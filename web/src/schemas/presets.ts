export interface SchemaPreset {
  label: string
  url: string
  group: 'W3C contexts' | 'CAWG contexts' | 'CAWG JSON Schemas'
}

// Each URL is published with `Access-Control-Allow-Origin: *`, so the static
// build can load them directly. The CAWG verifiable credential binding context
// and schema (`…/vcb/…`) aren't published yet, so they aren't listed.
export const SCHEMA_PRESETS: SchemaPreset[] = [
  { group: 'W3C contexts', label: 'Verifiable Credentials 2.0', url: 'https://www.w3.org/ns/credentials/v2' },
  { group: 'W3C contexts', label: 'Verifiable Credentials 1.1', url: 'https://www.w3.org/2018/credentials/v1' },
  { group: 'W3C contexts', label: 'Bitstring Status List', url: 'https://www.w3.org/ns/credentials/status/v1' },
  { group: 'W3C contexts', label: 'Data Integrity 2.0', url: 'https://w3id.org/security/data-integrity/v2' },
  { group: 'CAWG contexts', label: 'Identity claims aggregation', url: 'https://cawg.io/identity/1.1/ica/context/' },
  {
    group: 'CAWG JSON Schemas',
    label: 'Identity claims aggregation (VC 2.0)',
    url: 'https://cawg.io/identity/1.1/ica/schema/vc2.0/',
  },
  {
    group: 'CAWG JSON Schemas',
    label: 'Identity claims aggregation (VC 1.1)',
    url: 'https://cawg.io/identity/1.1/ica/schema/vc1.1/',
  },
]
