// Vite inlines these at build time, so `if (BACKEND_ENABLED)` branches and the
// dynamic imports inside them are dropped entirely from the static build.
export const BACKEND_ENABLED = import.meta.env.VITE_ENABLE_BACKEND === 'true'

/** Absolute base URL of viewer-server, or `undefined` in the static build. */
export const BACKEND_URL: string | undefined = BACKEND_ENABLED
  ? new URL(import.meta.env.VITE_BACKEND_URL || '/', globalThis.location.href).href.replace(/\/$/, '')
  : undefined
