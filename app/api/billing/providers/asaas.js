// Provedor Asaas (https://docs.asaas.com). Padrao = SANDBOX. Producao so com ASAAS_ENV=producao E chave de producao
// ($aact_prod_...). Chave de sandbox ($aact_hmlg_...) apontando para producao (ou o contrario) e recusada na partida.
// As renovacoes sao agendadas pelo AVAGYM (job de cobranca): cada periodo vira um POST /v3/payments com o token do
// cartao e externalReference = id da nossa cobranca (permite reconciliar sem cobrar duas vezes).
export const ASAAS_URLS = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' }
// Um 403 do Asaas tem causas diferentes (recurso nao liberado, chave restrita por IP, chave revogada) e cada uma
// pede uma acao diferente de quem opera. Separamos para nao anunciar "aguardando habilitacao" quando o problema e a chave.
const TOKENIZE_PATH = '/creditCard/tokenizeCreditCard'
const PERMISSAO_NEGADA = /n[aã]o (?:possui|tem) permiss[aã]o|permission/i
const ORIGEM_NEGADA = /\bIPs?\b|endere[çc]o de origem|origem n[aã]o autorizada/i
const CAUSAS_DE_CONTA = new Set(['TOKENIZATION_NOT_ENABLED', 'PROVIDER_AUTH', 'PROVIDER_IP_BLOCKED', 'PROVIDER_FORBIDDEN'])
export function asaasConfig(env = process.env) {
  const mode = env.ASAAS_ENV === 'producao' ? 'producao' : 'sandbox'
  const key = env.ASAAS_API_KEY || ''
  const problems = []
  if (!key) problems.push('ASAAS_API_KEY ausente')
  if (mode === 'producao' && key && !key.startsWith('$aact_prod_')) problems.push('ASAAS_ENV=producao exige chave de producao ($aact_prod_...)')
  if (mode === 'sandbox' && key.startsWith('$aact_prod_')) problems.push('chave de PRODUCAO com ASAAS_ENV diferente de producao: recusada para evitar cobranca real')
  if (mode === 'sandbox' && key && !key.startsWith('$aact_hmlg_')) problems.push('ASAAS_API_KEY deve usar o prefixo de sandbox ($aact_hmlg_...)')
  const webhook = env.ASAAS_WEBHOOK_TOKEN || ''
  if (!webhook) problems.push('ASAAS_WEBHOOK_TOKEN ausente')
  else if (webhook.length < 32 || webhook.length > 255 || /\s/.test(webhook)) problems.push('ASAAS_WEBHOOK_TOKEN deve ter entre 32 e 255 caracteres e não conter espaços')
  else if (webhook === key) problems.push('ASAAS_WEBHOOK_TOKEN não pode ser igual à ASAAS_API_KEY')
  return { mode, key, baseUrl: ASAAS_URLS[mode], problems, live: mode === 'producao' }
}
const brl = c => Math.round(c) / 100
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)   // data de vencimento em horario de Brasilia
export function asaas({ env = process.env, fetchImpl = fetch } = {}) {
  const cfg = asaasConfig(env)
  async function call(method, path, body) {
    let r
    try {
      r = await fetchImpl(cfg.baseUrl + path, { method, signal: AbortSignal.timeout(20000),
        headers: { access_token: cfg.key, 'Content-Type': 'application/json', 'User-Agent': 'AVAGYM/5.0' }, body: body ? JSON.stringify(body) : undefined })
    } catch (e) { const x = new Error('Asaas indisponivel'); x.code = 'PROVIDER_UNAVAILABLE'; x.inconclusive = true; throw x }
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const er = data?.errors?.[0] || {}, description = er.description || ('Asaas HTTP ' + r.status)
      console.error('[asaas]', method, path, r.status, er.code || 's/codigo', description)   // nunca a chave, o token ou dados do cartao
      let code = er.code || 'PROVIDER_ERROR', message = description
      if (r.status === 401 || /invalid_access_token|unauthorized/i.test(code)) { code = 'PROVIDER_AUTH'; message = 'A credencial do Asaas não foi aceita.' }
      else if (r.status === 403 && ORIGEM_NEGADA.test(description)) { code = 'PROVIDER_IP_BLOCKED'; message = 'O Asaas recusou a origem desta requisição.' }
      else if (path === TOKENIZE_PATH && PERMISSAO_NEGADA.test(description)) { code = 'TOKENIZATION_NOT_ENABLED'; message = 'A tokenização de cartão ainda não está habilitada nesta conta Asaas.' }
      else if (r.status === 403) { code = 'PROVIDER_FORBIDDEN'; message = 'O Asaas negou o acesso a este recurso.' }
      const x = new Error(message)
      x.status = r.status; x.code = code; x.inconclusive = r.status >= 500; throw x
    }
    return data
  }
  return {
    name: 'asaas', test: !cfg.live, live: cfg.live, mode: cfg.mode, label: cfg.live ? 'Asaas (producao)' : 'Asaas Sandbox (teste)', config: cfg,
    async ensureCustomer(user, holder) {
      const c = await call('POST', '/customers', { name: holder?.name || user.name, email: user.email, cpfCnpj: holder?.cpfCnpj, externalReference: user.id, notificationDisabled: true })
      return c.id
    },
    async tokenize({ customerId, card, holder, remoteIp }) {
      const [mm, yy] = [String(card.expMonth).padStart(2, '0'), String(card.expYear).length === 2 ? '20' + card.expYear : String(card.expYear)]
      try {
        const r = await call('POST', TOKENIZE_PATH, { customer: customerId, remoteIp,
          creditCard: { holderName: card.holderName, number: String(card.number).replace(/\D/g, ''), expiryMonth: mm, expiryYear: yy, ccv: card.cvv },
          creditCardHolderInfo: { name: holder.name, email: holder.email, cpfCnpj: holder.cpfCnpj, postalCode: holder.postalCode, addressNumber: holder.addressNumber, phone: holder.phone } })
        return { token: r.creditCardToken, brand: r.creditCardBrand, last4: r.creditCardNumber }
      } catch (e) { if (!e.inconclusive && !CAUSAS_DE_CONTA.has(e.code)) e.code = 'CARD_INVALID'; throw e }
    },
    async charge({ token, customerId, amountCents, charge, split, remoteIp }) {
      try {
        const p = await call('POST', '/payments', { customer: customerId, billingType: 'CREDIT_CARD', value: brl(amountCents), dueDate: today(),
          description: 'AVAGYM - ' + (charge.description || 'assinatura'), externalReference: charge.id, creditCardToken: token, remoteIp,
          ...(split?.length ? { split } : {}) })
        // Mesmo se a resposta síncrona vier como confirmada, só o webhook autenticado libera o plano.
        return { status: 'pendente', providerChargeId: p.id }
      } catch (e) {
        if (e.inconclusive) return { status: 'pendente', providerChargeId: null, inconclusive: true }
        return { status: 'recusada', providerChargeId: null, failure: { code: e.code, message: e.message } }
      }
    },
    // reconciliacao: consulta pela nossa referencia (evita cobranca duplicada depois de timeout)
    async getCharge(charge) {
      const p = charge.provider_charge_id ? await call('GET', '/payments/' + encodeURIComponent(charge.provider_charge_id))
        : (await call('GET', '/payments?externalReference=' + encodeURIComponent(charge.id))).data?.[0]
      if (!p) return null
      const map = { CONFIRMED: 'paga', RECEIVED: 'paga', RECEIVED_IN_CASH: 'paga', REFUNDED: 'estornada', REFUND_REQUESTED: 'estornada', CHARGEBACK_REQUESTED: 'estornada', OVERDUE: 'recusada', PENDING: 'pendente', AWAITING_RISK_ANALYSIS: 'pendente' }
      return { status: map[p.status] || 'pendente', providerChargeId: p.id }
    },
    // diagnostico somente leitura para o painel admin: mostra se a conta responde e se a fila de webhook
    // esta interrompida. Nunca devolve a chave, o ASAAS_WEBHOOK_TOKEN nem o authToken cadastrado no Asaas.
    async diagnostics() {
      const out = { mode: cfg.mode, account: null, webhooks: [], errors: [] }
      try { out.account = await call('GET', '/myAccount/status') } catch (e) { out.errors.push({ step: 'conta', code: e.code, message: e.message }) }
      try {
        const r = await call('GET', '/webhooks')
        out.webhooks = (r.data || []).map(w => ({ id: w.id, name: w.name || null, url: w.url, enabled: !!w.enabled, interrupted: !!w.interrupted,
          send_type: w.sendType || null, events: w.events || [], auth_token_set: !!w.authToken,
          auth_token_matches: w.authToken == null ? null : String(w.authToken) === String(env.ASAAS_WEBHOOK_TOKEN || '') }))
      } catch (e) { out.errors.push({ step: 'webhooks', code: e.code, message: e.message }) }
      return out
    },
    async refund(charge) { await call('POST', `/payments/${encodeURIComponent(charge.provider_charge_id)}/refund`, {}); return { ok: true } },
    async cancelCharge(charge) { if (charge.provider_charge_id) await call('DELETE', `/payments/${encodeURIComponent(charge.provider_charge_id)}`); return { ok: true } }
  }
}
