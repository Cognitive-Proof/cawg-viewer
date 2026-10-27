# syntax=docker/dockerfile:1.7
#
# The full CAWG viewer: viewer-server serving the full web build.
#
#   docker build --build-arg C2PA_RS_REF=$(cat c2pa-rs.ref) -t cawg-viewer .
#   docker run -p 8080:8080 cawg-viewer
#
# c2pa-rs is fetched at the commit pinned in c2pa-rs.ref (the fork's
# cawg-viewer branch), into the sibling path Cargo.toml expects.

ARG C2PA_RS_REF

# --- Rust: the WASM module and the server ------------------------------------
FROM rust:1.96-bookworm AS rust
ARG C2PA_RS_REF
RUN test -n "$C2PA_RS_REF" || (echo "pass --build-arg C2PA_RS_REF=\$(cat c2pa-rs.ref)" && exit 1)

# clang/llvm-ar build c2pa-rs's C dependencies for wasm32.
RUN apt-get update \
 && apt-get install -y --no-install-recommends clang llvm lld \
 && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo install wasm-pack --version 0.14.0 --locked

ADD https://github.com/mrappard/c2pa-rs-text-support.git#${C2PA_RS_REF} /src/c2pa-rs-cawg-viewer

WORKDIR /src/cawg-viewer
COPY rust-toolchain.toml ./
RUN rustup show active-toolchain && rustup target add wasm32-unknown-unknown
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY scripts ./scripts
RUN mkdir -p web/src/wasm

ENV CC_wasm32_unknown_unknown=clang AR_wasm32_unknown_unknown=llvm-ar
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/cawg-viewer/target \
    scripts/build-wasm.sh \
 && cargo build --release --locked -p viewer-server \
 && cp target/release/viewer-server /usr/local/bin/viewer-server

# --- Web: the full build -----------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /src/cawg-viewer/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY --from=rust /src/cawg-viewer/web/src/wasm/pkg ./src/wasm/pkg
RUN npm run build:full

# --- Runtime -----------------------------------------------------------------
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home viewer

WORKDIR /app
COPY --from=rust /usr/local/bin/viewer-server ./viewer-server
COPY --from=web /src/cawg-viewer/web/dist/full ./static
COPY web/public/trust ./trust
# Public c2pa-rs test signing credentials: anything signed with them is
# untrusted outside developer mode. Swap for Secret Manager before using a real key.
COPY --from=rust /src/c2pa-rs-cawg-viewer/sdk/tests/fixtures/certs/es256.pub /src/c2pa-rs-cawg-viewer/sdk/tests/fixtures/certs/es256.pem ./signing/

ENV PORT=8080 \
    STATIC_DIR=/app/static \
    TRUST_DIR=/app/trust \
    SIGN_CERT=/app/signing/es256.pub \
    SIGN_KEY=/app/signing/es256.pem \
    SIGN_ALG=es256 \
    RUST_LOG=info

USER viewer
EXPOSE 8080
CMD ["/app/viewer-server"]
