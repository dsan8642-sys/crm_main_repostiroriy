import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { textHash } from './appearanceText.js'
import { usePresence } from './usePresence.js'
import './appearance-editor.css'

const elementFields = [
  { key: 'backgroundColor', label: 'Фон', type: 'color', css: 'backgroundColor' },
  { key: 'color', label: 'Цвет текста', type: 'color', css: 'color' },
  { key: 'borderColor', label: 'Цвет рамки', type: 'color', css: 'borderColor' },
  { key: 'borderRadius', label: 'Скругление', type: 'size', css: 'borderRadius', min: 0, max: 40 },
  { key: 'fontSize', label: 'Размер текста', type: 'size', css: 'fontSize', min: 10, max: 40 },
  ...['padding', 'margin'].flatMap((kind) => ['Top', 'Right', 'Bottom', 'Left'].map((side, index) => ({
    key: `${kind}${side}`, label: ['Сверху', 'Справа', 'Снизу', 'Слева'][index],
    group: kind === 'padding' ? 'Внутренний отступ' : 'Внешний отступ',
    type: 'size', css: `${kind}${side}`, min: 0, max: 96,
  }))),
]

function previewCss(fields, values, overrides = []) {
  const scope = ':root[data-appearance="preview"]'
  const tokens = []
  const rules = []
  fields.forEach((field) => {
    const value = values[field.key]
    if (!value) return
    field.tokens.forEach((token) => tokens.push(`${token}: ${value};`))
    field.rules?.forEach((rule) => {
      const selectors = rule.selector.split(',').map((part) => `${scope} ${part.trim()}`).join(', ')
      rules.push(`${selectors} { ${rule.property}: ${value} !important; }`)
    })
  })
  overrides.forEach(({ route, selector, properties, visibility }) => {
    const declarations = Object.entries(properties).map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value} !important;`).join(' ')
    const layout = visibility === 'hidden' ? 'visibility: hidden !important;' : visibility === 'removed' ? 'display: none !important;' : ''
    rules.push(`${scope}[data-appearance-route="${route}"] ${selector} { ${declarations} ${layout} }`)
  })
  return `${scope} { ${tokens.join(' ')} } ${rules.join(' ')}`
}

function applyPreview(doc, fields, values, overrides, blocks, original) {
  if (!doc?.documentElement) return
  let style = doc.getElementById('local-appearance-preview')
  if (!style) {
    style = doc.createElement('style')
    style.id = 'local-appearance-preview'
    doc.head.appendChild(style)
  }
  style.textContent = previewCss(fields, values, overrides)
  doc.defaultView.__appearancePreviewOverrides = overrides
  doc.defaultView.__appearancePreviewBlocks = blocks
  doc.documentElement.dataset.appearance = original ? 'default' : 'preview'
  doc.defaultView.dispatchEvent(new doc.defaultView.Event('appearance-preview-change'))
}

function elementSelector(element) {
  if (element?.id === 'root') return '#root'
  if (element?.dataset?.appearanceBlockId) return `#root [data-appearance-block-id="${element.dataset.appearanceBlockId}"]`
  const parts = []
  for (let node = element; node?.id !== 'root'; node = node?.parentElement) {
    if (!node || parts.length >= 20) return null
    const tag = node.tagName.toLowerCase()
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) return null
    const siblings = [...node.parentElement.children].filter((child) => child.tagName === node.tagName)
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`)
  }
  return `#root > ${parts.join(' > ')}`
}

function outlineLabel(node) {
  const tag = node.tagName.toLowerCase()
  const kind = { div: 'Контейнер', section: 'Секция', main: 'Основное', button: 'Кнопка', span: 'Текст', p: 'Абзац', h1: 'Заголовок', h2: 'Заголовок', h3: 'Заголовок', a: 'Ссылка', input: 'Поле', svg: 'Иконка' }[tag] || tag
  const content = (node.childElementCount ? '' : node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 35)
  return content ? `${kind} · ${content}` : kind
}

function OutlineBranch({ node, depth, expanded, selectedSelector, onToggle, onSelect }) {
  const selector = elementSelector(node)
  if (!selector) return null
  const children = node.tagName.toLowerCase() === 'svg' ? [] : [...node.children]
  const open = selector === '#root' || expanded.has(selector)
  return <div className="appearance-editor__outline-branch">
    <div role="treeitem" aria-level={depth + 1} aria-expanded={children.length ? open : undefined} aria-selected={selectedSelector === selector} className={`appearance-editor__outline-node${selectedSelector === selector ? ' is-selected' : ''}${selectedSelector?.startsWith(`${selector} > `) ? ' is-ancestor' : ''}`} data-appearance-selector={selector} aria-current={selectedSelector === selector ? 'true' : undefined} style={{ paddingLeft: 8 + depth * 14 }}>
      {children.length ? <button type="button" className="appearance-editor__outline-toggle" aria-label={`${open ? 'Свернуть' : 'Раскрыть'}: ${outlineLabel(node)}`} aria-expanded={open} onClick={() => onToggle(selector)}>{open ? '⌄' : '›'}</button> : <span className="appearance-editor__outline-spacer" />}
      <button type="button" className="appearance-editor__outline-select" disabled={selector === '#root'} onClick={() => onSelect(node)} title={node.tagName.toLowerCase()}>{outlineLabel(node)}</button>
    </div>
    {open && children.length > 0 && <div className="appearance-editor__outline-children" role="group">{children.map((child) => <OutlineBranch key={elementSelector(child) || child.tagName} node={child} depth={depth + 1} expanded={expanded} selectedSelector={selectedSelector} onToggle={onToggle} onSelect={onSelect} />)}</div>}
  </div>
}

function computedValue(style, field) {
  const raw = style[field.css]
  if (field.type === 'size') return `${Math.min(field.max, Math.max(field.min, Math.round(Number.parseFloat(raw) || 0)))}px`
  const match = raw?.match(/^rgba?\((\d+),?\s*(\d+),?\s*(\d+)/)
  return match ? `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}` : '#ffffff'
}

function endPreview(doc) {
  if (!doc?.documentElement) return
  doc.getElementById('local-appearance-preview')?.remove()
  delete doc.defaultView.__appearancePreviewOverrides
  delete doc.defaultView.__appearancePreviewBlocks
  doc.documentElement.dataset.appearance = 'custom'
  doc.defaultView.dispatchEvent(new doc.defaultView.Event('appearance-preview-change'))
}

function readDefaults(fields) {
  const root = document.documentElement
  const previous = root.dataset.appearance
  root.dataset.appearance = 'default'
  const style = getComputedStyle(root)
  const result = Object.fromEntries(fields.map((field) => {
    const value = field.tokens[0] ? style.getPropertyValue(field.tokens[0]).trim() : field.default
    return [field.key, /^#[\da-f]{6}$/i.test(value) || /^\d+px$/.test(value) ? value : field.default || (field.type === 'color' ? '#ffffff' : `${field.min}px`)]
  }))
  root.dataset.appearance = previous
  return result
}

export default function AppearanceEditor({ onClose, closing = false }) {
  const dialogRef = useRef(null)
  const frameRef = useRef(null)
  const stageRef = useRef(null)
  const [payload, setPayload] = useState(null)
  const [draft, setDraft] = useState(null)
  const [defaults, setDefaults] = useState({})
  const [undo, setUndo] = useState([])
  const [name, setName] = useState('')
  const [original, setOriginal] = useState(false)
  const [phone, setPhone] = useState(false)
  const [desktopWidth, setDesktopWidth] = useState(1440)
  const [mode, setMode] = useState('global')
  const [selected, setSelected] = useState(null)
  const [copied, setCopied] = useState(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const outlinePresence = usePresence(outlineOpen)
  const [expanded, setExpanded] = useState(() => new Set())
  const [, setOutlineVersion] = useState(0)
  const [frameReady, setFrameReady] = useState(0)
  const [stageWidth, setStageWidth] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const confirmPresence = usePresence(confirmClose)
  const dirty = Boolean(payload && draft && JSON.stringify(draft) !== JSON.stringify(payload.state))

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    let alive = true
    api.get('/api/dev/appearance/')
      .then((data) => {
        if (!alive) return
        setDefaults(readDefaults(data.fields))
        const normalized = { ...data, state: { ...data.state, overrides: data.state.overrides || [], blocks: data.state.blocks || [] } }
        setPayload(normalized)
        setDraft(normalized.state)
      })
      .catch((err) => { if (alive) setError(err.message || 'Не удалось открыть редактор.') })
    return () => {
      alive = false
      endPreview(document)
      endPreview(frameRef.current?.contentDocument)
      dialog.close()
    }
  }, [])

  useEffect(() => {
    if (!stageRef.current) return undefined
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width))
    observer.observe(stageRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!payload || !draft) return
    applyPreview(document, payload.fields, draft.values, draft.overrides, draft.blocks, original)
    applyPreview(frameRef.current?.contentDocument, payload.fields, draft.values, draft.overrides, draft.blocks, original)
  }, [payload, draft, original])

  async function selectTarget(target, doc = frameRef.current?.contentDocument) {
    if (!target?.closest?.('#root') || !draft) return
    const selector = elementSelector(target)
    if (!selector) return
    const route = doc.documentElement.dataset.appearanceRoute
    if (!route) return
    const style = doc.defaultView.getComputedStyle(target)
    const tag = target.tagName.toLowerCase()
    const label = `${tag}: ${(target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90) || 'элемент'}`
    const storedLabel = `${tag}: элемент`
    const existing = draft.overrides.find((item) => item.route === route && item.selector === selector)
    const blockId = target.dataset.appearanceBlockId || null
    const isContainer = ['DIV', 'SECTION', 'MAIN', 'ARTICLE', 'ASIDE'].includes(target.tagName) && target.childElementCount > 0 && !blockId
    const parent = isContainer ? target : target.parentElement?.closest('div, section, main, article, aside, li, td')
    const parentSelector = elementSelector(parent?.dataset?.appearanceBlockId ? parent.parentElement : parent)
    const editableText = !target.childElementCount && !['INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'SVG'].includes(target.tagName)
    const currentText = editableText ? target.textContent.trim() : ''
    const match = editableText ? existing?.match || await textHash(currentText) : null
    setSelected({ route, selector, label, storedLabel, blockId, parentSelector, text: editableText ? currentText : null, match, defaults: Object.fromEntries(elementFields.map((field) => [field.key, computedValue(style, field)])) })
    const branch = new Set()
    for (let node = target; node && node.id !== 'root'; node = node.parentElement) {
      const path = elementSelector(node)
      if (path) branch.add(path)
    }
    setExpanded((previous) => new Set([...previous, ...branch]))
  }

  useEffect(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc?.body || mode !== 'element') return undefined
    const choose = (event) => {
      const target = event.ctrlKey
        ? event.target
        : event.target.closest?.('button, a, input, select, textarea, h1, h2, h3, .card, .card-pad') || event.target
      if (!target?.closest?.('#root')) return
      event.preventDefault()
      event.stopPropagation()
      void selectTarget(target, doc)
    }
    doc.addEventListener('click', choose, true)
    doc.documentElement.classList.add('appearance-selecting')
    return () => {
      doc.removeEventListener('click', choose, true)
      doc.documentElement.classList.remove('appearance-selecting')
    }
  }, [mode, frameReady, draft])

  useEffect(() => {
    const root = frameRef.current?.contentDocument?.getElementById('root')
    if (!outlineOpen || !root) return undefined
    let scheduled = 0
    const observer = new MutationObserver(() => {
      if (!scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; setOutlineVersion((value) => value + 1) })
    })
    observer.observe(root, { subtree: true, childList: true, characterData: true })
    return () => { observer.disconnect(); cancelAnimationFrame(scheduled) }
  }, [outlineOpen, frameReady])

  useEffect(() => {
    if (!outlineOpen || !selected) return
    requestAnimationFrame(() => document.querySelector('.appearance-editor__outline-node[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }))
  }, [outlineOpen, selected])

  useEffect(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return undefined
    let style = doc.getElementById('local-appearance-selection')
    if (!style) {
      style = doc.createElement('style')
      style.id = 'local-appearance-selection'
      doc.head.appendChild(style)
    }
    style.textContent = mode === 'element'
      ? `.appearance-selecting #root * { cursor: crosshair !important; } ${selected ? `${selected.selector} { outline: 3px solid #e58d19 !important; outline-offset: 2px !important; }` : ''}`
      : ''
    return () => style.remove()
  }, [mode, selected, frameReady])

  function changeState(next) {
    setUndo((previous) => [...previous.slice(-49), draft])
    setDraft(next)
    setNotice('')
    setError('')
  }

  function updateField(key, value) {
    changeState({ ...draft, values: { ...draft.values, [key]: value } })
  }

  function resetField(key) {
    const values = { ...draft.values }
    delete values[key]
    changeState({ ...draft, values })
  }

  function updateElement(key, value) {
    const overrides = [...draft.overrides]
    const index = overrides.findIndex((item) => item.route === selected.route && item.selector === selected.selector)
    const current = index < 0 ? { route: selected.route, selector: selected.selector, label: selected.storedLabel, properties: {} } : overrides[index]
    const properties = { ...current.properties }
    if ('padding' in properties) {
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) properties[`padding${side}`] ??= properties.padding
      delete properties.padding
    }
    const next = { ...current, label: selected.storedLabel, properties: { ...properties, [key]: value } }
    if (index < 0) overrides.push(next)
    else overrides[index] = next
    changeState({ ...draft, overrides })
  }

  function updateElementText(value) {
    if (selected.blockId) {
      changeState({ ...draft, blocks: draft.blocks.map((block) => block.id === selected.blockId ? { ...block, text: value } : block) })
      return
    }
    const overrides = [...draft.overrides]
    const index = overrides.findIndex((item) => item.route === selected.route && item.selector === selected.selector)
    const current = index < 0 ? { route: selected.route, selector: selected.selector, label: selected.storedLabel, properties: {} } : overrides[index]
    const next = { ...current, label: selected.storedLabel, text: value, match: current.match || selected.match }
    if (index < 0) overrides.push(next)
    else overrides[index] = next
    changeState({ ...draft, overrides })
  }

  function resetElementText() {
    const overrides = draft.overrides.flatMap((item) => {
      if (item.route !== selected.route || item.selector !== selected.selector) return [item]
      const { text, match, ...rest } = item
      return Object.keys(rest.properties).length || rest.visibility ? [rest] : []
    })
    changeState({ ...draft, overrides })
  }

  function resetElement() {
    changeState({ ...draft, overrides: draft.overrides.filter((item) => item.route !== selected.route || item.selector !== selected.selector) })
  }

  function setVisibility(visibility) {
    const overrides = [...draft.overrides]
    const index = overrides.findIndex((item) => item.route === selected.route && item.selector === selected.selector)
    const current = index < 0 ? { route: selected.route, selector: selected.selector, label: selected.storedLabel, properties: {} } : overrides[index]
    const next = { ...current }
    if (visibility) next.visibility = visibility
    else delete next.visibility
    if (index < 0) overrides.push(next)
    else if (!next.visibility && !Object.keys(next.properties).length && !('text' in next)) overrides.splice(index, 1)
    else overrides[index] = next
    changeState({ ...draft, overrides })
  }

  function addBlock(kind, source = null) {
    if (!selected?.parentSelector || draft.blocks.length >= 50) return
    const id = crypto.randomUUID()
    const block = { id, route: selected.route, parent: selected.parentSelector, kind, text: source?.text ?? (kind === 'text' ? 'Новый текст' : 'Новый блок') }
    const overrides = source?.properties && Object.keys(source.properties).length
      ? [...draft.overrides, { route: selected.route, selector: `#root [data-appearance-block-id="${id}"]`, label: 'Добавленный элемент', properties: { ...source.properties } }]
      : draft.overrides
    changeState({ ...draft, blocks: [...draft.blocks, block], overrides })
  }

  function deleteSelected() {
    if (selected.blockId) {
      changeState({ ...draft, blocks: draft.blocks.filter((block) => block.id !== selected.blockId), overrides: draft.overrides.filter((item) => item.route !== selected.route || item.selector !== selected.selector) })
      setSelected(null)
    } else setVisibility('removed')
  }

  function requestClose() {
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const saved = await api.post('/api/dev/appearance/', { revision: payload.revision, state: draft })
      const normalized = { ...saved, state: { ...saved.state, overrides: saved.state.overrides || [], blocks: saved.state.blocks || [] } }
      setPayload(normalized)
      setDraft(normalized.state)
      setUndo([])
      setNotice('Сохранено в файлы проекта.')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить.')
    } finally {
      setBusy(false)
    }
  }

  function addPreset() {
    const title = name.trim()
    if (!title || title.length > 60) return setError('Введите название до 60 символов.')
    if (draft.presets.some((preset) => preset.name.toLocaleLowerCase() === title.toLocaleLowerCase())) return setError('Вариант с таким названием уже есть.')
    if (draft.presets.length >= 20) return setError('Можно сохранить до 20 вариантов.')
    changeState({ ...draft, presets: [...draft.presets, { name: title, values: { ...draft.values }, overrides: structuredClone(draft.overrides), blocks: structuredClone(draft.blocks) }] })
    setName('')
  }

  const groups = payload ? [...new Set(payload.fields.map((field) => field.group))] : []
  const virtualWidth = phone ? 390 : desktopWidth
  const virtualHeight = phone ? 780 : 900
  const scale = virtualWidth ? Math.min(1, Math.max(0.1, (stageWidth - 24) / virtualWidth)) : 1
  const scaled = Boolean(virtualWidth)
  const previewUrl = new URL(window.location.href)
  previewUrl.searchParams.set('appearancePreview', '1')
  const outlineRoot = frameRef.current?.contentDocument?.getElementById('root')
  const selectedOverride = selected && draft?.overrides.find((item) => item.route === selected.route && item.selector === selected.selector)

  return (
    <dialog ref={dialogRef} className={`appearance-editor${closing ? ' is-exiting' : ''}`} aria-label="Редактор оформления" aria-hidden={closing || undefined} inert={closing || undefined} onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <div className="appearance-editor__preview-area">
        <div className="appearance-editor__preview-bar">
          <strong>Предпросмотр CRM</strong>
          <div role="group" aria-label="Ширина экрана">
            <button type="button" aria-pressed={!phone} onClick={() => setPhone(false)}>Компьютер</button>
            <button type="button" aria-pressed={phone} onClick={() => setPhone(true)}>Телефон</button>
          </div>
          {!phone && <label className="appearance-editor__desktop-width">Ширина компьютера <select value={desktopWidth} onChange={(event) => setDesktopWidth(Number(event.target.value))}><option value={0}>По месту</option><option value={1280}>1280 px</option><option value={1440}>1440 px</option><option value={1920}>1920 px</option></select></label>}
          {scaled && <small>Масштаб {Math.round(scale * 100)}%</small>}
          <button type="button" aria-expanded={outlineOpen} aria-controls="appearance-editor-outline" onClick={() => { setOutlineOpen(!outlineOpen); setMode('element') }}>Структура</button>
        </div>
        <div className="appearance-editor__workbench">
        {outlinePresence.present && <aside id="appearance-editor-outline" className={`appearance-editor__outline${outlinePresence.exiting ? ' is-exiting' : ''}`} aria-label="Структура страницы" aria-hidden={outlinePresence.exiting || undefined} inert={outlinePresence.exiting || undefined}>
          <header><strong>Элементы страницы</strong><button type="button" aria-label="Скрыть структуру" onClick={() => setOutlineOpen(false)}>×</button></header>
          {outlineRoot && <div className="appearance-editor__outline-tree" role="tree" aria-label="Элементы страницы"><OutlineBranch node={outlineRoot} depth={0} expanded={expanded} selectedSelector={selected?.route === frameRef.current?.contentDocument?.documentElement.dataset.appearanceRoute ? selected.selector : null} onToggle={(selector) => setExpanded((previous) => { const next = new Set(previous); if (next.has(selector)) next.delete(selector); else next.add(selector); return next })} onSelect={(node) => { const current = frameRef.current?.contentDocument?.querySelector(elementSelector(node)); if (current) { setMode('element'); void selectTarget(current) } }} /></div>}
        </aside>}
        <div ref={stageRef} className="appearance-editor__stage">
          <div className={`appearance-editor__frame-box${scaled ? ' is-scaled' : ''}`} style={scaled ? { width: virtualWidth * scale, height: virtualHeight * scale } : undefined}>
            <iframe
              ref={frameRef}
              title="Предпросмотр CRM"
              src={previewUrl.toString()}
              style={scaled ? { width: virtualWidth, height: virtualHeight, transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}
              onLoad={() => { setFrameReady((ready) => ready + 1); if (payload) applyPreview(frameRef.current?.contentDocument, payload.fields, draft.values, draft.overrides, draft.blocks, original) }}
            />
          </div>
        </div>
        </div>
      </div>
      <aside className="appearance-editor__panel">
        <header className="appearance-editor__head">
          <div><h2>Оформление</h2><p>Локальный редактор страниц CRM</p></div>
          <button type="button" aria-label="Закрыть редактор" onClick={requestClose}>×</button>
        </header>
        {error && <div className="appearance-editor__error" role="alert">{error}</div>}
        {notice && <div className="appearance-editor__notice" role="status">{notice}</div>}
        {confirmPresence.present ? (
          <div className={`appearance-editor__confirm${confirmPresence.exiting ? ' is-exiting' : ''}`} role="alertdialog" aria-label="Закрыть без сохранения" aria-hidden={confirmPresence.exiting || undefined} inert={confirmPresence.exiting || undefined}>
            <strong>Не сохранять изменения?</strong>
            <div><button type="button" onClick={() => setConfirmClose(false)}>Продолжить</button><button type="button" onClick={onClose}>Закрыть без сохранения</button></div>
          </div>
        ) : null}
        {!payload ? (!error && <p className="appearance-editor__loading">Загрузка настроек…</p>) : (
          <>
            <div className="appearance-editor__tools">
              <button type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>{original ? 'Показать мои изменения' : 'Сравнить с исходным'}</button>
              <button type="button" disabled={!undo.length} onClick={() => { setDraft(undo.at(-1)); setUndo(undo.slice(0, -1)) }}>Отменить шаг</button>
              <button type="button" disabled={!Object.keys(draft.values).length && !draft.overrides.length && !draft.blocks.length} onClick={() => changeState({ ...draft, values: {}, overrides: [], blocks: [] })}>Вернуть исходное</button>
            </div>
            <div className="appearance-editor__mode" role="group" aria-label="Режим настройки">
              <button type="button" aria-pressed={mode === 'global'} onClick={() => setMode('global')}>Общее оформление</button>
              <button type="button" aria-pressed={mode === 'element'} onClick={() => setMode('element')}>Отдельный элемент</button>
            </div>
            {mode === 'element' && <div className="appearance-editor__selection">
              <p>Клик выбирает блок; Ctrl+клик — элемент внутри него, например текст. Настройка действует на этом экране.</p>
              {selected && <>
                <strong>{selected.label}</strong>
                <p>{selected.route}</p>
                <div className="appearance-editor__element-actions">
                  <button type="button" onClick={() => setVisibility(selectedOverride?.visibility === 'hidden' ? null : 'hidden')}>{selectedOverride?.visibility === 'hidden' ? 'Показать' : 'Скрыть'}</button>
                  <button type="button" onClick={selectedOverride?.visibility === 'removed' ? () => setVisibility(null) : deleteSelected}>{selectedOverride?.visibility === 'removed' ? 'Восстановить' : 'Удалить'}</button>
                  <button type="button" disabled={!selected.parentSelector || draft.blocks.length >= 50} onClick={() => addBlock('text')}>Добавить текст</button>
                  <button type="button" disabled={!selected.parentSelector || draft.blocks.length >= 50} onClick={() => addBlock('block')}>Добавить блок</button>
                  <button type="button" disabled={selected.text === null} onClick={() => setCopied({ kind: selected.blockId ? draft.blocks.find((block) => block.id === selected.blockId)?.kind : 'text', text: selected.blockId ? draft.blocks.find((block) => block.id === selected.blockId)?.text : selectedOverride?.text ?? selected.text, properties: selectedOverride?.properties || {} })}>Копировать</button>
                  <button type="button" disabled={!copied || !selected.parentSelector || draft.blocks.length >= 50} onClick={() => addBlock(copied.kind, copied)}>Вставить</button>
                </div>
                {selected.text !== null && <div className="appearance-editor__text-edit"><label htmlFor="appearance-element-text">Текст элемента</label><textarea id="appearance-element-text" maxLength={500} value={selected.blockId ? draft.blocks.find((block) => block.id === selected.blockId)?.text || '' : selectedOverride?.text ?? selected.text} onChange={(event) => updateElementText(event.target.value)} />{!selected.blockId && <button type="button" disabled={!selectedOverride || !('text' in selectedOverride)} onClick={resetElementText}>Вернуть исходный текст</button>}</div>}
                <div className="appearance-editor__fields">
                  {elementFields.map((field, index) => {
                    const current = draft.overrides.find((item) => item.route === selected.route && item.selector === selected.selector)
                    const value = current?.properties[field.key] || selected.defaults[field.key]
                    return <React.Fragment key={field.key}>{field.group && (index === 0 || elementFields[index - 1].group !== field.group) && <h3 className="appearance-editor__spacing-heading">{field.group}</h3>}<label className="appearance-editor__field" data-appearance-field={field.key}><span>{field.label}</span><span className="appearance-editor__control">
                      {field.type === 'color' ? <input type="color" value={value} onChange={(event) => updateElement(field.key, event.target.value)} />
                        : <input type="number" min={field.min} max={field.max} value={Number.parseInt(value, 10)} onChange={(event) => {
                          const number = Number(event.target.value)
                          if (Number.isInteger(number) && number >= field.min && number <= field.max) updateElement(field.key, `${number}px`)
                        }} />}
                      <output>{value}</output>
                    </span></label></React.Fragment>
                  })}
                </div>
                <button type="button" disabled={!selectedOverride} onClick={resetElement}>Сбросить оформление элемента</button>
              </>}
            </div>}
            {mode === 'global' && <div className="appearance-editor__fields">
              {groups.map((group) => (
                <section key={group}>
                  <h3>{group}</h3>
                  {payload.fields.filter((field) => field.group === group).map((field) => {
                    const value = draft.values[field.key] || defaults[field.key]
                    return <label key={field.key} className="appearance-editor__field">
                      <span>{field.label}</span>
                      <span className="appearance-editor__control">
                        {field.type === 'color'
                          ? <input type="color" value={value} onChange={(event) => updateField(field.key, event.target.value)} />
                          : <input type="number" min={field.min} max={field.max} value={Number.parseInt(value, 10)} onChange={(event) => {
                            const number = Number(event.target.value)
                            if (Number.isInteger(number) && number >= field.min && number <= field.max) updateField(field.key, `${number}px`)
                          }} />}
                        <output>{value}</output>
                        {field.key in draft.values && <button type="button" aria-label={`Сбросить: ${field.label}`} onClick={() => resetField(field.key)}>↺</button>}
                      </span>
                    </label>
                  })}
                </section>
              ))}
              <section>
                <h3>Варианты оформления</h3>
                <div className="appearance-editor__preset-add"><input aria-label="Название варианта" maxLength={60} value={name} placeholder="Например, более контрастный" onChange={(event) => setName(event.target.value)} /><button type="button" onClick={addPreset}>Добавить</button></div>
                {draft.presets.map((preset) => <div className="appearance-editor__preset" key={preset.name}><span>{preset.name}</span><button type="button" onClick={() => changeState({ ...draft, values: { ...preset.values }, overrides: structuredClone(preset.overrides || []), blocks: structuredClone(preset.blocks || []) })}>Применить</button><button type="button" aria-label={`Удалить вариант ${preset.name}`} onClick={() => changeState({ ...draft, presets: draft.presets.filter((item) => item.name !== preset.name) })}>×</button></div>)}
              </section>
            </div>}
            <footer className="appearance-editor__footer"><span>{dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span><button type="button" disabled={!dirty || busy} onClick={save}>{busy ? 'Сохранение…' : 'Сохранить'}</button></footer>
          </>
        )}
      </aside>
    </dialog>
  )
}
