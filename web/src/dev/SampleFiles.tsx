// Dev-server only (stripped from builds): one-click test files from the local c2pa-rs checkout,
// plus samples/cawg_vcb.jpg from `cargo run -p viewer-core --example vcb_sample`.
import cawg from '../../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures/C_with_CAWG_data.jpg?url'
import ocsp from '../../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures/ocsp.jpg?url'
import vcb from './samples/cawg_vcb.jpg?url'
import none from '../../../../c2pa-rs-cawg-viewer/sdk/tests/fixtures/no_manifest.jpg?url'

const samples = [
  { label: 'CAWG identity', name: 'C_with_CAWG_data.jpg', url: cawg },
  { label: 'VCB identity', name: 'cawg_vcb.jpg', url: vcb },
  { label: 'OCSP + ingredients', name: 'ocsp.jpg', url: ocsp },
  { label: 'No credentials', name: 'no_manifest.jpg', url: none },
]

export default function SampleFiles({ onFile }: { onFile: (file: File) => void }) {
  const load = async (name: string, url: string) => {
    const blob = await (await fetch(url)).blob()
    onFile(new File([blob], name, { type: 'image/jpeg' }))
  }
  return (
    <div className="samples">
      <span className="muted">Test files:</span>
      {samples.map((s) => (
        <button key={s.name} onClick={() => load(s.name, s.url)} title={s.name}>
          {s.label}
        </button>
      ))}
    </div>
  )
}
