import React, { useEffect, useState } from 'react'
import { api, downloadFile } from '../../api.js'

const EXPORT_DATASETS = [
  ['clients', 'Клиенты'],
  ['attendance', 'Посещаемость'],
  ['payments', 'Оплаты'],
  ['groups', 'Группы'],
  ['trainers', 'Тренеры'],
]

const CANONICAL_FIELD_OPTIONS = [
  ['', '— не использовать —'],
  ['last_name', 'Фамилия'],
  ['first_name', 'Имя'],
  ['name', 'ФИО целиком'],
  ['phone', 'Телефон'],
  ['email', 'Email'],
  ['group', 'Группа'],
  ['subscription', 'Абонемент'],
]

const HEADER_ALIASES = {
  'фамилия': 'last_name', 'имя': 'first_name', 'фио': 'name', 'name': 'name',
  'телефон': 'phone', 'phone': 'phone', 'email': 'email', 'почта': 'email',
  'группа': 'group', 'group': 'group', 'абонемент': 'subscription', 'subscription': 'subscription',
  'last_name': 'last_name', 'first_name': 'first_name',
}

const STATUS_META = {
  new: ['Новая запись', '#1a7f37'],
  matched: ['Занятие найдено', '#1a7f37'],
  will_create_session: ['Будет создано занятие', '#9a6700'],
  duplicate: ['Дубликат', '#9a6700'],
  possible_duplicate: ['Вероятный дубликат', '#b54708'],
  error: ['Ошибка', '#cf222e'],
}

function guessMapping(headers) {
  const mapping = {}
  headers.forEach((header) => {
    const key = HEADER_ALIASES[String(header).trim().toLowerCase()]
    if (key) mapping[header] = key
  })
  return mapping
}

function cleanMapping(mapping) {
  return Object.fromEntries(Object.entries(mapping || {}).filter(([, value]) => value))
}

function StatusText({ status }) {
  const [label, color] = STATUS_META[status] || [status, '#57606a']
  return <span style={{ color, fontWeight: 600 }}>{label}</span>
}

function useImportTab({ previewUrl, commitUrl, buildFormData, onFileSelected }) {
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [rows, setRows] = useState([])
  const [batchId, setBatchId] = useState(null)
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function runPreview(overrideFile, overrideMapping) {
    const targetFile = overrideFile || file
    if (!targetFile) return
    setBusy(true); setError(''); setSummary(null)
    try {
      const formData = buildFormData(targetFile, overrideMapping || mapping)
      const payload = await api.postForm(previewUrl, formData)
      setHeaders(payload.headers || [])
      setRows(payload.rows || [])
      setBatchId(payload.batch_id || null)
    } catch (err) {
      setError(err.message)
      setRows([])
      setBatchId(null)
    } finally {
      setBusy(false)
    }
  }

  async function commit(extraPayload = {}) {
    if (!batchId || rows.length === 0) return
    setBusy(true); setError('')
    try {
      const payload = await api.post(commitUrl, {
        batch_id: batchId,
        selected_indices: rows.map((row) => row.index),
        ...extraPayload,
      })
      setSummary(payload)
      setRows([])
      setBatchId(null)
      setFile(null)
      setHeaders([])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function selectFile(nextFile) {
    setFile(nextFile)
    setRows([])
    setBatchId(null)
    setSummary(null)
    setError('')
    if (!nextFile) return
    setBusy(true)
    try {
      if (onFileSelected) await onFileSelected(nextFile, { runPreview, setMapping })
      else await runPreview(nextFile)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return { file, headers, mapping, setMapping, rows, batchId, summary, busy, error, selectFile, runPreview, commit }
}

export function createAdminImportExportPanel(components, icons, reloadRoleData) {
  const { Button, Banner, Tabs, Table } = components
  const I = icons

  function ImportRowsTable({ rows }) {
    const columns = [
      { key: 'index', header: '#', width: 56, render: (row) => row.index },
      { key: 'status', header: 'Статус', width: 190, render: (row) => <StatusText status={row.status} /> },
      { key: 'summary', header: 'Строка', render: (row) => Object.values(row.data || {}).filter(Boolean).join(' · ') },
      { key: 'errors', header: 'Ошибки', muted: true, render: (row) => (row.errors || []).join('; ') },
    ]
    return <Table rows={rows} rowKey={(row) => row.index} columns={columns} density="sm"
      emptyLabel="Загрузите файл, чтобы увидеть предпросмотр" />
  }

  function ImportSummary({ summary }) {
    if (!summary) return null
    const parts = Object.entries(summary)
      .filter(([key]) => key !== 'errors')
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')
    return <Banner tone={(summary.errors || []).length ? 'warning' : 'success'} style={{ marginBottom: 12 }}>
      <div>{parts}</div>
      {(summary.errors || []).length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {summary.errors.map((line, i) => <li key={i}>{line}</li>)}
      </ul>}
    </Banner>
  }

  return function AdminImportExportScreen() {
    const [tab, setTab] = useState('export')
    const [exportBusy, setExportBusy] = useState(null)
    const [exportError, setExportError] = useState('')
    const [batches, setBatches] = useState([])
    const [batchesError, setBatchesError] = useState('')
    const [attendanceEffectMode, setAttendanceEffectMode] = useState('history_only')
    const [financialEffectsConfirmed, setFinancialEffectsConfirmed] = useState(false)
    const [possiblePaymentDuplicatesApproved, setPossiblePaymentDuplicatesApproved] = useState(false)

    const clientsImport = useImportTab({
      previewUrl: '/api/admin/import/clients/preview/',
      commitUrl: '/api/admin/import/clients/commit/',
      buildFormData: (file, mapping) => {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('mapping', JSON.stringify(cleanMapping(mapping)))
        return fd
      },
      onFileSelected: async (nextFile, { runPreview, setMapping }) => {
        // First pass reads the header row only (empty mapping -> every row is an
        // error, ignored here); the guessed mapping then drives the real preview.
        const probe = new FormData()
        probe.set('file', nextFile)
        probe.set('mapping', '{}')
        const payload = await api.postForm('/api/admin/import/clients/preview/', probe)
        const guessed = guessMapping(payload.headers || [])
        setMapping(guessed)
        await runPreview(nextFile, guessed)
      },
    })
    const attendanceImport = useImportTab({
      previewUrl: '/api/admin/import/attendance/preview/',
      commitUrl: '/api/admin/import/attendance/commit/',
      buildFormData: (file) => {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('effect_mode', attendanceEffectMode)
        return fd
      },
    })
    const paymentsImport = useImportTab({
      previewUrl: '/api/admin/import/payments/preview/',
      commitUrl: '/api/admin/import/payments/commit/',
      buildFormData: (file) => { const fd = new FormData(); fd.set('file', file); return fd },
    })

    async function loadBatches() {
      try {
        const payload = await api.get('/api/admin/system/imports/')
        setBatches(payload.batches || [])
      } catch (err) {
        setBatchesError(err.message)
      }
    }

    useEffect(() => { if (tab === 'clients') loadBatches() }, [tab])

    async function rollbackBatch(batchId) {
      setBatchesError('')
      try {
        const preview = await api.get(`/api/admin/import/clients/${batchId}/rollback/`)
        if (!preview.can_rollback) {
          const details = (preview.blockers || []).map((item) => item.student).join(', ')
          throw new Error(`Откат заблокирован зависимыми данными: ${details || 'есть зависимости'}`)
        }
        const confirmation = window.prompt(
          `Откат удалит импортированные записи. Введите ID batch ${batchId} для подтверждения:`)
        if (confirmation !== String(batchId)) return
        await api.post(`/api/admin/import/clients/${batchId}/rollback/`, {
          confirm_batch_id: batchId,
          confirm_rollback: true,
        })
        await loadBatches()
      } catch (err) {
        setBatchesError(err.message)
      }
    }

    async function runExport(entity, fmt) {
      setExportBusy(`${entity}-${fmt}`)
      setExportError('')
      try {
        await downloadFile(`/api/admin/export/${entity}/${fmt}/`, `${entity}.${fmt}`)
      } catch (err) {
        setExportError(err.message)
      } finally {
        setExportBusy(null)
      }
    }

    // Rendered inside Settings → Контроль, which supplies the page header.
    return <div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'export', label: 'Экспорт' },
        { value: 'clients', label: 'Клиенты' },
        { value: 'attendance', label: 'Посещаемость' },
        { value: 'payments', label: 'Оплаты' },
      ]} />

      {tab === 'export' && <div className="card card-pad" style={{ marginTop: 12 }}>
        {exportError && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setExportError('')}>{exportError}</Banner>}
        <div className="ops-action-strip">
          {EXPORT_DATASETS.map(([entity, label]) => <div key={entity} className="card card-pad" style={{ display: 'grid', gap: 8 }}>
            <strong>{label}</strong>
            <div className="ops-button-row">
              <Button size="sm" variant="secondary" iconLeft={<I.Download size={14} />}
                loading={exportBusy === `${entity}-xlsx`} disabled={exportBusy != null}
                onClick={() => runExport(entity, 'xlsx')}>XLSX</Button>
              <Button size="sm" variant="secondary" iconLeft={<I.Download size={14} />}
                loading={exportBusy === `${entity}-csv`} disabled={exportBusy != null}
                onClick={() => runExport(entity, 'csv')}>CSV</Button>
            </div>
          </div>)}
        </div>
      </div>}

      {tab === 'clients' && <div style={{ marginTop: 12 }}>
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Файл клиентов (.xlsx / .csv)</div>
          <input type="file" accept=".xlsx,.xlsm,.csv" style={{ marginTop: 8 }}
            onChange={(event) => clientsImport.selectFile(event.target.files?.[0] || null)} />
        </div>
        {clientsImport.error && <Banner tone="danger" style={{ marginBottom: 12 }}>{clientsImport.error}</Banner>}
        {clientsImport.headers.length > 0 && <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Сопоставление колонок</div>
          <div className="ops-form-grid">
            {clientsImport.headers.map((header) => <label key={header}>
              {header}
              <select value={clientsImport.mapping[header] || ''}
                onChange={(event) => clientsImport.setMapping({ ...clientsImport.mapping, [header]: event.target.value })}>
                {CANONICAL_FIELD_OPTIONS.map(([value, label]) => <option key={value || 'none'} value={value}>{label}</option>)}
              </select>
            </label>)}
          </div>
          <div className="ops-button-row" style={{ marginTop: 8 }}>
            <Button variant="secondary" disabled={clientsImport.busy} onClick={() => clientsImport.runPreview()}>Обновить предпросмотр</Button>
          </div>
        </div>}
        <ImportSummary summary={clientsImport.summary} />
        {clientsImport.rows.length > 0 && <>
          <ImportRowsTable rows={clientsImport.rows} />
          <div className="ops-button-row" style={{ margin: '12px 0' }}>
            <Button variant="primary" loading={clientsImport.busy} disabled={clientsImport.busy}
              onClick={clientsImport.commit}>Импортировать</Button>
          </div>
        </>}
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="eyebrow">История импортов</div>
          {batchesError && <Banner tone="danger" style={{ margin: '8px 0' }} onClose={() => setBatchesError('')}>{batchesError}</Banner>}
          {batches.slice(0, 5).map((batch) => <div key={batch.id} className="ops-button-row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
            <span>{batch.source_name || 'Импорт'} · {batch.rows_imported}/{batch.rows_total} строк{batch.is_rolled_back ? ' · откачен' : ''}</span>
            {!batch.is_rolled_back && <Button size="sm" variant="subtle" onClick={() => rollbackBatch(batch.id)}>Откатить</Button>}
          </div>)}
          {!batches.length && <p className="muted">Импортов пока не было.</p>}
        </div>
      </div>}

      {tab === 'attendance' && <div style={{ marginTop: 12 }}>
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Файл посещаемости (.xlsx / .csv)</div>
          <p className="muted" style={{ margin: '6px 0' }}>
            Колонки: Дата (ДД.ММ.ГГГГ ЧЧ:ММ), Клиент, Группа, Тренер, Статус.
            Для занятий, которых ещё нет в расписании, дополнительно: Окончание (ЧЧ:ММ), Локация, Вместимость.
          </p>
          <label style={{ display: 'grid', gap: 6, margin: '12px 0' }}>
            <span className="eyebrow">Режим импорта</span>
            <select value={attendanceEffectMode} disabled={Boolean(attendanceImport.file)}
              onChange={(event) => {
                setAttendanceEffectMode(event.target.value)
                setFinancialEffectsConfirmed(false)
              }}>
              <option value="history_only">Только история, без списаний и начислений</option>
              <option value="apply_financial">Применить списания абонемента или начисления</option>
            </select>
          </label>
          {attendanceEffectMode === 'history_only' && <Banner tone="info" style={{ margin: '8px 0 12px' }}>
            Безопасный режим по умолчанию: посещения сохранятся в истории, но баланс абонемента и денежные начисления не изменятся.
          </Banner>}
          {attendanceEffectMode === 'apply_financial' && <Banner tone="warning" style={{ margin: '8px 0 12px' }}>
            Финансовый режим может списать занятия с действующих абонементов или создать начисления по тарифу занятия.
          </Banner>}
          <input type="file" accept=".xlsx,.xlsm,.csv"
            onChange={(event) => {
              setFinancialEffectsConfirmed(false)
              attendanceImport.selectFile(event.target.files?.[0] || null)
            }} />
        </div>
        {attendanceImport.error && <Banner tone="danger" style={{ marginBottom: 12 }}>{attendanceImport.error}</Banner>}
        <ImportSummary summary={attendanceImport.summary} />
        {attendanceImport.rows.length > 0 && <>
          <ImportRowsTable rows={attendanceImport.rows} />
          <Banner tone="warning" style={{ margin: '12px 0' }}>
            Операция необратима: отметки посещаемости нельзя удалить после импорта.
          </Banner>
          {attendanceEffectMode === 'apply_financial' && <label className="card card-pad"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
            <input type="checkbox" checked={financialEffectsConfirmed}
              onChange={(event) => setFinancialEffectsConfirmed(event.target.checked)} />
            <span>Я подтверждаю списание занятий или создание денежных начислений для выбранных строк.</span>
          </label>}
          <div className="ops-button-row" style={{ marginBottom: 12 }}>
            <Button variant="primary" loading={attendanceImport.busy}
              disabled={attendanceImport.busy || (attendanceEffectMode === 'apply_financial' && !financialEffectsConfirmed)}
              onClick={() => attendanceImport.commit(
                attendanceEffectMode === 'apply_financial'
                  ? { confirm_financial_effects: true }
                  : {}
              )}>Импортировать</Button>
          </div>
        </>}
      </div>}

      {tab === 'payments' && <div style={{ marginTop: 12 }}>
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Файл оплат (.xlsx / .csv)</div>
          <p className="muted" style={{ margin: '6px 0' }}>
            Колонки: Клиент, Сумма, Валюта (необязательно, по умолчанию PLN), Дата (ДД.ММ.ГГГГ),
            Способ (наличные/перевод/карта/другое), Статус (необязательно, по умолчанию — подтверждён), Reference ID (необязательно), Комментарий.
          </p>
          <input type="file" accept=".xlsx,.xlsm,.csv"
            onChange={(event) => paymentsImport.selectFile(event.target.files?.[0] || null)} />
        </div>
        {paymentsImport.error && <Banner tone="danger" style={{ marginBottom: 12 }}>{paymentsImport.error}</Banner>}
        <ImportSummary summary={paymentsImport.summary} />
        {paymentsImport.rows.length > 0 && <>
          <ImportRowsTable rows={paymentsImport.rows} />
          <Banner tone="warning" style={{ margin: '12px 0' }}>
            Операция необратима: платежи нельзя удалить после импорта (append-only история).
          </Banner>
          {paymentsImport.rows.some((row) => row.status === 'possible_duplicate') && <label className="card card-pad"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
            <input type="checkbox" checked={possiblePaymentDuplicatesApproved}
              onChange={(event) => setPossiblePaymentDuplicatesApproved(event.target.checked)} />
            <span>Я проверил вероятные дубликаты и разрешаю добавить выбранные платежи без Reference ID.</span>
          </label>}
          <div className="ops-button-row" style={{ marginBottom: 12 }}>
            <Button variant="primary" loading={paymentsImport.busy}
              disabled={paymentsImport.busy || (paymentsImport.rows.some((row) => row.status === 'possible_duplicate') && !possiblePaymentDuplicatesApproved)}
              onClick={() => paymentsImport.commit({
                approve_possible_duplicates: possiblePaymentDuplicatesApproved,
              })}>Импортировать</Button>
          </div>
        </>}
      </div>}
    </div>
  }
}
