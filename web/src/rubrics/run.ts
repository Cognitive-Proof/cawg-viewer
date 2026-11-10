// Runs the vendored C2PA conformance rubrics (`src/lib/rubrics`, from
// contentauth/c2pa-conformance-tool) against a report's crJSON.
// Imported lazily by the Rubrics tab, so json-formula and yaml stay out of the main bundle.
import type { CrJson } from '../lib/crjson'
import { evaluateRubric } from '../lib/rubrics/evaluate'
import { loadRubric, loadRubricIndex } from '../lib/rubrics/loader'
import { evaluatePerManifest } from '../lib/rubrics/perManifest'
import type { AnyRubricResult, Rubric, RubricIndexEntry } from '../lib/rubrics/types'

export type { AnyRubricResult, Rubric, RubricIndexEntry }

export { loadRubricIndex }

const cache = new Map<string, Promise<Rubric>>()

/** Loads (once) and parses a rubric's YAML from `public/rubrics/`. */
export function rubric(filename: string): Promise<Rubric> {
  let r = cache.get(filename)
  if (!r) {
    r = loadRubric(filename)
    r.catch(() => cache.delete(filename))
    cache.set(filename, r)
  }
  return r
}

export function evaluate(entry: RubricIndexEntry, rubric: Rubric, crjson: CrJson): AnyRubricResult {
  const options = { rubricId: entry.id }
  return entry.mode === 'per-manifest'
    ? evaluatePerManifest(rubric, crjson, options)
    : { ...evaluateRubric(rubric, crjson, options), mode: 'document' }
}

