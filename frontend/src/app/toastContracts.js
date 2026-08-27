export function toastReducer(state, action) {
  if (action.type === 'dismiss') return state.filter((toast) => toast.id !== action.id)
  if (action.type !== 'show') return state
  const toast = action.toast
  const existing = state.findIndex((item) => item.id === toast.id)
  if (existing < 0) return [...state, toast].slice(-4)
  return state.map((item, index) => index === existing ? toast : item)
}
