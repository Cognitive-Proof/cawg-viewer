import { useId } from 'react'
import {
  countCerts,
  DEFAULT_DEV_CAWG_ISSUERS,
  DEFAULT_DEV_TRUST_PEM,
  parseIssuers,
  updateSettings,
  useSettings,
  type Settings,
} from '../settings'

export function SettingsPage() {
  const s = useSettings()
  return (
    <section className="settings">
      <h2>Settings</h2>

      <div className="setting">
        <label className="toggle">
          <input
            type="checkbox"
            checked={s.developerMode}
            onChange={(e) => updateSettings({ developerMode: e.target.checked })}
          />
          <span>
            <strong>Developer mode</strong>
            <small>Test your own signing certificates before they are on a public trust list.</small>
          </span>
        </label>
      </div>

      {s.developerMode && (
        <div className="dev-settings">
          <p className="notice">
            Certificates here are trusted <em>in addition to</em> the bundled trust list, only in this browser. Results
            validated with them are labelled. Both lists start with the c2pa-rs test root CAs, so the test files and
            files signed by the dev server validate as trusted. Those CAs' private keys are public, so anything signed
            under them, or under any CA you add, will show as Trusted.
          </p>
          <TrustField
            field="extraTrustPem"
            title="C2PA signer trust anchors"
            hint="Root or intermediate CA certificates for manifest signing certificates."
          />
          <TrustField
            field="extraCawgTrustPem"
            title="CAWG identity trust anchors"
            hint="CA certificates for X.509 CAWG identity assertions (cawg.x509.cose)."
          />
          <IssuersField />
        </div>
      )}
    </section>
  )
}

function IssuersField() {
  const id = useId()
  const value = useSettings().trustedCawgIssuers
  const count = parseIssuers(value).length
  const isDefault = value.trim() === DEFAULT_DEV_CAWG_ISSUERS
  const set = (v: string) => updateSettings({ trustedCawgIssuers: v })

  return (
    <div className="setting">
      <label htmlFor={id}>
        <strong>Trusted CAWG credential issuers</strong>
        <small>
          Issuer DIDs, one per line, for identity claims aggregation and verifiable credential binding credentials.
        </small>
      </label>
      <textarea
        id={id}
        rows={4}
        spellCheck={false}
        placeholder="did:web:issuer.example"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <div className="setting-actions">
        {value && <button onClick={() => set('')}>Clear</button>}
        {!isDefault && <button onClick={() => set(DEFAULT_DEV_CAWG_ISSUERS)}>Reset to VCB sample issuer</button>}
        <span className="muted">
          {count ? `${count} issuer${count === 1 ? '' : 's'}` : 'None added'}
          {isDefault && ' · VCB sample issuer (default)'}
        </span>
      </div>
    </div>
  )
}

type PemField = keyof Pick<Settings, 'extraTrustPem' | 'extraCawgTrustPem'>

function TrustField({ field, title, hint }: { field: PemField; title: string; hint: string }) {
  const id = useId()
  const value = useSettings()[field]
  const certs = countCerts(value)
  const isDefault = value.trim() === DEFAULT_DEV_TRUST_PEM
  const set = (v: string) => updateSettings({ [field]: v })

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const pems = await Promise.all([...files].map(toPem))
    set([value.trim(), ...pems].filter(Boolean).join('\n'))
  }

  return (
    <div className="setting">
      <label htmlFor={id}>
        <strong>{title}</strong>
        <small>{hint}</small>
      </label>
      <textarea
        id={id}
        rows={8}
        spellCheck={false}
        placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <div className="setting-actions">
        <label className="button">
          Add certificate file…
          <input type="file" accept=".pem,.crt,.cer,.der" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </label>
        {value && <button onClick={() => set('')}>Clear</button>}
        {!isDefault && <button onClick={() => set(DEFAULT_DEV_TRUST_PEM)}>Reset to c2pa-rs test roots</button>}
        <span className={value && !certs ? 'error' : 'muted'}>
          {value ? (certs ? `${certs} certificate${certs === 1 ? '' : 's'}` : 'No PEM certificates found') : 'None added'}
          {isDefault && ' · c2pa-rs test roots (default)'}
        </span>
      </div>
    </div>
  )
}

/** Reads a PEM file as-is, or wraps a binary DER certificate as PEM. */
async function toPem(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const text = new TextDecoder().decode(bytes)
  if (text.includes('-----BEGIN CERTIFICATE-----')) return text.trim()
  const b64 = btoa(String.fromCharCode(...bytes))
  return `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`
}
