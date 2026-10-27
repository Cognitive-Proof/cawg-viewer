//! Writes the dev-only "VCB identity" sample: a JPEG whose manifest carries a
//! CAWG identity assertion with a verifiable credential binding
//! (`cawg.verifiable_credential_binding`).
//!
//! `cargo run -p viewer-core --example vcb_sample [out.jpg]`
//!
//! The C2PA claim is signed with the c2pa-rs ES256 test certificate. The
//! credential is issued by a fixed Ed25519 `did:jwk` issuer, printed on exit;
//! the web app's developer mode trusts it by default.

use std::io::Cursor;

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use c2pa::{
    identity::{
        builder::{
            CredentialHolder, IdentityAssertionBuilder, IdentityAssertionSigner,
            IdentityBuilderError,
        },
        vc_binding::{terms_of_use_for, CAWG_VCB_SIG_TYPE},
        SignerPayload,
    },
    Builder, Context, SigningAlg,
};
use coset::{iana, CoseSign1Builder, HeaderBuilder, TaggedCborSerializable};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;

const FIXTURES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures"
);
const DEFAULT_OUT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../web/src/dev/samples/cawg_vcb.jpg"
);

/// Fixed so the issuer DID, and the dev-mode default that trusts it, never change.
fn issuer_key() -> SigningKey {
    SigningKey::from_bytes(&[0x42; 32])
}

fn issuer_did() -> String {
    let jwk = json!({
        "alg": "EdDSA",
        "kty": "OKP",
        "crv": "Ed25519",
        "x": URL_SAFE_NO_PAD.encode(issuer_key().verifying_key().as_bytes()),
    });
    format!("did:jwk:{}", URL_SAFE_NO_PAD.encode(jwk.to_string()))
}

struct SampleIssuer;

impl CredentialHolder for SampleIssuer {
    fn sig_type(&self) -> &'static str {
        CAWG_VCB_SIG_TYPE
    }

    fn reserve_size(&self) -> usize {
        8192
    }

    fn sign(&self, signer_payload: &SignerPayload) -> Result<Vec<u8>, IdentityBuilderError> {
        let terms_of_use = terms_of_use_for(signer_payload)
            .map_err(|e| IdentityBuilderError::SignerError(e.to_string()))?;

        let credential = json!({
            "@context": [
                "https://www.w3.org/ns/credentials/v2",
                "https://cawg.io/identity/1.2/vcb/context/",
            ],
            "type": ["VerifiableCredential", "C2PABindingCredential", "CAWGVerifiedIdentities"],
            "issuer": issuer_did(),
            "validFrom": "2026-01-01T00:00:00Z",
            "credentialSubject": [
                {
                    "id": "did:example:sample-creator",
                    "type": "cawg.social_media",
                    "name": "Sample Creator",
                    "username": "samplecreator",
                    "uri": "https://social.example/samplecreator",
                    "method": "cawg.federated_login",
                    "provider": { "id": "https://social.example", "name": "Example Social" },
                    "verifiedAt": "2026-01-01T00:00:00Z",
                },
                {
                    "id": "did:example:sample-creator",
                    "type": "cawg.web_site",
                    "uri": "https://samplecreator.example",
                    "method": "cawg.dns_record",
                    "provider": { "name": "Example Domain Verifier" },
                    "verifiedAt": "2026-01-01T00:00:00Z",
                },
            ],
            "termsOfUse": terms_of_use,
        });

        let key = issuer_key();
        let sign1 = CoseSign1Builder::new()
            .protected(
                HeaderBuilder::new()
                    .algorithm(iana::Algorithm::EdDSA)
                    .content_type("application/vc".to_owned())
                    .build(),
            )
            .payload(credential.to_string().into_bytes())
            .create_signature(b"", |data| key.sign(data).to_bytes().to_vec())
            .build();

        sign1
            .to_tagged_vec()
            .map_err(|e| IdentityBuilderError::SignerError(e.to_string()))
    }
}

/// DER certificates from a PEM chain.
fn pem_to_der(pem: &str) -> Vec<Vec<u8>> {
    pem.split("-----BEGIN CERTIFICATE-----")
        .skip(1)
        .filter_map(|block| block.split("-----END CERTIFICATE-----").next())
        .map(|b64| {
            STANDARD
                .decode(b64.split_whitespace().collect::<String>())
                .expect("PEM base64")
        })
        .collect()
}

fn main() {
    let out = std::env::args()
        .nth(1)
        .unwrap_or_else(|| DEFAULT_OUT.to_owned());

    let cert = std::fs::read_to_string(format!("{FIXTURES}/certs/es256.pub")).expect("read cert");
    let key = std::fs::read(format!("{FIXTURES}/certs/es256.pem")).expect("read key");
    let raw_signer =
        c2pa_raw_crypto::signer_from_private_key(&key, SigningAlg::Es256).expect("signer");

    let mut signer = IdentityAssertionSigner::new(raw_signer, pem_to_der(&cert));
    signer.add_identity_assertion(IdentityAssertionBuilder::for_credential_holder(
        SampleIssuer,
    ));

    let manifest = json!({
        "title": "CAWG VCB sample",
        "claim_generator_info": [{ "name": "cawg-viewer vcb_sample" }],
        "assertions": [{
            "label": "c2pa.actions",
            "data": { "actions": [{
                "action": "c2pa.created",
                "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
            }] },
        }],
    });

    let mut builder = Builder::from_context(Context::new())
        .with_definition(manifest.to_string())
        .expect("manifest definition");

    let mut source =
        Cursor::new(std::fs::read(format!("{FIXTURES}/no_manifest.jpg")).expect("read image"));
    let mut dest = Cursor::new(Vec::new());
    builder
        .sign(&signer, "image/jpeg", &mut source, &mut dest)
        .expect("sign");

    if let Some(dir) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(dir).expect("create output dir");
    }
    std::fs::write(&out, dest.into_inner()).expect("write sample");
    println!("wrote {out}");
    println!("issuer {}", issuer_did());
}
