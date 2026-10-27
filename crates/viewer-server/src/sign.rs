//! Server-side signing: private keys never reach the browser.

use std::io::Cursor;

use axum::{
    extract::{Multipart, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use c2pa::{Builder, SigningAlg};

use crate::AppState;

pub struct SignerConfig {
    cert: Vec<u8>,
    key: Vec<u8>,
    alg: SigningAlg,
    tsa_url: Option<String>,
}

impl SignerConfig {
    pub fn from_env() -> Option<Self> {
        let cert = std::fs::read(std::env::var("SIGN_CERT").ok()?).expect("read SIGN_CERT");
        let key = std::fs::read(std::env::var("SIGN_KEY").ok()?).expect("read SIGN_KEY");
        let alg = std::env::var("SIGN_ALG")
            .unwrap_or_else(|_| "es256".into())
            .parse()
            .expect("SIGN_ALG must be a c2pa signing algorithm, e.g. es256");
        Some(Self {
            cert,
            key,
            alg,
            tsa_url: std::env::var("SIGN_TSA_URL").ok(),
        })
    }

    #[cfg(test)]
    pub fn from_pem_files(cert: &str, key: &str, alg: SigningAlg) -> Self {
        Self {
            cert: std::fs::read(cert).unwrap(),
            key: std::fs::read(key).unwrap(),
            alg,
            tsa_url: None,
        }
    }
}

type SignError = (StatusCode, String);

/// `multipart/form-data` with `file` (the asset) and `manifest` (a manifest definition JSON).
pub async fn sign(State(state): State<AppState>, mut form: Multipart) -> Response {
    let Some(config) = state.signer.clone() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "signing is not configured on this server",
        )
            .into_response();
    };

    let mut file = None;
    let mut manifest = None;
    loop {
        match form.next_field().await {
            Ok(Some(field)) => {
                let name = field.name().unwrap_or_default().to_owned();
                let content_type = field.content_type().map(str::to_owned);
                let Ok(bytes) = field.bytes().await else {
                    return (StatusCode::BAD_REQUEST, "could not read upload").into_response();
                };
                match name.as_str() {
                    "file" => file = Some((content_type, bytes)),
                    "manifest" => manifest = Some(String::from_utf8_lossy(&bytes).into_owned()),
                    _ => {}
                }
            }
            Ok(None) => break,
            Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
        }
    }
    let (Some((content_type, bytes)), Some(manifest)) = (file, manifest) else {
        return (
            StatusCode::BAD_REQUEST,
            "expected `file` and `manifest` fields",
        )
            .into_response();
    };
    let format = content_type.unwrap_or_else(|| "application/octet-stream".into());

    let result = tokio::task::spawn_blocking(move || {
        sign_bytes(&config, &manifest, &format, &bytes).map(|out| (format, out))
    })
    .await;
    match result {
        Ok(Ok((format, out))) => ([(header::CONTENT_TYPE, format)], out).into_response(),
        Ok(Err((status, msg))) => (status, msg).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

fn sign_bytes(
    config: &SignerConfig,
    manifest: &str,
    format: &str,
    bytes: &[u8],
) -> Result<Vec<u8>, SignError> {
    let bad = |e: c2pa::Error| (StatusCode::UNPROCESSABLE_ENTITY, e.to_string());
    let signer = c2pa::create_signer::from_keys(
        &config.cert,
        &config.key,
        config.alg,
        config.tsa_url.clone(),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("signer: {e}")))?;
    // Trust is the reader's call, not the signer's: skip trust checks in post-sign validation.
    let ctx = viewer_core::context(&viewer_core::VerifyOptions::default())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut builder = Builder::from_context(ctx)
        .with_definition(manifest)
        .map_err(bad)?;
    let mut dest = Cursor::new(Vec::new());
    builder
        .sign(&*signer, format, &mut Cursor::new(bytes), &mut dest)
        .map_err(bad)?;
    Ok(dest.into_inner())
}
