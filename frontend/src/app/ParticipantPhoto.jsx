import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useLocale } from '../i18n.jsx'

const PHOTO_TEXT = {
  ru: { view: 'Увеличить фото', title: 'Фотография пловца', choose: 'Выбрать фото', horizontal: 'По горизонтали', vertical: 'По вертикали', zoom: 'Увеличение', save: 'Сохранить фото', remove: 'Удалить фото', preview: 'Предпросмотр обрезанного фото', invalid: 'Выберите JPG, PNG или WebP не больше 10 МБ.', pixels: 'Выберите изображение не больше 20 мегапикселей.', unreadable: 'Не удалось прочитать изображение.', large: 'Фотография слишком большая после обрезки.', saveError: 'Не удалось сохранить фотографию.', removeError: 'Не удалось удалить фотографию.' },
  uk: { view: 'Збільшити фото', title: 'Фотографія плавця', choose: 'Вибрати фото', horizontal: 'По горизонталі', vertical: 'По вертикалі', zoom: 'Збільшення', save: 'Зберегти фото', remove: 'Видалити фото', preview: 'Попередній перегляд обрізаного фото', invalid: 'Виберіть JPG, PNG або WebP до 10 МБ.', pixels: 'Виберіть зображення до 20 мегапікселів.', unreadable: 'Не вдалося прочитати зображення.', large: 'Фото завелике після обрізання.', saveError: 'Не вдалося зберегти фото.', removeError: 'Не вдалося видалити фото.' },
  pl: { view: 'Powiększ zdjęcie', title: 'Zdjęcie pływaka', choose: 'Wybierz zdjęcie', horizontal: 'W poziomie', vertical: 'W pionie', zoom: 'Powiększenie', save: 'Zapisz zdjęcie', remove: 'Usuń zdjęcie', preview: 'Podgląd przyciętego zdjęcia', invalid: 'Wybierz JPG, PNG lub WebP do 10 MB.', pixels: 'Wybierz obraz do 20 megapikseli.', unreadable: 'Nie można odczytać obrazu.', large: 'Zdjęcie jest za duże po przycięciu.', saveError: 'Nie można zapisać zdjęcia.', removeError: 'Nie można usunąć zdjęcia.' },
  en: { view: 'Enlarge photo', title: 'Swimmer photo', choose: 'Choose photo', horizontal: 'Horizontal position', vertical: 'Vertical position', zoom: 'Zoom', save: 'Save photo', remove: 'Remove photo', preview: 'Cropped photo preview', invalid: 'Choose a JPG, PNG or WebP under 10 MB.', pixels: 'Choose an image under 20 megapixels.', unreadable: 'Could not read the image.', large: 'Photo is too large after cropping.', saveError: 'Could not save the photo.', removeError: 'Could not remove the photo.' },
}

export function photoUrl(id, version, sessionId) {
  if (!id || !version) return null
  const path = sessionId
    ? `/api/trainer/sessions/${sessionId}/participants/${id}/photo/`
    : `/api/admin/participants/${id}/photo/`
  return `${path}?v=${encodeURIComponent(version)}`
}

export function PhotoAvatar({ Avatar, Dialog, name, src, size = 32, avatarStyle }) {
  const { locale } = useLocale()
  const labels = PHOTO_TEXT[locale] || PHOTO_TEXT.ru
  const [open, setOpen] = useState(false)
  if (!src) return <Avatar name={name} size={size} style={avatarStyle} />
  return <>
    <button type="button" aria-label={`${labels.view}: ${name}`} onClick={() => setOpen(true)} style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in', borderRadius: avatarStyle?.borderRadius || '50%' }}><Avatar name={name} size={size} src={src} style={avatarStyle} /></button>
    <Dialog open={open} title={name} onClose={() => setOpen(false)} hideFooter width={600}>
      <img src={src} alt={name} style={{ display: 'block', width: 'min(100%, 512px)', aspectRatio: '1', objectFit: 'contain', margin: 'auto' }} />
      <button type="button" data-dialog-cancel onClick={() => setOpen(false)} style={{ marginTop: 12 }}>{({ ru: 'Закрыть', uk: 'Закрити', pl: 'Zamknij', en: 'Close' })[locale] || 'Закрыть'}</button>
    </Dialog>
  </>
}

export function ParticipantPhotoEditor({ student, Avatar, Dialog, onChanged, onPendingChange, onBusyChange }) {
  const { locale } = useLocale()
  const labels = PHOTO_TEXT[locale] || PHOTO_TEXT.ru
  const [version, setVersion] = useState(student.photo_version)
  const [source, setSource] = useState(null)
  const [image, setImage] = useState(null)
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef(null)

  useEffect(() => { onPendingChange?.(Boolean(image)) }, [image, onPendingChange])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])

  useEffect(() => { setVersion(student.photo_version); setSource(null); setImage(null); setError('') }, [student.id, student.photo_version])
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  useEffect(() => {
    if (!image || !canvasRef.current) return
    const width = image.naturalWidth * Math.max(512 / image.naturalWidth, 512 / image.naturalHeight) * zoom
    const height = image.naturalHeight * Math.max(512 / image.naturalWidth, 512 / image.naturalHeight) * zoom
    const context = canvasRef.current.getContext('2d')
    context.clearRect(0, 0, 512, 512)
    context.drawImage(image, -(width - 512) * x / 100, -(height - 512) * y / 100, width, height)
  }, [image, x, y, zoom])

  function chooseFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(labels.invalid)
      return
    }
    const url = URL.createObjectURL(file)
    const nextImage = new Image()
    nextImage.onload = () => {
      if (nextImage.naturalWidth * nextImage.naturalHeight > 20_000_000) {
        URL.revokeObjectURL(url)
        setError(labels.pixels)
        return
      }
      setSource(url); setImage(nextImage); setX(50); setY(50); setZoom(1)
    }
    nextImage.onerror = () => { URL.revokeObjectURL(url); setError(labels.unreadable) }
    nextImage.src = url
    event.target.value = ''
  }

  async function save() {
    setBusy(true); setError('')
    try {
      const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob || blob.size > 1024 * 1024) throw new Error(labels.large)
      const form = new FormData()
      form.append('photo', blob, 'photo.jpg')
      const result = await api.postForm(`/api/admin/participants/${student.id}/photo/`, form)
      setVersion(result.photo_version); setSource(null); setImage(null); onChanged?.()
    } catch (err) { setError(err.message || labels.saveError) }
    finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setError('')
    try {
      await api.delete(`/api/admin/participants/${student.id}/photo/`)
      setVersion(null); setSource(null); setImage(null); onChanged?.()
    } catch (err) { setError(err.message || labels.removeError) }
    finally { setBusy(false) }
  }

  return <section aria-label={labels.title} style={{ gridColumn: '1 / -1', display: 'grid', gap: 10 }}>
    <strong>{labels.title}</strong>
    <PhotoAvatar Avatar={Avatar} Dialog={Dialog} name={student.full_name} src={photoUrl(student.id, version)} size={64} />
    <label>{labels.choose} <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={busy} /></label>
    {image && <>
      <canvas ref={canvasRef} width="512" height="512" aria-label={labels.preview} style={{ width: 'min(100%, 320px)', aspectRatio: '1', borderRadius: 8 }} />
      <label>{labels.horizontal} <input type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
      <label>{labels.vertical} <input type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
      <label>{labels.zoom} <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <button type="button" disabled={busy} onClick={save}>{labels.save}</button>
    </>}
    {version && <button type="button" disabled={busy} onClick={remove}>{labels.remove}</button>}
    {error && <span role="alert">{error}</span>}
  </section>
}
