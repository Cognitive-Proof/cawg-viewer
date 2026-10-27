import { resolve, sep } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const src = resolve(import.meta.dirname, 'src')

/**
 * Resolves every import of a module under `src/<dir>/` to an empty stub, so that
 * code can't end up in the bundle even if an import slips past its runtime guard.
 * Used for `src/backend/` in the static build.
 */
function stripDir(dir: string): Plugin {
  const root = resolve(src, dir) + sep
  const stub = `\0stub:${dir}`
  return {
    name: `strip-${dir}`,
    enforce: 'pre',
    resolveId(id, importer) {
      if (importer?.startsWith(src) && id.startsWith('.') && resolve(importer, '..', id).startsWith(root)) return stub
    },
    load(id) {
      if (id === stub) return 'export default () => null'
    },
  }
}

export default defineConfig(({ mode }) => {
  const backend = loadEnv(mode, '.').VITE_ENABLE_BACKEND === 'true'
  return {
    // Tests (mode "test") exercise the real backend modules; builds and the static dev server strip them.
    plugins: [react(), !backend && mode !== 'test' && stripDir('backend')],
    // Keep a single React even if a linked c2pa-react-cawg-component (e.g. via
    // `npm link` while developing it) brings its own copy, so its hooks work.
    resolve: { dedupe: ['react', 'react-dom'] },
    worker: { format: 'es' },
    build: { chunkSizeWarningLimit: 1000 },
    server: {
      // In `dev:full`, forward API calls to a locally running viewer-server.
      proxy: { '/api': 'http://127.0.0.1:8787' },
    },
  }
})
