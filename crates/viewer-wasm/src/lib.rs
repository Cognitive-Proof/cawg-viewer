//! wasm-bindgen glue so the browser can call c2pa-rs directly.

use std::io::Read;

use c2pa::http::{
    http::{header, Request, Response, Uri},
    AsyncHttpResolver, HttpResolverError,
};
use serde::{Deserialize, Serialize};
use viewer_core::VerifyOptions;
use wasm_bindgen::prelude::*;

/// Options from JS: c2pa's `VerifyOptions` plus where viewer-server lives, if anywhere.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct JsOptions {
    #[serde(flatten)]
    verify: VerifyOptions,
    proxy_base: Option<String>,
}

/// Sends every request c2pa makes (remote manifests, did:web, X.509 URLs, OCSP)
/// to `{base}/api/proxy?url=…`, so servers without CORS headers still work.
struct ProxyResolver {
    base: String,
    client: reqwest::Client,
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
impl AsyncHttpResolver for ProxyResolver {
    async fn http_resolve_async(
        &self,
        request: Request<Vec<u8>>,
    ) -> Result<Response<Box<dyn Read>>, HttpResolverError> {
        let (mut parts, body) = request.into_parts();
        let target = parts.uri.to_string();
        let encoded: String = js_sys::encode_uri_component(&target).into();
        parts.uri = format!("{}/api/proxy?url={encoded}", self.base)
            .parse::<Uri>()
            .map_err(|e| HttpResolverError::Other(Box::new(e)))?;
        // Aimed at the original host (OCSP sets it); the proxy is a different host.
        parts.headers.remove(header::HOST);
        self.client
            .http_resolve_async(Request::from_parts(parts, body))
            .await
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Validates an asset and returns c2pa's manifest-store report.
///
/// `options`: `trustPem`, `cawgTrustPem`, `ocspFetch`, `remoteManifestFetch`, and
/// `proxyBase` (viewer-server origin, full build only); pass `undefined` for defaults.
#[wasm_bindgen]
pub async fn verify(bytes: Vec<u8>, format: String, options: JsValue) -> Result<JsValue, JsError> {
    let opts: JsOptions = if options.is_undefined() || options.is_null() {
        JsOptions::default()
    } else {
        serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
    };
    let mut ctx = viewer_core::context(&opts.verify).map_err(|e| JsError::new(&e.to_string()))?;
    if let Some(base) = opts.proxy_base.filter(|b| !b.is_empty()) {
        ctx = ctx.with_resolver_async(ProxyResolver {
            base: base.trim_end_matches('/').to_owned(),
            client: reqwest::Client::new(),
        });
    }
    let report = viewer_core::verify(ctx, &format, &bytes)
        .await
        .map_err(|e| JsError::new(&e.to_string()))?;
    to_js(&report)
}

/// c2pa-rs version this module was built from.
#[wasm_bindgen]
pub fn c2pa_version() -> String {
    c2pa::VERSION.to_string()
}
