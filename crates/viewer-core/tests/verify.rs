use viewer_core::{context, verify, VerifyOptions};

const FIXTURES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures"
);

async fn report(name: &str, format: &str) -> viewer_core::Report {
    let bytes = std::fs::read(format!("{FIXTURES}/{name}")).unwrap();
    let ctx = context(&VerifyOptions::default()).unwrap();
    verify(ctx, format, &bytes).await.unwrap()
}

#[tokio::test]
async fn reads_cawg_identity_assertion() {
    let report = report("C_with_CAWG_data.jpg", "image/jpeg").await;
    let r = &report.store;
    let active = r["active_manifest"].as_str().expect("active manifest");
    let assertions = r["manifests"][active]["assertions"].as_array().unwrap();
    let identity = assertions
        .iter()
        .find(|a| {
            a["label"]
                .as_str()
                .unwrap_or("")
                .starts_with("cawg.identity")
        })
        .expect("cawg.identity assertion");
    // decode_identity_assertions = true, so the signer payload is decoded, not raw CBOR.
    assert!(identity["data"].is_object(), "{identity:#}");
    assert!(r["validation_state"].is_string());

    let thumb = r["manifests"][active]["thumbnail"]["identifier"]
        .as_str()
        .unwrap();
    assert!(
        report.resources.contains_key(thumb),
        "thumbnail bytes included"
    );
}

#[tokio::test]
async fn asset_without_manifest_is_not_an_error() {
    let r = report("no_manifest.jpg", "image/jpeg").await;
    assert_eq!(r.store["validation_state"], "None");
    assert!(r.resources.is_empty());
}

#[test]
fn options_accept_null_issuer_list() {
    let opts: VerifyOptions = serde_json::from_str(r#"{"trustedCawgIssuers": null}"#).unwrap();
    assert!(opts.trusted_cawg_issuers.is_empty());
    let opts: VerifyOptions =
        serde_json::from_str(r#"{"trustedCawgIssuers": ["did:web:a.example"]}"#).unwrap();
    assert_eq!(opts.trusted_cawg_issuers, ["did:web:a.example"]);
    let opts: VerifyOptions = serde_json::from_str("{}").unwrap();
    assert!(opts.trusted_cawg_issuers.is_empty());
}
