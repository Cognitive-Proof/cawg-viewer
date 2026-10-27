import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'issuers' | 'schemas' | 'dids' | 'settings'

const ROUTES: Route[] = ['home', 'issuers', 'schemas', 'dids', 'settings']

// Hash routing keeps the static build hostable anywhere, with no server rewrites.
// The hash is `#/<route>` with an optional `?query`, e.g. `#/schemas?url=…`.
function parse(hash: string): { route: Route; query: string } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?', 2)
  const route = ROUTES.includes(path as Route) ? (path as Route) : 'home'
  return { route, query }
}

function subscribe(l: () => void) {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parse(location.hash).route)
}

/** The current route's query string (without `?`). */
export function useRouteQuery(): string {
  return useSyncExternalStore(subscribe, () => parse(location.hash).query)
}

export const href = (route: Route, params?: Record<string, string>) => {
  const base = route === 'home' ? '#/' : `#/${route}`
  const query = params ? new URLSearchParams(params).toString() : ''
  return query ? `${base}?${query}` : base
}
