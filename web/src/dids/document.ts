// Summarizes a DID document for display: each verification method with the
// purposes (verification relationships) it serves, services, and anything that
// doesn't follow DID Core.

import { decodeDidKey } from './did'

export const RELATIONSHIPS = [
  'authentication',
  'assertionMethod',
  'keyAgreement',
  'capabilityInvocation',
  'capabilityDelegation',
] as const

export interface KeySummary {
  id: string
  type?: string
  controller?: string
  /** e.g. "OKP Ed25519 · EdDSA" or "Multikey Ed25519". */
  key?: string
  purposes: string[]
  /** Defined inline inside a relationship rather than in `verificationMethod`. */
  embedded: boolean
  raw: unknown
}

export interface ServiceSummary {
  id?: string
  type?: string
  endpoint: unknown
}

export interface DocumentSummary {
  id?: string
  controller: string[]
  alsoKnownAs: string[]
  keys: KeySummary[]
  services: ServiceSummary[]
  /** Departures from DID Core worth pointing out. */
  notes: string[]
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v])
const strings = (v: unknown) => list(v).filter((s): s is string => typeof s === 'string')

const CORE_PROPERTIES = new Set([
  '@context',
  'id',
  'controller',
  'alsoKnownAs',
  'verificationMethod',
  'service',
  ...RELATIONSHIPS,
])

/** Resolves a relative DID URL such as `#key-1` against the document id. */
const absolute = (ref: string, docId?: string) => (ref.startsWith('#') && docId ? docId + ref : ref)

function keyText(vm: Obj): string | undefined {
  if (isObj(vm.publicKeyJwk)) {
    const j = vm.publicKeyJwk
    return [j.kty, j.crv, j.alg && `· ${j.alg}`].filter(Boolean).join(' ')
  }
  if (typeof vm.publicKeyMultibase === 'string') {
    try {
      return `multibase ${decodeDidKey(vm.publicKeyMultibase).codec}`
    } catch {
      return 'multibase key'
    }
  }
  if (typeof vm.publicKeyBase58 === 'string') return 'base58 key (legacy)'
  return undefined
}

export function summarizeDocument(doc: Obj, requestedDid?: string): DocumentSummary {
  const docId = typeof doc.id === 'string' ? doc.id : undefined
  const notes: string[] = []
  if (!docId) notes.push('The document has no "id".')
  else if (requestedDid && docId !== requestedDid) notes.push(`The document's id is ${docId}, not ${requestedDid}.`)

  const keys = new Map<string, KeySummary>()
  const addKey = (vm: Obj, embedded: boolean) => {
    const id = typeof vm.id === 'string' ? absolute(vm.id, docId) : `(unnamed ${keys.size + 1})`
    if (!keys.has(id)) {
      keys.set(id, {
        id,
        type: typeof vm.type === 'string' ? vm.type : undefined,
        controller: typeof vm.controller === 'string' ? vm.controller : undefined,
        key: keyText(vm),
        purposes: [],
        embedded,
        raw: vm,
      })
    }
    return keys.get(id)!
  }

  for (const vm of list(doc.verificationMethod)) if (isObj(vm)) addKey(vm, false)

  for (const rel of RELATIONSHIPS) {
    for (const entry of list(doc[rel])) {
      if (typeof entry === 'string') {
        const id = absolute(entry, docId)
        const key = keys.get(id)
        if (key) key.purposes.push(rel)
        else notes.push(`${rel} refers to ${entry}, which isn't a verification method in this document.`)
      } else if (isObj(entry)) {
        addKey(entry, true).purposes.push(rel)
      }
    }
  }

  for (const k of keys.values()) {
    if (k.type === 'JsonWebKey') {
      notes.push(`${k.id} has type "JsonWebKey"; the registered type is "JsonWebKey2020".`)
    }
    if (k.purposes.length === 0) notes.push(`${k.id} isn't used for any verification relationship.`)
  }

  const serviceSource = doc.service ?? doc.services
  if (doc.service === undefined && doc.services !== undefined) {
    notes.push('The document has "services"; DID Core defines "service".')
  }
  const services = list(serviceSource)
    .filter(isObj)
    .map((s) => ({
      id: typeof s.id === 'string' ? s.id : undefined,
      type: typeof s.type === 'string' ? s.type : Array.isArray(s.type) ? s.type.join(', ') : undefined,
      endpoint: s.serviceEndpoint,
    }))

  const extra = Object.keys(doc).filter((k) => !CORE_PROPERTIES.has(k) && k !== 'services')
  if (extra.length) notes.push(`Properties outside DID Core: ${extra.join(', ')}.`)

  return {
    id: docId,
    controller: strings(doc.controller),
    alsoKnownAs: strings(doc.alsoKnownAs),
    keys: [...keys.values()],
    services,
    notes,
  }
}
