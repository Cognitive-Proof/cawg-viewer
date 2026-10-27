//! Prints the viewer report for a file: `cargo run -p viewer-core --example dump -- <path> [mime]`
//! Set `TRUST_PEM=<file>` / `CAWG_TRUST_PEM=<file>` to validate against trust lists,
//! `CAWG_ISSUERS=<did>[,<did>...]` to trust CAWG credential issuers, `OCSP=1` to fetch OCSP responses.
use viewer_core::{context, verify, VerifyOptions};

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().expect("usage: dump <path> [mime]");
    let format = args
        .next()
        .unwrap_or_else(|| path.rsplit('.').next().unwrap_or("").to_string());
    let bytes = std::fs::read(&path).expect("read file");
    let opts = VerifyOptions {
        trust_pem: std::env::var("TRUST_PEM")
            .ok()
            .map(|p| std::fs::read_to_string(p).expect("read TRUST_PEM")),
        cawg_trust_pem: std::env::var("CAWG_TRUST_PEM")
            .ok()
            .map(|p| std::fs::read_to_string(p).expect("read CAWG_TRUST_PEM")),
        trusted_cawg_issuers: std::env::var("CAWG_ISSUERS")
            .map(|v| v.split(',').map(str::to_owned).collect())
            .unwrap_or_default(),
        ocsp_fetch: std::env::var("OCSP").is_ok_and(|v| v == "1"),
        ..Default::default()
    };
    let ctx = context(&opts).expect("context");
    let report = verify(ctx, &format, &bytes).await.expect("verify");
    println!("{}", serde_json::to_string_pretty(&report.store).unwrap());
}
