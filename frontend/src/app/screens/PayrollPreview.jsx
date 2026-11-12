import React, { useEffect, useRef, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import './PayrollPreview.css'

const words = {
  ru: ['Тренер', 'Выберите тренера', 'Этот месяц', 'Прошлый месяц', 'Предыдущая неделя', 'Выбрать даты', 'С', 'По', 'Рассчитать зарплату', 'Зарплата', 'Занятия', 'Без ставки', 'Дата', 'Тренировка', 'Группа или клиент', 'Сумма', 'Ставка не назначена', 'Скачать CSV', 'Нет занятий'],
  uk: ['Тренер', 'Оберіть тренера', 'Цей місяць', 'Минулий місяць', 'Попередній тиждень', 'Обрати дати', 'З', 'До', 'Розрахувати зарплату', 'Зарплата', 'Заняття', 'Без ставки', 'Дата', 'Тренування', 'Група або клієнт', 'Сума', 'Ставку не призначено', 'Завантажити CSV', 'Немає занять'],
  pl: ['Trener', 'Wybierz trenera', 'Ten miesiąc', 'Poprzedni miesiąc', 'Poprzedni tydzień', 'Wybierz daty', 'Od', 'Do', 'Oblicz wynagrodzenie', 'Wynagrodzenie', 'Zajęcia', 'Bez stawki', 'Data', 'Trening', 'Grupa lub klient', 'Kwota', 'Nie przypisano stawki', 'Pobierz CSV', 'Brak zajęć'],
  en: ['Trainer', 'Select trainer', 'This month', 'Last month', 'Previous week', 'Choose dates', 'From', 'To', 'Calculate salary', 'Salary', 'Sessions', 'No rate', 'Date', 'Training', 'Group or client', 'Amount', 'Rate not assigned', 'Download CSV', 'No sessions'],
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function payrollPeriodRange(preset) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth()
  if (preset === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
  if (preset === 'last') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
  const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7))
  return [iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)), iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1))]
}
const money = (totals) => Object.entries(totals || {}).map(([c, n]) => `${(n / 100).toFixed(2)} ${c}`).join(' · ') || '—'
function csvDownload(rows, filename) {
  const cell = (v) => `"${String(v ?? '').replace(/^[=+@\-]/, "'$&").replace(/"/g, '""')}"`
  const blob = new Blob(['\ufeff' + rows.map((row) => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export function PayrollPreview({ trainers = [], report = false, dateFrom, dateTo, Button }) {
  const { locale } = useLocale(), w = words[locale] || words.ru
  const [trainer, setTrainer] = useState(''), [preset, setPreset] = useState('month')
  const [dates, setDates] = useState(() => payrollPeriodRange('month'))
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  async function load(from, to, id = '') {
    const current = ++requestId.current
    setLoading(true); setError(''); setData(null)
    try { const response = await api.get(`/api/admin/payroll/preview/?${new URLSearchParams({ date_from: from, date_to: to, ...(id ? { trainer_id: id } : {}) })}`); if (current === requestId.current) setData(response) }
    catch (err) { if (current === requestId.current) setError(apiErrorMessage(err)) } finally { if (current === requestId.current) setLoading(false) }
  }
  useEffect(() => { if (report && dateFrom && dateTo && dateFrom <= dateTo) load(dateFrom, dateTo); else if (report) setData(null); return () => { requestId.current += 1 } }, [report, dateFrom, dateTo])
  const clear = () => { requestId.current += 1; setLoading(false); setData(null) }
  const changePreset = (value) => { setPreset(value); clear(); if (value !== 'custom') setDates(payrollPeriodRange(value)) }
  const rows = report ? data?.trainers || [] : [...(data?.rows || [])].sort((a, b) => Number(a.amount_minor == null) - Number(b.amount_minor == null))
  const exportRows = report
    ? [[w[0], w[10], w[9], w[11]], ...rows.map((r) => [r.trainer, r.sessions, money(r.totals), r.missing]), ['', data?.sessions, money(data?.totals), data?.rows.filter((r) => r.amount_minor == null).length]]
    : [[w[12], w[13], w[14], w[15]], ...rows.map((r) => [r.date, r.training, r.group_or_client, r.amount_minor == null ? w[16] : money({ [r.currency]: r.amount_minor })]), ['', '', w[9], money(data?.totals)]]
  return <div className="ops-form-stack">
    {!report && <><label>{w[0]}<select value={trainer} onChange={(e) => { setTrainer(e.target.value); clear() }}><option value="">{w[1]}</option>{trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.name || t.username}</option>)}</select></label>
      <div className="ops-button-row" style={{ flexWrap: 'wrap' }}>{['month', 'last', 'week', 'custom'].map((p, i) => <Button variant={preset === p ? 'primary' : 'secondary'} type="button" key={p} aria-pressed={preset === p} onClick={() => changePreset(p)}>{w[i + 2]}</Button>)}</div>
      {preset === 'custom' && <><label>{w[6]}<input type="date" value={dates[0]} onChange={(e) => { setDates([e.target.value, dates[1]]); clear() }} /></label><label>{w[7]}<input type="date" min={dates[0]} value={dates[1]} onChange={(e) => { setDates([dates[0], e.target.value]); clear() }} /></label></>}
      <Button variant="primary" type="button" disabled={loading || !trainer || !dates[0] || !dates[1] || dates[0] > dates[1]} onClick={() => load(...dates, trainer)}>{w[8]}</Button></>}
    {error && <p role="alert">{error}</p>}
    {data && <><strong style={{ fontSize: '1.4rem' }}>{w[9]}: {money(data.totals)}</strong>{report && <p>{w[10]}: {data.sessions} · {w[11]}: {data.rows.filter((r) => r.amount_minor == null).length}</p>}
      <div className="payroll-preview-table"><table><thead><tr>{(report ? [w[0], w[10], w[9], w[11]] : [w[12], w[13], w[14], w[15]]).map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, index) => <React.Fragment key={report ? r.trainer_id : r.session_id}>{!report && r.amount_minor == null && (index === 0 || rows[index - 1].amount_minor != null) && <tr><th colSpan={4}>{w[16]}</th></tr>}<tr>{(report ? [r.trainer, r.sessions, money(r.totals), r.missing] : [r.date, r.training, r.group_or_client, r.amount_minor == null ? w[16] : money({ [r.currency]: r.amount_minor })]).map((v, i) => <td key={i}>{v}</td>)}</tr></React.Fragment>)}</tbody></table></div>
      {!rows.length && <p>{w[18]}</p>}<Button variant="secondary" type="button" onClick={() => csvDownload(exportRows, 'payroll.csv')}>{w[17]}</Button></>}
  </div>
}
