//! Serves the web build: precompressed assets (from `scripts/precompress.mjs`)
//! and cache headers suited to Vite's fingerprinted output.

use std::path::Path;

use axum::{
    extract::Request,
    http::{header, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::Response,
    Router,
};
use tower_http::services::ServeDir;

/// `/assets/<name>-<hash>.<ext>` never changes at a given URL.
const IMMUTABLE: HeaderValue = HeaderValue::from_static("public, max-age=31536000, immutable");
/// Everything else (`index.html`, the trust list) is revalidated, so a deploy shows up at once.
const REVALIDATE: HeaderValue = HeaderValue::from_static("no-cache");

/// Serves `dir`, preferring `<file>.br`, then `<file>.gz`, as the client accepts them.
pub fn static_files(dir: impl AsRef<Path>) -> Router {
    Router::new()
        .fallback_service(ServeDir::new(dir).precompressed_br().precompressed_gzip())
        .layer(middleware::from_fn(cache_headers))
}

async fn cache_headers(req: Request, next: Next) -> Response {
    let immutable = req.uri().path().starts_with("/assets/");
    let mut res = next.run(req).await;
    let status = res.status();
    if status.is_success() || status == StatusCode::NOT_MODIFIED {
        let headers = res.headers_mut();
        headers.insert(
            header::CACHE_CONTROL,
            if immutable { IMMUTABLE } else { REVALIDATE },
        );
        // The body depends on Accept-Encoding once precompressed copies exist.
        headers
            .entry(header::VARY)
            .or_insert(HeaderValue::from_static("accept-encoding"));
    }
    res
}
