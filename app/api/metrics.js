// AVAGYM V4 — regra única de "sessão conta nas métricas" (ranking, desafios, prêmios, progresso, KPIs).
// Decisão do Lucas: sessão com tempo corrigido manualmente fica fora de TODAS as métricas.
// Descartadas/interrompidas já ficam fora (status <> 'done'); anuladas (voided_at) também.
// Histórico legado importado (origin='legado') fica fora: não é auditável (ver FASE-02.md, dúvida D2-1).
export const countsInMetrics = (a = 's') =>
  `${a}.status='done' and ${a}.voided_at is null and ${a}.time_corrected_at is null and coalesce(${a}.origin,'') <> 'legado'`
