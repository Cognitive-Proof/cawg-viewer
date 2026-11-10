// Runs every rubric on crJSON from *our* c2pa-rs fork for the bundled samples.
// Upstream's golden tests cover the evaluator; this catches crJSON differences
// in our fork that would make a check error instead of pass or fail.
// Regenerate a fixture with:
//   TRUST_PEM=web/public/trust/trustlist.pem CRJSON=1 \
//     cargo run -q -p viewer-core --example dump -- web/src/samples/<name>.jpg image/jpeg > web/src/rubrics/__fixtures__/<name>.crjson.json
import { describe, expect, it } from 'vitest'
import type { CrJson } from '../lib/crjson'
import { parseRubricYaml } from '../lib/rubrics/loader'
import type { RubricIndexEntry } from '../lib/rubrics/types'
import index from '../../public/rubrics/index.json'
import { evaluate, localRubrics } from './run'

const yaml = import.meta.glob<string>('../../public/rubrics/*.yml', { eager: true, query: '?raw', import: 'default' })
const fixtures = import.meta.glob<CrJson>('./__fixtures__/*.crjson.json', { eager: true, import: 'default' })
const entries = [...(index.rubrics as RubricIndexEntry[]), ...localRubrics]
const rubric = (e: RubricIndexEntry) => parseRubricYaml(yaml[`../../public/rubrics/${e.filename}`], e.filename)

describe.each(Object.entries(fixtures))('rubrics on %s', (_, crjson) => {

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
