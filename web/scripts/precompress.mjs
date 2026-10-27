// Writes brotli (.br) and gzip (.gz) copies of a build's text assets, so
// viewer-server can serve them precompressed. Images are already compressed.
//
//   node scripts/precompress.mjs dist/full
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.wasm', '.json', '.svg', '.pem', '.txt', '.map'])
const MIN_BYTES = 1024

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/precompress.mjs <dir>')
  process.exit(1)
}

function* files(d) {
  for (const name of readdirSync(d)) {
    const path = join(d, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

let before = 0
let after = 0
for (const path of files(dir)) {
  if (!COMPRESSIBLE.has(extname(path)) || statSync(path).size < MIN_BYTES) continue
  const data = readFileSync(path)
  const br = brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  })
  writeFileSync(`${path}.br`, br)
  writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }))
  before += data.length
  after += br.length
}
console.log(`precompressed ${dir}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (brotli)`)
