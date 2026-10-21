// AVAGYM V3 — chamadas das funcionalidades SaaS (identidade, planos, convites).
import { api } from './api.js'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
export const V = {
  // Fase 2 — identidade global e verificação profissional
  context: () => api('/api/me/context'), setContext: context => post('/api/me/context', { context }),
  addCapacity: capacity => post('/api/me/capacities', { capacity }), me: () => api('/api/auth/me'),
  verification: () => api('/api/pro/verification'), submitVerification: b => post('/api/pro/verification', b),
  uploadDoc: (data, file_name) => post('/api/pro/verification/document', { data, file_name }),
  docUrl: id => (import.meta.env.VITE_API_BASE || '') + '/api/verification/document?id=' + id,
  // Fase 3 — motor de planos
  plans: () => api('/api/plans'), mySubs: () => api('/api/me/subscriptions'),
  admSubs: () => api('/api/adm/subscriptions'), admChangePlan: b => post('/api/adm/subscriptions/plan', b), admSubStatus: b => post('/api/adm/subscriptions/status', b),
  admGrant: b => post('/api/adm/grants', b), admGrants: user_id => api('/api/adm/grants?user_id=' + user_id), revokeGrant: id => post('/api/adm/grants/revoke', { id }),
  // Fase 4 — convites (Profissional Free / Aluno Free)
  proInvites: () => api('/api/pro/invites'), createInvite: b => post('/api/pro/invites', b), cancelInvite: id => post('/api/pro/invites/cancel', { id }),
  myInvites: () => api('/api/me/invites'), viewInvite: code => api('/api/invites/view?code=' + encodeURIComponent(code)),
  acceptInvite: code => post('/api/invites/accept', { code }), declineInvite: code => post('/api/invites/decline', { code }),
  // Fase 5 — código público do aluno e visão 360° do admin
  lookupStudent: code => api('/api/pro/students/lookup?code=' + encodeURIComponent(code)), admUser360: id => api('/api/adm/users/overview?id=' + id),
  admVerifications: status => api('/api/adm/verifications' + (status ? '?status=' + status : '')), decideVerification: b => post('/api/adm/verifications/decide', b)
}
export const VER_PT = { pendente: 'Em análise', correcao_solicitada: 'Correção solicitada', verificado: 'Verificado' }
export const readFileAsDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Não foi possível ler o arquivo')); r.readAsDataURL(f) })
export const SUB_PT = { ativa: 'Ativa', trial: 'Teste', suspensa: 'Suspensa', inadimplente: 'Inadimplente', cancelada: 'Cancelada' }
export const AUD_PT = { aluno: 'Treino (aluno)', profissional: 'Área profissional' }
export const METRIC_PT = { alunos_ativos: 'Alunos ativos' }
export const FEAT_PT = { treino_pessoal: 'Treino pessoal', programas_guiados: 'Programas guiados', execucao: 'Execução com cronômetro', progresso: 'Progresso', receber_ficha_profissional: 'Receber ficha do profissional', prescrever: 'Prescrever treinos', convidar_alunos: 'Convidar alunos', construtor_treino: 'Construtor de treino' }
// erros comerciais padronizados abrem a tela de upgrade/regularização (ver PlanErrorHost)
export const PLAN_CODES = ['LIMIT_REACHED', 'FEATURE_NOT_INCLUDED', 'SUBSCRIPTION_INACTIVE']
export const INV_PT = { pendente: 'Pendente', aceito: 'Aceito', recusado: 'Recusado', cancelado: 'Cancelado', expirado: 'Expirado' }
