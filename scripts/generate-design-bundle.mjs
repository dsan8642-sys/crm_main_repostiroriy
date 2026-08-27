import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync, transformSync } from '../frontend/node_modules/esbuild/lib/main.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const designRoot = path.join(repoRoot, 'design')
const namespace = 'SwimCRMDesignSystem_546643'

const publicComponents = [
  ['Avatar', 'components/data/Avatar.jsx'],
  ['Badge', 'components/data/Badge.jsx'],
  ['Money', 'components/data/Money.jsx'],
  ['STATUS', 'components/data/StatusPill.jsx'],
  ['StatusPill', 'components/data/StatusPill.jsx'],
  ['Table', 'components/data/Table.jsx'],
  ['Banner', 'components/feedback/Banner.jsx'],
  ['Dialog', 'components/feedback/Dialog.jsx'],
  ['EmptyState', 'components/feedback/EmptyState.jsx'],
  ['Toast', 'components/feedback/Toast.jsx'],
  ['Button', 'components/forms/Button.jsx'],
  ['Checkbox', 'components/forms/Checkbox.jsx'],
  ['IconButton', 'components/forms/IconButton.jsx'],
  ['Input', 'components/forms/Input.jsx'],
  ['Radio', 'components/forms/Radio.jsx'],
  ['Select', 'components/forms/Select.jsx'],
  ['Switch', 'components/forms/Switch.jsx'],
  ['Textarea', 'components/forms/Textarea.jsx'],
  ['SidebarNav', 'components/navigation/SidebarNav.jsx'],
  ['Tabs', 'components/navigation/Tabs.jsx'],
]

const runtimeComponents = publicComponents.filter(([name]) => !new Set([
  'STATUS',
  'EmptyState',
  'Toast',
  'Radio',
  'Switch',
  'SidebarNav',
]).has(name))

const runtimeIconNames = new Set([
  'Alert', 'ArrowLeft', 'Bell', 'Calendar', 'Cash', 'Check', 'ChevronL',
  'ChevronR', 'ClientFamily', 'Download', 'File', 'GroupMembers', 'Home',
  'Layers', 'Location', 'Logout', 'Pencil', 'Search', 'Settings',
  'TrainerWhistle', 'Upload', 'User', 'Users', 'Wallet', 'Waves', 'X',
])

// Dependencies must precede their importers. Demo UI kits are authoring-only;
// shipping them in the application duplicated the real lazy-loaded screens.
const runtimeSourcePaths = [
  'assets/icons.jsx',
  'components/data/Avatar.jsx',
  'components/data/Badge.jsx',
  'components/data/Money.jsx',
  'components/data/StatusPill.jsx',
  'components/data/Table.jsx',
  'components/forms/Button.jsx',
  'components/forms/Checkbox.jsx',
  'components/forms/IconButton.jsx',
  'components/forms/Input.jsx',
  'components/forms/Select.jsx',
  'components/forms/Textarea.jsx',
  'components/feedback/Banner.jsx',
  'components/feedback/Dialog.jsx',
  'components/navigation/Tabs.jsx',
]

const authoringSourcePaths = [
  'assets/icons.jsx',
  'components/data/Avatar.jsx',
  'components/data/Badge.jsx',
  'components/data/Money.jsx',
  'components/data/StatusPill.jsx',
  'components/data/Table.jsx',
  'components/forms/Button.jsx',
  'components/forms/Checkbox.jsx',
  'components/forms/IconButton.jsx',
  'components/forms/Input.jsx',
  'components/forms/Radio.jsx',
  'components/forms/Select.jsx',
  'components/forms/Switch.jsx',
  'components/forms/Textarea.jsx',
  'components/feedback/Banner.jsx',
  'components/feedback/Dialog.jsx',
  'components/feedback/EmptyState.jsx',
  'components/feedback/Toast.jsx',
  'components/navigation/SidebarNav.jsx',
  'components/navigation/Tabs.jsx',
]

const readDesign = relativePath => fs.readFileSync(path.join(designRoot, relativePath), 'utf8').replace(/\r\n/g, '\n')
const sha12 = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)

function runtimeSource(relativePath) {
  const source = readDesign(relativePath)
  if (relativePath !== 'assets/icons.jsx') return source
  let insideIcons = false
  return source.split('\n').filter((line) => {
    if (line.includes('window.SwimIcons = {')) insideIcons = true
    if (insideIcons && /^\s{2}};/.test(line)) insideIcons = false
    const icon = insideIcons ? line.match(/^\s{4}([A-Za-z_$][\w$]*):/)?.[1] : null
    return !icon || runtimeIconNames.has(icon)
  }).join('\n')
}

function exportsFrom(source) {
  const names = new Set()
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1])
  for (const match of source.matchAll(/\bexport\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1])
  for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}\s*;?/g)) {
    for (const item of match[1].split(',')) names.add(item.trim().split(/\s+as\s+/)[1] || item.trim().split(/\s+as\s+/)[0])
  }
  return [...names].filter(Boolean)
}
function prepareModule(source) {
  const exported = exportsFrom(source)
  let prepared = source
    .replace(/^import\s+React\s+from\s+['"]react['"]\s*;?\s*$/gm, '')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, (_, names) => `const { ${names.trim()} } = __ds_scope;`)
    .replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '')
    .replace(/\bexport\s+(?=(?:const|let|var|class)\b)/g, '')
    .replace(/\bexport\s*\{[^}]+\}\s*;?/g, '')

  const transformed = transformSync(prepared, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2019',
    charset: 'utf8',
    legalComments: 'none',
    sourcemap: false,
  }).code.trim()

  const assignments = exported.map(name => `__ds_scope.${name} = ${name};`).join('\n')
  return assignments ? `${transformed}\n${assignments}` : transformed
}

function buildBundle() {
  const sourceHashes = Object.fromEntries(authoringSourcePaths.map(relativePath => [relativePath, sha12(readDesign(relativePath))]))
  const header = {
    format: 4,
    namespace,
    components: publicComponents.map(([name, sourcePath]) => ({ name, sourcePath })),
    sourceHashes,
    inlinedExternals: [],
    unexposedExports: [
      { name: 'labelStyle', sourcePath: 'components/forms/Input.jsx' },
      { name: 'tdBase', sourcePath: 'components/data/Table.jsx' },
      { name: 'thBase', sourcePath: 'components/data/Table.jsx' },
    ],
  }

  const sections = authoringSourcePaths.map(relativePath => {
    const code = prepareModule(readDesign(relativePath))
    return `// ${relativePath}\ntry { (() => {\n${code}\n})(); } catch (e) { __ds_ns.__errors.push({ path: ${JSON.stringify(relativePath)}, error: String((e && e.message) || e) }); }`
  })
  const exposures = publicComponents.map(([name]) => `__ds_ns.${name} = __ds_scope.${name};`).join('\n')

  return `/* @ds-bundle: ${JSON.stringify(header)} */\n\n(() => {\nconst __ds_ns = (window.${namespace} = window.${namespace} || {});\nconst __ds_scope = {};\n(__ds_ns.__errors = __ds_ns.__errors || []);\n\n${sections.join('\n\n')}\n\n${exposures}\n})();\n`
}

function buildRuntimeBundle() {
  const sourceHashes = Object.fromEntries(runtimeSourcePaths.map(relativePath => [relativePath, sha12(readDesign(relativePath))]))
  const header = {
    format: 5,
    namespace,
    components: runtimeComponents.map(([name, sourcePath]) => ({ name, sourcePath })),
    sourceHashes,
    inlinedExternals: [],
  }
  const importsByPath = new Map()
  for (const [name, sourcePath] of runtimeComponents) {
    const names = importsByPath.get(sourcePath) || []
    names.push(name)
    importsByPath.set(sourcePath, names)
  }
  const imports = [...importsByPath].map(([sourcePath, names]) => (
    `import { ${names.join(', ')} } from './${sourcePath}'`
  )).join('\n')
  const exposures = runtimeComponents.map(([name]) => name).join(', ')
  const entry = `${imports}\nimport React from 'react'\n\n${runtimeSource('assets/icons.jsx')}\n\nwindow.${namespace} = { ${exposures} }\n`
  const result = buildSync({
    stdin: {
      contents: entry,
      loader: 'jsx',
      resolveDir: designRoot,
      sourcefile: 'runtime-entry.jsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'transform',
    minify: true,
    legalComments: 'none',
    treeShaking: true,
    external: ['react'],
    charset: 'utf8',
  })
  return `/* @ds-bundle: ${JSON.stringify(header)} */\n${result.outputFiles[0].text}`
}

function cardMetadata() {
  const cards = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(fullPath)
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue
      const source = fs.readFileSync(fullPath, 'utf8')
      const marker = source.match(/<!--\s*@dsCard\s+([^>]+?)\s*-->/)
      if (!marker) continue
      const attrs = Object.fromEntries([...marker[1].matchAll(/([A-Za-z]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
      cards.push({
        path: path.relative(designRoot, fullPath).replaceAll('\\', '/'),
        group: attrs.group || '',
        viewport: attrs.viewport || '',
        subtitle: attrs.subtitle || '',
        name: attrs.name || entry.name,
      })
    }
  }
  visit(designRoot)
  return cards.sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path))
}

function tokenKind(name, value) {
  if (name.includes('radius')) return 'radius'
  if (name.includes('shadow') || name === '--ring') return 'shadow'
  if (name.startsWith('--font') || name.startsWith('--text-')) return 'font'
  if (/color|primary|accent|surface|border|status|money|slate|blue|green|amber|red|violet|teal|white/.test(name)) return 'color'
  if (/px\b|rem\b/.test(value) || /space|control|row-h|sidebar|topbar|content|max|bw-/.test(name)) return 'spacing'
  return 'other'
}

function tokensMetadata() {
  const tokens = []
  const tokenFiles = fs.readdirSync(path.join(designRoot, 'tokens')).filter(name => name.endsWith('.css')).sort()
  for (const fileName of tokenFiles) {
    const source = readDesign(`tokens/${fileName}`)
    for (const match of source.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/gs)) {
      const name = match[1]
      const value = match[2].trim().replace(/\s+/g, ' ')
      tokens.push({ name, value, kind: tokenKind(name, value), definedIn: `tokens/${fileName}` })
    }
  }
  return tokens
}

function buildManifest() {
  return `${JSON.stringify({
    namespace,
    components: publicComponents.map(([name, sourcePath]) => ({ name, sourcePath })),
    startingPoints: [
      { name: 'StatusPill', path: 'components/data/StatusPill.jsx', previewPath: 'components/data/data.card.html', kind: 'component', section: 'Data', subtitle: 'Status pills for every CRM state', viewport: '700x150' },
      { name: 'Button', path: 'components/forms/Button.jsx', previewPath: 'components/forms/forms.card.html', kind: 'component', section: 'Forms', subtitle: 'Buttons — 5 variants, 3 sizes', viewport: '700x150' },
      { name: 'Input', path: 'components/forms/Input.jsx', previewPath: 'components/forms/forms.card.html', kind: 'component', section: 'Forms', subtitle: 'Text fields with label, hint, error, affixes', viewport: '700x150' },
      { name: 'admin', path: 'ui_kits/admin/index.html', previewPath: 'ui_kits/admin/index.html', kind: 'screen', section: 'SwimCRM', subtitle: 'Full admin CRM shell (sidebar + 6 screens)', viewport: '1280x800' },
    ],
    cards: cardMetadata(),
    templates: [],
    hasThumbnailHtml: false,
    globalCssPaths: ['tokens/fonts.css', 'tokens/colors.css', 'tokens/typography.css', 'tokens/spacing.css', 'tokens/elevation.css', 'tokens/base.css', 'styles.css'],
    tokens: tokensMetadata(),
    themes: [],
    fonts: [],
    brandFonts: [
      { family: 'IBM Plex Sans', status: 'ok', tokens: ['--font-sans'], path: 'tokens/typography.css' },
      { family: 'IBM Plex Mono', status: 'ok', tokens: ['--font-mono'], path: 'tokens/typography.css' },
    ],
    source: 'spa',
  })}\n`
}

const outputs = [
  [path.join(designRoot, '_ds_bundle.js'), buildBundle()],
  [path.join(designRoot, '_ds_manifest.json'), buildManifest()],
  [path.join(repoRoot, 'frontend', 'src', 'design', '_ds_bundle.js'), buildRuntimeBundle()],
]
const checkOnly = process.argv.includes('--check')

if (checkOnly) {
  const stale = outputs.filter(([outputPath, expected]) => !fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n') !== expected)
  if (stale.length) {
    for (const [outputPath] of stale) console.error(`STALE_DESIGN_ARTIFACT=${path.relative(repoRoot, outputPath)}`)
    process.exitCode = 1
  } else {
    console.log('DESIGN_BUNDLE_REPRODUCIBLE=PASS')
  }
} else {
  for (const [outputPath, content] of outputs) fs.writeFileSync(outputPath, content, 'utf8')
  console.log('DESIGN_BUNDLE_GENERATED=PASS')
}
