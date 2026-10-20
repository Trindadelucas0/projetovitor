// V4.1 — treino ativo único (sistema OU profissional). Fonte: Postgres via /api/active-training.
import { api } from './api.js'
export const AT = {
  get: () => api('/api/active-training'),
  activatePlan: id => api('/api/active-training', { method: 'POST', body: JSON.stringify({ kind: 'profissional', pro_plan_id: id }) })
}
export const activeLabel = a => !a?.kind ? 'Nenhum treino ativo' : a.kind === 'sistema' ? 'Programa do sistema' : 'Ficha do profissional'
AT.detach = () => api('/api/active-training/detach', { method: 'POST', body: '{}' })
