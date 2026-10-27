import { useState } from 'react'
import type { Result } from '../pages/Home'
import { verifyFile } from '../c2pa/client'
import { BACKEND_URL } from '../features'
import { developerTrust } from '../settings'
import { deepVerify, sign } from './api'

const defaultManifest = JSON.stringify(
  {
    title: 'Signed with CAWG Viewer',
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [
            { action: 'c2pa.created', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture' },
          ],
        },
      },
      {
        label: 'cawg.training-mining',
        data: { entries: { 'cawg.ai_generative_training': { use: 'notAllowed' } } },
      },
    ],
  },
  null,
  2,
)

interface Props {
  file: File
  onResult: (r: Result) => void
  onError: (msg: string) => void
}

export default function BackendTools({ file, onResult, onError }: Props) {
  const [busy, setBusy] = useState<string>()
  const [manifest, setManifest] = useState(defaultManifest)
  const [signed, setSigned] = useState<{ file: File; url: string }>()

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="backend-tools">
      <button
        disabled={!!busy}
        onClick={() =>
          run('verify', async () => {
            const dev = developerTrust()
            const report = await deepVerify(file, dev)
            onResult({ file, report, source: 'Validated on the server, with OCSP', devTrust: !!dev })
          })
        }
      >
        {busy === 'verify' ? 'Verifying…' : 'Deep verify on server (OCSP)'}
      </button>

      <details>
        <summary>Sign this file</summary>
        <textarea value={manifest} onChange={(e) => setManifest(e.target.value)} rows={12} spellCheck={false} />
        <button
          disabled={!!busy}
          onClick={() =>
            run('sign', async () => {
              const out = await sign(file, manifest)
              if (signed) URL.revokeObjectURL(signed.url)
              setSigned({ file: out, url: URL.createObjectURL(out) })
              const dev = developerTrust()
              const report = await verifyFile(out, { proxyBase: BACKEND_URL, ocspFetch: true }, dev)
              onResult({ file: out, report, source: 'Signed on the server, validated in your browser', devTrust: !!dev })
            })
          }
        >
          {busy === 'sign' ? 'Signing…' : 'Sign'}
        </button>
        {signed && (
          <a href={signed.url} download={signed.file.name}>
            Download {signed.file.name}
          </a>
        )}
      </details>
    </section>
  )
}
