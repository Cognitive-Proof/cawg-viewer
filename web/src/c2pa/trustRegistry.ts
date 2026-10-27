import { setTrustRegistryQueryFn, type TrustRegistryQueryFn } from 'c2pa-react-cawg-component'
import { BACKEND_URL } from '../features'

/** fetch(), routed through viewer-server's proxy when the full build has one. */
export function proxiedFetch(url: string, init?: RequestInit) {
  return BACKEND_URL ? fetch(`${BACKEND_URL}/api/proxy?url=${encodeURIComponent(url)}`, init) : fetch(url, init)
}

/**
 * Queries the TRQP authorization endpoint named in a CAWG identity assertion.
 * Without the backend this only works for registries that send CORS headers.
 */
const query: TrustRegistryQueryFn = async ({ entityId, action, resource, authorityId, trqpAuthorizationUri }) => {
  if (!trqpAuthorizationUri) throw new Error('No trust registry endpoint in this credential')
  const res = await proxiedFetch(trqpAuthorizationUri, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entity_id: entityId, authority_id: authorityId, action, resource }),
  })
  if (!res.ok) throw new Error(`Trust registry responded ${res.status}`)
  return res.json()
}

export function installTrustRegistry() {
  setTrustRegistryQueryFn(query)
}
