export function mountAppearanceBlocks(doc, savedBlocks = []) {
  const root = doc.getElementById('root')
  if (!root) return () => {}
  const mounted = new Map()
  let stopped = false
  let scheduled = false

  function apply() {
    scheduled = false
    if (stopped) return
    const html = doc.documentElement
    const blocks = html.dataset.appearance === 'default' ? [] : html.dataset.appearance === 'preview'
      ? doc.defaultView.__appearancePreviewBlocks || [] : savedBlocks
    const active = blocks.filter((block) => block.route === html.dataset.appearanceRoute)
    const ids = new Set(active.map((block) => block.id))
    for (const [id, node] of mounted) {
      if (!ids.has(id)) { node.remove(); mounted.delete(id) }
    }
    for (const block of active) {
      const parent = doc.querySelector(block.parent)
      if (!parent || !root.contains(parent)) continue
      let node = mounted.get(block.id)
      if (!node) {
        node = doc.createElement(block.kind === 'text' ? 'p' : 'div')
        node.dataset.appearanceBlockId = block.id
        mounted.set(block.id, node)
      }
      if (node.textContent !== block.text) node.textContent = block.text
      if (node.parentElement !== parent) parent.append(node)
    }
  }

  function schedule() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(apply)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(root, { childList: true, subtree: true })
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-appearance', 'data-appearance-route'] })
  doc.defaultView.addEventListener('appearance-preview-change', schedule)
  schedule()
  return () => {
    stopped = true
    observer.disconnect()
    doc.defaultView.removeEventListener('appearance-preview-change', schedule)
    for (const node of mounted.values()) node.remove()
  }
}
