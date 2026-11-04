import React, { useEffect, useRef, useState } from 'react'
import { api, apiErrorMessage } from '../api.js'
import { useLocale } from '../i18n.jsx'
import { ageToday } from './participantNotesContracts.js'
import './ParticipantNotes.css'

const copy = {
  ru: { open: 'Заметки', age: 'Возраст', private: 'Только для персонала', hint: 'Клиент не видит эти заметки.', birth: 'Дата рождения', close: 'Закрыть', empty: 'Заметок пока нет.', add: 'Добавить заметку', save: 'Сохранить', cancel: 'Отмена', edit: 'Изменить', remove: 'Удалить', confirm: 'Удалить эту заметку?', edited: 'Изменено', imported: 'Перенесено из старого поля', loading: 'Загрузка…', error: 'Не удалось загрузить или сохранить заметки.' },
  uk: { open: 'Нотатки', age: 'Вік', private: 'Тільки для персоналу', hint: 'Клієнт не бачить ці нотатки.', birth: 'Дата народження', close: 'Закрити', empty: 'Нотаток поки немає.', add: 'Додати нотатку', save: 'Зберегти', cancel: 'Скасувати', edit: 'Змінити', remove: 'Видалити', confirm: 'Видалити цю нотатку?', edited: 'Змінено', imported: 'Перенесено зі старого поля', loading: 'Завантаження…', error: 'Не вдалося завантажити або зберегти нотатки.' },
  pl: { open: 'Notatki', age: 'Wiek', private: 'Tylko dla personelu', hint: 'Klient nie widzi tych notatek.', birth: 'Data urodzenia', close: 'Zamknij', empty: 'Nie ma jeszcze notatek.', add: 'Dodaj notatkę', save: 'Zapisz', cancel: 'Anuluj', edit: 'Edytuj', remove: 'Usuń', confirm: 'Usunąć tę notatkę?', edited: 'Zmieniono', imported: 'Przeniesiono ze starego pola', loading: 'Ładowanie…', error: 'Nie udało się wczytać lub zapisać notatek.' },
  en: { open: 'Notes', age: 'Age', private: 'Staff only', hint: 'The client cannot see these notes.', birth: 'Date of birth', close: 'Close', empty: 'No notes yet.', add: 'Add a note', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete', confirm: 'Delete this note?', edited: 'Edited', imported: 'Imported from old field', loading: 'Loading…', error: 'Could not load or save notes.' },
}

export function ParticipantNotes({ participantId, name, birthDate, endpoint, readOnly = false, showAge = false, hasNotes = false }) {
  const { locale } = useLocale()
  const t = copy[locale] || copy.ru
  const trigger = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState([])
  const [present, setPresent] = useState(hasNotes)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setPresent(hasNotes); setOpen(false); setNotes([]); setDraft(''); setEditing(null) }, [participantId, endpoint, hasNotes])
  useEffect(() => {
    if (!open) return undefined
    let live = true
    setLoading(true); setError('')
    api.get(endpoint).then((result) => {
      if (live) { setNotes(result.notes || []); setPresent(Boolean(result.notes?.length)) }
    }).catch((err) => { if (live) setError(apiErrorMessage(err, t.error)) })
      .finally(() => { if (live) setLoading(false) })
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
      if (event.key === 'Tab') {
        const focusable = [...panelRef.current?.querySelectorAll('button:not(:disabled), textarea:not(:disabled)') || []]
        if (!focusable.length) return
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus() }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { live = false; document.removeEventListener('keydown', onKey) }
  }, [open, endpoint, t.error])

  const close = () => { setOpen(false); trigger.current?.focus() }
  const age = ageToday(birthDate)
  const date = birthDate ? new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${birthDate}T12:00:00`)) : '—'

  async function save() {
    if (!draft.trim() || busy) return
    setBusy(true); setError('')
    try {
      const result = editing ? await api.patch(`${endpoint}${editing}/`, { body: draft }) : await api.post(endpoint, { body: draft })
      setNotes((current) => editing ? current.map((note) => note.id === editing ? result : note) : [result, ...current])
      setPresent(true); setDraft(''); setEditing(null)
    } catch (err) { setError(apiErrorMessage(err, t.error)) }
    finally { setBusy(false) }
  }

  async function remove(note) {
    if (!window.confirm(t.confirm) || busy) return
    setBusy(true); setError('')
    try {
      await api.delete(`${endpoint}${note.id}/`)
      setNotes((current) => { const next = current.filter((item) => item.id !== note.id); setPresent(Boolean(next.length)); return next })
      if (editing === note.id) { setEditing(null); setDraft('') }
    } catch (err) { setError(apiErrorMessage(err, t.error)) }
    finally { setBusy(false) }
  }

  return <>
    <button ref={trigger} type="button" className={`participant-notes-trigger${present ? ' has-notes' : ''}`} data-testid={`participant-notes-open-${participantId}`} onClick={() => setOpen(true)}>
      {showAge && <span>{t.age}: {age == null ? '—' : age}</span>}
      <span>{t.open}</span>
    </button>
    {open && <div className="participant-notes-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={panelRef} className="participant-notes-panel" role="dialog" aria-modal="true" aria-label={`${t.private}: ${name}`}>
        <header><div><strong>{t.private}</strong><span>{name}</span></div><button ref={closeRef} type="button" onClick={close} aria-label={t.close}>×</button></header>
        <div className="participant-notes-scroll">
          <p className="participant-notes-birth">{t.birth}: <strong>{date}</strong></p>
          <p className="participant-notes-hint">{t.hint}</p>
          {loading && <p>{t.loading}</p>}
          {error && <p className="participant-notes-error" role="alert">{error}</p>}
          {!loading && !notes.length && <p className="participant-notes-empty">{t.empty}</p>}
          {notes.map((note) => <article key={note.id} className="participant-note">
            <p>{note.body}</p>
            <small>{note.imported ? t.imported : note.author || '—'} · {new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale === 'en' ? 'en-GB' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(note.created_at))}{note.edited ? ` · ${t.edited}` : ''}</small>
            {!readOnly && note.can_manage && <div className="participant-note-actions"><button type="button" onClick={() => { setEditing(note.id); setDraft(note.body) }}>{t.edit}</button><button type="button" onClick={() => remove(note)}>{t.remove}</button></div>}
          </article>)}
        </div>
        {!readOnly && <div className="participant-notes-compose">
          <label htmlFor={`participant-note-draft-${participantId}`}>{editing ? t.edit : t.add}</label>
          <textarea id={`participant-note-draft-${participantId}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={3} />
          <div>{editing && <button type="button" onClick={() => { setEditing(null); setDraft('') }}>{t.cancel}</button>}<button type="button" className="participant-notes-save" disabled={!draft.trim() || busy} onClick={save}>{t.save}</button></div>
        </div>}
      </section>
    </div>}
  </>
}
