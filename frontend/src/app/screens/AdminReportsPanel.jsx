import React, { useEffect, useMemo, useState } from 'react'
import { adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { DateField } from '../DateTimeField.jsx'
import './AdminReportsPanel.css'


function localDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function currentMonthRange() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  )
  const year = Number(parts.year)
  const month = Number(parts.month)
  return {
    dateFrom: localDate(year, month, 1),
    dateTo: localDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()),
  }
}

function queryString(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value != null) params.set(key, value)
  })
  return params.toString()
}

function totalsFor(rows) {
  const totals = rows.reduce((current, row) => ({
    group: current.group + row.group,
    individual: current.individual + row.individual,
    split: current.split + row.split,
    total: current.total + row.total,
  }), { group: 0, individual: 0, split: 0, total: 0 })
  return totals
}

function SessionChart({ rows, t }) {
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.group, row.individual + row.split]))
  return <div className="ops-report-chart card card-pad" role="img" aria-label={t('reports.chartAria')}>
    <div className="ops-report-chart-legend" aria-hidden="true">
      <span><i className="is-group" />{t('reports.group')}</span>
      <span><i className="is-personal" />{t('reports.personal')}</span>
    </div>
    <div className="ops-report-chart-scroll">
      {rows.length ? rows.map((row) => {
        const personal = row.individual + row.split
        return <div className="ops-report-chart-row" key={row.trainer_id}>
          <div className="ops-report-chart-name">{row.trainer}</div>
          <div className="ops-report-chart-bars">
            <div className="ops-report-chart-track">
              <div className="ops-report-chart-bar is-group" style={{ width: `${(row.group / maxValue) * 100}%` }} />
              <span>{row.group}</span>
            </div>
            <div className="ops-report-chart-track">
              <div className="ops-report-chart-bar is-personal" style={{ width: `${(personal / maxValue) * 100}%` }} />
              <span>{personal}</span>
            </div>
          </div>
        </div>
      }) : <p className="muted">{t('reports.noSessionsSelected')}</p>}
    </div>
  </div>
}

function Kpi({ label, value }) {
  return <div className="kpi ops-report-kpi">
    <span className="kpi-label">{label}</span>
    <strong className="kpi-value">{value}</strong>
  </div>
}

export function createAdminReportsPanel(components) {
  const { Banner, Button, Select, Table, Tabs } = components

  return function AdminReportsPanel() {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const initialRange = useMemo(currentMonthRange, [])
    const [subtab, setSubtab] = useState('sessions')
    const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
    const [dateTo, setDateTo] = useState(initialRange.dateTo)
    const [trainerId, setTrainerId] = useState('')
    const [currency, setCurrency] = useState('')
    const [currencies, setCurrencies] = useState([])
    const [sessionReport, setSessionReport] = useState(null)
    const [incomeReport, setIncomeReport] = useState(null)
    const [incomePage, setIncomePage] = useState(1)
    const [sessionLoading, setSessionLoading] = useState(false)
    const [incomeLoading, setIncomeLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [sessionError, setSessionError] = useState(null)
    const [incomeError, setIncomeError] = useState(null)

    useEffect(() => {
      let active = true
      setSessionLoading(true)
      setSessionError(null)
      api.get(`/api/admin/reports/session-counts/?${queryString({ date_from: dateFrom, date_to: dateTo })}`)
        .then((payload) => { if (active) setSessionReport(payload) })
        .catch((error) => { if (active) setSessionError(apiErrorMessage(error, t('reports.sessionLoadError'))) })
        .finally(() => { if (active) setSessionLoading(false) })
      return () => { active = false }
    }, [dateFrom, dateTo, t])

    useEffect(() => { setIncomePage(1) }, [dateFrom, dateTo, currency])

    useEffect(() => {
      let active = true
      setIncomeLoading(true)
      setIncomeError(null)
      const query = queryString({
        date_from: dateFrom,
        date_to: dateTo,
        currency,
        page: incomePage,
        page_size: 25,
      })
      api.get(`/api/admin/reports/income/?${query}`)
        .then((payload) => {
          if (!active) return
          setIncomeReport(payload)
          setCurrencies(payload.available_currencies || [])
          if (!currency && payload.currency) setCurrency(payload.currency)
        })
        .catch((error) => { if (active) setIncomeError(apiErrorMessage(error, t('reports.incomeLoadError'))) })
        .finally(() => { if (active) setIncomeLoading(false) })
      return () => { active = false }
    }, [dateFrom, dateTo, currency, incomePage, t])

    const allSessionRows = sessionReport?.rows || []
    const sessionRows = trainerId
      ? allSessionRows.filter((row) => String(row.trainer_id) === trainerId)
      : allSessionRows
    const sessionTotals = totalsFor(sessionRows)
    const tableRows = trainerId ? sessionRows : [
      ...sessionRows,
      { trainer_id: 'total', trainer: t('reports.schoolTotal'), isTotal: true, ...sessionTotals },
    ]

    async function exportReport(kind) {
      const isSessions = kind === 'sessions'
      const query = queryString({
        date_from: dateFrom,
        date_to: dateTo,
        trainer_id: isSessions ? trainerId : '',
        currency: isSessions ? '' : currency,
      })
      const path = isSessions
        ? `/api/admin/reports/session-counts/xlsx/?${query}`
        : `/api/admin/reports/income/xlsx/?${query}`
      setDownloading(true)
      if (isSessions) setSessionError(null)
      else setIncomeError(null)
      try {
        await downloadFile(path, `${isSessions ? 'session-counts' : 'income'}.xlsx`)
      } catch (error) {
        const message = apiErrorMessage(error, t('reports.downloadError'))
        if (isSessions) setSessionError(message)
        else setIncomeError(message)
      } finally {
        setDownloading(false)
      }
    }

    const sessionColumns = [
      { key: 'trainer', header: t('common.trainer'), render: (row) => <span className={row.isTotal ? 'strong' : ''}>{row.trainer}</span> },
      { key: 'group', header: t('reports.group') },
      { key: 'individual', header: t('reports.individual') },
      { key: 'split', header: 'Split' },
      { key: 'total', header: t('reports.total'), render: (row) => <strong>{row.total}</strong> },
    ]
    const incomeColumns = [
      { key: 'paid_at', header: t('common.date') },
      { key: 'participant', header: t('reports.client') },
      { key: 'method_label', header: t('reports.method') },
      { key: 'amount', header: t('common.amount'), render: (row) => <strong>{row.amount}</strong> },
    ]
    const lessonGroupColumns = [
      { key: 'group', header: t('reports.groupType') },
      { key: 'amount', header: t('reports.sessionValue'), render: (row) => <strong>{row.amount}</strong> },
    ]
    const lessonTrainerColumns = [
      { key: 'trainer', header: t('reports.actualTrainer') },
      { key: 'amount', header: t('reports.sessionValue'), render: (row) => <strong>{row.amount}</strong> },
    ]

    return <div className="ops-reports-panel">
      <div className="ops-section-head">
        <div>
          <div className="eyebrow">{t('reports.title')}</div>
          <h3 className="section-title">{t('reports.subtitle')}</h3>
          <p className="page-desc">{t('reports.description')}</p>
        </div>
      </div>

      <div className="card card-pad ops-report-filters">
        <DateField id="admin-reports-date-from" label={t('reports.periodFrom')} value={dateFrom} onChange={setDateFrom} />
        <DateField id="admin-reports-date-to" label={t('reports.periodTo')} value={dateTo} onChange={setDateTo} />
      </div>

      <Tabs
        value={subtab}
        onChange={setSubtab}
        items={[
          { value: 'sessions', label: t('reports.sessions') },
          { value: 'income', label: t('reports.income') },
        ]}
      />

      {subtab === 'sessions' ? <section aria-label={t('reports.sessionReport')}>
        <div className="ops-report-toolbar">
          <Select id="admin-report-trainer" label={t('common.trainer')} value={trainerId} onChange={(event) => setTrainerId(event.target.value)}>
            <option value="">{t('reports.allTrainers')}</option>
            {allSessionRows.map((row) => <option key={row.trainer_id} value={row.trainer_id}>{row.trainer}{row.is_active ? '' : t('reports.inactiveSuffix')}</option>)}
          </Select>
          <Button variant="secondary" disabled={downloading || sessionLoading} onClick={() => exportReport('sessions')}>{t('reports.download')}</Button>
        </div>
        {sessionError && <Banner tone="danger" onClose={() => setSessionError(null)}>{sessionError}</Banner>}
        <div className="ops-report-kpis" aria-live="polite">
          <Kpi label={t('reports.group')} value={sessionTotals.group} />
          <Kpi label={t('reports.individual')} value={sessionTotals.individual} />
          <Kpi label="Split" value={sessionTotals.split} />
          <Kpi label={t('reports.total')} value={sessionTotals.total} />
        </div>
        <SessionChart rows={sessionRows} t={t} />
        <div className="ops-report-table">
          <Table rowKey={(row) => row.trainer_id} rows={tableRows} columns={sessionColumns} emptyLabel={sessionLoading ? t('reports.loading') : t('reports.noSessions')} />
        </div>
      </section> : <section aria-label={t('reports.incomeReport')}>
        <div className="ops-report-toolbar">
          <Select id="admin-report-currency" label={t('reports.currency')} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {!currency && <option value="">{t('reports.systemCurrency')}</option>}
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </Select>
          <Button variant="secondary" disabled={downloading || incomeLoading} onClick={() => exportReport('income')}>{t('reports.download')}</Button>
        </div>
        {incomeError && <Banner tone="danger" onClose={() => setIncomeError(null)}>{incomeError}</Banner>}
        <div className="ops-report-kpis" aria-live="polite">
          <Kpi label={t('reports.total')} value={incomeReport?.total || '—'} />
          <Kpi label={t('reports.cash')} value={incomeReport?.cash || '—'} />
          <Kpi label={t('reports.cashless')} value={incomeReport?.non_cash || '—'} />
        </div>
        <div className="ops-report-table">
          <Table rowKey={(row) => row.id} rows={incomeReport?.payments || []} columns={incomeColumns} emptyLabel={incomeLoading ? t('reports.loading') : t('reports.noPayments')} />
        </div>
        {(incomeReport?.pagination?.pages || 0) > 1 && <div className="ops-report-pagination" aria-label={t('reports.paymentPages')}>
          <Button variant="secondary" size="sm" disabled={incomeLoading || !incomeReport.pagination.has_previous} onClick={() => setIncomePage((page) => page - 1)}>{t('reports.previous')}</Button>
          <span>{t('reports.pageOf', { page: incomeReport.pagination.page, pages: incomeReport.pagination.pages })}</span>
          <Button variant="secondary" size="sm" disabled={incomeLoading || !incomeReport.pagination.has_next} onClick={() => setIncomePage((page) => page + 1)}>{t('reports.next')}</Button>
        </div>}
        <div className="ops-report-table">
          <h4>{t('reports.groupValues')}</h4>
          <p className="muted">{t('reports.valueExplanation')}</p>
          <Table rowKey={(row) => row.group} rows={incomeReport?.lesson_value_by_group || []} columns={lessonGroupColumns} emptyLabel={incomeLoading ? t('reports.loading') : t('reports.noChargedSessions')} />
        </div>
        <div className="ops-report-table">
          <h4>{t('reports.trainerValues')}</h4>
          <Table rowKey={(row) => row.trainer} rows={incomeReport?.lesson_value_by_trainer || []} columns={lessonTrainerColumns} emptyLabel={incomeLoading ? t('reports.loading') : t('reports.noChargedSessions')} />
        </div>
      </section>}
    </div>
  }
}
