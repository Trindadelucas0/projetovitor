// AVAGYM — chamadas de acompanhamento, profissional e administração.
import { api } from './api.js'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
export const C = {
  care: () => api('/api/care'), plan: id => api('/api/plan?id=' + id), schedulePlan: (plan_id, days) => post('/api/plan/schedule', { plan_id, days }), blocks: () => api('/api/blocks'),
  occurrence: b => post('/api/occurrences', b), newThread: b => post('/api/threads', b), thread: id => api('/api/thread?id=' + id), send: (thread_id, body) => post('/api/messages', { thread_id, body }),
  notifications: () => api('/api/notifications'), readAll: () => post('/api/notifications/read', {}),
  pros: area => api('/api/professionals' + (area ? '?area=' + encodeURIComponent(area) : '')), pro: id => api('/api/professional?id=' + id),
  searchEx: t => api('/api/exercises/search?q=' + encodeURIComponent(t)),
  // profissional
  dash: (history = false) => api('/api/pro/dashboard' + (history ? '?include_history=1' : '')), saveProfile: b => post('/api/pro/profile', b), addQual: b => post('/api/pro/qualifications', b),
  student: id => api('/api/pro/student?id=' + id), savePlan: b => post('/api/pro/plans', b), archivePlan: (id, reason) => post('/api/pro/plans/archive', { id, reason }),
  assess: b => post('/api/pro/assess', b), closeOcc: (id, reason) => post('/api/pro/close-occurrence', { id, reason }), closeThread: id => post('/api/pro/close-thread', { id }),
  propose: b => post('/api/pro/proposals', b), decide: b => post('/api/pro/proposals/decide', b),
  // admin
  overview: () => api('/api/adm/overview'), users: (status, q) => api('/api/adm/users?' + new URLSearchParams({ ...(status ? { status } : {}), q: q || '' })),
  setStatus: (id, status, reason) => post('/api/adm/users/status', { id, status, reason }), setRole: (id, role, on) => post('/api/adm/users/role', { id, role, on }),
  setPlan: (id, plan_id) => post('/api/adm/users/plan', { id, plan_id }), plans: () => api('/api/adm/plans'), savePlanAcc: b => post('/api/adm/plans', b),
  admPros: () => api('/api/adm/professionals'),
  updUser: b => post('/api/adm/users/update', b), delUser: b => post('/api/adm/users/delete', b), proProfile: b => post('/api/adm/professionals/profile', b),
  quals: id => api('/api/adm/qualifications?user_id=' + id), saveQual: b => post('/api/adm/qualifications/save', b), delQual: b => post('/api/adm/qualifications/delete', b),
  record: id => api('/api/adm/student/record?id=' + id), saveRecord: b => post('/api/adm/student/record', b), saveRestr: b => post('/api/adm/restrictions/save', b), delRestr: b => post('/api/adm/restrictions/delete', b),
  training: id => api('/api/adm/student/training?id=' + id), admSavePlan: b => post('/api/adm/plans/save', b), admDelPlan: b => post('/api/adm/plans/delete', b),
  endProgram: b => post('/api/adm/user-programs/end', b), voidSession: b => post('/api/adm/sessions/void', b), transfer: b => post('/api/adm/links/transfer', b),
  corrigirPerfil: student_id => post('/api/pro/students/corrigir-perfil', { student_id, confirm: true }),
  admPosts: (st, q) => api(`/api/adm/posts?status=${st || ''}&q=${encodeURIComponent(q || '')}`), updPost: b => post('/api/adm/posts/update', b), delPost: b => post('/api/adm/posts/delete', b),
  officialPosts: state => api('/api/adm/community/editorial' + (state ? '?state=' + encodeURIComponent(state) : '')),
  seedOfficialPosts: () => post('/api/adm/community/editorial/seed', {}),
  saveOfficialPost: b => post('/api/adm/community/editorial/save', b),
  publishOfficialPost: id => post('/api/adm/community/editorial/publish', { id }),
  cancelOfficialPost: id => post('/api/adm/community/editorial/cancel', { id }),
  admComments: id => api('/api/adm/comments?post_id=' + id), updComment: b => post('/api/adm/comments/update', b), delComment: b => post('/api/adm/comments/delete', b),
  saveExercise: b => post('/api/adm/exercises/save', b), archiveExercise: b => post('/api/adm/exercises/archive', b), createUser: b => post('/api/adm/users/create', b), updPro: b => post('/api/adm/professionals', b), verify: (id, status, note) => post('/api/adm/qualifications/verify', { id, status, note }),
  links: () => api('/api/adm/links'), link: b => post('/api/adm/links', b), endLink: (id, reason) => post('/api/adm/links/end', { id, reason }),
  queue: () => api('/api/adm/queue'), assign: b => post('/api/adm/assign', b), admClose: (id, reason) => post('/api/adm/close-occurrence', { id, reason }),
  live: () => api('/api/adm/live'), userWorkouts: id => api('/api/adm/users/workouts?id=' + id),
  samePerson: (id, other_id, note) => post('/api/adm/users/same-person', { id, other_id, note }),
  dataRequests: st => api('/api/adm/data-requests?status=' + (st || '')), decideData: b => post('/api/adm/data-requests/decide', b),
  terms: () => api('/api/adm/terms'), publishTerms: b => post('/api/adm/terms', b),
  admExercises: qq => api('/api/adm/exercises?q=' + encodeURIComponent(qq || '')), exMedia: id => api('/api/exercises/media?id=' + encodeURIComponent(id)),
  addExMedia: b => post('/api/adm/exercises/media', b), rmExMedia: id => post('/api/adm/exercises/media/remove', { id }),
  myRequests: () => api('/api/me/requests'), deleteRequest: reason => post('/api/me/delete-request', { reason }), cancelDelete: () => post('/api/me/delete-request/cancel', {}),
  proThread: (student_id, body) => post('/api/pro/threads', { student_id, body }),
  resetLink: id => post('/api/adm/users/reset-link', { id }),
  audit: () => api('/api/adm/audit'), settings: () => api('/api/adm/settings'), saveSettings: b => post('/api/adm/settings', b),
  tapago: () => api('/api/adm/tapago'), saveTapago: b => post('/api/adm/tapago/config', b), decideTapago: (id, decision, reason) => post('/api/adm/tapago/decide', { id, decision, reason }), applyTapago: id => post('/api/adm/tapago/apply', { id }), revokeTapago: (id, reason) => post('/api/adm/tapago/revoke', { id, reason })
}
export const CAT_PT = { dor: 'Dor', desconforto: 'Desconforto', dificuldade: 'Dificuldade para realizar', duvida: 'Dúvida sobre a execução', outro: 'Outro motivo' }
export const OCC_ST = { aberta: 'Aguardando avaliação', orientada: 'Orientação registrada', encerrada: 'Encerrada' }
export const dt = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
export const initials = n => (n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('')
// comunidade
export const F = {
  cats: () => api('/api/feed/categories'), feed: p => api('/api/feed?' + new URLSearchParams(p || {})), post: id => api('/api/post?id=' + id),
  save: b => post('/api/posts', b), del: id => post('/api/posts/delete', { id }), like: (id, on) => post('/api/posts/like', { id, on }),
  publishWorkout: b => post('/api/community/workout-post', b),
  comment: (post_id, body, parent_id) => post('/api/comments', { post_id, body, parent_id }), likeComment: (id, on) => post('/api/comments/like', { id, on }), delComment: id => post('/api/comments/delete', { id }),
  report: b => post('/api/reports', b), follow: (professional_id, on) => post('/api/follows', { professional_id, on }), upload: data => post('/api/uploads', { data }),
  reports: st => api('/api/adm/reports?status=' + st), decide: b => post('/api/adm/reports/decide', b),
}
export const REPORT_PT = { ofensivo: 'Conteúdo ofensivo', prejudicial: 'Informação inadequada ou potencialmente prejudicial', privado: 'Divulgação de informações privadas', spam: 'Spam ou propaganda não autorizada', outro: 'Outro motivo' }

const API_BASE = import.meta.env.VITE_API_BASE || ''
// envio binário direto (vídeo até 60 MB, foto até 5 MB)
export async function uploadExMedia(exercise_id, file, caption) {
  const r = await fetch(API_BASE + '/api/adm/exercises/upload?' + new URLSearchParams({ exercise_id, caption: caption || '' }), { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Falha no envio'); return d
}
// V4.1: exportMyData (Exportar dados) removido a pedido do Lucas.

// AVAGYM e central administrativa
export const P = {
  management: period => api('/api/adm/management?period=' + period),
  managementInvites: () => api('/api/adm/management/invites'),
  home: () => api('/api/pro/home'), students: (filter, q) => api('/api/pro/students?' + new URLSearchParams({ filter: filter || 'todos', q: q || '' })),
  student: id => api('/api/pro/student/full?id=' + id), library: f => api('/api/pro/library?' + new URLSearchParams(f || {})), templates: () => api('/api/pro/templates'),
  list: f => api('/api/pro/prescriptions?' + new URLSearchParams(f || {})), get: id => api('/api/pro/prescription?id=' + id),
  save: b => post('/api/pro/prescriptions', b), publish: id => post('/api/pro/prescriptions/publish', { id }), archive: (id, reason) => post('/api/pro/prescriptions/archive', { id, reason }),
  capacity: () => api('/api/pro/capacity'), request: b => post('/api/pro/requests', b), cancel: id => post('/api/pro/requests/cancel', { id }), reply: (id, note) => post('/api/pro/requests/reply', { id, note }),
  myCode: () => api('/api/me/code'), myCoaches: () => api('/api/me/coaches'),
  // admin
  kpis: () => api('/api/adm/kpis'), requests: (type, group) => api('/api/adm/requests?' + new URLSearchParams({ ...(type ? { type } : {}), group: group || 'pendentes' })),
  decide: b => post('/api/adm/requests/decide', b), setCapacity: b => post('/api/adm/capacity', b), grantSeats: b => post('/api/adm/grants', { ...b, audience: 'profissional', kind: 'limit', key: 'alunos_ativos' }),
  admTemplates: () => api('/api/adm/templates'), saveTemplate: b => post('/api/adm/templates', b), templateStatus: (id, status) => post('/api/adm/templates/status', { id, status })
}
export const GOALS = { hypertrophy: 'Hipertrofia', weight_loss: 'Emagrecimento', strength: 'Força', conditioning: 'Condicionamento', mobility: 'Mobilidade', home: 'Treino em casa', rehab: 'Reabilitação' }
export const REQ_ST = { pendente: 'Pendente', em_analise: 'Em análise', aguardando_info: 'Aguardando informações', aprovada: 'Aprovada', rejeitada: 'Rejeitada', cancelada: 'Cancelada' }
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
