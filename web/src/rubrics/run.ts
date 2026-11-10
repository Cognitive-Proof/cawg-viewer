// Runs the vendored C2PA conformance rubrics (`src/lib/rubrics`, from
// contentauth/c2pa-conformance-tool) against a report's crJSON.
// Imported lazily by the Rubrics tab, so json-formula and yaml stay out of the main bundle.
import type { ManifestStoreReport } from '../c2pa/types'
import type { CrJson } from '../lib/crjson'
import { evaluateRubric } from '../lib/rubrics/evaluate'
import { loadRubric, loadRubricIndex as loadUpstreamIndex } from '../lib/rubrics/loader'
import { evaluatePerManifest } from '../lib/rubrics/perManifest'
import type { AnyRubricResult, Rubric, RubricIndexEntry } from '../lib/rubrics/types'
import localIndex from './local-index.json'

export type { AnyRubricResult, Rubric, RubricIndexEntry }

/** Our own rubrics (YAML in `public/rubrics/`), kept out of the vendored index.json so a re-sync doesn't drop them. */
export const localRubrics = localIndex.rubrics as RubricIndexEntry[]

/** The upstream index followed by our local rubrics. */
export async function loadRubricIndex(): Promise<RubricIndexEntry[]> {
  return [...(await loadUpstreamIndex()), ...localRubrics]
}

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

/** A W3C verifiable credential from a CAWG identity assertion, as c2pa-rs decoded it into the manifest store. */
export interface IdentityCredential {
  /** Label of the manifest the identity assertion is in. */
  manifest: string
  /** True for the active manifest. */
  active: boolean
  /** The identity assertion's label, e.g. `cawg.identity__1`. */
  label: string
  /** `cawg.identity_claims_aggregation` or `cawg.verifiable_credential_binding`. */
  sigType: string | null
  credential: Record<string, unknown>
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The verifiable credentials (identity claims aggregation, verifiable credential binding) behind the store's
 * identity assertions. crJSON keeps only a few of their fields, so rubrics that check the credential itself
 * read these instead. X.509 identity assertions have no credential and are skipped.
 */
export function identityCredentials(store: ManifestStoreReport): IdentityCredential[] {
  return Object.entries(store.manifests ?? {}).flatMap(([manifest, m]) =>
    (m.assertions ?? []).flatMap(({ label, data }) => {
      if (label.split('__')[0] !== 'cawg.identity' || !isRecord(data)) return []
      const credential = '@context' in data ? data : isRecord(data.named_actor) && '@context' in data.named_actor ? data.named_actor : null
      if (!credential) return []
      const payload = [data.signer_payload, credential.signer_payload, credential.c2paAsset].find(isRecord)
      const sigType = typeof payload?.sig_type === 'string' ? payload.sig_type : null
      return [{ manifest, active: manifest === store.active_manifest, label, sigType, credential }]
    }),
  )
}

/** What rubrics evaluate: the crJSON, plus `identityCredentials` from the store (ignored by the upstream rubrics). */
export function rubricContext(crjson: CrJson, store: ManifestStoreReport): CrJson {
  return { ...crjson, identityCredentials: identityCredentials(store) }
}

export function evaluate(entry: RubricIndexEntry, rubric: Rubric, crjson: CrJson): AnyRubricResult {
  const options = { rubricId: entry.id }
  return entry.mode === 'per-manifest'
    ? evaluatePerManifest(rubric, crjson, options)
    : { ...evaluateRubric(rubric, crjson, options), mode: 'document' }
}

