// Developer-mode default trust anchors: the c2pa-rs test root CAs (Ed25519,
// ECDSA, RSA-PSS), copied from c2pa-rs `sdk/tests/fixtures/crypto/raw_signature/
// test_cert_root_bundle.pem`. Their private keys are public, so they are only
// ever applied in developer mode; they make c2pa-rs test assets, and files the
// dev server signs with c2pa-rs test certificates, validate as trusted.
import testRoots from './c2pa-rs-test-roots.pem?raw'

export const C2PA_RS_TEST_ROOTS = testRoots.trim()

/**
 * The `did:jwk` issuer of the dev-only "VCB identity" sample
 * (`crates/viewer-core/examples/vcb_sample.rs`). Trusting it by default makes
 * that sample's CAWG verifiable credential binding validate as trusted.
 */
export const VCB_SAMPLE_ISSUER =
  'did:jwk:eyJhbGciOiJFZERTQSIsImt0eSI6Ik9LUCIsImNydiI6IkVkMjU1MTkiLCJ4IjoiSVZMNDBadDVIU1JGTWtMaFh5NnJiTGZQLW50cVh0TUFsNVlPQnBpQjJ4SSJ9'
