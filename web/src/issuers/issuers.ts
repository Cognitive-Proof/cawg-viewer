// The CAWG issuer list: organizations that issue the credentials behind CAWG
// identity assertions. Empty until there are listed issuers.

export interface CawgIssuer {
  /** Stable id, e.g. a slug. */
  id: string
  name: string
  vendor: string
  /** The issuer's DID, if it signs credentials as one. */
  did?: string
  /** Kinds of credential issued, e.g. "Identity claims aggregation". */
  credentialTypes: string[]
  /** Assurance level, 1 (lowest) to 4. */
  assuranceLevel?: number
  /** e.g. "Active", "Suspended", "Revoked". */
  status: string
  /** CAWG identity assertion specification version, e.g. "1.2". */
  specVersion: string
  website?: string
  /** ISO 8601 date the issuer was listed. */
  listedAt?: string
}

export const CAWG_ISSUERS: CawgIssuer[] = []

/** The credential types the CAWG identity assertion specification defines. */
export const KNOWN_CREDENTIAL_TYPES = ['X.509 certificate', 'Identity claims aggregation', 'Verifiable credential binding']

/** Published CAWG identity assertion specification versions. */
export const KNOWN_SPEC_VERSIONS = ['1.1', '1.2', '1.3']

export interface IssuerFilters {
  search: string
  vendor: string
  credentialType: string
  assuranceLevel: string
  status: string
  specVersion: string
}

export type IssuerSort = 'name' | 'assurance' | 'listed'

export const NO_FILTERS: IssuerFilters = {
  search: '',
  vendor: '',
  credentialType: '',
  assuranceLevel: '',
  status: '',
  specVersion: '',
}

/** Dropdown options: the values present in the list, plus the spec's known credential types and versions. */
export function filterOptions(issuers: CawgIssuer[]) {
  const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return {
    vendor: sorted(issuers.map((i) => i.vendor)),
    credentialType: sorted([...KNOWN_CREDENTIAL_TYPES, ...issuers.flatMap((i) => i.credentialTypes)]),
    assuranceLevel: sorted(issuers.flatMap((i) => (i.assuranceLevel ? [String(i.assuranceLevel)] : []))),
    status: sorted(issuers.map((i) => i.status)),
    specVersion: sorted([...KNOWN_SPEC_VERSIONS, ...issuers.map((i) => i.specVersion)]),
  }
}

export function filterIssuers(issuers: CawgIssuer[], f: IssuerFilters, sort: IssuerSort = 'name'): CawgIssuer[] {
  const terms = f.search.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = issuers.filter((i) => {
    if (f.vendor && i.vendor !== f.vendor) return false
    if (f.credentialType && !i.credentialTypes.includes(f.credentialType)) return false
    if (f.assuranceLevel && String(i.assuranceLevel ?? '') !== f.assuranceLevel) return false
    if (f.status && i.status !== f.status) return false
    if (f.specVersion && i.specVersion !== f.specVersion) return false
    if (terms.length) {
      const text = [i.name, i.vendor, i.did, i.status, i.specVersion, ...i.credentialTypes].join(' ').toLowerCase()
      if (!terms.every((t) => text.includes(t))) return false
    }
    return true
  })

  const byName = (a: CawgIssuer, b: CawgIssuer) => a.name.localeCompare(b.name)
  return matches.sort((a, b) => {
    if (sort === 'assurance') return (b.assuranceLevel ?? 0) - (a.assuranceLevel ?? 0) || byName(a, b)
    if (sort === 'listed') return (b.listedAt ?? '').localeCompare(a.listedAt ?? '') || byName(a, b)
    return byName(a, b)
  })
}

export const hasFilters = (f: IssuerFilters) => Object.values(f).some((v) => v.trim() !== '')
