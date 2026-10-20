// AVAGYM V3 — erros padronizados do motor comercial e de permissões.
// Formato: { error: <mensagem pt-BR>, code: <CÓDIGO>, ...detalhes }. O frontend decide a tela pelo `code`.
export const CODES = {
  FEATURE_NOT_INCLUDED: 403,   // recurso fora do plano
  LIMIT_REACHED: 409,          // limite do plano atingido (ex.: alunos ativos)
  SUBSCRIPTION_INACTIVE: 402,  // assinatura suspensa/cancelada/inadimplente
  PAYWALL: 402,                // V5: recurso do catalogo pago (cupom experimental ou assinatura)
  PERMISSION_DENIED: 403       // papel/estado não permite a ação
}
export function fail(json, res, code, error, extra) {
  return json(res, CODES[code] || 400, { error, code, ...(extra || {}) })
}
