import { describe, expect, it } from 'vitest'
import { CAWG_ISSUERS, filterIssuers, filterOptions, hasFilters, NO_FILTERS, type CawgIssuer } from './issuers'

// Test data only; the shipped list is empty.
const issuers: CawgIssuer[] = [
  { id: 'a', name: 'Acme Identity', vendor: 'Acme', did: 'did:web:acme.example', credentialTypes: ['Identity claims aggregation'], assuranceLevel: 2, status: 'Active', specVersion: '1.2', listedAt: '2026-03-01' },
  { id: 'b', name: 'Beta Badges', vendor: 'Beta', credentialTypes: ['Verifiable credential binding', 'X.509 certificate'], assuranceLevel: 3, status: 'Active', specVersion: '1.3', listedAt: '2026-06-01' },
  { id: 'c', name: 'Acme Legacy', vendor: 'Acme', credentialTypes: ['X.509 certificate'], status: 'Revoked', specVersion: '1.1' },
]

describe('CAWG issuer list', () => {
  it('ships empty', () => {
    expect(CAWG_ISSUERS).toEqual([])
    expect(filterIssuers(CAWG_ISSUERS, NO_FILTERS)).toEqual([])
  })

  it('offers the known credential types and spec versions even when empty', () => {
    const empty = filterOptions([])
    expect(empty.credentialType).toEqual(['Identity claims aggregation', 'Verifiable credential binding', 'X.509 certificate'])
    expect(empty.specVersion).toEqual(['1.1', '1.2', '1.3'])
    expect(empty.vendor).toEqual([])
    expect(empty.status).toEqual([])
    expect(empty.assuranceLevel).toEqual([])
  })

  it('derives vendor, status and assurance options from the list', () => {
    const o = filterOptions(issuers)
    expect(o.vendor).toEqual(['Acme', 'Beta'])
    expect(o.status).toEqual(['Active', 'Revoked'])
    expect(o.assuranceLevel).toEqual(['2', '3'])
  })

  it('searches every field, all terms required', () => {
    const ids = (search: string) => filterIssuers(issuers, { ...NO_FILTERS, search }).map((i) => i.id)
    expect(ids('acme')).toEqual(['a', 'c'])
    expect(ids('did:web:acme')).toEqual(['a'])
    expect(ids('acme revoked')).toEqual(['c'])
    expect(ids('binding')).toEqual(['b'])
    expect(ids('nothing-matches')).toEqual([])
  })

  it('applies each dropdown filter', () => {
    const ids = (f: Partial<typeof NO_FILTERS>) => filterIssuers(issuers, { ...NO_FILTERS, ...f }).map((i) => i.id)
    expect(ids({ vendor: 'Acme' })).toEqual(['a', 'c'])
    expect(ids({ credentialType: 'X.509 certificate' })).toEqual(['c', 'b']) // by name: Acme Legacy, Beta Badges
    expect(ids({ assuranceLevel: '3' })).toEqual(['b'])
    expect(ids({ status: 'Revoked' })).toEqual(['c'])
    expect(ids({ specVersion: '1.2' })).toEqual(['a'])
    expect(ids({ vendor: 'Acme', status: 'Active' })).toEqual(['a'])
  })

  it('sorts by name, assurance or date listed', () => {
    const ids = (sort: Parameters<typeof filterIssuers>[2]) => filterIssuers(issuers, NO_FILTERS, sort).map((i) => i.id)
    expect(ids('name')).toEqual(['a', 'c', 'b'])
    expect(ids('assurance')).toEqual(['b', 'a', 'c'])
    expect(ids('listed')).toEqual(['b', 'a', 'c'])
  })

  it('knows when any filter is set', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false)
    expect(hasFilters({ ...NO_FILTERS, search: ' x ' })).toBe(true)
    expect(hasFilters({ ...NO_FILTERS, search: '   ' })).toBe(false)
  })
})
