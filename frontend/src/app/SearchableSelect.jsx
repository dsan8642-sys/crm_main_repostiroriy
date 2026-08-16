import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/ł/g, 'l')
    .trim()
}

export function clientSelectOption(client, {
  valueKey = 'studentId',
  label,
  description,
} = {}) {
  const first = client.first || client.first_name || ''
  const last = client.last || client.last_name || ''
  const fullName = client.full_name || `${last} ${first}`.trim()
  return {
    value: client[valueKey] ?? client.id,
    label: label?.(client) || fullName,
    description: description?.(client) || client.phone || client.email || client.group || '',
    searchText: [
      first, last, fullName, `${first} ${last}`, `${last} ${first}`,
      client.phone, client.email,
    ].filter(Boolean).join(' '),
  }
}

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  loadOptions,
  placeholder = 'Начните вводить имя или фамилию',
  emptyLabel = 'Клиенты не найдены',
  disabled = false,
  className = '',
  inputAriaLabel,
  inputId,
  error,
}) {
  const id = useId().replace(/:/g, '')
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const selected = options.find((option) => String(option.value) === String(value)) || null
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [remoteOptions, setRemoteOptions] = useState(null)
  const [remoteQuery, setRemoteQuery] = useState('')
  const [remoteLoading, setRemoteLoading] = useState(false)

  useEffect(() => {
    if (!open) setQuery(selected?.label || '')
  }, [open, selected?.label])

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [])

  useEffect(() => {
    const normalized = normalizeSearch(query)
    if (!loadOptions || !open || !normalized || query === selected?.label) {
      setRemoteOptions(null)
      setRemoteQuery('')
      setRemoteLoading(false)
      return undefined
    }
    let alive = true
    setRemoteLoading(true)
    const handle = setTimeout(async () => {
      try {
        const nextOptions = await loadOptions(query.trim())
        if (!alive) return
        setRemoteOptions(Array.isArray(nextOptions) ? nextOptions : [])
        setRemoteQuery(normalized)
      } catch {
        if (!alive) return
        setRemoteOptions(null)
        setRemoteQuery('')
      } finally {
        if (alive) setRemoteLoading(false)
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(handle)
    }
  }, [loadOptions, open, query, selected?.label])

  const filteredOptions = useMemo(() => {
    const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean)
    const source = remoteQuery === normalizeSearch(query) && remoteOptions != null
      ? remoteOptions
      : options
    if (!tokens.length || query === selected?.label) return source
    return source.filter((option) => {
      const haystack = normalizeSearch(`${option.label} ${option.searchText || ''}`)
      return tokens.every((token) => haystack.includes(token))
    })
  }, [options, query, remoteOptions, remoteQuery, selected?.label])

  function openList() {
    if (disabled) return
    setOpen(true)
    setActiveIndex((current) => current >= 0 ? current : 0)
  }

  function choose(option) {
    onChange(String(option.value))
    setQuery(option.label)
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function handleInput(event) {
    const nextQuery = event.target.value
    setQuery(nextQuery)
    setOpen(true)
    setActiveIndex(0)
    if (selected && nextQuery !== selected.label) onChange('')
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openList()
      setActiveIndex((current) => filteredOptions.length ? (current + 1) % filteredOptions.length : -1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openList()
      setActiveIndex((current) => filteredOptions.length
        ? (current <= 0 ? filteredOptions.length - 1 : current - 1)
        : -1)
    } else if (event.key === 'Enter' && open && activeIndex >= 0 && filteredOptions[activeIndex]) {
      event.preventDefault()
      choose(filteredOptions[activeIndex])
    } else if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setQuery(selected?.label || '')
    }
  }

  const controlId = inputId || `${id}-input`
  const errorId = `${controlId}-error`
  const listboxId = `${id}-listbox`
  const activeOption = open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined

  return (
    <label className={`ops-search-select ${className}`.trim()} ref={rootRef}>
      {label && <span className="ops-search-select-label">{label}</span>}
      <span className="ops-search-select-control">
        <input
          id={controlId}
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-label={inputAriaLabel || label}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeOption}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          onChange={handleInput}
          onFocus={openList}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="ops-search-select-toggle"
          tabIndex="-1"
          aria-label={open ? 'Закрыть список' : 'Открыть список'}
          aria-controls={listboxId}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            if (open) setOpen(false)
            else {
              openList()
              inputRef.current?.focus()
            }
          }}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </span>
      {error && <small id={errorId} className="ops-field-error" role="alert">{error}</small>}
      {open && (
        <ul id={listboxId} className="ops-search-select-list" role="listbox">
          {filteredOptions.map((option, index) => (
            <li
              id={`${id}-option-${index}`}
              key={String(option.value)}
              className={index === activeIndex ? 'is-active' : ''}
              role="option"
              aria-selected={String(option.value) === String(value)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </li>
          ))}
          {!filteredOptions.length && <li className="is-empty" role="presentation">{remoteLoading ? 'Ищу клиентов...' : emptyLabel}</li>}
        </ul>
      )}
    </label>
  )
}
