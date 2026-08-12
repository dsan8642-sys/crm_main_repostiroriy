import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(frontendRoot, '..')

test('design bundle is reproducible from authoring sources', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'generate-design-bundle.mjs'), '--check'],
    { cwd: repoRoot, encoding: 'utf8' },
  )

  assert.equal(
    result.status,
    0,
    `design generator check failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
  assert.match(result.stdout, /DESIGN_BUNDLE_REPRODUCIBLE=PASS/)
})

test('runtime theme uses the approved blue palette and real variable weights', async () => {
  const [colors, fonts, typography, opsCss] = await Promise.all([
    readFile(path.join(repoRoot, 'design', 'tokens', 'colors.css'), 'utf8'),
    readFile(path.join(repoRoot, 'design', 'tokens', 'fonts.css'), 'utf8'),
    readFile(path.join(repoRoot, 'design', 'tokens', 'typography.css'), 'utf8'),
    readFile(path.join(frontendRoot, 'src', 'app', 'ops-redesign.css'), 'utf8'),
  ])

  for (const contract of [
    '--blue-500:  #1a7dc4', '--blue-600:  #1364a3', '--blue-700:  #0f5285',
    '--blue-50:   #eef6fd', '--blue-200:  #aed7f5',
    '--green-500: #147818', '--green-700: #0f6114',
    '--amber-50:  #fff4d6', '--amber-500: #fc9e05', '--amber-700: #966300',
    '--red-600:   #b62d25', '--red-700:   #93231d',
  ]) assert.match(colors, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(fonts, /IBMPlexSans-Variable\.woff2/)
  assert.match(fonts, /font-weight:\s*100 700/)
  assert.match(typography, /--fw-regular:\s+450/)
  assert.match(typography, /--fw-medium:\s+500/)
  assert.match(typography, /--fw-semibold:\s+600/)
  assert.doesNotMatch(opsCss, /font-weight:\s*(?:700|800|900)/)
  assert.doesNotMatch(opsCss, /#0f766e|#115e59|#d9f3ef|rgba\(15,\s*118,\s*110/)

  for (const relative of ['tokens/colors.css', 'tokens/fonts.css', 'tokens/typography.css']) {
    const canonical = await readFile(path.join(repoRoot, 'design', relative), 'utf8')
    const runtime = await readFile(path.join(frontendRoot, 'src', 'design', relative), 'utf8')
    assert.equal(runtime, canonical, `${relative} is not synchronized`)
  }
})

test('approved schedule palette manifest freezes 30 unique accessible colors', async () => {
  const canonicalSource = await readFile(
    path.join(repoRoot, 'design', 'tokens', 'schedule-palette.json'),
    'utf8',
  )
  const manifest = JSON.parse(canonicalSource)
  assert.equal(manifest.version, 1)
  assert.equal(manifest.standard.key, 'standard')
  assert.equal(manifest.colors.length, 30)
  assert.equal(new Set(manifest.colors.map((color) => color.key)).size, 30)
  const families = new Set(manifest.colors.map((color) => color.key.split('-')[0]))
  assert.ok(families.size >= 24, 'palette should not be dominated by near-duplicate hue families')
  for (const required of ['navy', 'cyan', 'emerald', 'orange', 'rose', 'purple', 'brown', 'slate']) {
    assert.ok(families.has(required), `palette is missing the ${required} hue family`)
  }

  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((part) => Number.parseInt(part, 16) / 255)
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const contrast = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
    return (light + 0.05) / (dark + 0.05)
  }
  for (const color of manifest.colors) {
    assert.ok(contrast(color.background, color.text) >= 4.5, `${color.key} text contrast is below WCAG AA`)
  }
  assert.equal(
    await readFile(path.join(frontendRoot, 'src', 'design', 'tokens', 'schedule-palette.json'), 'utf8'),
    canonicalSource,
  )
  assert.equal(
    await readFile(path.join(repoRoot, 'swimcrm', 'common', 'schedule_palette.json'), 'utf8'),
    canonicalSource,
  )
})
