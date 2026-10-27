// Parsing and resolution of the DID methods CAWG credentials use: did:web
// (fetched over HTTPS), and did:jwk and did:key (decoded locally).

import { proxiedFetch } from '../c2pa/trustRegistry'
import { BACKEND_URL } from '../features'

export interface ParsedDid {
  did: string
  method: string
  methodSpecificId: string
  fragment?: string
}

const DID_RE = /^did:([a-z0-9]+):([A-Za-z0-9._%:-]*[A-Za-z0-9._%-])(#.*)?$/

export function parseDid(input: string): ParsedDid {
  const value = input.trim()
  const m = DID_RE.exec(value)
  if (!m) throw new Error('Enter a DID like did:web:example.com, did:jwk:… or did:key:z…')
  return { did: `did:${m[1]}:${m[2]}`, method: m[1], methodSpecificId: m[2], fragment: m[3]?.slice(1) }
}

/** The HTTPS URL of a did:web document, per the did:web method specification. */
export function didWebUrl(methodSpecificId: string): string {
  const [host, ...path] = methodSpecificId.split(':').map(decodeURIComponent)
  if (!host || host.includes('/')) throw new Error(`Invalid did:web host: ${host}`)
  return path.length ? `https://${host}/${path.join('/')}/did.json` : `https://${host}/.well-known/did.json`
}

export interface Resolution {
  document: Record<string, unknown>
  /** Where the document came from: a URL for did:web, or how it was derived. */
  source: string
  via: 'direct' | 'proxy' | 'local'
}

export async function resolveDid(parsed: ParsedDid): Promise<Resolution> {
  switch (parsed.method) {
    case 'web':
      return resolveWeb(parsed)
    case 'jwk':
      return { document: jwkDocument(parsed), source: 'Decoded from the DID (did:jwk)', via: 'local' }
    case 'key':
      return { document: keyDocument(parsed), source: 'Decoded from the DID (did:key)', via: 'local' }
    default:
      throw new Error(`did:${parsed.method} is not supported. Supported methods: did:web, did:jwk, did:key.`)
  }
}

async function resolveWeb(parsed: ParsedDid): Promise<Resolution> {
  const url = didWebUrl(parsed.methodSpecificId)
  const headers = { accept: 'application/did+json, application/did+ld+json, application/json;q=0.9' }
  let res: Response
  let via: Resolution['via'] = 'direct'
  try {
    res = await fetch(url, { headers })
  } catch (e) {
    if (!BACKEND_URL) throw new Error(`Could not fetch ${url}. The server may not allow cross-origin requests.`, { cause: e })
    res = await proxiedFetch(url, { headers })
    via = 'proxy'
  }
  if (!res.ok) throw new Error(`${url} responded ${res.status}`)
  let document: unknown
  try {
    document = JSON.parse(await res.text())
  } catch {
    throw new Error(`${url} did not return JSON`)
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error(`${url} did not return a DID document`)
  }
  return { document: document as Record<string, unknown>, source: url, via }
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The DID document for a did:jwk, per the did:jwk method specification. */
function jwkDocument(parsed: ParsedDid): Record<string, unknown> {
  let jwk: Record<string, unknown>
  try {
    jwk = JSON.parse(new TextDecoder().decode(base64UrlDecode(parsed.methodSpecificId)))
  } catch {
    throw new Error('This did:jwk does not contain a base64url-encoded JSON Web Key')
  }
  if (typeof jwk.kty !== 'string') throw new Error('The did:jwk key has no "kty"')
  if ('d' in jwk) throw new Error('The did:jwk key contains private key material ("d")')

  const vm = `${parsed.did}#0`
  const doc: Record<string, unknown> = {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    id: parsed.did,
    verificationMethod: [{ id: vm, type: 'JsonWebKey2020', controller: parsed.did, publicKeyJwk: jwk }],
  }
  // A key restricted to encryption only gets keyAgreement; to signing, everything but.
  if (jwk.use !== 'sig') doc.keyAgreement = [vm]
  if (jwk.use !== 'enc') {
    for (const rel of ['assertionMethod', 'authentication', 'capabilityInvocation', 'capabilityDelegation']) doc[rel] = [vm]
  }
  return doc
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58btcDecode(s: string): Uint8Array {
  let n = 0n
  for (const c of s) {
    const i = BASE58.indexOf(c)
    if (i < 0) throw new Error(`Invalid base58btc character "${c}"`)
    n = n * 58n + BigInt(i)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const c of s) {
    if (c !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

/** Multicodec public key types did:key commonly uses, keyed by their varint prefix. */
const KEY_CODECS: { prefix: number[]; name: string; length: number; jwk?: (key: Uint8Array) => Record<string, string> }[] = [
  { prefix: [0xed, 0x01], name: 'Ed25519', length: 32, jwk: (k) => ({ kty: 'OKP', crv: 'Ed25519', x: base64UrlEncode(k) }) },
  { prefix: [0xec, 0x01], name: 'X25519', length: 32, jwk: (k) => ({ kty: 'OKP', crv: 'X25519', x: base64UrlEncode(k) }) },
  { prefix: [0x80, 0x24], name: 'P-256 (compressed)', length: 33 },
  { prefix: [0x81, 0x24], name: 'P-384 (compressed)', length: 49 },
  { prefix: [0xe7, 0x01], name: 'secp256k1 (compressed)', length: 33 },
]

export function decodeDidKey(methodSpecificId: string): { codec: string; key: Uint8Array; jwk?: Record<string, string> } {
  if (!methodSpecificId.startsWith('z')) throw new Error('This did:key is not multibase base58btc (it should start with "z")')
  const bytes = base58btcDecode(methodSpecificId.slice(1))
  const codec = KEY_CODECS.find((c) => c.prefix.every((b, i) => bytes[i] === b))
  if (!codec) {
    const prefix = [...bytes.slice(0, 2)].map((b) => b.toString(16).padStart(2, '0')).join('')
    throw new Error(`Unsupported did:key key type (multicodec prefix 0x${prefix})`)
  }
  const key = bytes.slice(codec.prefix.length)
  if (key.length !== codec.length) throw new Error(`${codec.name} key should be ${codec.length} bytes, not ${key.length}`)
  return { codec: codec.name, key, jwk: codec.jwk?.(key) }
}

/** The DID document for a did:key, per the did:key method specification (Multikey form). */
function keyDocument(parsed: ParsedDid): Record<string, unknown> {
  const { codec } = decodeDidKey(parsed.methodSpecificId)
  const vm = `${parsed.did}#${parsed.methodSpecificId}`
  const doc: Record<string, unknown> = {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
    id: parsed.did,
    verificationMethod: [{ id: vm, type: 'Multikey', controller: parsed.did, publicKeyMultibase: parsed.methodSpecificId }],
  }
  if (codec === 'X25519') {
    doc.keyAgreement = [vm]
  } else {
    for (const rel of ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation']) doc[rel] = [vm]
  }
  return doc
}
