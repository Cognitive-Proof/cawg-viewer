import { describe, expect, it } from 'vitest'
import { buildVerifyOptions } from './client'

describe('buildVerifyOptions', () => {
  it('leaves unset options out instead of sending undefined to the WASM module', () => {
    // Developer mode off: no extra trust. Every key present must have a value,
    // because serde-wasm-bindgen rejects `undefined` for list fields.
    const opts = buildVerifyOptions({ proxyBase: 'https://viewer.example', ocspFetch: true }, { trustPem: 'PEM' })
    expect(opts).toEqual({ proxyBase: 'https://viewer.example', ocspFetch: true, trustPem: 'PEM' })
    expect(Object.values(opts)).not.toContain(undefined)
  })

  it('adds developer anchors and issuers to the bundled trust', () => {
    const opts = buildVerifyOptions(
      {},
      { trustPem: 'BUNDLED', cawgTrustPem: undefined },
      { trustPem: 'DEV', cawgTrustPem: 'DEV-CAWG', trustedCawgIssuers: ['did:web:issuer.example'] },
    )
    expect(opts).toEqual({ trustPem: 'BUNDLED\nDEV', cawgTrustPem: 'DEV-CAWG', trustedCawgIssuers: ['did:web:issuer.example'] })
  })
})
