import { useSyncExternalStore } from 'react'
import { C2PA_RS_TEST_ROOTS, VCB_SAMPLE_ISSUER } from './devTrustDefaults'
import type { VerifyOptions } from './c2pa/types'

export interface Settings {
  /** Unlocks developer-only options such as extra trust anchors. */
  developerMode: boolean
  /** Extra C2PA signer trust anchors (PEM), used only while developer mode is on. */
  extraTrustPem: string
  /** Extra CAWG X.509 identity trust anchors (PEM), used only while developer mode is on. */
  extraCawgTrustPem: string
  /** Trusted CAWG credential issuer DIDs, one per line, used only while developer mode is on. */
  trustedCawgIssuers: string
}

/** Both developer anchor lists default to the c2pa-rs test roots, so the sample files work out of the box. */
export const DEFAULT_DEV_TRUST_PEM = C2PA_RS_TEST_ROOTS

/** The developer issuer list defaults to the VCB sample's issuer, for the same reason. */
export const DEFAULT_DEV_CAWG_ISSUERS = VCB_SAMPLE_ISSUER

const KEY = 'cawg-viewer:settings'
const defaults: Settings = {
  developerMode: false,
  extraTrustPem: DEFAULT_DEV_TRUST_PEM,
  extraCawgTrustPem: DEFAULT_DEV_TRUST_PEM,
  trustedCawgIssuers: DEFAULT_DEV_CAWG_ISSUERS,
}

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

let current = load()
const listeners = new Set<() => void>()

export function getSettings(): Settings {
  return current
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage unavailable (private window, blocked site data): keep settings for this tab only.
  }
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSettings,
  )
}

/** Developer-mode additions to the bundled trust configuration. */
export type DevTrust = Pick<VerifyOptions, 'trustPem' | 'cawgTrustPem' | 'trustedCawgIssuers'>

/** The developer trust settings that apply right now, or undefined when developer mode is off or they're all empty. */
export function developerTrust(s: Settings = current): DevTrust | undefined {
  if (!s.developerMode) return undefined
  const trustPem = s.extraTrustPem.trim() || undefined
  const cawgTrustPem = s.extraCawgTrustPem.trim() || undefined
  const issuers = parseIssuers(s.trustedCawgIssuers)
  const trustedCawgIssuers = issuers.length ? issuers : undefined
  return trustPem || cawgTrustPem || trustedCawgIssuers ? { trustPem, cawgTrustPem, trustedCawgIssuers } : undefined
}

/** Issuer DIDs from a newline-separated list, ignoring blank lines. */
export function parseIssuers(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Number of certificates in a PEM bundle. */
export function countCerts(pem: string): number {
  return pem.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0
}
