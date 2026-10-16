import manifest from '../design/tokens/schedule-palette.json' with { type: 'json' }


export const schedulePaletteOptions = Object.freeze([
  manifest.standard,
  ...manifest.colors,
])

const paletteByKey = new Map(
  schedulePaletteOptions.map((option) => [option.key, option]),
)
const customColorPattern = /^#[0-9a-f]{6}$/i


export function normalizeScheduleColorKey(value) {
  if (typeof value === 'string' && customColorPattern.test(value)) return value.toLowerCase()
  return paletteByKey.has(value) ? value : manifest.standard.key
}


export function scheduleColorOption(value) {
  const key = normalizeScheduleColorKey(value)
  if (key.startsWith('#')) return {
    key,
    background: `color-mix(in srgb, ${key} 18%, white)`,
    border: `color-mix(in srgb, ${key} 45%, #d6dbe0)`,
    text: '#19324b',
  }
  return paletteByKey.get(key)
}


export function scheduleColorStyle(value) {
  const color = scheduleColorOption(value)
  return {
    '--schedule-color-background': color.background,
    '--schedule-color-border': color.border,
    '--schedule-color-text': color.text,
  }
}
