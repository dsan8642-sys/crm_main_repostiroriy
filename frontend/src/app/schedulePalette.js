import manifest from '../design/tokens/schedule-palette.json' with { type: 'json' }


export const schedulePaletteOptions = Object.freeze([
  manifest.standard,
  ...manifest.colors,
])

const paletteByKey = new Map(
  schedulePaletteOptions.map((option) => [option.key, option]),
)


export function normalizeScheduleColorKey(value) {
  return paletteByKey.has(value) ? value : manifest.standard.key
}


export function scheduleColorOption(value) {
  return paletteByKey.get(normalizeScheduleColorKey(value))
}


export function scheduleColorStyle(value) {
  const color = scheduleColorOption(value)
  return {
    '--schedule-color-background': color.background,
    '--schedule-color-border': color.border,
    '--schedule-color-text': color.text,
  }
}
