//! Optional backend for the CAWG viewer: the things a browser can't do.
//!
//! - `GET|POST /api/proxy?url=` CORS-free fetches for the WASM module and trust registries
//! - `POST /api/verify` native validation with live OCSP fetching
//! - `POST /api/sign` signs an asset with the server's certificate
//!
//! It also serves the full web build, so one binary runs the whole app.
//!
//! Configuration (env):
//! - `BIND` (default `127.0.0.1:8787`)
//! - `STATIC_DIR` (default `web/dist/full`)
//! - `TRUST_DIR` with `trustlist.pem` / `cawg-anchors.pem` (default `web/public/trust`)
//! - `SIGN_CERT`, `SIGN_KEY` PEM file paths; `SIGN_ALG` (default `es256`); `SIGN_TSA_URL`
//! - `CORS_ORIGINS` comma-separated origins allowed to call the API cross-origin (default: none)
//! - `PROXY_ALLOW_PRIVATE=1` lets the proxy reach private addresses (local testing only)

mod proxy;
mod sign;

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use axum::{
    extract::{DefaultBodyLimit, Multipart, State},
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use viewer_core::VerifyOptions;

const MAX_UPLOAD: usize = 512 * 1024 * 1024;

#[derive(Clone)]
pub struct AppState {
    trust: Arc<VerifyOptions>,
    signer: Option<Arc<sign::SignerConfig>>,
    proxy_allow_private: bool,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let env = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_owned());
    let state = AppState {
        trust: Arc::new(load_trust(&PathBuf::from(env(
            "TRUST_DIR",
            "web/public/trust",
        )))),
        signer: sign::SignerConfig::from_env().map(Arc::new),
        proxy_allow_private: env("PROXY_ALLOW_PRIVATE", "") == "1",
    };
    if state.signer.is_none() {
        tracing::warn!("SIGN_CERT/SIGN_KEY not set: /api/sign is disabled");
    }

    let app = app(state, &env("CORS_ORIGINS", ""))
        .fallback_service(ServeDir::new(env("STATIC_DIR", "web/dist/full")));
    let addr: SocketAddr = env("BIND", "127.0.0.1:8787")
        .parse()
        .expect("BIND must be host:port");
    tracing::info!("viewer-server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}

pub fn app(state: AppState, cors_origins: &str) -> Router {
    let mut router = Router::new()
        .route("/api/health", get(health))
        .route("/api/proxy", get(proxy::proxy).post(proxy::proxy))
        .route("/api/verify", post(verify))
        .route("/api/sign", post(sign::sign))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Same-origin by default; an open CORS proxy would let any site use this server.
    let origins: Vec<HeaderValue> = cors_origins
        .split(',')
        .map(str::trim)
        .filter(|o| !o.is_empty())
        .filter_map(|o| o.parse().ok())
        .collect();
    if !origins.is_empty() {
        router = router.layer(
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );
    }
    router
}

fn load_trust(dir: &std::path::Path) -> VerifyOptions {
    let read = |name: &str| {
        std::fs::read_to_string(dir.join(name))
            .ok()
            .filter(|p| p.contains("BEGIN CERTIFICATE"))
    };
    VerifyOptions {
        trust_pem: read("trustlist.pem"),
        cawg_trust_pem: read("cawg-anchors.pem"),
        ..Default::default()
    }
}

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "c2pa": c2pa::VERSION,
        "signing": state.signer.is_some(),
    }))
}

/// Same report as the browser produces, but validated natively with OCSP fetching on.
///
/// `multipart/form-data` with `file` and `format`, plus optional `trustPem` /
/// `cawgTrustPem` and repeated `trustedCawgIssuer` fields: developer-mode trust
/// added to the server's own for this request only.
async fn verify(State(state): State<AppState>, mut form: Multipart) -> Response {
    let mut opts = VerifyOptions {
        ocsp_fetch: true,
        ..(*state.trust).clone()
    };
    let (mut file, mut format) = (None, None);
    loop {
        let field = match form.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
        };
        let name = field.name().unwrap_or_default().to_owned();
        let Ok(bytes) = field.bytes().await else {
            return (StatusCode::BAD_REQUEST, "could not read upload").into_response();
        };
        let text = || String::from_utf8_lossy(&bytes).into_owned();
        match name.as_str() {
            "file" => file = Some(bytes.clone()),
            "format" => format = Some(text()),
            "trustPem" => opts.trust_pem = join_pem(opts.trust_pem.take(), text()),
            "cawgTrustPem" => opts.cawg_trust_pem = join_pem(opts.cawg_trust_pem.take(), text()),
            "trustedCawgIssuer" => opts.trusted_cawg_issuers.push(text()),
            _ => {}
        }
    }
    let (Some(file), Some(format)) = (file, format) else {
        return (
            StatusCode::BAD_REQUEST,
            "expected `file` and `format` fields",
        )
            .into_response();
    };

    let result = tokio::task::spawn_blocking(move || {
        let ctx = viewer_core::context(&opts)?;
        tokio::runtime::Handle::current().block_on(viewer_core::verify(ctx, &format, &file))
    })
    .await;
    match result {
        Ok(Ok(report)) => Json(report).into_response(),
        Ok(Err(e)) => (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

fn join_pem(base: Option<String>, extra: String) -> Option<String> {
    match base {
        Some(base) if !extra.trim().is_empty() => Some(format!("{base}\n{extra}")),
        Some(base) => Some(base),
        None => Some(extra).filter(|e| !e.trim().is_empty()),
    }
}

#[cfg(test)]
mod tests;
