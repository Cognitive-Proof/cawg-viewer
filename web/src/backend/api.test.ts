import { describe, expect, it, vi } from 'vitest'
import { deepVerify, MAX_SERVER_UPLOAD, sign } from './api'

describe('server upload size limit', () => {
  const big = new File([new Uint8Array(MAX_SERVER_UPLOAD + 1)], 'big.jpg', { type: 'image/jpeg' })

  it('refuses files Cloud Run would reject, without a request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(deepVerify(big)).rejects.toThrow(/too large to verify on the server \(limit 32 MB\)/)
    await expect(sign(big, '{}')).rejects.toThrow(/too large to sign on the server/)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
