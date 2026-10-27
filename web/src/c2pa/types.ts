// Shapes produced by viewer-core (c2pa-rs `Reader::json()` plus thumbnail bytes).
// Only the fields the viewer reads are typed; everything else passes through.

export interface ValidationStatus {
  code: string
  url?: string
  explanation?: string
}

export interface ValidationResults {
  success?: ValidationStatus[]
  informational?: ValidationStatus[]
  failure?: ValidationStatus[]
}

export interface ResourceRef {
  format: string
  identifier: string
}

export interface ReportIngredient {
  title?: string
  format?: string
  active_manifest?: string
  thumbnail?: ResourceRef
  validation_results?: { activeManifest?: ValidationResults }
  [key: string]: unknown
}

export interface ReportManifest {
  label?: string
  title?: string
  instance_id: string
  claim_generator?: string
  claim_generator_info?: { name: string; version?: string; [key: string]: unknown }[]
  claim_version?: number
  signature_info?: Record<string, unknown>
  thumbnail?: ResourceRef
  assertions?: { label: string; data: unknown; [key: string]: unknown }[]
  ingredients?: ReportIngredient[]
  credentials?: unknown[]
}

export type ValidationState = 'Invalid' | 'Valid' | 'Trusted' | 'None'

export interface ManifestStoreReport {
  active_manifest?: string
  manifests: Record<string, ReportManifest>
  validation_status?: ValidationStatus[]
  validation_results?: { activeManifest?: ValidationResults; ingredientDeltas?: unknown[] }
  validation_state: ValidationState
}

export interface Report {
  store: ManifestStoreReport
  /** Thumbnail bytes keyed by `ResourceRef.identifier`. */
  resources: Record<string, { format: string; data: string }>
}

export interface VerifyOptions {
  trustPem?: string
  cawgTrustPem?: string
  /** DIDs of trusted CAWG credential issuers (identity claims aggregation, verifiable credential binding). */
  trustedCawgIssuers?: string[]
  ocspFetch?: boolean
  remoteManifestFetch?: boolean
  /** Route all outbound HTTP through viewer-server's `/api/proxy` (full build only). */
  proxyBase?: string
}
