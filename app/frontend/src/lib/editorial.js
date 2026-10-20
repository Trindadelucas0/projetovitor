// AVAGYM V4 — fluxo editorial de programas (cliente)
import { api } from './api.js'
const P = (u, b, m = 'POST') => api(u, { method: m, body: JSON.stringify(b || {}) })
export const E = {
  mine: () => api('/api/pro/programs'),
  one: id => api('/api/pro/program?id=' + id),
  create: c => P('/api/pro/programs', c),
  save: (id, c) => P('/api/pro/programs', { id, ...c }, 'PATCH'),
  submit: id => P('/api/pro/programs/submit', { id }),
  queue: (status = 'revisao') => api('/api/admin/program-reviews?status=' + status),
  review: id => api('/api/admin/program-review?id=' + id),
  decide: (revision_id, decision, reason) => P('/api/admin/program-reviews/decision', { revision_id, decision, reason }),
  publish: revision_id => P('/api/admin/programs/publish', { revision_id }),
  archive: (program_id, reason) => P('/api/admin/programs/archive', { program_id, reason }),
  revoke: (program_id, reason) => P('/api/admin/programs/revoke', { program_id, reason }),
  badge: (program_id, badge_type, reason, expires_at) => P('/api/admin/programs/badges', { program_id, badge_type, reason, expires_at }),
  unbadge: (id, reason) => P('/api/admin/program-badges/revoke', { id, reason }),
  search: t => api('/api/exercises/search?q=' + encodeURIComponent(t))
}
export const REV_PT = { rascunho: 'Rascunho', revisao: 'Em avaliação', correcao_solicitada: 'Correção pedida', aprovado: 'Aprovado — aguardando publicação', publicado: 'Publicado', arquivado: 'Arquivado', revogado: 'Revogado' }
