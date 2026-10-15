export async function textHash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim())))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function mountAppearanceText(doc, savedOverrides) {
  const originals = new Map()
  const root = doc.documentElement
  let stopped = false
  let running = false
  let rerun = false

  async function apply() {
    const mode = root.dataset.appearance
    const overrides = mode === 'default' ? [] : mode === 'preview'
      ? doc.defaultView.__appearancePreviewOverrides || [] : savedOverrides
    const route = root.dataset.appearanceRoute
    const targets = overrides.filter((item) => item.route === route && typeof item.text === 'string')
      .map((item) => ({ item, node: doc.querySelector(item.selector) }))
      .filter(({ node }) => node && !node.childElementCount)

    for (const [node, record] of originals) {
      if (targets.some(({ item, node: target }) => target === node && item.text === record.replacement && item.match === record.match)) continue
      if (node.textContent === record.replacement) node.textContent = record.original
      originals.delete(node)
    }
    for (const { item, node } of targets) {
      if (originals.has(node)) continue
      const original = node.textContent
      if (await textHash(original) !== item.match || stopped) continue
      originals.set(node, { original, replacement: item.text, match: item.match })
      if (original !== item.text) node.textContent = item.text
    }
  }

  async function schedule() {
    rerun = true
    if (running) return
    running = true
    while (rerun && !stopped) {
      rerun = false
      await apply()
    }
    running = false
  }

  const observer = new MutationObserver(schedule)
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-appearance', 'data-appearance-route'] })
  doc.defaultView.addEventListener('appearance-preview-change', schedule)
  void schedule()
  return () => {
    stopped = true
    observer.disconnect()
    doc.defaultView.removeEventListener('appearance-preview-change', schedule)
    for (const [node, record] of originals) if (node.textContent === record.replacement) node.textContent = record.original
  }
}
