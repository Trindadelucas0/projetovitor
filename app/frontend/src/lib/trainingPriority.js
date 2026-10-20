// AVAGYM V4.4 - U2/U3: prioridade do que o aluno vê no Início/Treinos (funções puras, testáveis).
// Ordem: sessão aberta > ficha profissional ativa > vínculo sem ficha > programa independente > sem treino.
// Dados incompletos (falha ou carregando) nunca viram "sem treino": devolve 'indefinido'.
export function trainingPriority({ liveSession = false, proPlan = false, coaches = null, systemProgram = false, failed = false } = {}) {
  if (liveSession) return 'sessao_aberta'
  if (proPlan) return 'ficha_profissional'
  if (failed || coaches == null) return 'indefinido'
  if (coaches.length) return 'aguardando_ficha'
  if (systemProgram) return 'programa_independente'
  return 'sem_treino'
}
// questionário de recomendação: só para quem não tem treino nenhum, ainda sem perfil e sem ter pulado
export const shouldOfferOnboarding = (priority, { profile, skipped } = {}) => priority === 'sem_treino' && !profile && !skipped
// Cartão contextual de vínculo: A = conta do plano do personal sem ficha; B = vinculado (mensalidade própria) sem ficha;
// C = já tem ficha (o destaque do treino ativo já informa, sem cartão); D = sem vínculo
export function coachContextState({ coaches = null, hasProPlan = false, scoped = false } = {}) {
  if (hasProPlan) return 'C'
  if (scoped) return 'A'
  if (coaches?.length) return 'B'
  return 'D'
}
