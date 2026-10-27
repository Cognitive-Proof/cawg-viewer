import { resolve, sep } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const src = resolve(import.meta.dirname, 'src')

/**
 * Resolves every import of a module under `src/<dir>/` to an empty stub, so that
 * code can't end up in the bundle even if an import slips past its runtime guard.
 * Used for `src/backend/` in the static build and `src/dev/` in every build.
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

export default defineConfig(({ mode, command }) => {
  const backend = loadEnv(mode, '.').VITE_ENABLE_BACKEND === 'true'
  return {
    plugins: [react(), !backend && stripDir('backend'), command === 'build' && stripDir('dev')],
    // c2pa-react-cawg-component may be a local `file:` link with its own node_modules;
    // keep a single React so its hooks work.
    resolve: { dedupe: ['react', 'react-dom'] },
    worker: { format: 'es' },
    build: { chunkSizeWarningLimit: 1000 },
    server: {
      // In `dev:full`, forward API calls to a locally running viewer-server.
      proxy: { '/api': 'http://127.0.0.1:8787' },
      // Dev-only sample buttons load test files straight from the c2pa-rs checkout.
      fs: { allow: ['.', '../../c2pa-rs-cawg-viewer/sdk/tests/fixtures'] },
    },
  }
})
