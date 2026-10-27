import { describe, expect, it } from 'vitest'
import { toOutcome } from './toOutcome'
import type { Report } from './types'

const report: Report = {
  store: {
    active_manifest: 'urn:m1',
    manifests: {
      'urn:m1': {
        title: 'photo.jpg',
        instance_id: 'xmp:iid:1',
        claim_generator_info: [{ name: 'test app' }],
        thumbnail: { format: 'image/jpeg', identifier: 'self#jumbf=thumb' },
        assertions: [
          { label: 'cawg.identity', data: { signer_payload: { sig_type: 'cawg.x509.cose' } } },
          { label: 'cawg.training-mining', data: { entries: {} } },
        ],
        ingredients: [{ title: 'parent.jpg', active_manifest: 'urn:m0' }],
      },
    },
    validation_results: { activeManifest: { success: [{ code: 'claimSignature.validated' }] } },
    validation_state: 'Trusted',
  },
  resources: { 'self#jumbf=thumb': { format: 'image/jpeg', data: 'AAEC' } },
}

describe('toOutcome', () => {
  const outcome = toOutcome(report)

  it('keys assertions by label, as the CAWG plugin reads them', () => {
    expect(outcome.manifests[0].assertions['cawg.identity'].signer_payload.sig_type).toBe('cawg.x509.cose')
    expect(outcome.manifestStore?.manifests['urn:m1'].assertions?.['cawg.training-mining']).toEqual({ entries: {} })
  })

  it('maps Trusted to state=true and a Valid store', () => {
    expect(outcome.state).toBe(true)
    expect(outcome.manifestStore?.validation_state).toBe('Valid')
    expect(outcome.manifestStore?.activeManifest).toBe('urn:m1')
  })

  it('turns thumbnails into data URLs', () => {
    expect(outcome.manifests[0].thumbnail).toBe('data:image/jpeg;base64,AAEC')
    expect(outcome.manifestStore?.manifests['urn:m1'].thumbnail).toMatchObject({ url: 'data:image/jpeg;base64,AAEC' })
  })

  it('carries ingredient manifest ids', () => {
    expect((outcome.manifests[0].ingredients as unknown[])[0]).toMatchObject({ title: 'parent.jpg', manifestId: 'urn:m0' })
  })

  it('has no manifest store when the file has no credentials', () => {
    const none = toOutcome({ store: { manifests: {}, validation_state: 'None' }, resources: {} })
    expect(none.manifestStore).toBeUndefined()
    expect(none.state).toBe(false)
  })
})
