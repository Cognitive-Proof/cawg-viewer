# CAWG Viewer

Drop in a file and see its Content Credentials: C2PA manifests and CAWG identity, metadata and training/mining assertions. Validation runs **in your browser**, using your local `c2pa-rs` checkout compiled directly to WebAssembly.

There are two builds from one codebase:

| | Static (online-only) | Full |
|---|---|---|
| Validation in the browser (WASM, Web Worker) | ✅ | ✅ |
| Remote manifests, `did:web`, X.509 URLs | only from servers that send CORS headers | ✅ via `/api/proxy` |
| Live OCSP revocation checks | — | ✅ via `/api/proxy` |
| Server-side "deep verify" (native c2pa-rs) | — | ✅ `/api/verify` |
| Signing (keys stay on the server) | — | ✅ `/api/sign` |
| Hosting | any static host | `viewer-server` binary |

In the static build, backend code is removed at build time: `src/backend/*` resolves to an empty stub (see `web/vite.config.ts`).

## c2pa-rs branch

The viewer builds against `cawg-viewer`, a branch of c2pa-rs that is upstream [`contentauth/c2pa-rs`](https://github.com/contentauth/c2pa-rs) `main` with the open pull requests the viewer needs merged in. Fixes go to upstream as PRs against `main`; once they're all merged, the viewer can depend on upstream directly.

| PR | Why the viewer needs it |
|---|---|
| [#2817](https://github.com/contentauth/c2pa-rs/pull/2817) | Keeps the C2PA claim-signer, TSA and CAWG trust lists separate, so a developer CAWG anchor doesn't make a claim signer trusted (and the reverse), and CAWG X.509 identities check against CAWG anchors |
| [#2927](https://github.com/contentauth/c2pa-rs/pull/2927) (draft; `feat/cawg-vcb`, discussion [#2926](https://github.com/contentauth/c2pa-rs/issues/2926)) | Validates CAWG verifiable credential bindings (`cawg.verifiable_credential_binding`, CAWG identity 1.3 draft §8.3) behind the experimental `unstable_cawg_vcb` feature, which the viewer enables |

To get it next to this repository:

```bash
git clone -b cawg-viewer https://github.com/mrappard/c2pa-rs-text-support.git ../c2pa-rs-cawg-viewer
git -C ../c2pa-rs-cawg-viewer remote rename origin fork
git -C ../c2pa-rs-cawg-viewer remote add upstream https://github.com/contentauth/c2pa-rs.git
```

To rebuild the branch after `main` or a PR moves:

```bash
git -C ../c2pa-rs-cawg-viewer fetch upstream main
git -C ../c2pa-rs-cawg-viewer fetch fork fix/trust-anchor-kind feat/cawg-vcb
git -C ../c2pa-rs-cawg-viewer checkout -B cawg-viewer upstream/main
git -C ../c2pa-rs-cawg-viewer merge --no-ff fork/fix/trust-anchor-kind
git -C ../c2pa-rs-cawg-viewer merge --no-ff fork/feat/cawg-vcb
```

The dev-only "VCB identity" sample (`web/src/dev/samples/cawg_vcb.jpg`) is generated with `cargo run -p viewer-core --example vcb_sample`. Its credential issuer is trusted by default in developer mode (Settings → Trusted CAWG credential issuers).

## Layout

```
crates/viewer-core    c2pa Settings/Context + async Reader → c2pa's own report JSON (+ thumbnails); shared by WASM and server
crates/viewer-wasm    wasm-bindgen glue; optional proxy resolver that routes all c2pa HTTP through viewer-server
crates/viewer-server  axum: /api/proxy, /api/verify, /api/sign, /api/health; serves web/dist/full
web/                  React + Vite; src/c2pa/toOutcome.ts maps the report onto c2pa-react-component's VerificationOutcome
```

## Prerequisites

- `../c2pa-rs-cawg-viewer`: a checkout of the `cawg-viewer` branch of c2pa-rs, at the commit in [`c2pa-rs.ref`](c2pa-rs.ref) (see [c2pa-rs branch](#c2pa-rs-branch); the path is set in `Cargo.toml` under `[workspace.dependencies]`)
- Rust 1.96 with `wasm32-unknown-unknown` (pinned in `rust-toolchain.toml`) and `wasm-pack`
- macOS: Homebrew LLVM (`brew install llvm`). c2pa-rs's C dependencies need it for wasm32. The scripts set `CC`/`AR` for you; for plain `cargo` commands, export them yourself:
  `export CC=$(brew --prefix llvm)/bin/clang AR=$(brew --prefix llvm)/bin/llvm-ar`
- Node 20+

## Develop

```bash
cd web && npm install
npm run wasm          # compile c2pa-rs → web/src/wasm/pkg (re-run after changing c2pa-rs)
npm run dev           # static variant on :5173
```

Full variant: run the server, then the Vite dev server, which proxies `/api` to it:

```bash
SIGN_CERT=../c2pa-rs-cawg-viewer/sdk/tests/fixtures/certs/es256.pub \
SIGN_KEY=../c2pa-rs-cawg-viewer/sdk/tests/fixtures/certs/es256.pem \
cargo run -p viewer-server          # from the repo root; :8787
npm --prefix web run dev:full       # :5174
```

## Build

```bash
npm --prefix web run build:static   # → web/dist/static, deploy anywhere
npm --prefix web run build:full     # → web/dist/full, served by viewer-server
cargo build --release -p viewer-server
```

### Server configuration (env)

| Variable | Default | |
|---|---|---|
| `BIND` | `127.0.0.1:8787` | |
| `STATIC_DIR` | `web/dist/full` | |
| `TRUST_DIR` | `web/public/trust` | `trustlist.pem`, optional `cawg-anchors.pem` |
| `SIGN_CERT`, `SIGN_KEY` | unset | PEM paths; `/api/sign` returns 503 without them |
| `SIGN_ALG` | `es256` | |
| `SIGN_TSA_URL` | unset | |
| `CORS_ORIGINS` | unset | Same-origin only by default, so the proxy can't be used by other sites |
| `PROXY_ALLOW_PRIVATE` | unset | `1` lets the proxy reach private IPs (local testing only) |

The proxy accepts only http(s) URLs. It refuses private, loopback and link-local addresses, pins each connection to the address it checked, re-checks every redirect, and caps bodies at 20 MB.

## Trust anchors

`web/public/trust/trustlist.pem` holds the C2PA signer trust list. It is fetched by the browser and loaded by the server. To check CAWG X.509 identity trust, add `cawg-anchors.pem` next to it, e.g. the Mozilla S/MIME roots and the IPTC anchor list. Never add test CAs whose keys are public: anything signed with them would show as **Trusted**.

## Test

```bash
cargo test -p viewer-core -p viewer-server   # fixtures from ../c2pa-rs-cawg-viewer/sdk/tests/fixtures
npm --prefix web test
```

## Deployment

Every push to `main` deploys production to Cloud Run in the `cawg-viewer` GCP project ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):

1. **CI** ([`ci.yml`](.github/workflows/ci.yml), which also runs on pull requests):
   - Rust tests and clippy against c2pa-rs at the commit in `c2pa-rs.ref`;
   - the WASM build;
   - web typecheck, tests, and both builds.
2. **Image:** the [`Dockerfile`](Dockerfile) fetches c2pa-rs at that commit and builds the WASM module, `viewer-server` and the full web build. The image is pushed to Artifact Registry.
3. **Deploy:** `gcloud run deploy cawg-viewer`, public, with up to 3 instances. A `/api/health` smoke test follows.

GitHub authenticates to Google Cloud with Workload Identity Federation, so no keys are stored. The provider only admits this repository. The one-time setup is [`scripts/gcp-setup.sh`](scripts/gcp-setup.sh):

```bash
scripts/gcp-setup.sh <project-id>
```

To build and run the image locally:

```bash
docker build --build-arg C2PA_RS_REF=$(cat c2pa-rs.ref) -t cawg-viewer .
docker run -p 8080:8080 cawg-viewer
```

The deployed server signs with the **public c2pa-rs test certificate**, so anything it signs is untrusted outside developer mode. Cloud Run limits request bodies to 32 MB, so larger files can be validated in the browser but not sent to the server for deep verify or signing.

To move to a newer c2pa-rs, update `c2pa-rs.ref` to a commit on the fork's `cawg-viewer` branch.

## License

[MIT](LICENSE) © 2026 Cognitive Proof.

The bundled C2PA trust list (`web/public/trust/trustlist.pem`) and c2pa-rs test root certificates (`web/src/c2pa-rs-test-roots.pem`) are public certificates published by their respective owners.
