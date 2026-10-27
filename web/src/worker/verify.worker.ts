// Runs the c2pa-rs WASM module off the main thread.
import * as Comlink from 'comlink'
import init, { verify, c2pa_version } from '../wasm/pkg/viewer.js'
import wasmUrl from '../wasm/pkg/viewer_bg.wasm?url'
import type { Report, VerifyOptions } from '../c2pa/types'

const ready = init({ module_or_path: wasmUrl })

const api = {
  async version(): Promise<string> {
    await ready
    return c2pa_version()
  },
  async verify(bytes: Uint8Array, format: string, options: VerifyOptions): Promise<Report> {
    await ready
    return (await verify(bytes, format, options)) as Report
  },
}

export type VerifyWorker = typeof api

Comlink.expose(api)
