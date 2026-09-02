import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiErrorMessage } from '../api.js'
import { useLocale } from '../i18n.jsx'
import {
  buildListUrl,
  createListRequestController,
  listStateKey,
  shouldRequestSearch,
  visiblePageNumbers,
} from './listContracts.js'


const MOBILE_QUERY = '(max-width: 767px)'
const IDENTITY_FILTERS = (filters) => filters
const EMPTY_PAGINATION = {
  page: 1,
  page_size: 50,
  total: 0,
  pages: 0,
  has_next: false,
  has_previous: false,
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches
}

function readStoredState(key, mobile) {
  const fallback = {
    search: '',
    appliedFilters: {},
    page: 1,
    loadedPages: 1,
    pageSize: mobile ? 20 : 50,
    scrollY: 0,
  }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || 'null')
    if (!parsed || typeof parsed !== 'object') return fallback
    return {
      ...fallback,
      ...parsed,
      pageSize: mobile ? 20 : [50, 100, 200].includes(parsed.pageSize) ? parsed.pageSize : 50,
    }
  } catch {
    return fallback
  }
}

function writeStoredState(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The list stays functional when session storage is unavailable.
  }
}

export function useScreenList({
  path,
  itemKey,
  mapRows = (rows) => rows,
  role,
  route,
  userKey,
  initialFilters = {},
  fixedParams = {},
  defaultOrder,
  serializeFilters = IDENTITY_FILTERS,
  enabled = true,
}) {
  const { t } = useLocale()
  const mobile = isMobileViewport()
  const storageKey = listStateKey({ userKey, role, route })
  const fixedParamsKey = JSON.stringify(fixedParams)
  const initialFiltersKey = JSON.stringify(initialFilters)
  const initialFilterValues = useMemo(() => ({ ...initialFilters }), [initialFiltersKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const stored = useMemo(() => readStoredState(storageKey, mobile), [storageKey, mobile])
  const [search, setSearch] = useState(stored.search)
  const [appliedSearch, setAppliedSearch] = useState(
    shouldRequestSearch(stored.search) ? stored.search.trim() : '',
  )
  const [draftFilters, setDraftFilters] = useState({ ...initialFilterValues, ...stored.appliedFilters })
  const [appliedFilters, setAppliedFilters] = useState({ ...initialFilterValues, ...stored.appliedFilters })
  const [page, setPage] = useState(mobile ? 1 : Math.max(1, stored.page))
  const [pageSize, setPageSizeState] = useState(stored.pageSize)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION, page_size: stored.pageSize })
  const [payload, setPayload] = useState({})
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [nextError, setNextError] = useState(null)
  const controllerRef = useRef(null)
  const activeStorageKeyRef = useRef(storageKey)
  const restoreScrollRef = useRef(stored.scrollY || 0)
  const restorePagesRef = useRef(mobile ? Math.max(1, stored.loadedPages) : 1)
  const rowsRef = useRef(rows)
  const routeIsChanging = activeStorageKeyRef.current !== storageKey
  rowsRef.current = rows
  if (!controllerRef.current) {
    controllerRef.current = createListRequestController(
      (url, options) => api.get(url, options),
    )
  }

  useEffect(() => {
    if (activeStorageKeyRef.current === storageKey) return
    activeStorageKeyRef.current = storageKey
    controllerRef.current.cancel()
    const next = readStoredState(storageKey, mobile)
    const nextSearch = String(next.search || '')
    setSearch(nextSearch)
    setAppliedSearch(shouldRequestSearch(nextSearch) ? nextSearch.trim() : '')
    setDraftFilters({ ...initialFilterValues, ...next.appliedFilters })
    setAppliedFilters({ ...initialFilterValues, ...next.appliedFilters })
    setPage(mobile ? 1 : Math.max(1, next.page))
    setPageSizeState(next.pageSize)
    setRows([])
    setPagination({ ...EMPTY_PAGINATION, page_size: next.pageSize })
    setPayload({})
    setError(null)
    setNextError(null)
    setStatus('loading')
    restorePagesRef.current = mobile ? Math.max(1, next.loadedPages) : 1
    restoreScrollRef.current = next.scrollY || 0
  }, [storageKey, mobile, initialFilterValues])

  useEffect(() => {
    if (!shouldRequestSearch(search)) {
      if (appliedSearch) {
        setAppliedSearch('')
        setPage(1)
      }
      return undefined
    }
    const normalized = search.trim()
    if (normalized === appliedSearch) return undefined
    const handle = setTimeout(() => {
      setAppliedSearch(normalized)
      setPage(1)
    }, normalized ? 300 : 0)
    return () => clearTimeout(handle)
  }, [search, appliedSearch])

  const requestParams = useMemo(() => ({
    page,
    page_size: pageSize,
    search: appliedSearch,
    order: defaultOrder,
    ...serializeFilters(appliedFilters),
    ...fixedParams,
  }), [page, pageSize, appliedSearch, defaultOrder, appliedFilters, fixedParamsKey, serializeFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    restorePagesRef.current = 1
    setRows([])
    setPage(1)
  }, [fixedParamsKey])

  const load = useCallback(async ({ preserveRows = false } = {}) => {
    if (!enabled || !path) return
    const isNextPage = mobile && page > 1
    if (!preserveRows && !isNextPage) setStatus('loading')
    else setStatus('loading-more')
    setError(null)
    setNextError(null)
    try {
      const result = await controllerRef.current.run(buildListUrl(path, requestParams))
      if (result.stale) return
      const payload = result.payload || {}
      setPayload(payload)
      const mapped = mapRows(payload[itemKey] || [], payload)
      setRows((current) => isNextPage ? [...current, ...mapped] : mapped)
      setPagination(payload.pagination || {
        ...EMPTY_PAGINATION,
        page,
        page_size: pageSize,
        total: mapped.length,
      })
      setStatus('ready')
      if (mobile && page < restorePagesRef.current && payload.pagination?.has_next) {
        setPage((current) => current + 1)
      } else if (restoreScrollRef.current) {
        restorePagesRef.current = 1
        const scrollY = restoreScrollRef.current
        restoreScrollRef.current = 0
        requestAnimationFrame(() => window.scrollTo({ top: scrollY }))
      }
    } catch (next) {
      const message = apiErrorMessage(next, t('list.loadFailed'))
      if (isNextPage && rowsRef.current.length) {
        setNextError(message)
        setStatus('ready')
      } else {
        setError(message)
        setStatus('error')
      }
    }
  }, [enabled, itemKey, mapRows, mobile, page, pageSize, path, requestParams, t])

  useEffect(() => {
    load()
    return () => controllerRef.current.cancel()
  }, [load])

  useEffect(() => {
    const refresh = (event) => {
      if (!event.detail?.role || event.detail.role === role) load({ preserveRows: true })
    }
    window.addEventListener('swimcrm:list-invalidate', refresh)
    return () => window.removeEventListener('swimcrm:list-invalidate', refresh)
  }, [load, role])

  useEffect(() => {
    const persist = () => writeStoredState(storageKey, {
      search,
      appliedFilters,
      page: mobile ? 1 : page,
      loadedPages: mobile ? page : 1,
      pageSize,
      scrollY: window.scrollY,
    })
    persist()
    window.addEventListener('scroll', persist, { passive: true })
    return () => window.removeEventListener('scroll', persist)
  }, [storageKey, search, appliedFilters, page, pageSize, mobile])

  const setDraftFilter = useCallback((name, value) => {
    setDraftFilters((current) => ({ ...current, [name]: value }))
  }, [])
  const applyFilters = useCallback(() => {
    restorePagesRef.current = 1
    setAppliedFilters({ ...draftFilters })
    setPage(1)
  }, [draftFilters])
  const resetFilters = useCallback(() => {
    restorePagesRef.current = 1
    setSearch('')
    setAppliedSearch('')
    setDraftFilters({ ...initialFilterValues })
    setAppliedFilters({ ...initialFilterValues })
    setPage(1)
  }, [initialFilterValues])
  const setPageSize = useCallback((value) => {
    restorePagesRef.current = 1
    const next = mobile ? 20 : Number(value)
    setPageSizeState([20, 50, 100, 200].includes(next) ? next : 50)
    setRows([])
    setPage(1)
  }, [mobile])
  const loadMore = useCallback(() => {
    if (pagination.has_next && status !== 'loading-more') setPage((current) => current + 1)
  }, [pagination.has_next, status])
  const filterCount = Object.entries(appliedFilters).filter(
    ([name, value]) => value !== '' && value !== initialFilterValues[name],
  ).length

  return {
    rows,
    pagination,
    payload,
    status: routeIsChanging ? 'loading' : status,
    error,
    nextError,
    search,
    setSearch,
    draftFilters,
    appliedFilters,
    setDraftFilter,
    applyFilters,
    resetFilters,
    filterCount,
    page,
    setPage: (value) => {
      const totalPages = Math.max(1, pagination.pages || 1)
      setRows([])
      setPage(Math.min(totalPages, Math.max(1, Number(value) || 1)))
    },
    pageSize,
    setPageSize,
    loadMore,
    retry: () => load({ preserveRows: true }),
    mobile,
  }
}

export function ListToolbar({ list, searchLabel, searchPlaceholder, children }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  return (
    <div className="ops-list-tools">
      <label className="ops-list-search">
        <span>{searchLabel || t('list.search')}</span>
        <input
          type="search"
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          placeholder={searchPlaceholder || t('list.minChars')}
        />
      </label>
      {children && (
        <>
          <button type="button" className="ops-list-filter-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {t('list.filters', undefined, { count: list.filterCount })}
          </button>
          {open && (
            <div className="ops-list-filter-panel">
              <div className="ops-list-filter-fields">{children}</div>
              <div className="ops-list-filter-actions">
                <button type="button" onClick={list.resetFilters}>{t('list.reset')}</button>
                <button type="button" className="primary" onClick={list.applyFilters}>{t('list.apply')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ListFeedback({ list, emptyLabel, noResultsLabel }) {
  const { t } = useLocale()
  if (list.status === 'loading' && !list.rows.length) {
    return <div className="ops-list-skeleton" role="status" aria-label={t('list.loading')}><span /><span /><span /></div>
  }
  if (list.error && !list.rows.length) {
    return <div className="ops-list-error" role="alert"><span>{list.error}</span><button type="button" onClick={list.retry}>{t('shared.retry')}</button></div>
  }
  if (!list.rows.length) {
    const filtered = Boolean(list.search.trim()) || list.filterCount > 0
    return (
      <div className="empty ops-list-empty">
        <span>{filtered ? (noResultsLabel || t('list.noResults')) : (emptyLabel || t('list.empty'))}</span>
        {filtered && <button type="button" onClick={list.resetFilters}>{t('list.resetSearch')}</button>}
      </div>
    )
  }
  return null
}

export function ListPagination({ list }) {
  const { t } = useLocale()
  const { pagination } = list
  if (!list.rows.length) return null
  if (list.mobile) {
    return (
      <div className="ops-list-pagination">
        {list.nextError && <div className="ops-list-error" role="alert"><span>{list.nextError}</span><button type="button" onClick={list.retry}>{t('shared.retry')}</button></div>}
        {pagination.has_next ? (
          <button type="button" disabled={list.status === 'loading-more'} onClick={list.loadMore}>
            {list.status === 'loading-more' ? t('list.loadingMore') : t('list.showMore')}
          </button>
        ) : <span>{t('list.allShown', undefined, { count: pagination.total })}</span>}
      </div>
    )
  }
  const totalPages = Math.max(1, pagination.pages || 1)
  const pages = visiblePageNumbers(pagination.page, totalPages)
  return (
    <div className="ops-list-pagination">
      <label>{t('list.perPage')} <select value={list.pageSize} onChange={(event) => list.setPageSize(event.target.value)}><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="500" disabled>500 — {t('list.afterReview')}</option></select></label>
      <div className="ops-list-pages" aria-label={t('list.pages')}>
        <button type="button" disabled={!pagination.has_previous} aria-label={t('list.previousPage')} onClick={() => list.setPage(pagination.page - 1)}>‹</button>
        {pages.map((page) => <button type="button" key={page} className={page === pagination.page ? 'is-current' : ''} aria-current={page === pagination.page ? 'page' : undefined} onClick={() => list.setPage(page)}>{page}</button>)}
        <button type="button" disabled={!pagination.has_next} aria-label={t('list.nextPage')} onClick={() => list.setPage(pagination.page + 1)}>›</button>
      </div>
      <span>{t('list.records', undefined, { count: pagination.total })}</span>
    </div>
  )
}
