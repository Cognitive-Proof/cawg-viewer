import { describe, expect, it } from 'vitest'
import { VCB_SAMPLE_ISSUER } from '../devTrustDefaults'
import { decodeDidKey, didWebUrl, parseDid, resolveDid } from './did'
import { summarizeDocument } from './document'

describe('parseDid', () => {
  it('splits method, id and fragment', () => {
    expect(parseDid(' did:web:example.com#key-1 ')).toEqual({
      did: 'did:web:example.com',
      method: 'web',
      methodSpecificId: 'example.com',
      fragment: 'key-1',
    })
  })

  it('rejects things that are not DIDs', () => {
    for (const bad of ['https://example.com', 'did:Web:example.com', 'did:web:', 'did::x']) {
      expect(() => parseDid(bad)).toThrow()
    }
  })
})

describe('didWebUrl', () => {
  it('maps hosts, ports and paths per the did:web spec', () => {
    expect(didWebUrl('example.com')).toBe('https://example.com/.well-known/did.json')
    expect(didWebUrl('example.com%3A3000')).toBe('https://example.com:3000/.well-known/did.json')
    expect(didWebUrl('example.com:user:alice')).toBe('https://example.com/user/alice/did.json')
  })
})

describe('did:key', () => {
  it('decodes the Ed25519 example from the did:key spec', () => {
    // Expected value from an independent base58btc decode of the same DID.
    const { codec, key, jwk } = decodeDidKey('z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')
    expect(codec).toBe('Ed25519')
    expect(key.length).toBe(32)
    expect(jwk).toEqual({ kty: 'OKP', crv: 'Ed25519', x: 'Lm_M42cB3HkUiODQsXRcweM6TByfzEHGO9ND274JcOY' })
  })

  it('builds a Multikey document used for signing', async () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const { document, via } = await resolveDid(parseDid(did))
    expect(via).toBe('local')
    const summary = summarizeDocument(document, did)
    expect(summary.keys).toHaveLength(1)
    expect(summary.keys[0]).toMatchObject({ type: 'Multikey', key: 'multibase Ed25519' })
    expect(summary.keys[0].purposes).toContain('assertionMethod')
    expect(summary.keys[0].purposes).not.toContain('keyAgreement')
    expect(summary.notes).toEqual([])
  })

  it('rejects other multibase encodings and unknown key types', () => {
    expect(() => decodeDidKey('uAAAA')).toThrow(/base58btc/)
    expect(() => decodeDidKey('z1111111111')).toThrow(/Unsupported/)
  })
})

describe('did:jwk', () => {
  it('decodes the VCB sample issuer into a JsonWebKey2020 document', async () => {
    const { document } = await resolveDid(parseDid(VCB_SAMPLE_ISSUER))
    const summary = summarizeDocument(document, VCB_SAMPLE_ISSUER)
    expect(summary.keys[0]).toMatchObject({ id: `${VCB_SAMPLE_ISSUER}#0`, type: 'JsonWebKey2020', key: 'OKP Ed25519 · EdDSA' })
    expect(summary.keys[0].purposes).toEqual(
      expect.arrayContaining(['assertionMethod', 'authentication', 'keyAgreement']),
    )
    expect(summary.notes).toEqual([])
  })

  it('limits a signing-only key to signing relationships', async () => {
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: 'Lm_M42cB3HkUiODQsXRcweM6TByfzEHGO9ND274JcOY', use: 'sig' }
    const did = `did:jwk:${btoa(JSON.stringify(jwk)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}`
    const { document } = await resolveDid(parseDid(did))
    expect(document.keyAgreement).toBeUndefined()
    expect(document.assertionMethod).toEqual([`${did}#0`])
  })

  it('refuses private key material', async () => {
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: 'AA', d: 'secret' }
    const did = `did:jwk:${btoa(JSON.stringify(jwk)).replace(/=+$/, '')}`
    await expect(resolveDid(parseDid(did))).rejects.toThrow(/private key/)
  })
})

describe('summarizeDocument', () => {
  it('handles keys embedded in relationships and flags departures from DID Core', () => {
    // The shape Adobe's did:web issuer documents use.
    const did = 'did:web:issuer.example'
    const summary = summarizeDocument(
      {
        '@context': 'https://www.w3.org/ns/did/v1',
        id: did,
        assertionMethod: [
          { id: `${did}#key-0`, controller: did, type: 'JsonWebKey', publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'AA', alg: 'EdDSA' } },
        ],
        authentication: ['#key-1'],
        services: [],
      },
      did,
    )
    expect(summary.keys).toEqual([
      expect.objectContaining({ id: `${did}#key-0`, embedded: true, purposes: ['assertionMethod'], key: 'OKP Ed25519 · EdDSA' }),
    ])
    expect(summary.notes).toEqual([
      'authentication refers to #key-1, which isn\'t a verification method in this document.',
      `${did}#key-0 has type "JsonWebKey"; the registered type is "JsonWebKey2020".`,
      'The document has "services"; DID Core defines "service".',
    ])
  })

  it('notes an id that differs from the DID resolved', () => {
    expect(summarizeDocument({ id: 'did:web:other.example' }, 'did:web:issuer.example').notes[0]).toMatch(/not did:web:issuer/)
  })
})
