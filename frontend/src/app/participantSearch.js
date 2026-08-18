import { api } from '../api.js'
import { mapAdminClientRows } from '../mappers.js'
import { clientSelectOption } from './SearchableSelect.jsx'

export async function loadAdminParticipantOptions(query, requestOptions = {}, optionConfig) {
  const payload = await api.get(`/api/admin/reference/?q=${encodeURIComponent(query)}`, requestOptions)
  return mapAdminClientRows(payload.participants || []).active
    .map((participant) => clientSelectOption(participant, optionConfig))
}
