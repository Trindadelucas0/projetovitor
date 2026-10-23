// Planos do aluno: ids num lugar só (espelha app/api/plan-rules.js).
// Básico = 'individual' (mensal, recorrente) · Completo = 'completo' (3 meses / 90 dias, pagamento único).
export const STUDENT_PLANS = { basico: 'individual', premium: 'completo' }
export const STUDENT_PLAN_IDS = Object.values(STUDENT_PLANS)
export const PLAN_LABEL = { individual: 'Básico', completo: 'Completo' }
export const isStudentPlan = id => STUDENT_PLAN_IDS.includes(id)
export const isPremium = id => id === STUDENT_PLANS.premium
export const GROUP_LABEL = { geral: 'Grupo geral', avisos: 'Avisos', premium: 'Grupo exclusivo Completo' }
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
/** "1 a cada 15 dias" / "1 por mês" */
export const quotaText = (n, janela) => `${n} ${janela ? `a cada ${janela} dias` : 'por mês'}`
/** Data/hora em São Paulo, como o app mostra para o aluno. */
export const spDateTime = d => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const spDate = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
