//! A fetch proxy for requests the browser can't make itself (no CORS headers):
//! did:web documents, remote manifests, X.509 URLs, OCSP responders, TRQP registries.
//!
//! It is SSRF-hardened: http(s) only, every hop's address is resolved and checked
//! against private/loopback/link-local ranges, the connection is pinned to the
//! checked address (no DNS rebinding), redirects are re-validated, and bodies are capped.

use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use url::Url;

use crate::AppState;

const MAX_BODY: usize = 20 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Deserialize)]
pub struct ProxyQuery {
    url: String,
}

pub async fn proxy(
    State(state): State<AppState>,
    method: Method,
    Query(q): Query<ProxyQuery>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if method != Method::GET && method != Method::POST {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            "only GET and POST are proxied",
        )
            .into_response();
    }
    match fetch(&state, method, &q.url, &headers, body).await {
        Ok(resp) => resp,
        Err((status, msg)) => (status, msg).into_response(),
    }
}

type ProxyError = (StatusCode, String);

async fn fetch(
    state: &AppState,
    mut method: Method,
    url: &str,
    headers: &HeaderMap,
    mut body: Bytes,
) -> Result<Response, ProxyError> {
    let bad = |m: String| (StatusCode::BAD_REQUEST, m);
    let mut url = Url::parse(url).map_err(|e| bad(format!("invalid url: {e}")))?;

    for _ in 0..=MAX_REDIRECTS {
        let addr = vet(&url, state.proxy_allow_private)
            .await
            .map_err(|e| (StatusCode::FORBIDDEN, e))?;
        let host = url.host_str().unwrap_or_default().to_owned();

        // A fresh client per hop pins `host` to the vetted address.
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(TIMEOUT)
            .resolve(&host, addr)
            .build()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let mut req = client.request(method.clone(), url.clone());
        for name in [header::CONTENT_TYPE, header::ACCEPT] {
            if let Some(v) = headers.get(&name) {
                req = req.header(name, v);
            }
        }
        if method == Method::POST {
            req = req.body(body.clone());
        }

        let resp = req
            .send()
            .await
            .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
        let status = resp.status();

        if status.is_redirection() {
            let location = resp
                .headers()
                .get(header::LOCATION)
                .and_then(|l| l.to_str().ok())
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_GATEWAY,
                        "redirect without location".to_owned(),
                    )
                })?;
            url = url
                .join(location)
                .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
            if status == StatusCode::SEE_OTHER {
                method = Method::GET;
                body = Bytes::new();
            }
            continue;
        }

        if resp
            .content_length()
            .is_some_and(|len| len as usize > MAX_BODY)
        {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                "upstream response too large".into(),
            ));
        }
        let content_type = resp.headers().get(header::CONTENT_TYPE).cloned();
        let mut resp = resp;
        let mut buf = Vec::new();
        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?
        {
            if buf.len() + chunk.len() > MAX_BODY {
                return Err((
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "upstream response too large".into(),
                ));
            }
            buf.extend_from_slice(&chunk);
        }

        let mut out = (
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            buf,
        )
            .into_response();
        if let Some(ct) = content_type {
            out.headers_mut().insert(header::CONTENT_TYPE, ct);
        }
        return Ok(out);
    }
    Err((StatusCode::BAD_GATEWAY, "too many redirects".into()))
}

/// Checks the scheme and resolves the host, refusing non-public addresses.
async fn vet(url: &Url, allow_private: bool) -> Result<SocketAddr, String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!("scheme {} is not allowed", url.scheme()));
    }
    let host = url.host_str().ok_or("url has no host")?;
    let port = url.port_or_known_default().ok_or("url has no port")?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let addrs = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("cannot resolve {host}: {e}"))?;
    let mut first = None;
    for addr in addrs {
        if !allow_private && !is_public(addr.ip()) {
            return Err(format!("{host} resolves to a non-public address"));
        }
        first.get_or_insert(addr);
    }
    first.ok_or_else(|| format!("{host} did not resolve"))
}

pub(crate) fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_documentation()
                || a == 0
                || (a == 100 && (64..128).contains(&b)) // carrier-grade NAT
                || (a == 198 && (b == 18 || b == 19)) // benchmarking
                || a >= 240)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(IpAddr::V4(v4));
            }
            let seg0 = v6.segments()[0];
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (seg0 & 0xfe00) == 0xfc00 // unique local
                || (seg0 & 0xffc0) == 0xfe80) // link local
        }
    }
}
