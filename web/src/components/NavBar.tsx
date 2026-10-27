import { useSettings } from '../settings'
import { href, type Route } from '../useRoute'

const items: { route: Route; label: string }[] = [
  { route: 'home', label: 'Home' },
  { route: 'issuers', label: 'Issuers' },
  { route: 'schemas', label: 'Schemas' },
  { route: 'dids', label: 'DIDs' },
  { route: 'settings', label: 'Settings' },
]

export function NavBar({ route, version, mode }: { route: Route; version?: string; mode: string }) {
  const { developerMode } = useSettings()
  return (
    <nav className="navbar" aria-label="Main">
      <a className="brand" href={href('home')}>
        CAWG Viewer
      </a>
      <ul>
        {items.map((i) => (
          <li key={i.route}>
            <a href={href(i.route)} aria-current={route === i.route ? 'page' : undefined}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
      <span className="muted nav-meta">
        {developerMode && <span className="dev-pill">Developer mode</span>}
        c2pa-rs {version ?? '…'} · {mode}
      </span>
    </nav>
  )
}
