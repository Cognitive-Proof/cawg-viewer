// One-click test files (see src/samples/README.md). The images are fetched
// only when a button is clicked.
import cawg from '../samples/C_with_CAWG_data.jpg?url'
import vcb from '../samples/cawg_vcb.jpg?url'
import none from '../samples/no_manifest.jpg?url'
import ocsp from '../samples/ocsp.jpg?url'

const samples = [
  { label: 'CAWG identity', name: 'C_with_CAWG_data.jpg', url: cawg },
  { label: 'VCB identity', name: 'cawg_vcb.jpg', url: vcb },
  { label: 'OCSP + ingredients', name: 'ocsp.jpg', url: ocsp },
  { label: 'No credentials', name: 'no_manifest.jpg', url: none },
]

export function SampleFiles({ onFile }: { onFile: (file: File) => void }) {
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
