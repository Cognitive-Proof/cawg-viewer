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
import { evaluate } from './run'

const yaml = import.meta.glob<string>('../../public/rubrics/*.yml', { eager: true, query: '?raw', import: 'default' })
const fixtures = import.meta.glob<CrJson>('./__fixtures__/*.crjson.json', { eager: true, import: 'default' })
const entries = index.rubrics as RubricIndexEntry[]
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
