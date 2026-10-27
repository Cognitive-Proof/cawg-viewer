//! Thin layer over c2pa-rs shared by the WASM module and the server.
//!
//! It only builds a c2pa [`Context`] from viewer options and runs the async
//! [`Reader`]; the report it returns is c2pa's own JSON, untouched.

use std::{collections::BTreeMap, io::Cursor};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

use c2pa::{Context, Reader, Settings};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, thiserror::Error)]
pub enum ViewerError {
    #[error("invalid settings: {0}")]
    Settings(String),
    #[error("c2pa error: {0}")]
    C2pa(#[from] c2pa::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, ViewerError>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VerifyOptions {
    /// PEM bundle of C2PA manifest-signer trust anchors.
    pub trust_pem: Option<String>,
    /// PEM bundle of CAWG X.509 identity trust anchors.
    pub cawg_trust_pem: Option<String>,
    /// DIDs of trusted CAWG credential issuers (identity claims aggregation and
    /// verifiable credential binding). `null` (or JavaScript `undefined`) means none.
    #[serde(deserialize_with = "null_as_empty")]
    pub trusted_cawg_issuers: Vec<String>,
    /// Fetch live OCSP responses (needs a CORS-capable path, i.e. the backend).
    pub ocsp_fetch: bool,
    /// Fetch remote manifests referenced by the asset. Defaults to true in c2pa.
    pub remote_manifest_fetch: Option<bool>,
}

fn null_as_empty<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> std::result::Result<Vec<String>, D::Error> {
    Ok(Option::<Vec<String>>::deserialize(d)?.unwrap_or_default())
}

/// Builds c2pa [`Settings`] for the given options.
pub fn settings(opts: &VerifyOptions) -> Result<Settings> {
    let mut anchors = Vec::new();
    if let Some(pem) = opts.trust_pem.as_deref().filter(|p| !p.trim().is_empty()) {
        anchors.push(json!({ "trust_anchors": pem, "trust_kind": "manifest" }));
    }
    if let Some(pem) = opts
        .cawg_trust_pem
        .as_deref()
        .filter(|p| !p.trim().is_empty())
    {
        anchors.push(json!({ "trust_anchors": pem, "trust_kind": "cawg" }));
    }

    let mut verify = json!({
        "verify_trust": !anchors.is_empty(),
        "ocsp_fetch": opts.ocsp_fetch,
    });
    if let Some(fetch) = opts.remote_manifest_fetch {
        verify["remote_manifest_fetch"] = json!(fetch);
    }

    // Trusted issuer DIDs ride on a CAWG anchor of their own. They don't turn on
    // certificate trust checks, so this comes after `verify_trust` is decided.
    let issuers: Vec<&str> = opts
        .trusted_cawg_issuers
        .iter()
        .map(|i| i.trim())
        .filter(|i| !i.is_empty())
        .collect();
    if !issuers.is_empty() {
        anchors.push(json!({
            "trust_anchors": "",
            "trust_kind": "cawg",
            "trusted_ica_issuers": issuers,
        }));
    }

    let mut overlay = json!({
        "core": { "decode_identity_assertions": true },
        "verify": verify,
    });
    if !anchors.is_empty() {
        overlay["trust"] = json!({ "anchors": anchors });
    }

    Settings::new()
        .with_json(&overlay.to_string())
        .map_err(|e| ViewerError::Settings(e.to_string()))
}

/// Builds a [`Context`] for the given options. Callers may add a custom
/// HTTP resolver with [`Context::with_resolver_async`].
pub fn context(opts: &VerifyOptions) -> Result<Context> {
    Ok(Context::new().with_settings(settings(opts)?)?)
}

/// What a verify call returns: c2pa's manifest-store JSON, plus the binary
/// resources (thumbnails) it references, base64-encoded and keyed by their
/// `identifier`, so the UI can show them without a second round trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub store: Value,
    pub resources: BTreeMap<String, Resource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resource {
    pub format: String,
    pub data: String,
}

/// Reads and validates `bytes`.
///
/// An asset with no C2PA data is not an error: `store` is
/// `{"manifests": {}, "validation_state": "None"}` so the UI can say so plainly.
pub async fn verify(ctx: Context, format: &str, bytes: &[u8]) -> Result<Report> {
    let reader = match Reader::from_context(ctx)
        .with_stream_async(format, Cursor::new(bytes))
        .await
    {
        Ok(reader) => reader,
        Err(c2pa::Error::JumbfNotFound) | Err(c2pa::Error::ProvenanceMissing) => {
            return Ok(Report {
                store: json!({ "manifests": {}, "validation_state": "None" }),
                resources: BTreeMap::new(),
            });
        }
        Err(e) => return Err(e.into()),
    };

    let store: Value = serde_json::from_str(&reader.json_checked()?)?;
    let resources = thumbnails(&store)
        .into_iter()
        .filter_map(|(id, format)| {
            let mut buf = Cursor::new(Vec::new());
            reader.resource_to_stream(&id, &mut buf).ok()?;
            Some((
                id,
                Resource {
                    format,
                    data: BASE64.encode(buf.into_inner()),
                },
            ))
        })
        .collect();

    Ok(Report { store, resources })
}

/// Thumbnail `(identifier, format)` pairs referenced by manifests and their ingredients.
fn thumbnails(store: &Value) -> Vec<(String, String)> {
    let Some(manifests) = store["manifests"].as_object() else {
        return Vec::new();
    };
    let ingredient_thumbs = |m: &Value| {
        m["ingredients"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|i| i["thumbnail"].clone())
            .collect::<Vec<_>>()
    };
    manifests
        .values()
        .flat_map(|m| std::iter::once(m["thumbnail"].clone()).chain(ingredient_thumbs(m)))
        .filter_map(|t| {
            Some((
                t["identifier"].as_str()?.to_owned(),
                t["format"]
                    .as_str()
                    .unwrap_or("application/octet-stream")
                    .to_owned(),
            ))
        })
        .collect()
}
