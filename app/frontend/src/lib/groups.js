import { api } from './api.js'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
export const GR = {
  list: (f) => api('/api/groups?' + new URLSearchParams(f || {})), get: id => api('/api/group?id=' + id),
  create: b => post('/api/groups', b), update: b => post('/api/groups/update', b), join: (id, code) => post('/api/groups/join', { id, code }), leave: id => post('/api/groups/leave', { id }),
  decide: (id, user_id, approve) => post('/api/groups/decide', { id, user_id, approve }), remove: (id, user_id, reason) => post('/api/groups/remove', { id, user_id, reason }),
  role: (id, user_id, role) => post('/api/groups/role', { id, user_id, role }), transfer: (id, user_id) => post('/api/groups/transfer', { id, user_id, confirm: true }),
  invite: (id, b) => post('/api/groups/invites', { id, ...b }), revoke: (id, invite_id) => post('/api/groups/invites/revoke', { id, invite_id }),
  admList: st => api('/api/adm/groups?status=' + (st || '')), admStatus: (id, status, reason) => post('/api/adm/groups/status', { id, status, reason })
}
export const PRIV_PT = { aberto: 'Aberto', moderado: 'Moderado (com aprovação)', privado: 'Privado (só convite)' }
