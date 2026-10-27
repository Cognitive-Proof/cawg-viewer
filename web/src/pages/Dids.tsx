import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { parseDid, resolveDid, type Resolution } from '../dids/did'
import { summarizeDocument, type KeySummary } from '../dids/document'
import { DID_PRESETS } from '../dids/presets'
import { href, useRouteQuery } from '../useRoute'

/** Resolve a DID and explore its document: keys, what each is for, and services. */
export function DidsPage() {
  // The DID lives in the hash (`#/dids?did=…`), so a DID can be linked to.
  const did = new URLSearchParams(useRouteQuery()).get('did') ?? ''
  const [input, setInput] = useState(did)
  const [state, setState] = useState<{ loading?: boolean; resolution?: Resolution; error?: string }>({})

  useEffect(() => {
    setInput(did)
    if (!did) {
      setState({})
      return
    }
    let cancelled = false
    setState({ loading: true })
    Promise.resolve()
      .then(() => resolveDid(parseDid(did)))
      .then(
        (resolution) => !cancelled && setState({ resolution }),
        (e: unknown) => !cancelled && setState({ error: e instanceof Error ? e.message : String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [did])

  const open = (next: string) => {
    if (next) location.hash = href('dids', { did: next.trim() })
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    open(input)
  }

  return (
    <section className="dids">
      <h2>DIDs</h2>
      <p className="muted">
        Resolve a decentralized identifier, such as a credential issuer, and see its keys and what each is for. Supports
        did:web, did:jwk and did:key; did:jwk and did:key are decoded locally.
      </p>

      <form className="schema-picker" onSubmit={onSubmit}>
        <input
          aria-label="DID"
          placeholder="did:web:example.com"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={!input.trim()}>
          Resolve
        </button>
        <select aria-label="Known DIDs" value="" onChange={(e) => open(e.target.value)}>
          <option value="">Choose from the list…</option>
          {DID_PRESETS.map((p) => (
            <option key={p.did} value={p.did}>
              {p.label}
            </option>
          ))}
        </select>
      </form>

      {state.loading && <p className="muted">Resolving…</p>}
      {state.error && <p className="error">{state.error}</p>}
      {state.resolution && <DidView did={parseDid(did).did} resolution={state.resolution} />}
    </section>
  )
}

function DidView({ did, resolution }: { did: string; resolution: Resolution }) {
  const [tab, setTab] = useState<'document' | 'raw'>('document')
  const summary = useMemo(() => summarizeDocument(resolution.document, did), [resolution, did])

  return (
    <div className="schema-view">
      <header className="schema-header">
        <div>
          <span className="kind-pill">DID document</span>
          <strong className="did-id">{summary.id ?? did}</strong>
        </div>
        <dl>
          <dt>Source</dt>
          <dd>
            {resolution.via === 'local' ? (
              resolution.source
            ) : (
              <a href={resolution.source} target="_blank" rel="noreferrer">
                {resolution.source}
              </a>
            )}
            {resolution.via === 'proxy' && <small> (via viewer-server)</small>}
          </dd>
          {summary.controller.length > 0 && (
            <>
              <dt>Controller</dt>
              <dd>{summary.controller.join(', ')}</dd>
            </>
          )}
          {summary.alsoKnownAs.length > 0 && (
            <>
              <dt>Also known as</dt>
              <dd>{summary.alsoKnownAs.join(', ')}</dd>
            </>
          )}
        </dl>
      </header>

      {summary.notes.length > 0 && (
        <div className="schema-warning">
          <strong>Differs from DID Core</strong>
          <ul>
            {summary.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <nav className="tabs">
        <button aria-pressed={tab === 'document'} onClick={() => setTab('document')}>
          Keys &amp; services
        </button>
        <button aria-pressed={tab === 'raw'} onClick={() => setTab('raw')}>
          Raw JSON
        </button>
      </nav>

      {tab === 'raw' ? (
        <pre className="json">{JSON.stringify(resolution.document, null, 2)}</pre>
      ) : (
        <>
          <h3>Verification methods ({summary.keys.length})</h3>
          {summary.keys.length === 0 ? (
            <p className="muted">This document has no verification methods.</p>
          ) : (
            <ul className="did-keys">
              {summary.keys.map((k) => (
                <KeyCard key={k.id} k={k} />
              ))}
            </ul>
          )}

          <h3>Services ({summary.services.length})</h3>
          {summary.services.length === 0 ? (
            <p className="muted">No services.</p>
          ) : (
            <ul className="did-keys">
              {summary.services.map((s, i) => (
                <li key={s.id ?? i} className="did-key">
                  <code className="did-id">{s.id ?? '(no id)'}</code>
                  {s.type && <span className="type">{s.type}</span>}
                  <pre className="json">{JSON.stringify(s.endpoint, null, 2)}</pre>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function KeyCard({ k }: { k: KeySummary }) {
  return (
    <li className="did-key">
      <div className="schema-row">
        <code className="did-id">{k.id}</code>
        {k.type && <span className="type">{k.type}</span>}
        {k.key && <span className="constraint">{k.key}</span>}
        {k.embedded && <span className="constraint">embedded</span>}
      </div>
      <div className="did-purposes">
        {k.purposes.length ? (
          k.purposes.map((p) => (
            <span key={p} className="purpose">
              {p}
            </span>
          ))
        ) : (
          <span className="muted">no verification relationships</span>
        )}
      </div>
      {k.controller && <small className="muted">controller {k.controller}</small>}
      <details>
        <summary>Key material</summary>
        <pre className="json">{JSON.stringify(k.raw, null, 2)}</pre>
      </details>
    </li>
  )
}
