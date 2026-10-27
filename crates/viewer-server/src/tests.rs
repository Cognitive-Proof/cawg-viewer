use std::net::IpAddr;

use axum::{body::Body, http::Request};
use tower::ServiceExt;

use super::*;
use crate::proxy::is_public;

fn state() -> AppState {
    AppState {
        trust: Arc::new(VerifyOptions::default()),
        signer: None,
        proxy_allow_private: false,
    }
}

async fn status_of(uri: &str) -> StatusCode {
    app(state(), "")
        .oneshot(Request::get(uri).body(Body::empty()).unwrap())
        .await
        .unwrap()
        .status()
}

#[test]
fn rejects_non_public_addresses() {
    for ip in [
        "127.0.0.1",
        "10.1.2.3",
        "192.168.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "::1",
        "fe80::1",
        "fd00::1",
        "::ffff:127.0.0.1",
    ] {
        assert!(
            !is_public(ip.parse::<IpAddr>().unwrap()),
            "{ip} should be blocked"
        );
    }
    for ip in ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"] {
        assert!(
            is_public(ip.parse::<IpAddr>().unwrap()),
            "{ip} should be allowed"
        );
    }
}

#[tokio::test]
async fn proxy_refuses_ssrf_targets() {
    assert_eq!(
        status_of("/api/proxy?url=http://127.0.0.1:8787/api/health").await,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        status_of("/api/proxy?url=http://169.254.169.254/latest/meta-data").await,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        status_of("/api/proxy?url=http://localhost/").await,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        status_of("/api/proxy?url=file:///etc/passwd").await,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn sign_without_keys_is_unavailable() {
    let req = Request::post("/api/sign")
        .header("content-type", "multipart/form-data; boundary=x")
        .body(Body::from("--x--\r\n"))
        .unwrap();
    assert_eq!(
        app(state(), "").oneshot(req).await.unwrap().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
}

const FIXTURES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures"
);

/// A `multipart/form-data` request to `/api/verify` with the given text fields and file.
fn verify_request(file: Vec<u8>, fields: &[(&str, &str)]) -> Request<Body> {
    let boundary = "XBOUNDARY";
    let mut body = Vec::new();
    for (name, value) in fields {
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes());
    }
    body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.jpg\"\r\n\r\n").as_bytes());
    body.extend(file);
    body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
    Request::post("/api/verify")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap()
}

async fn report_of(st: AppState, req: Request<Body>) -> viewer_core::Report {
    let resp = app(st, "").oneshot(req).await.unwrap();
    let status = resp.status();
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn verify_matches_browser_report_shape() {
    let bytes = std::fs::read(format!("{FIXTURES}/C_with_CAWG_data.jpg")).unwrap();
    let report = report_of(state(), verify_request(bytes, &[("format", "image/jpeg")])).await;
    assert!(report.store["active_manifest"].is_string());
    assert!(!report.resources.is_empty());
}

#[tokio::test]
async fn developer_trust_anchors_apply_to_one_request() {
    // c2pa-rs's test signer chains to its public test CA: untrusted by default,
    // Trusted once a developer supplies that CA.
    let signed = std::fs::read(format!("{FIXTURES}/C_with_CAWG_data.jpg")).unwrap();
    let chain = std::fs::read_to_string(format!("{FIXTURES}/certs/es256.pub")).unwrap();
    let ca = &chain[chain.rfind("-----BEGIN CERTIFICATE-----").unwrap()..];

    let without = report_of(
        state(),
        verify_request(signed.clone(), &[("format", "image/jpeg")]),
    )
    .await;
    assert_ne!(without.store["validation_state"], "Trusted");

    let with = report_of(
        state(),
        verify_request(
            signed.clone(),
            &[("format", "image/jpeg"), ("trustPem", ca)],
        ),
    )
    .await;
    let codes: Vec<_> = with.store["validation_results"]["activeManifest"]["success"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["code"].as_str().unwrap().to_owned())
        .collect();
    assert!(
        codes.contains(&"signingCredential.trusted".to_owned()),
        "{codes:?}"
    );
}

#[tokio::test]
async fn signs_then_validates() {
    let certs = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures"
    );
    let mut st = state();
    st.signer = Some(Arc::new(sign::SignerConfig::from_pem_files(
        &format!("{certs}/certs/es256.pub"),
        &format!("{certs}/certs/es256.pem"),
        c2pa::SigningAlg::Es256,
    )));

    let asset = std::fs::read(format!("{certs}/no_manifest.jpg")).unwrap();
    let manifest = r#"{"title":"test","assertions":[{"label":"c2pa.actions","data":{"actions":[{"action":"c2pa.created","digitalSourceType":"http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"}]}}]}"#;
    let boundary = "XBOUNDARY";
    let mut body = Vec::new();
    body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"manifest\"\r\n\r\n{manifest}\r\n").as_bytes());
    body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").as_bytes());
    body.extend(&asset);
    body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());

    let req = Request::post("/api/sign")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap();
    let resp = app(st, "").oneshot(req).await.unwrap();
    let status = resp.status();
    let signed = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(
        status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&signed)
    );

    let ctx = viewer_core::context(&VerifyOptions::default()).unwrap();
    let report = viewer_core::verify(ctx, "image/jpeg", &signed)
        .await
        .unwrap();
    assert_eq!(
        report.store["validation_state"], "Valid",
        "{:#}",
        report.store
    );
}

#[tokio::test]
async fn developer_trusted_cawg_issuer_applies_to_one_request() {
    // The dev VCB sample's credential issuer is untrusted unless the request names it.
    let sample = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../web/src/dev/samples/cawg_vcb.jpg"
    ))
    .unwrap();
    let issuer = "did:jwk:eyJhbGciOiJFZERTQSIsImt0eSI6Ik9LUCIsImNydiI6IkVkMjU1MTkiLCJ4IjoiSVZMNDBadDVIU1JGTWtMaFh5NnJiTGZQLW50cVh0TUFsNVlPQnBpQjJ4SSJ9";
    let codes = |r: &viewer_core::Report| -> Vec<String> {
        let v = &r.store["validation_results"]["activeManifest"];
        ["success", "informational"]
            .iter()
            .flat_map(|k| v[*k].as_array().cloned().unwrap_or_default())
            .map(|s| s["code"].as_str().unwrap().to_owned())
            .filter(|c| c.starts_with("cawg.vcb."))
            .collect()
    };

    let without = report_of(
        state(),
        verify_request(sample.clone(), &[("format", "image/jpeg")]),
    )
    .await;
    assert_eq!(codes(&without), ["cawg.vcb.untrusted_issuer"]);

    let with = report_of(
        state(),
        verify_request(
            sample,
            &[("format", "image/jpeg"), ("trustedCawgIssuer", issuer)],
        ),
    )
    .await;
    assert_eq!(codes(&with), ["cawg.vcb.credential_valid"]);
}
