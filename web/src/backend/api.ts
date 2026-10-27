// viewer-server client. Only imported from the full build.
import { BACKEND_URL } from '../features'
import type { Report } from '../c2pa/types'
import { formatOf } from '../c2pa/client'
import type { DevTrust } from '../settings'

async function fail(res: Response): Promise<never> {
  throw new Error((await res.text()) || `Server responded ${res.status}`)
}

/**
 * Native c2pa-rs validation on the server, with live OCSP fetching. Developer-mode
 * trust anchors are sent along and added to the server's own for this request only.
 */
export async function deepVerify(file: File, extraTrust?: DevTrust): Promise<Report> {
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
  const body = new FormData()
  body.append('file', file)
  body.append('manifest', manifest)
  const res = await fetch(`${BACKEND_URL}/api/sign`, { method: 'POST', body })
  if (!res.ok) return fail(res)
  const name = file.name.replace(/(\.[^.]+)?$/, '-signed$1')
  return new File([await res.blob()], name, { type: file.type })
}
