import { useEffect, useMemo, useState } from 'react'
import type { ManifestStoreReport } from '../c2pa/types'
import type { CrJson } from '../lib/crjson'
import type { ManifestSignalsResult, RubricResult, StatementResult } from '../lib/rubrics/types'
import type { AnyRubricResult, Rubric, RubricIndexEntry } from '../rubrics/run'
import { updateSettings, useSettings } from '../settings'

type Run = typeof import('../rubrics/run')
// json-formula and yaml load only when the tab first opens.
const loadRun = () => import('../rubrics/run')

interface Evaluated {
  entry: RubricIndexEntry
  rubric: Rubric
  result: AnyRubricResult | { error: string }
}

export function RubricsPanel({ crjson, store }: { crjson: CrJson; store: ManifestStoreReport }) {
  const { rubrics: selected } = useSettings()
  const [lib, setLib] = useState<{ run: Run; index: RubricIndexEntry[] } | { error: string }>()
  // Parsed rubrics (or a load error) by filename.
  const [loaded, setLoaded] = useState<Record<string, Rubric | string>>({})

  useEffect(() => {
    let live = true
    loadRun()
      .then(async (run) => ({ run, index: await run.loadRubricIndex() }))
      .then(
        (l) => live && setLib(l),
        (e) => live && setLib({ error: String(e) }),
      )
    return () => {
      live = false
    }
  }, [])

  const chosen = useMemo(
    () => (lib && 'index' in lib ? lib.index.filter((e) => selected.includes(e.id)) : []),
    [lib, selected],
  )

  useEffect(() => {
    if (!lib || !('run' in lib)) return
    for (const { filename } of chosen) {
      if (filename in loaded) continue
      lib.run.rubric(filename).then(
        (r) => setLoaded((l) => ({ ...l, [filename]: r })),
        (e) => setLoaded((l) => ({ ...l, [filename]: String(e) })),
      )
    }
  }, [lib, chosen, loaded])

  const evaluated = useMemo(() => {
    if (!lib || !('run' in lib)) return []
    const context = lib.run.rubricContext(crjson, store)
    return chosen.flatMap((entry): Evaluated[] => {
      const rubric = loaded[entry.filename]
      if (rubric === undefined) return []
      if (typeof rubric === 'string') return [{ entry, rubric: { metadata: { name: entry.name }, statements: [] }, result: { error: rubric } }]
      try {
        return [{ entry, rubric, result: lib.run.evaluate(entry, rubric, context) }]
      } catch (e) {
        return [{ entry, rubric, result: { error: String(e) } }]
      }
    })
  }, [lib, chosen, loaded, crjson, store])

  if (!lib) return <p className="rubrics-note">Loading rubrics…</p>
  if ('error' in lib) return <p className="error">Could not load the rubrics: {lib.error}</p>

  const toggle = (id: string, on: boolean) =>
    updateSettings({ rubrics: on ? [...selected, id] : selected.filter((s) => s !== id) })
  const categories = [...new Set(lib.index.map((e) => e.category ?? 'Other'))]

  return (
    <div className="rubrics">
      <p className="rubrics-note">
        Rubrics from the C2PA Conformance Task Force, via{' '}
        <a href="https://github.com/contentauth/c2pa-conformance-tool" target="_blank" rel="noreferrer">
          c2pa-conformance-tool
        </a>
        ; the CAWG and W3C credential rubrics are this viewer's own. Informational: they are not part of the C2PA, CAWG or W3C specifications.
      </p>
      <div className="rubric-picker">
        {categories.map((c) => (
          <fieldset key={c}>
            <legend>{c}</legend>
            {lib.index
              .filter((e) => (e.category ?? 'Other') === c)
              .map((e) => (
                <label key={e.id} title={e.description}>
                  <input type="checkbox" checked={selected.includes(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} />
                  {e.name}
                </label>
              ))}
          </fieldset>
        ))}
        {evaluated.length > 0 && (
          <button
            onClick={() => navigator.clipboard.writeText(JSON.stringify(evaluated.map((e) => e.result), null, 2))}
          >
            Copy results JSON
          </button>
        )}
      </div>
      {chosen.length === 0 && <p className="rubrics-note">Choose a rubric above.</p>}
      {chosen.length > evaluated.length && <p className="rubrics-note">Evaluating…</p>}
      {evaluated.map(({ entry, rubric, result }) =>
        'error' in result ? (
          <section key={entry.id} className="rubric rubric-fail">
            <h3>{entry.name}</h3>
            <p className="error">{result.error}</p>
          </section>
        ) : result.mode === 'document' ? (
          <DocumentRubric key={entry.id} result={result} rubric={rubric} />
        ) : (
          <SignalsRubric key={entry.id} name={result.rubricName} version={result.rubricVersion} manifests={result.manifests} crjson={crjson} />
        ),
      )}
    </div>
  )
}

const outcome = (s: StatementResult) =>
  s.passed === null ? 'error' : s.warned ? 'warn' : s.passed ? 'pass' : 'fail'

function DocumentRubric({ result, rubric }: { result: RubricResult; rubric: Rubric }) {
  const passed = result.statements.filter((s) => outcome(s) === 'pass')
  const problems = result.statements.filter((s) => outcome(s) !== 'pass')
  // Errors first, then failures, then warnings.
  const order = { error: 0, fail: 1, warn: 2, pass: 3 }
  problems.sort((a, b) => order[outcome(a)] - order[outcome(b)])
  const section = (id: string) => {
    const s = rubric.statements.find((s) => s.id === id) as { specSection?: unknown } | undefined
    return typeof s?.specSection === 'string' ? s.specSection : undefined
  }
  const item = (s: StatementResult) => (
    <li key={s.id} className={outcome(s)}>
      <span className="outcome">{outcome(s)}</span> {s.message || s.description}
      <div className="meta">
        <code>{s.id}</code>
        {section(s.id) && <span> · {section(s.id)}</span>}
      </div>
    </li>
  )
  return (
    <section className={`rubric ${result.overallPassed ? 'rubric-pass' : 'rubric-fail'}`}>
      <h3>
        {result.rubricName}
        {result.rubricVersion && <small> v{result.rubricVersion}</small>}
        <span className="score">
          {passed.length} / {result.statements.length} passed
        </span>
      </h3>
      {problems.length > 0 && <ul>{problems.map(item)}</ul>}
      {passed.length > 0 && (
        <details>
          <summary>Show {passed.length} passed</summary>
          <ul>{passed.map(item)}</ul>
        </details>
      )}
    </section>
  )
}

function SignalsRubric({
  name,
  version,
  manifests,
  crjson,
}: {
  name: string
  version?: string
  manifests: ManifestSignalsResult[]
  crjson: CrJson
}) {
  return (
    <section className="rubric">
      <h3>
        {name}
        {version && <small> v{version}</small>}
      </h3>
      <table className="signals">
        <thead>
          <tr>
            <th>Manifest</th>
            <th>Inception</th>
            <th>Transformations</th>
          </tr>
        </thead>
        <tbody>
          {manifests.map((m, i) => (
            <tr key={i}>
              <td>
                {i === 0 && <span className="badge">active</span>} {m.pseudo ? 'Ingredient (no manifest)' : [m.assertedBy.CN, m.assertedBy.O].filter(Boolean).join(' · ') || 'Unknown signer'}
                <div className="meta">
                  {m.mimeType && <span>{m.mimeType}</span>}
                  {!m.pseudo && crjson.manifests[i] && <code> {crjson.manifests[i].label}</code>}
                </div>
              </td>
              <td>{badges(m.localInceptions)}</td>
              <td>{badges(m.localTransformations)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

const badges = (hits: { trait: string; reportText: string }[]) =>
  hits.length ? hits.map((h) => <span key={h.trait} className="badge">{h.reportText}</span>) : <span className="meta">none</span>
