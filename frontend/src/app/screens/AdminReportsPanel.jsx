import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
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

function SessionChart({ rows }) {
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.group, row.individual + row.split]))
  return <div className="ops-report-chart card card-pad" role="img" aria-label="Диаграмма количества тренировок по тренерам; точные значения приведены в таблице ниже">
    <div className="ops-report-chart-legend" aria-hidden="true">
      <span><i className="is-group" />Групповые</span>
      <span><i className="is-personal" />Индивидуальные + Split</span>
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
      }) : <p className="muted">За выбранный период занятий нет.</p>}
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
        .catch((error) => { if (active) setSessionError(apiErrorMessage(error, 'Не удалось загрузить отчёт по тренировкам.')) })
        .finally(() => { if (active) setSessionLoading(false) })
      return () => { active = false }
    }, [dateFrom, dateTo])

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
        .catch((error) => { if (active) setIncomeError(apiErrorMessage(error, 'Не удалось загрузить отчёт по поступлениям.')) })
        .finally(() => { if (active) setIncomeLoading(false) })
      return () => { active = false }
    }, [dateFrom, dateTo, currency, incomePage])

    const allSessionRows = sessionReport?.rows || []
    const sessionRows = trainerId
      ? allSessionRows.filter((row) => String(row.trainer_id) === trainerId)
      : allSessionRows
    const sessionTotals = totalsFor(sessionRows)
    const tableRows = trainerId ? sessionRows : [
      ...sessionRows,
      { trainer_id: 'total', trainer: 'Итого по школе', isTotal: true, ...sessionTotals },
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
        const message = apiErrorMessage(error, 'Не удалось скачать отчёт.')
        if (isSessions) setSessionError(message)
        else setIncomeError(message)
      } finally {
        setDownloading(false)
      }
    }

    const sessionColumns = [
      { key: 'trainer', header: 'Тренер', render: (row) => <span className={row.isTotal ? 'strong' : ''}>{row.trainer}</span> },
      { key: 'group', header: 'Групповые' },
      { key: 'individual', header: 'Индивидуальные' },
      { key: 'split', header: 'Split' },
      { key: 'total', header: 'Всего', render: (row) => <strong>{row.total}</strong> },
    ]
    const incomeColumns = [
      { key: 'paid_at', header: 'Дата' },
      { key: 'participant', header: 'Клиент' },
      { key: 'method_label', header: 'Способ' },
      { key: 'amount', header: 'Сумма', render: (row) => <strong>{row.amount}</strong> },
    ]
    const lessonGroupColumns = [
      { key: 'group', header: 'Группа / тип занятия' },
      { key: 'amount', header: 'Стоимость занятий', render: (row) => <strong>{row.amount}</strong> },
    ]
    const lessonTrainerColumns = [
      { key: 'trainer', header: 'Фактический тренер' },
      { key: 'amount', header: 'Стоимость занятий', render: (row) => <strong>{row.amount}</strong> },
    ]

    return <div className="ops-reports-panel">
      <div className="ops-section-head">
        <div>
          <div className="eyebrow">Отчёты</div>
          <h3 className="section-title">Тренировки и поступления</h3>
          <p className="page-desc">Период общий для обеих вкладок. Отменённые занятия и неподтверждённые платежи не учитываются.</p>
        </div>
      </div>

      <div className="card card-pad ops-report-filters">
        <DateField id="admin-reports-date-from" label="Период с" value={dateFrom} onChange={setDateFrom} />
        <DateField id="admin-reports-date-to" label="Период по" value={dateTo} onChange={setDateTo} />
      </div>

      <Tabs
        value={subtab}
        onChange={setSubtab}
        items={[
          { value: 'sessions', label: 'Тренировки' },
          { value: 'income', label: 'Поступления' },
        ]}
      />

      {subtab === 'sessions' ? <section aria-label="Отчёт по тренировкам">
        <div className="ops-report-toolbar">
          <Select id="admin-report-trainer" label="Тренер" value={trainerId} onChange={(event) => setTrainerId(event.target.value)}>
            <option value="">Все тренеры</option>
            {allSessionRows.map((row) => <option key={row.trainer_id} value={row.trainer_id}>{row.trainer}{row.is_active ? '' : ' (неактивен)'}</option>)}
          </Select>
          <Button variant="secondary" disabled={downloading || sessionLoading} onClick={() => exportReport('sessions')}>Скачать XLSX</Button>
        </div>
        {sessionError && <Banner tone="danger" onClose={() => setSessionError(null)}>{sessionError}</Banner>}
        <div className="ops-report-kpis" aria-live="polite">
          <Kpi label="Групповые" value={sessionTotals.group} />
          <Kpi label="Индивидуальные" value={sessionTotals.individual} />
          <Kpi label="Split" value={sessionTotals.split} />
          <Kpi label="Всего" value={sessionTotals.total} />
        </div>
        <SessionChart rows={sessionRows} />
        <div className="ops-report-table">
          <Table rowKey={(row) => row.trainer_id} rows={tableRows} columns={sessionColumns} emptyLabel={sessionLoading ? 'Загрузка...' : 'Занятий за период нет'} />
        </div>
      </section> : <section aria-label="Отчёт по поступлениям">
        <div className="ops-report-toolbar">
          <Select id="admin-report-currency" label="Валюта" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {!currency && <option value="">Системная</option>}
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </Select>
          <Button variant="secondary" disabled={downloading || incomeLoading} onClick={() => exportReport('income')}>Скачать XLSX</Button>
        </div>
        {incomeError && <Banner tone="danger" onClose={() => setIncomeError(null)}>{incomeError}</Banner>}
        <div className="ops-report-kpis" aria-live="polite">
          <Kpi label="Всего" value={incomeReport?.total || '—'} />
          <Kpi label="Наличные" value={incomeReport?.cash || '—'} />
          <Kpi label="Безналичные" value={incomeReport?.non_cash || '—'} />
        </div>
        <div className="ops-report-table">
          <Table rowKey={(row) => row.id} rows={incomeReport?.payments || []} columns={incomeColumns} emptyLabel={incomeLoading ? 'Загрузка...' : 'Подтверждённых платежей за период нет'} />
        </div>
        {(incomeReport?.pagination?.pages || 0) > 1 && <div className="ops-report-pagination" aria-label="Страницы платежей">
          <Button variant="secondary" size="sm" disabled={incomeLoading || !incomeReport.pagination.has_previous} onClick={() => setIncomePage((page) => page - 1)}>Назад</Button>
          <span>Страница {incomeReport.pagination.page} из {incomeReport.pagination.pages}</span>
          <Button variant="secondary" size="sm" disabled={incomeLoading || !incomeReport.pagination.has_next} onClick={() => setIncomePage((page) => page + 1)}>Далее</Button>
        </div>}
        <div className="ops-report-table">
          <h4>Стоимость занятий по группам</h4>
          <p className="muted">Рассчитывается по отмеченным посещениям и цене конкретной тренировки, независимо от поступивших платежей.</p>
          <Table rowKey={(row) => row.group} rows={incomeReport?.lesson_value_by_group || []} columns={lessonGroupColumns} emptyLabel={incomeLoading ? 'Загрузка...' : 'Занятий со списанием за период нет'} />
        </div>
        <div className="ops-report-table">
          <h4>Стоимость занятий по тренерам</h4>
          <Table rowKey={(row) => row.trainer} rows={incomeReport?.lesson_value_by_trainer || []} columns={lessonTrainerColumns} emptyLabel={incomeLoading ? 'Загрузка...' : 'Занятий со списанием за период нет'} />
        </div>
      </section>}
    </div>
  }
}
