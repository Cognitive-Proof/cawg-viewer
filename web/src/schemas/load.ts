import { proxiedFetch } from '../c2pa/trustRegistry'
import { BACKEND_URL } from '../features'

export type SchemaKind = 'json-schema' | 'json-ld-context' | 'unknown'

export interface LoadedSchema {
  url: string
  json: unknown
  kind: SchemaKind
  /** Fetched by the browser, or through viewer-server's proxy (full build only). */
  via: 'direct' | 'proxy'
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A JSON-LD context document has a top-level `@context`; a JSON Schema has schema keywords. */
export function detectKind(json: unknown): SchemaKind {
  if (!isObject(json)) return 'unknown'
  const schemaKeys = ['$schema', 'properties', '$defs', 'definitions', 'allOf', 'oneOf', 'anyOf']
  if (schemaKeys.some((k) => k in json)) return 'json-schema'
  if ('@context' in json) return 'json-ld-context'
  return 'unknown'
}

/**
 * Fetches a schema or context. The browser tries first; if that fails (for
 * example, the host sends no CORS headers) the full build retries through the
 * viewer-server proxy.
 */
export async function loadSchema(url: string): Promise<LoadedSchema> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Enter a full URL, e.g. https://www.w3.org/ns/credentials/v2')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only http(s) URLs can be loaded')

  const headers = { accept: 'application/ld+json, application/schema+json, application/json;q=0.9, */*;q=0.1' }
  let res: Response
  let via: LoadedSchema['via'] = 'direct'
  try {
    res = await fetch(parsed.href, { headers })
  } catch (e) {
    if (!BACKEND_URL) {
      throw new Error(`Could not fetch ${parsed.href}. The server may not allow cross-origin requests.`, { cause: e })
    }
    res = await proxiedFetch(parsed.href, { headers })
    via = 'proxy'
  }

  if (!res.ok) throw new Error(`${parsed.href} responded ${res.status}`)
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${parsed.href} did not return JSON`)
  }
  return { url: parsed.href, json, kind: detectKind(json), via }
}
