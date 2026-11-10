// crJSON types used by the vendored rubric evaluator in `./rubrics`, from
// contentauth/c2pa-conformance-tool `src/lib/crjson.ts` (Apache-2.0).
// crJSON is what c2pa-rs `Reader::to_crjson_value()` returns; viewer-core
// sends it as `Report.crjson`.

/** Validation status entry in crJSON (code, optional url, explanation) */
export interface CrJsonValidationStatus {
  code: string
  url?: string
  explanation?: string
}

/** activeManifest block inside validationResults */
export interface CrJsonActiveManifestStatus {
  success?: CrJsonValidationStatus[]
  informational?: CrJsonValidationStatus[]
  failure?: CrJsonValidationStatus[]
}

/** validationResults in crJSON (camelCase). Document-level has activeManifest; per-manifest has status codes directly. */
export interface CrJsonValidationResults {
  activeManifest?: CrJsonActiveManifestStatus
  success?: CrJsonValidationStatus[]
  informational?: CrJsonValidationStatus[]
  failure?: CrJsonValidationStatus[]
  [key: string]: unknown
}

/** Single manifest entry in crJSON manifests array */
export interface CrJsonManifestEntry {
  label: string
  assertions: Record<string, unknown>
  claim?: Record<string, unknown>
  'claim.v2'?: Record<string, unknown>
  signature?: Record<string, unknown>
  status?: Record<string, unknown>
  validationResults?: CrJsonValidationResults
  [key: string]: unknown
}

/** Root crJSON structure from Reader.crjson() */
export interface CrJson {
  '@context'?: Record<string, unknown>
  manifests: CrJsonManifestEntry[]
  validationResults?: CrJsonValidationResults
  jsonGenerator?: Record<string, unknown>
  [key: string]: unknown
}

