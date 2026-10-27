import { useEffect, useState } from 'react'
import { c2paVersion } from './c2pa/client'
import { NavBar } from './components/NavBar'
import { BACKEND_ENABLED } from './features'
import { Home } from './pages/Home'
import { DidsPage } from './pages/Dids'
import { IssuersPage } from './pages/Issuers'
import { SchemasPage } from './pages/Schemas'
import { SettingsPage } from './pages/Settings'
import { useRoute } from './useRoute'

export default function App() {
  const route = useRoute()
  const [version, setVersion] = useState<string>()

  useEffect(() => {
    c2paVersion().then(setVersion, () => undefined)
  }, [])

  return (
    <>
      <NavBar route={route} version={version} mode={BACKEND_ENABLED ? 'full' : 'browser-only'} />
      <main>
        {/* Home stays mounted so the loaded file survives a trip to Settings. */}
        <div hidden={route !== 'home'}>
          <Home />
        </div>
        {route === 'issuers' && <IssuersPage />}
        {route === 'schemas' && <SchemasPage />}
        {route === 'dids' && <DidsPage />}
        {route === 'settings' && <SettingsPage />}
      </main>
    </>
  )
}
