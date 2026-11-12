import React, { useEffect, useState } from 'react'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { PayrollPreview } from './PayrollPreview.jsx'
import './PayrollSettingsPanel.css'

const today = () => new Date().toLocaleDateString('en-CA')
const labels = {
  ru: ['Групповое', 'Индивидуальное', 'Сплит', 'Создать ставку', 'Изменить', 'Архивировать', 'Архив', 'Назначить ставку', 'Все филиалы', 'Рассчитать период', 'Изменить период', 'Подробнее', 'Результат расчёта', 'Ставка', 'Выберите ставку', 'Тренеры', 'Филиал', 'Учитывать для занятий с', 'Название ставки', 'Тип занятия', 'Базовая сумма, PLN', 'Порог клиентов', 'За каждого сверх порога, PLN', 'Изменение действует с', 'Период расчёта: с', 'Период расчёта: по', 'Подтвердить замену', 'Сохранить', 'Отмена', 'Нет начислений', 'ставка не назначена', 'Ставка будет заменена с указанной даты у', 'после'],
  uk: ['Групове', 'Індивідуальне', 'Спліт', 'Створити ставку', 'Змінити', 'Архівувати', 'Архів', 'Призначити ставку', 'Усі філії', 'Розрахувати період', 'Змінити період', 'Докладніше', 'Результат розрахунку', 'Ставка', 'Виберіть ставку', 'Тренери', 'Філія', 'Враховувати для занять з', 'Назва ставки', 'Тип заняття', 'Базова сума, PLN', 'Поріг клієнтів', 'За кожного понад поріг, PLN', 'Зміна діє з', 'Період розрахунку: з', 'Період розрахунку: по', 'Підтвердити заміну', 'Зберегти', 'Скасувати', 'Немає нарахувань', 'ставку не призначено', 'Ставку буде замінено з указаної дати для', 'після'],
  pl: ['Grupowe', 'Indywidualne', 'Split', 'Utwórz stawkę', 'Zmień', 'Archiwizuj', 'Archiwum', 'Przypisz stawkę', 'Wszystkie lokalizacje', 'Oblicz okres', 'Zmień okres', 'Szczegóły', 'Wynik obliczenia', 'Stawka', 'Wybierz stawkę', 'Trenerzy', 'Lokalizacja', 'Uwzględniaj zajęcia od', 'Nazwa stawki', 'Typ zajęć', 'Kwota bazowa, PLN', 'Próg klientów', 'Za każdego powyżej progu, PLN', 'Zmiana obowiązuje od', 'Okres rozliczenia: od', 'Okres rozliczenia: do', 'Potwierdź zmianę', 'Zapisz', 'Anuluj', 'Brak naliczeń', 'nie przypisano stawki', 'Stawka zostanie zmieniona od wskazanej daty dla', 'powyżej'],
  en: ['Group', 'Individual', 'Split', 'Create rate', 'Edit', 'Archive', 'Archived', 'Assign rate', 'All locations', 'Calculate period', 'Change period', 'Details', 'Calculation result', 'Rate', 'Select rate', 'Trainers', 'Location', 'Apply to sessions from', 'Rate name', 'Session type', 'Base amount, PLN', 'Client threshold', 'Per client above threshold, PLN', 'Change effective from', 'Calculation period: from', 'Calculation period: to', 'Confirm replacement', 'Save', 'Cancel', 'No earnings', 'rate not assigned', 'Rate will be replaced from the selected date for', 'after'],
}
const keys = ['group', 'individual', 'split', 'create', 'edit', 'archive', 'archived', 'assign', 'allLocations', 'calculate', 'changePeriod', 'details', 'result', 'rate', 'chooseRate', 'trainers', 'location', 'applyFrom', 'rateName', 'sessionType', 'base', 'threshold', 'extra', 'changeFrom', 'periodFrom', 'periodTo', 'confirm', 'save', 'cancel', 'noEarnings', 'missing', 'replaceFor', 'after']
const amount = (minor, currency = 'PLN') => `${(Number(minor || 0) / 100).toFixed(2)} ${currency}`

export function PayrollSettingsPanel({ section, Button }) {
  const { locale } = useLocale()
  const tr = (key) => (labels[locale] || labels.ru)[keys.indexOf(key)]
  const types = { group: tr('group'), individual: tr('individual'), split: tr('split') }
  const [rates, setRates] = useState([])
  const [assignments, setAssignments] = useState([])
  const [periods, setPeriods] = useState([])
  const [trainers, setTrainers] = useState([])
  const [locations, setLocations] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function load() {
    try {
      const [r, a, p, tr, loc] = await Promise.all([
        api.get('/api/admin/payroll/rates/'), fetchAllPages('/api/admin/payroll/assignments/', 'assignments'),
        api.get('/api/admin/payroll/periods/'), fetchAllPages('/api/admin/trainers/', 'trainers'),
        fetchAllPages('/api/admin/settings/locations/', 'locations'),
      ])
      setRates(r.rates || []); setAssignments(a.assignments || []); setPeriods(p.periods || [])
      setTrainers(tr.trainers || []); setLocations(loc.locations || [])
    } catch (err) { setError(apiErrorMessage(err, 'Не удалось загрузить зарплату')) }
  }
  useEffect(() => { load() }, [])
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value,
    ...(current.kind === 'assignment' && ['rate_id', 'trainer_ids', 'location', 'effective_from'].includes(key) ? { confirmed: false } : {}) }))
  const startRate = (rate = null) => setForm({ kind: 'rate', id: rate?.id,
    name: rate?.name || '', session_type: rate?.session_type || 'group',
    currency: rate?.currency || 'PLN',
    base_amount: rate ? String(rate.base_amount_minor / 100) : '',
    threshold: rate?.min_clients_threshold ?? 0,
    extra_amount: rate ? String((rate.extra_client_amount_minor || 0) / 100) : '0',
    effective_from: today() })
  const startAssignment = (trainerId = '') => setForm({ kind: 'assignment', rate_id: '',
    trainer_ids: trainerId ? [Number(trainerId)] : [], location: '', effective_from: today(), confirmed: false })
  const startPeriod = (period = null) => setForm({ kind: 'period', id: period?.id,
    date_from: period?.date_from || `${today().slice(0, 8)}01`,
    date_to: period?.date_to || today(), location: period?.location || '' })

  async function save(event) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (form.kind === 'rate') {
        const payload = { name: form.name, session_type: form.session_type,
          base_amount_minor: Math.round(Number(form.base_amount.replace(',', '.')) * 100), currency: form.currency,
          min_clients_threshold: form.session_type === 'group' ? Number(form.threshold) : null,
          extra_client_amount_minor: form.session_type === 'group' ? Math.round(Number(form.extra_amount.replace(',', '.')) * 100) : null }
        if (form.id) await api.patch(`/api/admin/payroll/rates/${form.id}/`, { ...payload, effective_from: form.effective_from })
        else await api.post('/api/admin/payroll/rates/', payload)
      } else if (form.kind === 'assignment') {
        const rate = rates.find((item) => String(item.id) === String(form.rate_id))
        const conflicts = assignments.filter((item) => form.trainer_ids.includes(item.trainer_id) &&
          item.session_type === rate?.session_type && item.location === form.location &&
          (!item.effective_to || item.effective_to >= form.effective_from))
        if (conflicts.length && !form.confirmed) {
          update('confirmed', true); setBusy(false); return
        }
        await api.post('/api/admin/payroll/assign-rates/', { rate_id: Number(form.rate_id),
          trainer_ids: form.trainer_ids, location: form.location, effective_from: form.effective_from })
      } else {
        const payload = { date_from: form.date_from, date_to: form.date_to, location: form.location }
        const response = form.id
          ? await api.patch(`/api/admin/payroll/periods/${form.id}/`, payload)
          : await api.post('/api/admin/payroll/periods/', payload)
        setResult(response)
      }
      setForm(null); await load()
    } catch (err) { setError(apiErrorMessage(err, 'Не удалось сохранить')) }
    finally { setBusy(false) }
  }

  return <div className="card card-pad ops-edit-panel">
    {error && <p role="alert" className="text-danger">{error}</p>}
    {section === 'rates' && <>
      <Button variant="primary" type="button" onClick={() => startRate()}>{tr('create')}</Button>
      <div className="payroll-rate-list">{rates.map((rate) => <div className="payroll-rate-row" key={rate.id}>
        <strong>{rate.name} · {types[rate.session_type]}{!rate.is_active ? ` · ${tr('archived')}` : ''}</strong>
        <span>{amount(rate.base_amount_minor, rate.currency)}{rate.session_type === 'group' ? ` + ${amount(rate.extra_client_amount_minor, rate.currency)} ${tr('after')} ${rate.min_clients_threshold}` : ''}</span>
        <div className="payroll-rate-actions">{rate.is_active && <><Button size="sm" variant="secondary" type="button" onClick={() => startRate(rate)}>{tr('edit')}</Button>
          <Button size="sm" variant="subtle" type="button" onClick={async () => { if (!window.confirm(`${tr('archive')} «${rate.name}»?`)) return; try { await api.delete(`/api/admin/payroll/rates/${rate.id}/`); await load() } catch (err) { setError(apiErrorMessage(err)) } }}>{tr('archive')}</Button></>}</div>
      </div>)}</div>
    </>}
    {section === 'assignments' && <>
      <Button variant="primary" type="button" onClick={() => startAssignment()}>{tr('assign')}</Button>
      {assignments.map((item) => <div className="ops-detail-row" key={item.id}>
        <strong>{item.trainer} · {item.rate}</strong><span>{item.location || tr('allLocations')} · {item.effective_from}{item.effective_to ? ` — ${item.effective_to}` : ''}</span>
      </div>)}
    </>}
    {section === 'periods' && <>
      <PayrollPreview trainers={trainers} Button={Button} />
      <details><summary>{tr('result')}</summary>
      <Button variant="primary" type="button" onClick={() => startPeriod()}>{tr('calculate')}</Button>
      {periods.map((item) => <div className="ops-detail-row" key={item.id}>
        <strong>{item.date_from} — {item.date_to} · {item.location || tr('allLocations')}</strong>
        <span>{item.totals_by_trainer?.map((total) => `${total.trainer__user__first_name} ${total.trainer__user__last_name}: ${amount(total.total_amount_minor, total.currency)}`).join('; ') || tr('noEarnings')}</span>
        {!['approved', 'exported'].includes(item.status) && <Button size="sm" variant="secondary" type="button" onClick={() => startPeriod(item)}>{tr('changePeriod')}</Button>}
        <Button size="sm" variant="subtle" type="button" onClick={async () => { try { setResult(await api.get(`/api/admin/payroll/periods/${item.id}/`)) } catch (err) { setError(apiErrorMessage(err)) } }}>{tr('details')}</Button>
      </div>)}
      {result && <div className="ops-form-stack"><strong>{tr('result')}</strong>
        {(result.calculations || []).map((line) => <div key={line.id}>{line.trainer} · {line.session_start_at?.slice(0, 10)} · {amount(line.final_amount_minor, line.currency)}</div>)}
        {(result.skipped_sessions || result.summary?.skipped || []).map((line) => <div key={`skip-${line.session_id}`}>#{line.session_id}: {tr('missing')}</div>)}
      </div>}
      </details>
    </>}
    {form && <form onSubmit={save} className="ops-form-stack" style={{ marginTop: 16 }}>
      {form.kind === 'rate' && <>
        <label>{tr('rateName')}<input required value={form.name} onChange={(e) => update('name', e.target.value)} /></label>
        {!form.id && <label>{tr('sessionType')}<select value={form.session_type} onChange={(e) => update('session_type', e.target.value)}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <label>Currency<select value={form.currency} onChange={(e) => update('currency', e.target.value)}>{['PLN', 'EUR', 'USD'].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label>{tr('base').replace('PLN', form.currency)}<input required type="number" min="0" step="0.01" value={form.base_amount} onChange={(e) => update('base_amount', e.target.value)} /></label>
        {form.session_type === 'group' && <><label>{tr('threshold')}<input required type="number" min="0" step="1" value={form.threshold} onChange={(e) => update('threshold', e.target.value)} /></label>
          <label>{tr('extra').replace('PLN', form.currency)}<input required type="number" min="0" step="0.01" value={form.extra_amount} onChange={(e) => update('extra_amount', e.target.value)} /></label></>}
        {form.id && <label>{tr('changeFrom')}<input required type="date" value={form.effective_from} onChange={(e) => update('effective_from', e.target.value)} /></label>}
      </>}
      {form.kind === 'assignment' && <>
        <label>{tr('rate')}<select required value={form.rate_id} onChange={(e) => update('rate_id', e.target.value)}><option value="">{tr('chooseRate')}</option>{rates.filter((rate) => rate.is_active).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} · {types[rate.session_type]}</option>)}</select></label>
        <fieldset><legend>{tr('trainers')}</legend>{trainers.filter((trainer) => trainer.is_active !== false).map((trainer) => <label key={trainer.id} style={{ display: 'block' }}><input type="checkbox" checked={form.trainer_ids.includes(trainer.id)} onChange={(e) => update('trainer_ids', e.target.checked ? [...form.trainer_ids, trainer.id] : form.trainer_ids.filter((id) => id !== trainer.id))} /> {trainer.full_name || trainer.name || trainer.username}</label>)}</fieldset>
        <label>{tr('location')}<select value={form.location} onChange={(e) => update('location', e.target.value)}><option value="">{tr('allLocations')}</option>{locations.map((loc) => <option key={loc.id} value={loc.name}>{loc.name}</option>)}</select></label>
        <label>{tr('applyFrom')}<input required type="date" value={form.effective_from} onChange={(e) => update('effective_from', e.target.value)} /></label>
        {form.confirmed && <p role="alert">{tr('replaceFor')}: {assignments.filter((item) => form.trainer_ids.includes(item.trainer_id) && item.session_type === rates.find((rate) => String(rate.id) === String(form.rate_id))?.session_type && item.location === form.location && (!item.effective_to || item.effective_to >= form.effective_from)).map((item) => item.trainer).join(', ')}.</p>}
      </>}
      {form.kind === 'period' && <><label>{tr('periodFrom')}<input required type="date" value={form.date_from} onChange={(e) => update('date_from', e.target.value)} /></label>
        <label>{tr('periodTo')}<input required type="date" min={form.date_from} value={form.date_to} onChange={(e) => update('date_to', e.target.value)} /></label>
        <label>{tr('location')}<select value={form.location} onChange={(e) => update('location', e.target.value)}><option value="">{tr('allLocations')}</option>{locations.map((loc) => <option key={loc.id} value={loc.name}>{loc.name}</option>)}</select></label></>}
      <div className="ops-button-row"><Button variant="primary" disabled={busy || (form.kind === 'assignment' && !form.trainer_ids.length)} type="submit">{tr(form.confirmed ? 'confirm' : 'save')}</Button><Button variant="secondary" type="button" onClick={() => setForm(null)}>{tr('cancel')}</Button></div>
    </form>}
  </div>
}
