export function ageToday(birthDate, today = new Date()) {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  if (!year || !month || !day) return null
  const age = today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0)
  return age >= 0 ? age : null
}
