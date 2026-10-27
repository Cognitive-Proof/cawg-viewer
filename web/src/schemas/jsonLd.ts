// Lists the term definitions of a JSON-LD context document, expanding compact
// IRIs (`prefix:suffix`) against the context's own prefixes and `@vocab`.

type JsonObject = { [key: string]: unknown }

export interface ContextTerm {
  term: string
  /** The expanded IRI, or the keyword the term aliases (e.g. `@id`). */
  id?: string
  type?: string
  container?: string
  protected: boolean
  /** A scoped `@context` defined for this term. */
  scoped?: ContextInfo
}

export interface ContextInfo {
  terms: ContextTerm[]
  /** Other contexts this one imports by URL. */
  imports: string[]
  version?: number
  vocab?: string
  protected: boolean
}

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

function expand(value: string, prefixes: Map<string, string>, vocab?: string): string {
  if (value.startsWith('@') || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value
  const colon = value.indexOf(':')
  if (colon > 0) {
    const prefix = prefixes.get(value.slice(0, colon))
    if (prefix) return prefix + value.slice(colon + 1)
    return value
  }
  return vocab ? vocab + value : value
}

function describe(context: unknown, inherited: Map<string, string>): ContextInfo {
  const info: ContextInfo = { terms: [], imports: [], protected: false }
  const parts = Array.isArray(context) ? context : [context]
  const prefixes = new Map(inherited)

  for (const part of parts) {
    if (typeof part === 'string') {
      info.imports.push(part)
      continue
    }
    if (!isObject(part)) continue

    if (typeof part['@version'] === 'number') info.version = part['@version']
    if (typeof part['@vocab'] === 'string') info.vocab = part['@vocab']
    if (part['@protected'] === true) info.protected = true

    // Simple string definitions can act as prefixes for the rest.
    for (const [term, def] of Object.entries(part)) {
      if (!term.startsWith('@') && typeof def === 'string' && /[:/#]$/.test(def)) prefixes.set(term, def)
    }

    for (const [term, def] of Object.entries(part)) {
      if (term.startsWith('@')) continue
      const t: ContextTerm = { term, protected: info.protected }
      if (typeof def === 'string') {
        t.id = expand(def, prefixes, info.vocab)
      } else if (isObject(def)) {
        if (typeof def['@id'] === 'string') t.id = expand(def['@id'], prefixes, info.vocab)
        else if (typeof def['@reverse'] === 'string') t.id = `reverse of ${expand(def['@reverse'], prefixes, info.vocab)}`
        else t.id = info.vocab ? info.vocab + term : undefined
        if (typeof def['@type'] === 'string') t.type = expand(def['@type'], prefixes, info.vocab)
        if (typeof def['@container'] === 'string') t.container = def['@container']
        else if (Array.isArray(def['@container'])) t.container = def['@container'].join(', ')
        if (typeof def['@protected'] === 'boolean') t.protected = def['@protected']
        if (def['@context'] !== undefined) t.scoped = describe(def['@context'], prefixes)
      } else if (def === null) {
        t.id = '(unset)'
      }
      info.terms.push(t)
    }
  }

  return info
}

/** Describes the `@context` of a JSON-LD context document. */
export function describeContext(document: unknown): ContextInfo {
  return describe(isObject(document) ? document['@context'] : undefined, new Map())
}
