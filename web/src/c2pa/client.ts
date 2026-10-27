import * as Comlink from 'comlink'
import type { VerifyWorker } from '../worker/verify.worker'
import type { Report, VerifyOptions } from './types'
import type { DevTrust } from '../settings'

let worker: Comlink.Remote<VerifyWorker> | undefined

function getWorker() {
  worker ??= Comlink.wrap<VerifyWorker>(
    new Worker(new URL('../worker/verify.worker.ts', import.meta.url), { type: 'module' }),
  )
  return worker
}

let trust: Promise<Pick<VerifyOptions, 'trustPem' | 'cawgTrustPem'>> | undefined

/** Loads bundled trust anchors from /trust. A missing file just means "no anchors of that kind". */
function loadTrust() {
  const pem = (name: string) =>
    fetch(`${import.meta.env.BASE_URL}trust/${name}`)
      .then((r) => (r.ok ? r.text() : undefined))
      .then((t) => (t?.includes('BEGIN CERTIFICATE') ? t : undefined))
      .catch(() => undefined)
  trust ??= Promise.all([pem('trustlist.pem'), pem('cawg-anchors.pem')]).then(([trustPem, cawgTrustPem]) => ({
    trustPem,
    cawgTrustPem,
  }))
  return trust
}

export function c2paVersion() {
  return getWorker().version()
}

const join = (...pems: (string | undefined)[]) => pems.filter(Boolean).join('\n') || undefined

/**
 * Validates a file in the browser with the c2pa-rs WASM module, against the
 * bundled trust anchors plus any developer-mode anchors in `extraTrust`.
 */
export async function verifyFile(
  file: File,
  options: VerifyOptions = {},
  extraTrust?: DevTrust,
): Promise<Report> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const bundled = await loadTrust()
  const opts: VerifyOptions = {
    ...options,
    trustPem: join(bundled.trustPem, extraTrust?.trustPem),
    cawgTrustPem: join(bundled.cawgTrustPem, extraTrust?.cawgTrustPem),
    trustedCawgIssuers: extraTrust?.trustedCawgIssuers,
  }
  return getWorker().verify(Comlink.transfer(bytes, [bytes.buffer]), formatOf(file), opts)
}

/** MIME type if the browser knows it, else the extension (c2pa also sniffs content). */
export function formatOf(file: File): string {
  return file.type || file.name.split('.').pop()?.toLowerCase() || 'application/octet-stream'
}
