import type { ManifestStoreReport, ValidationStatus } from '../c2pa/types'

const groups = ['failure', 'informational', 'success'] as const

export function ValidationList({ store }: { store: ManifestStoreReport }) {
  const results = store.validation_results?.activeManifest
  if (!results) return null
  return (
    <div className="validation">
      {groups.map((g) =>
        (results[g] ?? []).length ? (
          <details key={g} open={g === 'failure'}>
            <summary>
              {g} ({results[g]!.length})
            </summary>
            <ul>
              {results[g]!.map((s: ValidationStatus, i) => (
                <li key={i} className={g}>
                  <code>{s.code}</code> {s.explanation}
                </li>
              ))}
            </ul>
          </details>
        ) : null,
      )}
    </div>
  )
}
