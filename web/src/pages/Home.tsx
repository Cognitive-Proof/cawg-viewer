import { lazy, Suspense, useCallback, useState } from 'react'
import { verifyFile } from '../c2pa/client'
import type { Report } from '../c2pa/types'
import { DropZone } from '../components/DropZone'
import { Viewer } from '../components/Viewer'
import { BACKEND_ENABLED, BACKEND_URL } from '../features'
import { developerTrust } from '../settings'

// Compiled out of the static build: the condition is a build-time constant.
const BackendTools = BACKEND_ENABLED ? lazy(() => import('../backend/BackendTools')) : null
// Dev server only; builds replace src/dev/ with a stub (see vite.config.ts).
const SampleFiles = import.meta.env.DEV ? lazy(() => import('../dev/SampleFiles')) : null

export interface Result {
  file: File
  report: Report
  source: string
  /** Developer-mode trust anchors were applied to this result. */
  devTrust: boolean
}

export function Home() {
  const [result, setResult] = useState<Result>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const onFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(undefined)
    try {
      const dev = developerTrust()
      const report = await verifyFile(file, BACKEND_URL ? { proxyBase: BACKEND_URL, ocspFetch: true } : {}, dev)
      setResult({ file, report, source: 'Validated in your browser', devTrust: !!dev })
    } catch (e) {
      setResult(undefined)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <>
      <DropZone onFile={onFile} busy={busy} />

      {SampleFiles && (
        <Suspense fallback={null}>
          <SampleFiles onFile={onFile} />
        </Suspense>
      )}

      {!BACKEND_ENABLED && (
        <p className="notice">
          Browser-only build: live revocation (OCSP) checks, signing, and lookups on servers that block cross-origin
          requests are unavailable.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <p className="file">
            <strong>{result.file.name}</strong> · {result.file.type || 'unknown type'} ·{' '}
            {(result.file.size / 1024).toFixed(1)} KB
          </p>
          {BackendTools && (
            <Suspense fallback={null}>
              <BackendTools file={result.file} onResult={setResult} onError={setError} />
            </Suspense>
          )}
          <Viewer
            key={`${result.file.name}:${result.file.lastModified}:${result.source}`}
            report={result.report}
            source={result.source}
            devTrust={result.devTrust}
          />
        </>
      )}
    </>
  )
}
