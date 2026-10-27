import { useId, useMemo, useState } from 'react'
import {
  CAWG_ISSUERS,
  filterIssuers,
  filterOptions,
  hasFilters,
  NO_FILTERS,
  type CawgIssuer,
  type IssuerFilters,
  type IssuerSort,
} from '../issuers/issuers'
import { href } from '../useRoute'

const FILTERS: { key: Exclude<keyof IssuerFilters, 'search'>; label: string; all: string }[] = [
  { key: 'vendor', label: 'Vendor', all: 'All Vendors' },
  { key: 'credentialType', label: 'Credential Type', all: 'All Types' },
  { key: 'assuranceLevel', label: 'Assurance Level', all: 'All Levels' },
  { key: 'status', label: 'Status', all: 'All Statuses' },
  { key: 'specVersion', label: 'Spec Version', all: 'All Spec Versions' },
]

/** Browse, search and filter the CAWG issuer list, in the style of the C2PA Conformance Explorer. */
export function IssuersPage({ issuers = CAWG_ISSUERS }: { issuers?: CawgIssuer[] }) {
  const [filters, setFilters] = useState<IssuerFilters>(NO_FILTERS)
  const [sort, setSort] = useState<IssuerSort>('name')
  const options = useMemo(() => filterOptions(issuers), [issuers])
  const results = useMemo(() => filterIssuers(issuers, filters, sort), [issuers, filters, sort])
  const vendors = new Set(results.map((i) => i.vendor)).size
  const set = (patch: Partial<IssuerFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const searchId = useId()

  return (
    <section className="issuers">
      <h2>CAWG Issuers</h2>
      <p className="muted">Browse, search, and filter the list of CAWG issuers.</p>

      <div className="issuer-tabs" role="tablist">
        <button role="tab" aria-selected="true" className="issuer-tab">
          CAWG Issuers
        </button>
      </div>

      <div className="issuer-filters">
        <label className="issuer-field issuer-search" htmlFor={searchId}>
          <span>Search</span>
          <input
            id={searchId}
            type="search"
            placeholder="Search anything..."
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>

        <div className="issuer-selects">
          {FILTERS.map((f) => (
            <label key={f.key} className="issuer-field">
              <span>{f.label}</span>
              <select value={filters[f.key]} onChange={(e) => set({ [f.key]: e.target.value })}>
                <option value="">{f.all}</option>
                {options[f.key].map((v) => (
                  <option key={v} value={v}>
                    {f.key === 'assuranceLevel' ? `Level ${v}` : v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="issuer-reset">
          <button onClick={() => setFilters(NO_FILTERS)} disabled={!hasFilters(filters)}>
            Reset Filters
          </button>
        </div>
      </div>

      <div className="issuer-results-bar">
        <p>
          Showing <strong>{results.length}</strong> issuer{results.length === 1 ? '' : 's'} from <strong>{vendors}</strong>{' '}
          vendor{vendors === 1 ? '' : 's'}.
        </p>
        <label className="issuer-sort">
          <span>Sort results by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as IssuerSort)}>
            <option value="name">Name (A–Z)</option>
            <option value="assurance">Assurance Level (Highest)</option>
            <option value="listed">Date Listed (Newest)</option>
          </select>
        </label>
      </div>

      {results.length === 0 ? (
        <div className="issuer-empty">
          {issuers.length === 0 ? (
            <>
              <strong>No CAWG issuers are listed yet.</strong>
              <span>Issuers will appear here as they're added to the list.</span>
            </>
          ) : (
            <>
              <strong>No issuers match these filters.</strong>
              <button onClick={() => setFilters(NO_FILTERS)}>Reset Filters</button>
            </>
          )}
        </div>
      ) : (
        <ul className="issuer-grid">
          {results.map((i) => (
            <IssuerCard key={i.id} issuer={i} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AssuranceDots({ level }: { level?: number }) {
  if (!level) return <span>N/A</span>
  return (
    <span className="assurance" aria-label={`Level ${level} of 4`}>
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={`assurance-dot${n <= level ? ' on' : ''}`} />
      ))}
      Level {level}
    </span>
  )
}

function IssuerCard({ issuer: i }: { issuer: CawgIssuer }) {
  return (
    <li className="issuer-card">
      <div className="issuer-card-head">
        <strong>{i.name}</strong>
        <span className="muted">{i.vendor}</span>
        {i.website && (
          <a href={i.website} target="_blank" rel="noreferrer">
            Issuer Info ↗
          </a>
        )}
        <span className={`issuer-status issuer-status-${i.status.toLowerCase()}`}>{i.status}</span>
      </div>
      <dl>
        <dt>Credential Type(s):</dt>
        <dd>{i.credentialTypes.join(', ') || 'N/A'}</dd>
        <dt>Assurance:</dt>
        <dd>
          <AssuranceDots level={i.assuranceLevel} />
        </dd>
        <dt>Spec Version:</dt>
        <dd>{i.specVersion}</dd>
        {i.listedAt && (
          <>
            <dt>Listed:</dt>
            <dd>{new Date(i.listedAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</dd>
          </>
        )}
      </dl>
      {i.did && (
        <a className="button issuer-details" href={href('dids', { did: i.did })}>
          View DID
        </a>
      )}
    </li>
  )
}
