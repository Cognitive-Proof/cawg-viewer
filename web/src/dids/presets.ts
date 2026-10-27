import { VCB_SAMPLE_ISSUER } from '../devTrustDefaults'

export interface DidPreset {
  label: string
  did: string
}

export const DID_PRESETS: DidPreset[] = [
  { label: 'Adobe connected identities (ICA issuer)', did: 'did:web:connected-identities.identity.adobe.com' },
  { label: 'Adobe connected identities, stage', did: 'did:web:connected-identities.identity-stage.adobe.com' },
  { label: 'Decentralized Identity Foundation', did: 'did:web:identity.foundation' },
  { label: 'VCB sample issuer (did:jwk)', did: VCB_SAMPLE_ISSUER },
  // The Ed25519 example from the did:key method specification.
  { label: 'did:key example (Ed25519)', did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' },
]
