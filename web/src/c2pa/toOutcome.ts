import type { Manifest, ManifestEntry, ManifestStore, VerificationOutcome } from 'c2pa-react-component-types'
import type { Report, ReportManifest, ResourceRef } from './types'

/**
 * Maps c2pa-rs's native report to the `VerificationOutcome` that
 * c2pa-react-component and c2pa-react-cawg-component render.
 *
 * Thumbnails become data URLs (the components accept a URL string or a
 * `{ url }` object), so the outcome owns no resources and needs no cleanup.
 */
export function toOutcome(report: Report): VerificationOutcome {
  const thumb = (ref?: ResourceRef): string | null => {
    const res = ref && report.resources[ref.identifier]
    return res ? `data:${res.format};base64,${res.data}` : null
  }
  // Keeps c2pa's `{ format, identifier }` and adds the URL the components display.
  const thumbRef = (ref?: ResourceRef) => (ref ? { ...ref, url: thumb(ref) ?? undefined } : undefined)

  const { store } = report
  const entries = Object.entries(store.manifests)

  const assertionsOf = (m: ReportManifest) =>
    Object.fromEntries((m.assertions ?? []).map((a) => [a.label, a.data]))

  const manifests: Manifest[] = entries.map(([label, m]) => ({
    id: label,
    title: m.title ?? '',
    claimGenerator: m.claim_generator ?? null,
    claimGeneratorInfo: (m.claim_generator_info ?? []) as Manifest['claimGeneratorInfo'],
    instanceId: m.instance_id,
    signatureInfo: (m.signature_info ?? {}) as Manifest['signatureInfo'],
    assertions: assertionsOf(m),
    credentials: (m.credentials ?? []) as [],
    thumbnail: thumb(m.thumbnail),
    ingredients: (m.ingredients ?? []).map((i) => ({
      ...i,
      manifestId: i.active_manifest,
      thumbnail: thumb(i.thumbnail),
    })) as [],
  }))

  const manifestStore: ManifestStore | undefined = store.active_manifest
    ? {
        activeManifest: store.active_manifest,
        manifests: Object.fromEntries(
          entries.map(([label, m]): [string, ManifestEntry] => [
            label,
            {
              label,
              title: m.title,
              claimGenerator: m.claim_generator ?? null,
              claimGeneratorInfo: m.claim_generator_info as ManifestEntry['claimGeneratorInfo'],
              claim_version: m.claim_version,
              instanceId: m.instance_id,
              signatureInfo: m.signature_info as ManifestEntry['signatureInfo'],
              assertions: assertionsOf(m),
              credentials: m.credentials,
              thumbnail: thumbRef(m.thumbnail),
              ingredients: (m.ingredients ?? []).map((i) => ({
                ...i,
                thumbnail: thumbRef(i.thumbnail),
              })) as ManifestEntry['ingredients'],
            },
          ]),
        ),
        validation_status: store.validation_status as ManifestStore['validation_status'],
        validation_results: store.validation_results as ManifestStore['validation_results'],
        // The component types predate c2pa's `Trusted` state; it is a stronger `Valid`.
        validation_state:
          store.validation_state === 'Trusted' ? 'Valid' : (store.validation_state as 'Valid' | 'Invalid'),
      }
    : undefined

  return { state: store.validation_state === 'Trusted', manifests, manifestStore }
}
