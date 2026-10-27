import { useMemo, useState } from 'react'
import { C2paManifest } from 'c2pa-react-component'
import type { DisclosureLevel } from 'c2pa-react-component-types'
import { createCAWGManifest } from 'c2pa-react-cawg-component'
import { toOutcome } from '../c2pa/toOutcome'
import type { Report } from '../c2pa/types'
import { ErrorBoundary } from './ErrorBoundary'
import { ValidationList } from './ValidationList'
import { href } from '../useRoute'

// Show identity credentials at L3, and open an issuer's DID on the DIDs page.
const CAWGPlugin = createCAWGManifest({
  showCredentials: true,
  onIssuerClick: (did) => {
    location.hash = href('dids', { did })
  },
})

const stateLabel: Record<string, string> = {
  Trusted: 'Trusted — signed by a certificate on the trust list',
  Valid: 'Valid — intact, but the signer is not on the trust list',
  Invalid: 'Invalid — see the failures below',
  None: 'No Content Credentials found in this file',
}

/** "Valid" covers both an untrusted signer and a trusted signer with other untrusted parts; say which. */
function label(report: Report): string {
  const state = report.store.validation_state
  const signerTrusted = report.store.validation_results?.activeManifest?.success?.some(
    (s) => s.code === 'signingCredential.trusted',
  )
  if (state === 'Valid' && signerTrusted) return 'Valid — signer trusted, but not every credential is (see below)'
  return stateLabel[state] ?? state
}

export function Viewer({ report, source, devTrust }: { report: Report; source: string; devTrust?: boolean }) {
  const [level, setLevel] = useState<DisclosureLevel>(3)
  const [tab, setTab] = useState<'manifest' | 'json'>('manifest')
  const outcome = useMemo(() => toOutcome(report), [report])

  const state = report.store.validation_state
  return (
    <section className="viewer">
      {devTrust && (
        <p className="dev-banner">
          Developer mode: validated with your own trust anchors as well as the bundled list. A "Trusted" result here
          may not be trusted by other viewers.
        </p>
      )}
      <header className={`state state-${state.toLowerCase()}`}>
        <span>{label(report)}</span>
        <small>{source}</small>
      </header>

      {state !== 'None' && (
        <>
          <nav className="tabs">
            <button aria-pressed={tab === 'manifest'} onClick={() => setTab('manifest')}>
              Manifest
            </button>
            <button aria-pressed={tab === 'json'} onClick={() => setTab('json')}>
              Raw JSON
            </button>
            {tab === 'manifest' && (
              <label>
                Detail
                <select value={level} onChange={(e) => setLevel(Number(e.target.value) as DisclosureLevel)}>
                  <option value={1}>L1 — summary</option>
                  <option value={2}>L2 — overview</option>
                  <option value={3}>L3 — details</option>
                  <option value={4}>L4 — provenance graph</option>
                </select>
              </label>
            )}
          </nav>
          {tab === 'manifest' ? (
            <>
              <ErrorBoundary key={level}>
                <C2paManifest manifest={outcome} plugin={[CAWGPlugin]} level={level} />
              </ErrorBoundary>
              <ValidationList store={report.store} />
            </>
          ) : (
            <pre className="json">{JSON.stringify(report.store, null, 2)}</pre>
          )}
        </>
      )}
    </section>
  )
}
