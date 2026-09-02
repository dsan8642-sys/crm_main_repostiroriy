import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const budget = JSON.parse(await readFile(new URL('../bundle-budget.json', import.meta.url), 'utf8'))
const assetsDir = new URL('../dist/assets/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8'))
const files = await readdir(assetsDir)
const entry = Object.values(manifest).find((item) => item.isEntry)
if (!entry?.file) throw new Error('Vite manifest does not contain an entry JavaScript file.')

const javascriptChunks = []
let cssRawBytes = 0

for (const file of files) {
  const bytes = await readFile(new URL(file, assetsDir))
  if (file.endsWith('.js')) {
    javascriptChunks.push({ file: `assets/${file}`, raw: bytes.length, gzip: gzipSync(bytes).length })
  } else if (file.endsWith('.css')) {
    cssRawBytes += bytes.length
  }
}

const entryChunk = javascriptChunks.find((chunk) => chunk.file === entry.file)
if (!entryChunk) throw new Error(`Vite entry asset is missing: ${entry.file}`)
const largestRawChunk = javascriptChunks.reduce(
  (largest, chunk) => chunk.raw > largest.raw ? chunk : largest,
  javascriptChunks[0],
)
const largestGzipChunk = javascriptChunks.reduce(
  (largest, chunk) => chunk.gzip > largest.gzip ? chunk : largest,
  javascriptChunks[0],
)
const totalJavaScriptRawBytes = javascriptChunks.reduce((total, chunk) => total + chunk.raw, 0)
const totalJavaScriptGzipBytes = javascriptChunks.reduce((total, chunk) => total + chunk.gzip, 0)
const actual = {
  entryJavaScriptRawBytes: entryChunk.raw,
  entryJavaScriptGzipBytes: entryChunk.gzip,
  largestJavaScriptChunkRawBytes: largestRawChunk.raw,
  largestJavaScriptChunkGzipBytes: largestGzipChunk.gzip,
  cssRawBytes,
}
let failed = false
for (const [metric, value] of Object.entries(actual)) {
  const maximum = budget.maximum[metric]
  const ok = value <= maximum
  process.stdout.write(`BUNDLE_BUDGET=${metric}|actual=${value}|maximum=${maximum}|pass=${ok}\n`)
  failed ||= !ok
}
process.stdout.write(`BUNDLE_INFO=largestRawJavaScriptChunk|file=${largestRawChunk.file}|raw=${largestRawChunk.raw}\n`)
process.stdout.write(`BUNDLE_INFO=largestGzipJavaScriptChunk|file=${largestGzipChunk.file}|gzip=${largestGzipChunk.gzip}\n`)
process.stdout.write(`BUNDLE_INFO=totalJavaScriptRawBytes|actual=${totalJavaScriptRawBytes}|blocking=false\n`)
process.stdout.write(`BUNDLE_INFO=totalJavaScriptGzipBytes|actual=${totalJavaScriptGzipBytes}|blocking=false\n`)
if (failed) process.exitCode = 1
