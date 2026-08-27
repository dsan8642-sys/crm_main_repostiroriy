import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const budget = JSON.parse(await readFile(new URL('../bundle-budget.json', import.meta.url), 'utf8'))
const assetsDir = new URL('../dist/assets/', import.meta.url)
const files = await readdir(assetsDir)
let javascriptRawBytes = 0
let javascriptGzipBytes = 0
let cssRawBytes = 0

for (const file of files) {
  const bytes = await readFile(new URL(file, assetsDir))
  if (file.endsWith('.js')) {
    javascriptRawBytes += bytes.length
    javascriptGzipBytes += gzipSync(bytes).length
  } else if (file.endsWith('.css')) {
    cssRawBytes += bytes.length
  }
}

const actual = { javascriptRawBytes, javascriptGzipBytes, cssRawBytes }
let failed = false
for (const [metric, value] of Object.entries(actual)) {
  const maximum = budget.maximum[metric]
  const ok = value <= maximum
  process.stdout.write(`BUNDLE_BUDGET=${metric}|actual=${value}|maximum=${maximum}|pass=${ok}\n`)
  failed ||= !ok
}
if (failed) process.exitCode = 1
