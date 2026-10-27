// Turns a JSON Schema document into a tree for display: properties, array
// items, combinators (allOf/anyOf/oneOf, if/then/else) and constraints, with
// `$ref`s resolved within the document.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

export type RefStatus = 'resolved' | 'missing' | 'external' | 'cycle'

export interface SchemaRef {
  ref: string
  status: RefStatus
  /** For an external ref, the absolute URL to explore. */
  url?: string
}

export interface SchemaNode {
  /** Property name, or a structural label such as `items` or `oneOf`. */
  key: string
  /** JSON Pointer of this schema within the document. */
  pointer: string
  required: boolean
  types: string[]
  title?: string
  description?: string
  /** Human-readable constraints, e.g. `const: "VerifiableCredential"`, `minItems: 1`. */
  constraints: string[]
  ref?: SchemaRef
  children: SchemaNode[]
}

export interface SchemaTree {
  root: SchemaNode
  /** Every `$ref` that points at nothing in the document. */
  unresolved: { ref: string; at: string }[]
}

const MAX_DEPTH = 40

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Resolves a JSON Pointer fragment (`#/a/b`) against `root`. */
export function resolvePointer(root: Json, fragment: string): Json | undefined {
  if (fragment === '#' || fragment === '') return root
  if (!fragment.startsWith('#/')) return undefined
  let node: Json | undefined = root
  for (const raw of fragment.slice(2).split('/')) {
    const part = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(node)) node = node[Number(part)]
    else if (isObject(node)) node = node[part]
    else return undefined
    if (node === undefined) return undefined
  }
  return node
}

const show = (v: Json) => JSON.stringify(v)

function constraintsOf(s: JsonObject): string[] {
  const out: string[] = []
  if ('const' in s) out.push(`const: ${show(s.const)}`)
  if (Array.isArray(s.enum)) out.push(`enum: ${s.enum.map(show).join(' | ')}`)
  for (const k of ['format', 'pattern', 'contentMediaType']) if (typeof s[k] === 'string') out.push(`${k}: ${s[k]}`)
  for (const k of ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'minProperties']) {
    if (typeof s[k] === 'number') out.push(`${k}: ${s[k]}`)
  }
  if (s.uniqueItems === true) out.push('uniqueItems')
  if (s.additionalProperties === false) out.push('no additional properties')
  if ('default' in s) out.push(`default: ${show(s.default)}`)
  return out
}

function typesOf(s: JsonObject): string[] {
  if (typeof s.type === 'string') return [s.type]
  if (Array.isArray(s.type)) return s.type.filter((t): t is string => typeof t === 'string')
  if ('const' in s) return [s.const === null ? 'null' : Array.isArray(s.const) ? 'array' : typeof s.const]
  return []
}

export function buildSchemaTree(root: unknown): SchemaTree {
  const unresolved: SchemaTree['unresolved'] = []
  const base = isObject(root) && typeof root.$id === 'string' ? root.$id : undefined

  function node(key: string, schema: Json, pointer: string, required: boolean, refStack: string[], depth: number): SchemaNode {
    const n: SchemaNode = { key, pointer, required, types: [], constraints: [], children: [] }

    if (schema === true || schema === false) {
      n.constraints.push(schema ? 'any value' : 'no value allowed')
      return n
    }
    if (!isObject(schema) || depth > MAX_DEPTH) return n

    // Siblings of $ref apply too (draft 2019-09 and later), so merge the
    // resolved target with the referring schema rather than replacing it.
    let s: JsonObject = schema
    if (typeof schema.$ref === 'string') {
      const ref = schema.$ref
      if (ref.startsWith('#')) {
        if (refStack.includes(ref)) {
          n.ref = { ref, status: 'cycle' }
        } else {
          const target = resolvePointer(root as Json, ref)
          if (isObject(target)) {
            n.ref = { ref, status: 'resolved' }
            s = { ...target, ...schema }
            refStack = [...refStack, ref]
          } else {
            n.ref = { ref, status: 'missing' }
            unresolved.push({ ref, at: pointer || '#' })
          }
        }
      } else {
        let url: string | undefined
        try {
          url = new URL(ref, base).href
        } catch {
          url = undefined
        }
        n.ref = { ref, status: 'external', url }
      }
    }

    n.types = typesOf(s)
    n.title = typeof s.title === 'string' ? s.title : undefined
    n.description = typeof s.description === 'string' ? s.description : undefined
    n.constraints = constraintsOf(s)

    const child = (k: string, sub: Json, p: string, req = false) =>
      n.children.push(node(k, sub, p, req, refStack, depth + 1))

    const requiredNames = new Set(Array.isArray(s.required) ? s.required.filter((r): r is string => typeof r === 'string') : [])
    if (isObject(s.properties)) {
      for (const [name, sub] of Object.entries(s.properties)) {
        child(name, sub, `${pointer}/properties/${name}`, requiredNames.has(name))
      }
    }
    // Required names with no matching property schema still matter to readers.
    for (const name of requiredNames) {
      if (!isObject(s.properties) || !(name in s.properties)) {
        n.children.push({ key: name, pointer: `${pointer}/required`, required: true, types: [], constraints: [], children: [] })
      }
    }

    if (Array.isArray(s.prefixItems)) s.prefixItems.forEach((sub, i) => child(`[${i}]`, sub, `${pointer}/prefixItems/${i}`))
    if (s.items !== undefined) {
      if (Array.isArray(s.items)) s.items.forEach((sub, i) => child(`[${i}]`, sub, `${pointer}/items/${i}`))
      else child('items', s.items, `${pointer}/items`)
    }
    if (s.contains !== undefined) child('contains', s.contains, `${pointer}/contains`)
    if (isObject(s.additionalProperties)) child('additionalProperties', s.additionalProperties, `${pointer}/additionalProperties`)

    for (const combinator of ['allOf', 'anyOf', 'oneOf'] as const) {
      const options = s[combinator]
      if (!Array.isArray(options)) continue
      const group: SchemaNode = { key: combinator, pointer: `${pointer}/${combinator}`, required: false, types: [], constraints: [], children: [] }
      options.forEach((sub, i) =>
        group.children.push(node(`option ${i + 1}`, sub, `${pointer}/${combinator}/${i}`, false, refStack, depth + 1)),
      )
      n.children.push(group)
    }
    for (const k of ['if', 'then', 'else', 'not'] as const) {
      if (s[k] !== undefined) child(k, s[k], `${pointer}/${k}`)
    }

    return n
  }

  const rootNode = node('(root)', (root ?? {}) as Json, '', false, [], 0)
  return { root: rootNode, unresolved }
}
