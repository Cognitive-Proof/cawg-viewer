import { describe, expect, it } from 'vitest'
import { buildSchemaTree, resolvePointer, type SchemaNode } from './jsonSchema'
import { describeContext } from './jsonLd'
import { detectKind } from './load'

const find = (n: SchemaNode, ...keys: string[]): SchemaNode => {
  let cur = n
  for (const k of keys) {
    const next = cur.children.find((c) => c.key === k)
    if (!next) throw new Error(`no ${k} under ${cur.key}: ${cur.children.map((c) => c.key)}`)
    cur = next
  }
  return cur
}

describe('detectKind', () => {
  it('tells JSON Schemas from JSON-LD contexts', () => {
    expect(detectKind({ $schema: 'https://json-schema.org/draft/2020-12/schema' })).toBe('json-schema')
    expect(detectKind({ type: 'object', properties: {} })).toBe('json-schema')
    expect(detectKind({ '@context': { name: 'https://schema.org/name' } })).toBe('json-ld-context')
    expect(detectKind([1, 2])).toBe('unknown')
  })
})

describe('buildSchemaTree', () => {
  const schema = {
    $id: 'https://example.com/schemas/vc/',
    title: 'Example credential',
    type: 'object',
    required: ['issuer', 'credentialSubject', 'validFrom'],
    properties: {
      issuer: { $ref: '#/$defs/nonEmptyUri' },
      type: { type: 'array', contains: { const: 'VerifiableCredential' }, minItems: 1 },
      credentialSubject: {
        oneOf: [{ $ref: '#/$defs/subject' }, { type: 'array', items: { $ref: '#/$defs/subject' } }],
      },
      evidence: { $ref: '#/definitions/evidence' },
      status: { $ref: 'status.json' },
      node: { $ref: '#/$defs/node' },
    },
    $defs: {
      nonEmptyUri: { type: 'string', format: 'uri', minLength: 1, description: 'A URI' },
      subject: { type: 'object', properties: { id: { type: 'string' } } },
      node: { type: 'object', properties: { next: { $ref: '#/$defs/node' } } },
    },
  }
  const { root, unresolved } = buildSchemaTree(schema)

  it('resolves local refs and keeps their constraints', () => {
    const issuer = find(root, 'issuer')
    expect(issuer.required).toBe(true)
    expect(issuer.ref).toEqual({ ref: '#/$defs/nonEmptyUri', status: 'resolved' })
    expect(issuer.types).toEqual(['string'])
    expect(issuer.constraints).toContain('format: uri')
    expect(issuer.description).toBe('A URI')
  })

  it('shows combinators, items and contains', () => {
    expect(find(root, 'type', 'contains').constraints).toContain('const: "VerifiableCredential"')
    expect(find(root, 'credentialSubject', 'oneOf', 'option 2', 'items', 'id').types).toEqual(['string'])
  })

  it('flags refs that point at nothing, like #/definitions/… in a $defs schema', () => {
    expect(find(root, 'evidence').ref?.status).toBe('missing')
    expect(unresolved).toEqual([{ ref: '#/definitions/evidence', at: '/properties/evidence' }])
  })

  it('resolves external refs against $id for exploring', () => {
    expect(find(root, 'status').ref).toEqual({
      ref: 'status.json',
      status: 'external',
      url: 'https://example.com/schemas/vc/status.json',
    })
  })

  it('stops at recursive refs', () => {
    expect(find(root, 'node', 'next').ref?.status).toBe('cycle')
  })

  it('lists required names that have no property schema', () => {
    expect(find(root, 'validFrom').required).toBe(true)
  })

  it('resolves JSON Pointers with escapes', () => {
    expect(resolvePointer({ 'a/b': { '~c': 1 } }, '#/a~1b/~0c')).toBe(1)
    expect(resolvePointer({ a: 1 }, '#/missing')).toBeUndefined()
  })
})

describe('describeContext', () => {
  const info = describeContext({
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      {
        '@version': 1.1,
        '@protected': true,
        cred: 'https://www.w3.org/2018/credentials#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        id: '@id',
        validFrom: { '@id': 'cred:validFrom', '@type': 'xsd:dateTime' },
        credentialSubject: { '@id': 'cred:credentialSubject', '@type': '@id', '@container': '@set' },
        BindingCredential: {
          '@id': 'https://cawg.example/BindingCredential',
          '@context': { termsOfUse: { '@id': 'cred:termsOfUse', '@type': '@id' } },
        },
      },
    ],
  })
  const term = (name: string) => info.terms.find((t) => t.term === name)

  it('collects imports, version and protection', () => {
    expect(info.imports).toEqual(['https://www.w3.org/ns/credentials/v2'])
    expect(info.version).toBe(1.1)
    expect(info.protected).toBe(true)
  })

  it('expands compact IRIs and keeps keyword aliases', () => {
    expect(term('validFrom')).toMatchObject({
      id: 'https://www.w3.org/2018/credentials#validFrom',
      type: 'http://www.w3.org/2001/XMLSchema#dateTime',
      protected: true,
    })
    expect(term('id')?.id).toBe('@id')
    expect(term('credentialSubject')?.container).toBe('@set')
  })

  it('describes scoped contexts with the outer prefixes', () => {
    expect(term('BindingCredential')?.scoped?.terms[0]).toMatchObject({
      term: 'termsOfUse',
      id: 'https://www.w3.org/2018/credentials#termsOfUse',
    })
  })
})
