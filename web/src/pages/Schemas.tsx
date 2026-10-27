import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { buildSchemaTree, type SchemaNode } from '../schemas/jsonSchema'
import { describeContext, type ContextInfo } from '../schemas/jsonLd'
import { loadSchema, type LoadedSchema } from '../schemas/load'
import { SCHEMA_PRESETS } from '../schemas/presets'
import { href, useRouteQuery } from '../useRoute'

const groups = [...new Set(SCHEMA_PRESETS.map((p) => p.group))]

/** Explore a W3C credential JSON Schema or JSON-LD context by URL or from a list. */
export function SchemasPage() {
  // The URL lives in the hash (`#/schemas?url=…`), so a schema can be linked to.
  const url = new URLSearchParams(useRouteQuery()).get('url') ?? ''
  const [input, setInput] = useState(url)
  const [state, setState] = useState<{ loading?: boolean; schema?: LoadedSchema; error?: string }>({})

  useEffect(() => {
    setInput(url)
    if (!url) {
      setState({})
      return
    }
    let cancelled = false
    setState({ loading: true })
    loadSchema(url).then(
      (schema) => !cancelled && setState({ schema }),
      (e: unknown) => !cancelled && setState({ error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [url])

  const open = (next: string) => {
    if (next) location.hash = href('schemas', { url: next.trim() })
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    open(input)
  }

  return (
    <section className="schemas">
      <h2>Schemas</h2>
      <p className="muted">
        Explore the JSON Schema or JSON-LD context behind a W3C verifiable credential. Paste its URL or pick one from the
        list.
      </p>

      <form className="schema-picker" onSubmit={onSubmit}>
        <input
          type="url"
          aria-label="Schema or context URL"
          placeholder="https://www.w3.org/ns/credentials/v2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={!input.trim()}>
          Load
        </button>
        <select aria-label="Known schemas" value="" onChange={(e) => open(e.target.value)}>
          <option value="">Choose from the list…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {SCHEMA_PRESETS.filter((p) => p.group === g).map((p) => (
                <option key={p.url} value={p.url}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </form>

      {state.loading && <p className="muted">Loading {url}…</p>}
      {state.error && <p className="error">{state.error}</p>}
      {state.schema && <SchemaView schema={state.schema} onExplore={open} />}
    </section>
  )
}

function SchemaView({ schema, onExplore }: { schema: LoadedSchema; onExplore: (url: string) => void }) {
  const [tab, setTab] = useState<'explore' | 'raw'>('explore')
  const doc = schema.json as Record<string, unknown>
  const str = (k: string) => (typeof doc[k] === 'string' ? (doc[k] as string) : undefined)
  const kindLabel = { 'json-schema': 'JSON Schema', 'json-ld-context': 'JSON-LD context', unknown: 'JSON' }[schema.kind]

  return (
    <div className="schema-view">
      <header className="schema-header">
        <div>
          <span className="kind-pill">{kindLabel}</span>
          <strong>{str('title') ?? schema.url}</strong>
        </div>
        {str('description') && <p>{str('description')}</p>}
        <dl>
          <dt>URL</dt>
          <dd>
            <a href={schema.url} target="_blank" rel="noreferrer">
              {schema.url}
            </a>
            {schema.via === 'proxy' && <small> (via viewer-server)</small>}
          </dd>
          {str('$id') && str('$id') !== schema.url && (
            <>
              <dt>$id</dt>
              <dd>{str('$id')}</dd>
            </>
          )}
          {str('$schema') && (
            <>
              <dt>Dialect</dt>
              <dd>{str('$schema')}</dd>
            </>
          )}
        </dl>
      </header>

      <nav className="tabs">
        <button aria-pressed={tab === 'explore'} onClick={() => setTab('explore')}>
          Explore
        </button>
        <button aria-pressed={tab === 'raw'} onClick={() => setTab('raw')}>
          Raw JSON
        </button>
      </nav>

      {tab === 'raw' ? (
        <pre className="json">{JSON.stringify(schema.json, null, 2)}</pre>
      ) : schema.kind === 'json-schema' ? (
        <JsonSchemaExplorer json={schema.json} onExplore={onExplore} />
      ) : schema.kind === 'json-ld-context' ? (
        <ContextExplorer info={describeContext(schema.json)} onExplore={onExplore} />
      ) : (
        <p className="notice">This document is neither a JSON Schema nor a JSON-LD context. See the Raw JSON tab.</p>
      )}
    </div>
  )
}

function JsonSchemaExplorer({ json, onExplore }: { json: unknown; onExplore: (url: string) => void }) {
  const { root, unresolved } = useMemo(() => buildSchemaTree(json), [json])
  return (
    <>
      {unresolved.length > 0 && (
        <div className="schema-warning">
          <strong>
            {unresolved.length} unresolved $ref{unresolved.length === 1 ? '' : 's'}
          </strong>{' '}
          — these point at nothing in this document, so validators will reject the schema or skip those rules:
          <ul>
            {unresolved.map((u, i) => (
              <li key={i}>
                <code>{u.ref}</code> at <code>{u.at}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="schema-tree">
        <SchemaRow node={root} depth={0} onExplore={onExplore} />
      </ul>
    </>
  )
}

function SchemaRow({ node, depth, onExplore }: { node: SchemaNode; depth: number; onExplore: (url: string) => void }) {
  const structural = ['items', 'contains', 'additionalProperties', 'allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', 'not']
  const label = (
    <span className="schema-row">
      <code className={structural.includes(node.key) || node.key.startsWith('option ') ? 'kw' : 'prop'}>{node.key}</code>
      {node.required && <span className="req">required</span>}
      {node.types.map((t) => (
        <span key={t} className="type">
          {t}
        </span>
      ))}
      {node.ref && <RefBadge node={node} onExplore={onExplore} />}
      {node.constraints.map((c) => (
        <span key={c} className="constraint">
          {c}
        </span>
      ))}
      {(node.title || node.description) && (
        <span className="desc">{[node.title, node.description].filter(Boolean).join(' — ')}</span>
      )}
    </span>
  )

  if (node.children.length === 0) return <li className="leaf">{label}</li>
  return (
    <li>
      <details open={depth < 2}>
        <summary>{label}</summary>
        <ul>
          {node.children.map((c, i) => (
            <SchemaRow key={`${c.pointer}:${c.key}:${i}`} node={c} depth={depth + 1} onExplore={onExplore} />
          ))}
        </ul>
      </details>
    </li>
  )
}

function RefBadge({ node, onExplore }: { node: SchemaNode; onExplore: (url: string) => void }) {
  const ref = node.ref!
  if (ref.status === 'external' && ref.url) {
    return (
      <button className="ref external" title={`Explore ${ref.url}`} onClick={() => onExplore(ref.url!)}>
        $ref {ref.ref} ↗
      </button>
    )
  }
  const text = { resolved: '', missing: ' (missing)', cycle: ' (recursive)', external: '' }[ref.status]
  return (
    <span className={`ref ${ref.status}`}>
      $ref {ref.ref}
      {text}
    </span>
  )
}

function ContextExplorer({ info, onExplore }: { info: ContextInfo; onExplore: (url: string) => void }) {
  return (
    <div className="context-explorer">
      <p className="muted">
        {info.terms.length} terms
        {info.version !== undefined && ` · JSON-LD ${info.version}`}
        {info.protected && ' · protected'}
        {info.vocab && ` · @vocab ${info.vocab}`}
      </p>
      {info.imports.length > 0 && (
        <p>
          Imports:{' '}
          {info.imports.map((u) => (
            <button key={u} className="ref external" onClick={() => onExplore(u)}>
              {u} ↗
            </button>
          ))}
        </p>
      )}
      <TermTable info={info} />
    </div>
  )
}

function TermTable({ info }: { info: ContextInfo }) {
  return (
    <div className="term-table">
      <table>
        <thead>
          <tr>
            <th>Term</th>
            <th>IRI</th>
            <th>Type</th>
            <th>Container</th>
          </tr>
        </thead>
        <tbody>
          {info.terms.map((t) => (
            <tr key={t.term}>
              <td>
                <code>{t.term}</code>
                {t.protected && <span className="constraint">protected</span>}
                {t.scoped && (
                  <details>
                    <summary>{t.scoped.terms.length} scoped terms</summary>
                    <TermTable info={t.scoped} />
                  </details>
                )}
              </td>
              <td className="iri">
                {t.id?.startsWith('http') ? (
                  <a href={t.id} target="_blank" rel="noreferrer">
                    {t.id}
                  </a>
                ) : (
                  t.id
                )}
              </td>
              <td className="iri">{t.type}</td>
              <td>{t.container}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
