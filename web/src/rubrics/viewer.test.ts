// Runs every rubric on crJSON from *our* c2pa-rs fork for the bundled samples.
// Upstream's golden tests cover the evaluator; this catches crJSON differences
// in our fork that would make a check error instead of pass or fail.
// Regenerate a fixture's crJSON and manifest store with:
//   TRUST_PEM=web/public/trust/trustlist.pem CRJSON=1 \
//     cargo run -q -p viewer-core --example dump -- web/src/samples/<name>.jpg image/jpeg > web/src/rubrics/__fixtures__/<name>.crjson.json
//   TRUST_PEM=web/public/trust/trustlist.pem \
//     cargo run -q -p viewer-core --example dump -- web/src/samples/<name>.jpg image/jpeg > web/src/rubrics/__fixtures__/<name>.store.json
import { describe, expect, it } from 'vitest'
import type { ManifestStoreReport } from '../c2pa/types'
import type { CrJson } from '../lib/crjson'
import { parseRubricYaml } from '../lib/rubrics/loader'
import type { RubricIndexEntry } from '../lib/rubrics/types'
import index from '../../public/rubrics/index.json'
import { evaluate, localRubrics, rubricContext } from './run'

const yaml = import.meta.glob<string>('../../public/rubrics/*.yml', { eager: true, query: '?raw', import: 'default' })
const fixtures = import.meta.glob<CrJson>('./__fixtures__/*.crjson.json', { eager: true, import: 'default' })
const stores = import.meta.glob<ManifestStoreReport>('./__fixtures__/*.store.json', { eager: true, import: 'default' })
/** What the Rubrics tab evaluates for a fixture: its crJSON plus the identity credentials from its store. */
const context = (path: string) => rubricContext(fixtures[path], stores[path.replace('.crjson.', '.store.')])
const entries = [...(index.rubrics as RubricIndexEntry[]), ...localRubrics]
const rubric = (e: RubricIndexEntry) => parseRubricYaml(yaml[`../../public/rubrics/${e.filename}`], e.filename)

describe.each(Object.keys(fixtures))('rubrics on %s', (path) => {
  const crjson = context(path)

  it.each(entries.map((e) => [e.id, e] as const))('%s evaluates without errors', (_, entry) => {
    const result = evaluate(entry, rubric(entry), crjson)
    if (result.mode === 'document') {
      const errored = result.statements.filter((s) => s.error).map((s) => `${s.id}: ${s.error}`)
      expect(errored).toEqual([])
    } else {
      expect(result.manifests.length).toBeGreaterThanOrEqual(crjson.manifests.length)
    }
  })

  it('reports only the untrusted test signer as an integrity failure', () => {
    const entry = entries.find((e) => e.id === 'asset-integrity')!
    const result = evaluate(entry, rubric(entry), crjson)
    if (result.mode !== 'document') throw new Error('expected a document rubric')
    const failed = result.statements.filter((s) => s.passed === false).map((s) => s.id)
    expect(failed).toEqual(['validation:trusted_success'])
  })
})

describe('CAWG identity rubric', () => {
  const entry = entries.find((e) => e.id === 'cawg-identity')!
  const run = (crjson: CrJson) => {
    const result = evaluate(entry, rubric(entry), crjson)
    if (result.mode !== 'document') throw new Error('expected a document rubric')
    return result.statements
  }
  const failed = (crjson: CrJson) => run(crjson).filter((s) => s.passed === false).map((s) => s.id)
  const x509 = fixtures['./__fixtures__/C_with_CAWG_data.crjson.json']
  const vcb = fixtures['./__fixtures__/cawg_vcb.crjson.json']

  it('passes the structural checks on the CAWG samples', () => {
    // The X.509 sample is signed by the untrusted c2pa-rs test cert.
    expect(failed(x509)).toEqual(['validation:cawg_trusted_success'])
    expect(failed(vcb)).toEqual([])
  })

  it('warns, without failing, when there is no identity assertion', () => {
    const statements = run(fixtures['./__fixtures__/ocsp.crjson.json'])
    expect(statements.filter((s) => s.passed === false).map((s) => [s.id, s.warned])).toEqual([
      ['identity:assertion_present', true],
    ])
  })

  it('fails when referenced_assertions omits the hard binding', () => {
    const mutated = structuredClone(x509)
    const identity = mutated.manifests[0].assertions['cawg.identity'] as {
      signer_payload: { referenced_assertions: { url: string }[] }
    }
    const refs = identity.signer_payload.referenced_assertions
    identity.signer_payload.referenced_assertions = refs.filter((r) => !r.url.endsWith('/c2pa.hash.data'))
    expect(identity.signer_payload.referenced_assertions).toHaveLength(refs.length - 1)
    expect(failed(mutated)).toContain('identity:hard_binding_referenced')
    expect(run(mutated).find((s) => s.id === 'identity:hard_binding_referenced')!.message).toContain('cawg.identity')
  })

  type Identity = { pad1?: unknown; signature?: unknown; signer_payload: Record<string, unknown> }
  it.each<[string, (a: Identity) => void]>([
    ['identity:pad1_present', (a) => delete a.pad1],
    ['identity:signature_present', (a) => delete a.signature],
    ['identity:sig_type_present', (a) => delete a.signer_payload.sig_type],
    ['identity:sig_type_known', (a) => (a.signer_payload.sig_type = 'cawg.example')],
    ['identity:referenced_assertions_present', (a) => (a.signer_payload.referenced_assertions = [])],
    ['identity:signer_payload_present', (a) => delete (a as Partial<Identity>).signer_payload],
  ])('fails %s on a mutated identity assertion', (id, mutate) => {
    const mutated = structuredClone(vcb)
    mutate(mutated.manifests[0].assertions['cawg.identity'] as Identity)
    expect(failed(mutated)).toContain(id)
  })

  it('fails on an unknown training-mining use value', () => {
    const mutated = structuredClone(x509)
    const tm = mutated.manifests[0].assertions['cawg.training-mining'] as { entries: Record<string, { use: string }> }
    tm.entries['cawg.ai_inference'].use = 'maybe'
    expect(failed(mutated)).toContain('training_mining:use_allowed_values')
  })
})

describe('W3C verifiable credentials rubric', () => {
  const entry = entries.find((e) => e.id === 'w3c-credentials')!
  const run = (crjson: CrJson) => {
    const result = evaluate(entry, rubric(entry), crjson)
    if (result.mode !== 'document') throw new Error('expected a document rubric')
    return result.statements
  }
  const failed = (crjson: CrJson) => run(crjson).filter((s) => s.passed === false).map((s) => s.id)
  const vcbPath = './__fixtures__/cawg_vcb.crjson.json'
  type Credential = Record<string, unknown> & { verifiedIdentities: Record<string, unknown>[] }
  /** The VCB sample with its credential changed by `mutate`. */
  const mutatedVcb = (mutate: (c: Credential) => void) => {
    const store = structuredClone(stores[vcbPath.replace('.crjson.', '.store.')])
    mutate(store.manifests[store.active_manifest!].assertions!.find((a) => a.label === 'cawg.identity')!.data as Credential)
    return rubricContext(fixtures[vcbPath], store)
  }

  // The identity claims aggregation example from c2pa-rs's built-in verifier tests, wrapped as `named_actor`.
  const ica = {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://cawg.io/identity/1.1/ica/context/'],
    type: ['VerifiableCredential', 'IdentityClaimsAggregationCredential'],
    issuer: 'did:web:connected-identities.identity-stage.adobe.com',
    validFrom: '2025-04-09T22:46:13Z',
    verifiedIdentities: [
      {
        type: 'cawg.social_media',
        username: 'testuser23',
        uri: 'https://net.s2stagehance.com/testuser23',
        verifiedAt: '2025-04-09T22:45:26Z',
        provider: { id: 'https://behance.net', name: 'behance' },
      },
    ],
    c2paAsset: { referenced_assertions: [], sig_type: 'cawg.identity_claims_aggregation' },
    credentialSchema: [{ id: 'https://cawg.io/identity/1.1/ica/schema/', type: 'JSONSchema' }],
  }
  const icaContext = (credential: Record<string, unknown>) =>
    rubricContext(fixtures[vcbPath], {
      active_manifest: 'm',
      manifests: { m: { instance_id: 'i', assertions: [{ label: 'cawg.identity', data: { sig_type: 'cawg.identity_claims_aggregation', named_actor: credential } }] } },
      validation_state: 'Valid',
    })

  it('passes the VCB sample', () => {
    expect(failed(context(vcbPath))).toEqual([])
  })

  it('passes an identity claims aggregation credential', () => {
    const statements = run(icaContext(ica))
    expect(statements.filter((s) => s.passed !== true).map((s) => s.id)).toEqual([])
  })

  it('only warns when the identity assertion has no W3C credential', () => {
    for (const path of ['./__fixtures__/C_with_CAWG_data.crjson.json', './__fixtures__/ocsp.crjson.json']) {
      const statements = run(context(path))
      expect(statements.filter((s) => s.passed === false).map((s) => [s.id, s.warned])).toEqual([
        ['vc:credentials_present', true],
      ])
    }
  })

  it.each<[string, (c: Credential) => void]>([
    ['vc:context', (c) => (c['@context'] = [...(c['@context'] as string[])].reverse())],
    ['vc:id', (c) => (c.id = 'not a url')],
    ['vc:type', (c) => (c.type = ['C2PABindingCredential'])],
    ['vc:issuer', (c) => (c.issuer = { name: 'No id' })],
    // Without either, there are no verified identities either.
    ['vc:credential_subject,cawg_vc:verified_identities_present', (c) => (delete c.credentialSubject, delete (c as Partial<Credential>).verifiedIdentities)],
    ['vc:valid_from_format', (c) => (c.validFrom = '2026-01-01')],
    ['vc:valid_until_format', (c) => (c.validUntil = '2026-01-01T00:00:00')],
    ['vc:validity_period_order', (c) => (c.validUntil = '2025-01-01T00:00:00+02:00')],
    ['vc:credential_status', (c) => (c.credentialStatus = { id: 'https://status.example/1' })],
    ['vc:credential_schema', (c) => (c.credentialSchema = [{ id: 'https://schema.example/' }])],
    ['cawg_vc:profile', (c) => (c['@context'] = ['https://www.w3.org/ns/credentials/v2'])],
    ['cawg_vc:valid_from_present', (c) => delete c.validFrom],
    ['cawg_vc:verified_identities_present', (c) => (c.verifiedIdentities = [])],
    ['cawg_vc:verified_identity_fields', (c) => (c.verifiedIdentities[1].verifiedAt = 'yesterday')],
    ['cawg_vc:verified_identity_type_fields', (c) => delete c.verifiedIdentities[0].username],
  ])('fails %s on a mutated credential', (ids, mutate) => {
    expect(failed(mutatedVcb(mutate))).toEqual(ids.split(','))
  })

  it('requires a provider id only for identity claims aggregation', () => {
    const noProviderId = structuredClone(ica)
    delete (noProviderId.verifiedIdentities[0].provider as { id?: string }).id
    expect(failed(icaContext(noProviderId))).toEqual(['cawg_vc:ica_provider_id'])
    // The VCB sample's second identity has a provider without an id, and passes.
    expect(failed(context(vcbPath))).not.toContain('cawg_vc:ica_provider_id')
  })
})
