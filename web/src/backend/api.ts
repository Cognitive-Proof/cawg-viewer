// viewer-server client. Only imported from the full build.
import { BACKEND_URL } from '../features'
import type { Report } from '../c2pa/types'
import { formatOf } from '../c2pa/client'
import type { DevTrust } from '../settings'

/**
 * Cloud Run rejects HTTP/1 request bodies over 32 MiB, so larger files can't go
 * to the server. In-browser validation has no such limit.
 */
export const MAX_SERVER_UPLOAD = 32 * 1024 * 1024

function checkSize(file: File, action: string) {
  if (file.size > MAX_SERVER_UPLOAD) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    throw new Error(
      `${file.name} is ${mb} MB, too large to ${action} on the server (limit 32 MB). In-browser validation still works.`,
    )
  }
}

async function fail(res: Response): Promise<never> {
  throw new Error((await res.text()) || `Server responded ${res.status}`)
}

/**
 * Native c2pa-rs validation on the server, with live OCSP fetching. Developer-mode
 * trust anchors are sent along and added to the server's own for this request only.
 */
export async function deepVerify(file: File, extraTrust?: DevTrust): Promise<Report> {
  checkSize(file, 'verify')
  const body = new FormData()
  body.append('file', file)
  body.append('format', formatOf(file))
  if (extraTrust?.trustPem) body.append('trustPem', extraTrust.trustPem)
  if (extraTrust?.cawgTrustPem) body.append('cawgTrustPem', extraTrust.cawgTrustPem)
  for (const did of extraTrust?.trustedCawgIssuers ?? []) body.append('trustedCawgIssuer', did)
  const res = await fetch(`${BACKEND_URL}/api/verify`, { method: 'POST', body })
  return res.ok ? res.json() : fail(res)
}

/** Signs `file` with the server's configured certificate and returns the signed file. */
export async function sign(file: File, manifest: string): Promise<File> {
  checkSize(file, 'sign')
  const body = new FormData()
  body.append('file', file)
  body.append('manifest', manifest)
  const res = await fetch(`${BACKEND_URL}/api/sign`, { method: 'POST', body })
  if (!res.ok) return fail(res)
  const name = file.name.replace(/(\.[^.]+)?$/, '-signed$1')
  return new File([await res.blob()], name, { type: file.type })
}
