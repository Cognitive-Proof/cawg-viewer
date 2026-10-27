import { describe, expect, it } from 'vitest'
import { countCerts, DEFAULT_DEV_CAWG_ISSUERS, DEFAULT_DEV_TRUST_PEM, developerTrust, getSettings, parseIssuers } from './settings'

describe('developer-mode trust defaults', () => {
  it('start with the seven c2pa-rs test roots in both lists', () => {
    expect(countCerts(DEFAULT_DEV_TRUST_PEM)).toBe(7)
    expect(getSettings().extraTrustPem).toBe(DEFAULT_DEV_TRUST_PEM)
    expect(getSettings().extraCawgTrustPem).toBe(DEFAULT_DEV_TRUST_PEM)
  })

  it('apply only while developer mode is on', () => {
    const s = getSettings()
    expect(s.developerMode).toBe(false)
    expect(developerTrust(s)).toBeUndefined()
    expect(developerTrust({ ...s, developerMode: true })).toEqual({
      trustPem: DEFAULT_DEV_TRUST_PEM,
      cawgTrustPem: DEFAULT_DEV_TRUST_PEM,
      trustedCawgIssuers: [DEFAULT_DEV_CAWG_ISSUERS],
    })
  })

  it('trust the VCB sample issuer by default', () => {
    expect(DEFAULT_DEV_CAWG_ISSUERS.startsWith('did:jwk:')).toBe(true)
    expect(getSettings().trustedCawgIssuers).toBe(DEFAULT_DEV_CAWG_ISSUERS)
    expect(parseIssuers(' did:web:a.example \n\n did:web:b.example ')).toEqual(['did:web:a.example', 'did:web:b.example'])
  })
})
