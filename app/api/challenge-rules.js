// Regras puras dos desafios: transições de estado, validação do assistente, avanço por tempo (America/Sao_Paulo).
export const CH_STATES = ['rascunho', 'publicado', 'inscricoes_abertas', 'agendado', 'em_andamento', 'apurando', 'concluido', 'cancelado', 'suspenso']
// transições permitidas (suspenso volta ao estado anterior só pelo admin; ver restore)
export const CH_FLOW = {
  rascunho: ['publicado', 'cancelado'],
  publicado: ['inscricoes_abertas', 'agendado', 'em_andamento', 'cancelado', 'suspenso'],
  inscricoes_abertas: ['agendado', 'em_andamento', 'cancelado', 'suspenso'],
  agendado: ['em_andamento', 'cancelado', 'suspenso'],
  em_andamento: ['apurando', 'cancelado', 'suspenso'],
  apurando: ['concluido', 'suspenso'],
  concluido: [], cancelado: [], suspenso: []
}
export const MEM_FLOW = {
  convidado: ['ativo', 'aprovado', 'rejeitado'], solicitado: ['aprovado', 'rejeitado'], aprovado: ['ativo', 'saiu', 'removido', 'desclassificado'],
  ativo: ['saiu', 'removido', 'desclassificado'], rejeitado: ['solicitado'], saiu: ['solicitado', 'ativo'], removido: [], desclassificado: []
}
export const canMove = (from, to) => (CH_FLOW[from] || []).includes(to)
export const canMoveMember = (from, to) => from == null ? ['convidado', 'solicitado', 'ativo', 'aprovado'].includes(to) : (MEM_FLOW[from] || []).includes(to)
export const TYPES = ['meta_individual', 'meta_coletiva', 'competicao_individual', 'competicao_equipes']
export const METRICS = ['sessoes', 'dias_distintos', 'consistencia', 'semanas_meta', 'soma_coletiva']
export const DURATIONS = [7, 15, 30, 90]
const DAY = 86400e3
// data local de São Paulo (UTC-3, sem horário de verão) -> instante UTC
export const spMidnight = ymd => new Date(ymd + 'T00:00:00-03:00')
// fim INCLUSIVO: o desafio vai até 23:59:59 (Brasília) do dia final
export const spEndOfDay = ymd => new Date(ymd + 'T23:59:59.999-03:00')
export const CAT_LIMITS = { min: 1, max: 365 }
export function wizardProblems(b, cat, now = Date.now()) {
  const p = []
  if (String(b.name || '').trim().length < 3) p.push('Dê um nome ao desafio (mínimo 3 letras)')
  if (!cat) p.push('Escolha uma categoria')
  if (!TYPES.includes(b.type)) p.push('Escolha o tipo do desafio')
  if (!METRICS.includes(b.metric)) p.push('Escolha a métrica')
  if (b.metric === 'soma_coletiva' && b.type !== 'meta_coletiva') p.push('Soma coletiva só vale para meta coletiva')
  if (b.type === 'meta_coletiva' && b.metric !== 'soma_coletiva') p.push('Meta coletiva usa a soma coletiva')
  if (['meta_individual', 'meta_coletiva'].includes(b.type) && !(+b.goal > 0)) p.push('Informe a meta')
  if (b.metric === 'consistencia' && !(+b.planned_sessions > 0)) p.push('Informe quantas sessões estão previstas para calcular a consistência')
  if (b.metric === 'semanas_meta' && !(+b.weekly_goal >= 1 && +b.weekly_goal <= 7)) p.push('Meta semanal entre 1 e 7 treinos')
  if (+b.weekly_goal > 7 || +b.goal > 0 && b.metric === 'dias_distintos' && +b.goal > 366) p.push('Meta acima do saudável')
  const s = new Date(b.starts_at), e = new Date(b.ends_at)
  if (isNaN(s) || isNaN(e)) p.push('Informe início e fim')
  else {
    if (e <= s) p.push('O fim precisa ser depois do início')
    const days = Math.round((e - s) / DAY)
    if (cat && (days < cat.min_days || days > cat.max_days)) p.push(`Duração entre ${cat.min_days} e ${cat.max_days} dias nesta categoria`)
    if (s < now - 5 * 60e3 && !b.allow_past) p.push('O início não pode estar no passado')
  }
  if (!['aberto', 'aprovacao', 'convite'].includes(b.audience || 'aberto')) p.push('Público inválido')
  if (b.max_participants != null && b.max_participants !== '' && !(+b.max_participants >= 2 && +b.max_participants <= 10000)) p.push('Máximo de participantes entre 2 e 10000')
  if (!['nenhuma', 'opcional', 'obrigatoria'].includes(b.proof || 'nenhuma')) p.push('Comprovação inválida')
  if ((b.proof || 'nenhuma') !== 'nenhuma' && !(b.proof_media || []).length) p.push('Escolha foto e/ou vídeo para a comprovação')
  if ((b.proof_media || []).some(m => !['foto', 'video'].includes(m))) p.push('Tipo de mídia inválido')
  if (b.type === 'competicao_equipes') {
    if ((b.teams || []).length < 2) p.push('Crie pelo menos 2 equipes')
    if (!(+b.team_min >= 1)) p.push('Informe o tamanho mínimo das equipes')
  }
  return p
}
// avanço automático pelo relógio: início congela as regras; fim leva à apuração
export function timeStatus(c, now = Date.now()) {
  const s = new Date(c.starts_at).getTime(), e = new Date(c.ends_at).getTime()
  if (['publicado', 'inscricoes_abertas', 'agendado'].includes(c.status) && now >= s) return now >= e ? 'apurando' : 'em_andamento'
  if (c.status === 'em_andamento' && now >= e) return 'apurando'
  return c.status
}
export const RULE_FIELDS = ['name', 'category', 'type', 'metric', 'goal', 'weekly_goal', 'planned_sessions', 'starts_at', 'ends_at', 'audience', 'max_participants', 'late_entry', 'proof', 'proof_media', 'manual_validation', 'team_min', 'team_max', 'tie_break']
export const rulesOf = c => Object.fromEntries(RULE_FIELDS.map(k => [k, c[k] instanceof Date ? c[k].toISOString() : c[k] ?? null]))
// comprovantes: validação manual, sem IA. Pendente nunca conta; só "aprovado" pontua.
export const PROOF_FLOW = {
  enviado: ['em_analise', 'aprovado', 'rejeitado', 'substituicao'],
  em_analise: ['aprovado', 'rejeitado', 'substituicao'],
  substituicao: ['enviado'],
  rejeitado: ['recurso'],
  recurso: ['aprovado', 'rejeitado'],
  aprovado: ['invalidado'],
  rejeitado_final: [], invalidado: []
}
export const canMoveProof = (from, to) => (PROOF_FLOW[from] || []).includes(to)
export const PROOF_COUNTS = s => s === 'aprovado'
// premiações oficiais: sem sorteio, sem dinheiro, sem entrega em resultado provisório
export const PRIZE_FLOW = {
  configurado: ['publicado', 'cancelado'],
  publicado: ['aguardando_resultado', 'aguardando_homologacao', 'cancelado'],
  aguardando_resultado: ['aguardando_homologacao', 'cancelado'],
  aguardando_homologacao: ['vencedor_homologado', 'cancelado'],
  vencedor_homologado: ['entrega_pendente', 'cancelado'],
  entrega_pendente: ['entregue', 'cancelado'],
  entregue: [], cancelado: []
}
export const canMovePrize = (from, to) => (PRIZE_FLOW[from] || []).includes(to)
const MONEY = /(r\$|\bpix\b|dinheiro|reais|\bcash\b|sorteio|rifa|aposta)/i
export const prizeProblems = b => {
  const p = []
  if (String(b.name || '').trim().length < 3) p.push('Dê um nome ao prêmio')
  if (MONEY.test(`${b.name} ${b.description || ''} ${b.rules || ''}`)) p.push('Prêmios não podem ser dinheiro nem sorteio')
  if (!(+b.quantity >= 1 && +b.quantity <= 1000)) p.push('Quantidade entre 1 e 1000')
  if (!['primeiro', 'segundo', 'terceiro', 'top3', 'meta_atingida', 'equipe_vencedora'].includes(b.criterion)) p.push('Escolha o critério')
  if (!String(b.owner || '').trim()) p.push('Informe o responsável pela entrega')
  if (!b.delivery_deadline) p.push('Informe o prazo de entrega')
  return p
}
const BAD_WORDS = /(porra|caralho|merda|puta|viado|idiota|burro|otario|fdp)/i
export const trophyNameOk = n => String(n || '').trim().length >= 3 && String(n).length <= 40 && !BAD_WORDS.test(n)
// quem ganha cada troféu, a partir do resultado final (nunca de um provisório)
export function trophyWinners(kind, result, c) {
  const rows = result.rows || [], pos = n => rows.filter(r => r.position === n && r.score > 0).map(r => r.user_id)
  if (kind === 'participacao') return rows.filter(r => r.days > 0).map(r => r.user_id)
  if (kind === 'conclusao') return result.mode === 'coletivo' ? (result.collective?.reached ? rows.filter(r => r.days > 0).map(r => r.user_id) : []) : rows.filter(r => r.goal_reached).map(r => r.user_id)
  if (['primeiro', 'segundo', 'terceiro'].includes(kind)) return ['podio', 'equipes'].includes(result.mode) ? pos({ primeiro: 1, segundo: 2, terceiro: 3 }[kind]) : []
  if (kind === 'equipe_vencedora') { const w = (result.teams || []).filter(t => t.position === 1 && t.score > 0).map(t => t.team_id); return rows.filter(r => w.includes(r.team_id) && r.days > 0).map(r => r.user_id) }
  if (kind === 'consistencia') { const plan = +c.planned_sessions || +c.goal || 0; return plan ? rows.filter(r => r.days >= Math.ceil(plan * 0.7)).map(r => r.user_id) : [] }
  return []
}
