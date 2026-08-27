import React, { useEffect, useMemo, useState } from 'react'
import { adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { FormModal } from '../FormModal.jsx'

const DATASETS = [
  { kind: 'trainers', label: 'import.dataset.trainers', help: 'import.help.trainers' },
  { kind: 'groups', label: 'import.dataset.groups', help: 'import.help.groups' },
  { kind: 'clients', label: 'import.dataset.clients', help: 'import.help.clients' },
  { kind: 'payments', label: 'import.dataset.payments', help: 'import.help.payments' },
  { kind: 'attendance', label: 'import.dataset.attendance', help: 'import.help.attendance' },
]

const STATUS_META = {
  new: ['import.status.new', '#1a7f37'],
  matched: ['import.status.matched', '#1a7f37'],
  will_create_session: ['import.status.willCreateSession', '#9a6700'],
  duplicate: ['import.status.duplicate', '#9a6700'],
  possible_duplicate: ['import.status.possibleDuplicate', '#b54708'],
  update: ['import.status.update', '#0969da'],
  skipped: ['import.status.skipped', '#57606a'],
  error: ['import.status.error', '#cf222e'],
}

const READY = new Set(['new', 'update', 'matched', 'will_create_session', 'possible_duplicate'])

function cleanMapping(mapping) {
  return Object.fromEntries(Object.entries(mapping || {}).filter(([, value]) => value))
}

function StatusText({ status }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const [label, color] = STATUS_META[status] || [null, '#57606a']
  return <span style={{ color, fontWeight: 650 }}>{label ? t(label) : status}</span>
}

function useImportTab(kind, effectMode, reloadRoleData, t) {
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [fieldOptions, setFieldOptions] = useState([])
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState([])
  const [batchId, setBatchId] = useState(null)
  const [counts, setCounts] = useState({})
  const [summary, setSummary] = useState(null)
  const [meta, setMeta] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [importMode, setImportMode] = useState('create_only')

  function updateSelected(value) {
    setSelected(value)
    setFieldErrors((current) => clearFieldError(current, 'selectedIndices'))
  }

  function applyPreview(payload) {
    const nextRows = payload.rows || []
    setHeaders(payload.headers || [])
    setMapping(payload.mapping || {})
    setFieldOptions(payload.field_options || [])
    setRows(nextRows)
    setSelected(nextRows.filter((row) => READY.has(row.status) && !row.excluded).map((row) => row.index))
    setBatchId(payload.batch_id || null)
    setCounts(payload.counts || {})
    setMeta({
      ownExport: payload.own_export,
      schema: payload.metadata?.schema_version,
      duplicateFile: payload.duplicate_file,
      unusedHeaders: payload.unused_headers || [],
      requiredMissing: payload.required_missing || [],
      sourceSamples: payload.source_samples || {},
    })
    setImportMode(payload.import_mode || 'create_only')
  }

  async function runPreview(targetFile = file, targetMapping = mapping) {
    if (!targetFile) {
      setFieldErrors({ file: t('import.fileRequired') })
      return
    }
    setBusy(true); setError(''); setFieldErrors({}); setSummary(null)
    try {
      const form = new FormData()
      form.set('file', targetFile)
      form.set('mapping', JSON.stringify(cleanMapping(targetMapping)))
      if (kind === 'attendance') form.set('effect_mode', effectMode)
      if (kind === 'groups') form.set('import_mode', importMode)
      applyPreview(await api.postForm(`/api/admin/import/${kind}/preview/`, form))
    } catch (err) {
      const nextErrors = fieldErrorsFromApi(err, {
        file: 'file', mapping: 'mapping', effect_mode: 'effectMode', import_mode: 'importMode',
      })
      setFieldErrors(nextErrors)
      setError(formErrorMessage(err, t('import.previewError')) || '')
      focusFirstFieldError(nextErrors, {
        file: `admin-import-${kind}-file`,
        mapping: `admin-import-${kind}-mapping-0`,
        effectMode: 'admin-import-attendance-effect-mode',
        importMode: `admin-import-${kind}-mode`,
      })
      setRows([]); setBatchId(null); setSelected([])
    } finally {
      setBusy(false)
    }
  }

  async function selectFile(nextFile) {
    setFile(nextFile); setRows([]); setBatchId(null); setSummary(null); setError(''); setFieldErrors({})
    setHeaders([]); setMapping({}); setFieldOptions([]); setMeta({}); setSelected([])
    if (nextFile) await runPreview(nextFile, {})
  }

  async function patchRow(index, patch) {
    if (!batchId) return
    setBusy(true); setError('')
    try {
      const payload = await api.patch(`/api/admin/import/${kind}/${batchId}/rows/${index}/`, patch)
      setRows((current) => current.map((row) => row.index === index ? payload.row : row))
      setCounts(payload.counts || {})
      if (payload.row.excluded || !READY.has(payload.row.status)) {
        setSelected((current) => current.filter((item) => item !== index))
      }
      return payload.row
    } catch (err) {
      setError(apiErrorMessage(err, t('import.rowSaveError')))
    } finally {
      setBusy(false)
    }
  }

  async function bulkPatch(indices, patch) {
    if (!batchId || !indices.length) return
    setBusy(true); setError('')
    try {
      const payload = await api.post(`/api/admin/import/${kind}/${batchId}/rows/bulk/`, { indices, ...patch })
      setRows(payload.rows || [])
      setCounts(payload.counts || {})
      if (patch.excluded) setSelected([])
    } catch (err) {
      setError(apiErrorMessage(err, t('import.bulkSaveError')))
    } finally {
      setBusy(false)
    }
  }

  async function commit(extraPayload = {}) {
    const available = new Set(rows.filter((row) => !row.excluded && READY.has(row.status)).map((row) => row.index))
    const selectedIndices = selected.filter((index) => available.has(index))
    if (!batchId || !selectedIndices.length) return
    setBusy(true); setError('')
    setFieldErrors((current) => clearFieldError(current, 'selectedIndices'))
    try {
      const payload = await api.post(`/api/admin/import/${kind}/commit/`, {
        batch_id: batchId,
        selected_indices: selectedIndices,
        ...extraPayload,
      })
      setSummary(payload)
      setRows([]); setBatchId(null); setFile(null); setHeaders([]); setSelected([])
      if (reloadRoleData) await reloadRoleData('admin')
    } catch (err) {
      const nextErrors = fieldErrorsFromApi(err, {
        selected_indices: 'selectedIndices',
        confirm_financial_effects: 'confirmFinancialEffects',
        approve_possible_duplicates: 'possibleDuplicates',
      })
      delete nextErrors.batch_id
      setFieldErrors((current) => ({ ...current, ...nextErrors }))
      setError(err.fieldErrors?.batch_id
        ? apiErrorMessage(err, t('import.previewExpired'))
        : formErrorMessage(err, t('import.commitError')) || '')
      focusFirstFieldError(nextErrors, {
        selectedIndices: `admin-import-${kind}-selected-indices`,
        confirmFinancialEffects: 'admin-import-attendance-financial-confirmation',
        possibleDuplicates: `admin-import-${kind}-possible-duplicates`,
      })
    } finally {
      setBusy(false)
    }
  }

  function toggle(index) {
    updateSelected((current) => current.includes(index)
      ? current.filter((item) => item !== index)
      : [...current, index])
  }

  return {
    kind, file, headers, mapping, setMapping, fieldOptions, rows, selected, setSelected: updateSelected,
    batchId, counts, summary, meta, busy, error, setError, selectFile, runPreview,
    patchRow, bulkPatch, commit, toggle, importMode, setImportMode, fieldErrors, setFieldErrors,
  }
}

function ImportSummary({ summary }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  if (!summary) return null
  const parts = Object.entries(summary)
    .filter(([key]) => !['errors', 'created_ids', 'created_client_ids'].includes(key))
    .map(([key, value]) => `${t(`import.summary.${key}`)}: ${value}`)
    .join(', ')
  return <div className="banner banner-success" role="status" style={{ marginBottom: 12 }}>
    <div>{parts}</div>
    {(summary.errors || []).length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
      {summary.errors.map((line, index) => <li key={index}>{line}</li>)}
    </ul>}
  </div>
}

function ClientSearch({ Button, disabled, onChoose }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  async function search() {
    if (!query.trim()) return
    setError('')
    try {
      const payload = await api.get(`/api/admin/import/client-search/?q=${encodeURIComponent(query.trim())}`)
      setResults(payload.clients || [])
    } catch (err) {
      setError(apiErrorMessage(err, t('import.clientSearchError')))
    }
  }

  return <div style={{ display: 'grid', gap: 8 }}>
    <div className="ops-button-row">
      <input value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder={t('import.clientSearchPlaceholder')} />
      <Button size="sm" variant="secondary" disabled={disabled} onClick={search}>{t('import.findClient')}</Button>
    </div>
    {error && <span className="muted">{error}</span>}
    {results.map((client) => <button type="button" key={client.id} className="card card-pad"
      style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onChoose(client)}>
      <strong>{client.name}</strong> · ID {client.id} · {client.email || t('import.noEmail')} · {client.phone || t('import.noPhone')}
    </button>)}
  </div>
}

function RowEditor({ state, row, Button, Banner, onClose }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const editable = state.fieldOptions.filter((field) => field.editable)
  const readOnly = state.fieldOptions.filter((field) => !field.editable && row.data?.[field.key])
  const [values, setValues] = useState(() => Object.fromEntries(
    editable.map((field) => [field.key, row.data?.[field.key] ?? ''])))

  useEffect(() => {
    setValues(Object.fromEntries(editable.map((field) => [field.key, row.data?.[field.key] ?? ''])))
  }, [row.index])

  async function save() {
    const saved = await state.patchRow(row.index, { data: values })
    if (saved) onClose()
  }

  async function assign(client) {
    const saved = await state.patchRow(row.index, { relations: { client_id: client.id } })
    if (saved) onClose()
  }

  async function clearClient() {
    await state.patchRow(row.index, { relations: {
      client_id: '', client_email: '', client_phone: '', client_first_name: '',
      client_last_name: '', client_birth_date: '', client: '', create_client: '',
    } })
  }

  const baseline = Object.fromEntries(editable.map((field) => [field.key, row.data?.[field.key] ?? '']))

  return <FormModal open title={t('import.rowEditorTitle', { index: row.index })} size="lg" busy={state.busy} dirty={JSON.stringify(values) !== JSON.stringify(baseline)} onRequestClose={onClose} footer={({ requestClose }) => <><Button variant="secondary" disabled={state.busy} onClick={() => requestClose('cancel')}>{t('common.close')}</Button><Button variant="primary" loading={state.busy} disabled={state.busy} onClick={save}>{t('import.saveCorrections')}</Button></>}>
    {state.error && <Banner tone="danger" onClose={() => state.setError('')}>{state.error}</Banner>}
    <div className="ops-form-grid">
      {editable.map((field) => <label key={field.key}>
        {field.label}{field.required ? ' *' : ''}
        <input value={values[field.key] ?? ''}
          onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />
      </label>)}
    </div>
    {readOnly.length > 0 && <div className="muted">
      {t('import.readOnlyFields', { fields: readOnly.map((field) => `${field.label}: ${row.data[field.key]}`).join(' · ') })}
    </div>}
    {['payments', 'attendance'].includes(state.kind) && <>
      <div className="eyebrow">{t('import.clientRelation')}</div>
      <ClientSearch Button={Button} disabled={state.busy} onChoose={assign} />
      <div className="ops-button-row">
        <Button size="sm" variant="secondary" onClick={clearClient}>{t('import.clearAutoMatch')}</Button>
        {state.kind === 'payments' && <Button size="sm" variant="secondary"
          onClick={() => state.patchRow(row.index, { relations: { create_client: 'true' } })}>
          {t('import.createClientFromRow')}
        </Button>}
      </div>
    </>}
  </FormModal>
}

function ImportWorkspace({ state, dataset, components, financial, possibleDuplicates, onFinancial, onDuplicates }) {
  const { Button, Banner, Table } = components
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [bulkClient, setBulkClient] = useState(null)

  const visibleRows = useMemo(() => state.rows.filter((row) => {
    const text = JSON.stringify(row.data || {}).toLocaleLowerCase()
    if (search && !text.includes(search.toLocaleLowerCase())) return false
    if (filter === 'error') return row.status === 'error'
    if (filter === 'warning') return (row.warnings || []).length > 0
    if (filter === 'unmatched') return ['ambiguous', 'suggestion', 'none'].includes(row.resolved?.matching_confidence)
    if (filter === 'new') return row.status === 'new'
    if (filter === 'update') return row.action === 'update'
    if (filter === 'duplicate') return ['duplicate', 'possible_duplicate'].includes(row.status)
    if (filter === 'excluded') return row.excluded
    return true
  }), [state.rows, search, filter])

  const columns = [
    { key: 'selected', header: '', width: 42, render: (row) => <input type="checkbox"
      aria-label={t('import.selectRow', { index: row.index })} checked={state.selected.includes(row.index)}
      disabled={row.excluded || row.status === 'error' || row.status === 'duplicate'}
      onChange={() => state.toggle(row.index)} /> },
    { key: 'index', header: '#', width: 52, render: (row) => row.index },
    { key: 'status', header: t('common.status'), width: 190, render: (row) => <StatusText status={row.status} /> },
    { key: 'summary', header: t('import.data'), render: (row) => Object.values(row.data || {}).filter(Boolean).slice(0, 8).join(' · ') },
    { key: 'match', header: t('import.relationsChanges'), render: (row) => {
      const changes = Object.entries(row.resolved?.changes || {})
        .map(([field, value]) => `${field}: ${value.old ?? '∅'} → ${value.new ?? '∅'}`)
      return changes.join(' · ') || row.resolved?.matching_reason || row.resolved?.group_reason || '—'
    } },
    { key: 'issues', header: t('import.issues'), render: (row) => [
      ...(row.errors || []), ...(row.warnings || []),
    ].join('; ') || '—' },
    { key: 'actions', header: t('import.actions'), width: 190, render: (row) => <div className="ops-button-row">
      <Button size="sm" variant="subtle" onClick={() => setEditing(row.index)}>{t('import.correct')}</Button>
      <Button size="sm" variant="subtle" onClick={() => state.patchRow(row.index, { excluded: !row.excluded })}>
        {t(row.excluded ? 'import.restoreRow' : 'import.excludeRow')}
      </Button>
    </div> },
  ]

  const selectedRows = state.rows.filter((row) => state.selected.includes(row.index))
  const hasPossibleDuplicates = selectedRows.some((row) => row.status === 'possible_duplicate')
  const canCommit = state.selected.length > 0 && !state.busy
    && (!hasPossibleDuplicates || possibleDuplicates)
    && (state.kind !== 'attendance' || !financial.required || financial.confirmed)

  return <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
    <div className="card card-pad">
      <div className="eyebrow">{t(dataset.label)}: CSV / XLSX</div>
      <p className="muted" style={{ margin: '6px 0 12px' }}>{t(dataset.help)}</p>
      {state.kind === 'attendance' && financial.controls}
      {state.kind === 'groups' && <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <span className="eyebrow">{t('import.conflictMode')}</span>
        <select id={`admin-import-${state.kind}-mode`} value={state.importMode} disabled={Boolean(state.file)} aria-invalid={Boolean(state.fieldErrors.importMode)} aria-describedby={state.fieldErrors.importMode ? `admin-import-${state.kind}-mode-error` : undefined}
          onChange={(event) => { state.setImportMode(event.target.value); state.setFieldErrors((current) => clearFieldError(current, 'importMode')) }}>
          <option value="create_only">{t('import.modeCreateOnly')}</option>
          <option value="update_existing">{t('import.modeUpdateOnly')}</option>
          <option value="upsert">{t('import.modeUpsert')}</option>
        </select>
        {state.fieldErrors.importMode && <small id={`admin-import-${state.kind}-mode-error`} className="ops-field-error" role="alert">{state.fieldErrors.importMode}</small>}
      </label>}
      <input id={`admin-import-${state.kind}-file`} type="file" accept=".xlsx,.xlsm,.csv" disabled={state.busy} aria-invalid={Boolean(state.fieldErrors.file)} aria-describedby={state.fieldErrors.file ? `admin-import-${state.kind}-file-error` : undefined}
        onChange={(event) => { state.setFieldErrors((current) => clearFieldError(current, 'file')); state.selectFile(event.target.files?.[0] || null) }} />
      {state.fieldErrors.file && <small id={`admin-import-${state.kind}-file-error`} className="ops-field-error" role="alert">{state.fieldErrors.file}</small>}
    </div>

    {state.error && !editing && <Banner tone="danger" onClose={() => state.setError('')}>{state.error}</Banner>}
    <ImportSummary summary={state.summary} />
    {state.meta.ownExport && <Banner tone="success">{t('import.ownExport', { schema: state.meta.schema })}</Banner>}
    {state.meta.duplicateFile && <Banner tone="warning">{t('import.duplicateFile')}</Banner>}
    {state.meta.requiredMissing?.length > 0 && <Banner tone="warning">
      {t('import.requiredMissing', { fields: state.meta.requiredMissing.join(', ') })}
    </Banner>}

    {state.headers.length > 0 && <div className="card card-pad">
      <div className="eyebrow">{t('import.columnMapping')}</div>
      <div className="ops-form-grid" style={{ marginTop: 8 }}>
        {state.headers.filter((header) => !['schema_version', 'exported_at', 'source_system', 'entity_type'].includes(header))
          .map((header, index) => <label key={header}>
            <span>{header}{state.meta.sourceSamples?.[header]
              ? <small className="muted"> · {t('import.example', { value: state.meta.sourceSamples[header] })}</small>
              : null}</span>
            <select id={`admin-import-${state.kind}-mapping-${index}`} value={state.mapping[header] || ''}
              aria-invalid={Boolean(state.fieldErrors.mapping)}
              onChange={(event) => { state.setMapping({ ...state.mapping, [header]: event.target.value }); state.setFieldErrors((current) => clearFieldError(current, 'mapping')) }}>
              <option value="">{t('import.doNotUse')}</option>
              {state.fieldOptions.map((field) => <option key={field.key} value={field.key}>
                {field.label}{field.required ? ' *' : ''}
              </option>)}
            </select>
          </label>)}
      </div>
      {state.fieldErrors.mapping && <small className="ops-field-error" role="alert">{state.fieldErrors.mapping}</small>}
      {state.meta.unusedHeaders?.length > 0 && <p className="muted">
        {t('import.unusedColumns', { columns: state.meta.unusedHeaders.join(', ') })}
      </p>}
      <Button size="sm" variant="secondary" disabled={state.busy} onClick={() => state.runPreview()}>
        {t('import.updatePreview')}
      </Button>
    </div>}

    {state.rows.length > 0 && <>
      <div className="card card-pad">
        <div className="ops-button-row" style={{ justifyContent: 'space-between' }}>
          <strong>{t('import.counts', { total: state.counts.total || state.rows.length, errors: state.counts.error || 0, duplicates: (state.counts.duplicate || 0) + (state.counts.possible_duplicate || 0), excluded: state.counts.excluded || 0 })}</strong>
          <div className="ops-button-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('import.rowSearch')} />
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">{t('import.filterAll')}</option>
              <option value="error">{t('import.filterErrors')}</option>
              <option value="warning">{t('import.filterWarnings')}</option>
              <option value="unmatched">{t('import.filterUnmatched')}</option>
              <option value="new">{t('import.filterNew')}</option>
              <option value="update">{t('import.filterUpdate')}</option>
              <option value="duplicate">{t('import.filterDuplicates')}</option>
              <option value="excluded">{t('import.filterExcluded')}</option>
            </select>
          </div>
        </div>
      </div>
      <Table rows={visibleRows} rowKey={(row) => row.row_key || row.index} columns={columns} density="sm"
        emptyLabel={t('import.noFilteredRows')} />
      {editing && <RowEditor state={state} row={state.rows.find((row) => row.index === editing)}
        Button={Button} Banner={Banner} onClose={() => { state.setError(''); setEditing(null) }} />}
      <div className="card card-pad" style={{ display: 'grid', gap: 10 }}>
        <div className="eyebrow">{t('import.bulkActions', { count: state.selected.length })}</div>
        <div className="ops-button-row">
          <Button size="sm" variant="secondary" disabled={!state.selected.length || state.busy}
            onClick={() => state.bulkPatch(state.selected, { excluded: true })}>{t('import.excludeSelected')}</Button>
          <Button size="sm" variant="subtle" disabled={!visibleRows.length}
            onClick={() => state.setSelected(visibleRows.filter((row) => READY.has(row.status) && !row.excluded).map((row) => row.index))}>
            {t('import.selectVisibleSafe')}
          </Button>
        </div>
        {['payments', 'attendance'].includes(state.kind) && <>
          <div className="eyebrow">{t('import.assignClientHeading')}</div>
          <ClientSearch Button={Button} disabled={!state.selected.length || state.busy}
            onChoose={(client) => setBulkClient(client)} />
          {bulkClient && <Button size="sm" variant="secondary" disabled={!state.selected.length}
            onClick={() => state.bulkPatch(state.selected, { relations: { client_id: bulkClient.id } })}>
            {t('import.assignClient', { name: bulkClient.name })}
          </Button>}
        </>}
      </div>

      {state.kind === 'payments' && hasPossibleDuplicates && <label className="card card-pad"
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input id={`admin-import-${state.kind}-possible-duplicates`} type="checkbox" checked={possibleDuplicates}
          aria-invalid={Boolean(state.fieldErrors.possibleDuplicates)}
          aria-describedby={state.fieldErrors.possibleDuplicates ? `admin-import-${state.kind}-possible-duplicates-error` : undefined}
          onChange={(event) => { onDuplicates(event.target.checked); state.setFieldErrors((current) => clearFieldError(current, 'possibleDuplicates')) }} />
        <span>{t('import.approveDuplicates')}
          {state.fieldErrors.possibleDuplicates && <small id={`admin-import-${state.kind}-possible-duplicates-error`} className="ops-field-error" role="alert">{state.fieldErrors.possibleDuplicates}</small>}
        </span>
      </label>}
      {state.kind === 'attendance' && financial.warning}
      <div className="ops-button-row">
        <Button id={`admin-import-${state.kind}-selected-indices`} variant="primary" loading={state.busy} disabled={!canCommit}
          aria-invalid={Boolean(state.fieldErrors.selectedIndices)}
          aria-describedby={state.fieldErrors.selectedIndices ? `admin-import-${state.kind}-selected-indices-error` : undefined}
          onClick={() => state.commit({
            ...(state.kind === 'payments' ? { approve_possible_duplicates: possibleDuplicates } : {}),
            ...(state.kind === 'attendance' && financial.required ? { confirm_financial_effects: true } : {}),
          })}>{t('import.confirmSelected')}</Button>
      </div>
      {state.fieldErrors.selectedIndices && <small id={`admin-import-${state.kind}-selected-indices-error`} className="ops-field-error" role="alert">{state.fieldErrors.selectedIndices}</small>}
    </>}
  </div>
}

export function createAdminImportExportPanel(components, icons, reloadRoleData) {
  const { Button, Banner, Tabs } = components
  const I = icons

  return function AdminImportExportScreen() {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const [tab, setTab] = useState('export')
    const [exportBusy, setExportBusy] = useState(null)
    const [exportError, setExportError] = useState('')
    const [batches, setBatches] = useState([])
    const [batchesError, setBatchesError] = useState('')
    const [attendanceEffectMode, setAttendanceEffectMode] = useState('history_only')
    const [financialConfirmed, setFinancialConfirmed] = useState(false)
    const [possibleDuplicates, setPossibleDuplicates] = useState(false)

    const trainers = useImportTab('trainers', null, reloadRoleData, t)
    const groups = useImportTab('groups', null, reloadRoleData, t)
    const clients = useImportTab('clients', null, reloadRoleData, t)
    const payments = useImportTab('payments', null, reloadRoleData, t)
    const attendance = useImportTab('attendance', attendanceEffectMode, reloadRoleData, t)
    const states = { trainers, groups, clients, payments, attendance }

    async function loadBatches() {
      try {
        const payload = await api.get('/api/admin/system/imports/')
        setBatches(payload.batches || [])
      } catch (err) {
        setBatchesError(apiErrorMessage(err, t('import.historyLoadError')))
      }
    }

    useEffect(() => { if (tab !== 'export') loadBatches() }, [tab, t])

    async function rollbackBatch(kind, batchId) {
      setBatchesError('')
      try {
        const preview = await api.get(`/api/admin/import/${kind}/${batchId}/rollback/`)
        if (!preview.can_rollback) throw new Error(t('import.rollbackBlocked'))
        const confirmation = window.prompt(t('import.rollbackPrompt', { id: batchId }))
        if (confirmation !== String(batchId)) return
        await api.post(`/api/admin/import/${kind}/${batchId}/rollback/`, {
          confirm_batch_id: batchId, confirm_rollback: true,
        })
        await loadBatches()
      } catch (err) {
        setBatchesError(apiErrorMessage(err, t('import.rollbackError')))
      }
    }

    async function runExport(entity, fmt) {
      setExportBusy(`${entity}-${fmt}`); setExportError('')
      try {
        await downloadFile(`/api/admin/export/${entity}/${fmt}/`, `${entity}.${fmt}`)
      } catch (err) {
        setExportError(apiErrorMessage(err, t('import.exportError')))
      } finally {
        setExportBusy(null)
      }
    }

    const financial = {
      required: attendanceEffectMode === 'apply_financial',
      confirmed: financialConfirmed,
      controls: <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <span className="eyebrow">{t('import.importMode')}</span>
        <select id="admin-import-attendance-effect-mode" value={attendanceEffectMode} disabled={Boolean(attendance.file)}
          aria-invalid={Boolean(attendance.fieldErrors.effectMode)}
          aria-describedby={attendance.fieldErrors.effectMode ? 'admin-import-attendance-effect-mode-error' : undefined}
          onChange={(event) => { setAttendanceEffectMode(event.target.value); setFinancialConfirmed(false); attendance.setFieldErrors((current) => clearFieldError(current, 'effectMode')) }}>
          <option value="history_only">{t('import.historyOnly')}</option>
          <option value="apply_financial">{t('import.applyFinancial')}</option>
        </select>
        {attendance.fieldErrors.effectMode && <small id="admin-import-attendance-effect-mode-error" className="ops-field-error" role="alert">{attendance.fieldErrors.effectMode}</small>}
      </label>,
      warning: attendanceEffectMode === 'apply_financial'
        ? <label className="card card-pad" style={{ display: 'flex', gap: 10 }}>
          <input id="admin-import-attendance-financial-confirmation" type="checkbox" checked={financialConfirmed}
            aria-invalid={Boolean(attendance.fieldErrors.confirmFinancialEffects)}
            aria-describedby={attendance.fieldErrors.confirmFinancialEffects ? 'admin-import-attendance-financial-confirmation-error' : undefined}
            onChange={(event) => { setFinancialConfirmed(event.target.checked); attendance.setFieldErrors((current) => clearFieldError(current, 'confirmFinancialEffects')) }} />
          <span>{t('import.confirmFinancialEffects')}
            {attendance.fieldErrors.confirmFinancialEffects && <small id="admin-import-attendance-financial-confirmation-error" className="ops-field-error" role="alert">{attendance.fieldErrors.confirmFinancialEffects}</small>}
          </span>
        </label>
        : <Banner tone="info">{t('import.safeHistoryMode')}</Banner>,
    }

    return <div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'export', label: t('import.export') },
        ...DATASETS.map((dataset) => ({ value: dataset.kind, label: t(dataset.label) })),
      ]} />

      {tab === 'export' && <div className="card card-pad" style={{ marginTop: 12 }}>
        {exportError && <Banner tone="danger" onClose={() => setExportError('')}>{exportError}</Banner>}
        <p className="muted">{t('import.exportFormatHint')}</p>
        <div className="ops-action-strip">
          {DATASETS.map((dataset) => <div key={dataset.kind} className="card card-pad" style={{ display: 'grid', gap: 8 }}>
            <strong>{t(dataset.label)}</strong>
            <div className="ops-button-row">
              {['xlsx', 'csv'].map((fmt) => <Button key={fmt} size="sm" variant="secondary"
                iconLeft={<I.Download size={14} />} loading={exportBusy === `${dataset.kind}-${fmt}`}
                disabled={exportBusy != null} onClick={() => runExport(dataset.kind, fmt)}>{fmt.toUpperCase()}</Button>)}
            </div>
          </div>)}
        </div>
      </div>}

      {DATASETS.map((dataset) => tab === dataset.kind && <ImportWorkspace key={dataset.kind}
        state={states[dataset.kind]} dataset={dataset} components={components}
        financial={financial} possibleDuplicates={possibleDuplicates}
        onFinancial={setFinancialConfirmed} onDuplicates={setPossibleDuplicates} />)}

      {tab !== 'export' && <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="eyebrow">{t('import.historyTitle')}</div>
        {batchesError && <Banner tone="danger" onClose={() => setBatchesError('')}>{batchesError}</Banner>}
        {batches.slice(0, 10).map((batch) => <div key={batch.id} className="ops-button-row"
          style={{ justifyContent: 'space-between', padding: '6px 0' }}>
          <span>{t('import.batchSummary', { id: batch.id, kind: batch.kind, source: batch.source_name || t('import.import'), created: batch.created || 0, updated: batch.updated || 0, skipped: batch.skipped || 0, errors: batch.errors_count || 0, status: batch.status })}
            {batch.rollback_strategy?.label ? <small className="muted" style={{ display: 'block' }}>
              {batch.rollback_strategy.label}
            </small> : null}</span>
          <div className="ops-button-row">
            {batch.report_available && ['csv', 'xlsx'].map((fmt) => <Button key={fmt} size="sm"
              variant="subtle" onClick={() => downloadFile(
                `/api/admin/import/batches/${batch.id}/report/${fmt}/`,
                `import-${batch.kind}-${batch.id}-report.${fmt}`)}>
              {t('import.reportFormat', { format: fmt.toUpperCase() })}
            </Button>)}
            {['clients', 'groups'].includes(batch.kind) && batch.status === 'committed' && !batch.is_rolled_back
              && <Button size="sm" variant="subtle" onClick={() => rollbackBatch(batch.kind, batch.id)}>{t('import.rollback')}</Button>}
          </div>
        </div>)}
        {!batches.length && <p className="muted">{t('import.noHistory')}</p>}
      </div>}
    </div>
  }
}
