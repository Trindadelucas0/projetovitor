const BASE_URL = 'https://api.checkout.infinitepay.io'
const CHECKOUT_HOSTS = new Set(['checkout.infinitepay.com.br', 'checkout.infinitepay.io'])

export function validCheckoutUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' && CHECKOUT_HOSTS.has(url.hostname) ? url.href : null
  } catch { return null }
}

const cleanOrigin = value => {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('ORIGIN da InfinitePay deve usar HTTPS')
  return url.origin
}

export function infinitePayConfig(env = process.env) {
  const apiKey = String(env.INFINITEPAY_API_KEY || '').trim()
  const handle = String(env.INFINITEPAY_HANDLE || '').trim().replace(/^\$/, '')
  const problems = []
  if (!apiKey) problems.push('INFINITEPAY_API_KEY ausente')
  if (!handle) problems.push('INFINITEPAY_HANDLE ausente')
  let origin = ''
  try { origin = cleanOrigin(env.ORIGIN) } catch { problems.push('ORIGIN pública HTTPS inválida') }
  return { apiKey, handle, origin, problems }
}

export function infinitepay({ env = process.env, fetchImpl = fetch } = {}) {
  const cfg = infinitePayConfig(env)
  async function call(path, body) {
    let response
    try {
      response = await fetchImpl(BASE_URL + path, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'X-Api-Key': cfg.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'AVAGYM/1.8' },
        body: JSON.stringify(body)
      })
    } catch {
      const error = new Error('InfinitePay indisponível')
      error.code = 'PROVIDER_UNAVAILABLE'; error.inconclusive = true
      throw error
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error('[infinitepay]', path, response.status, String(data?.message || data?.error || 'erro do provedor').slice(0, 200))
      const error = new Error(response.status === 401 || response.status === 403 ? 'A credencial da InfinitePay não foi aceita.' : 'A InfinitePay recusou a operação.')
      error.code = response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_ERROR'
      error.status = response.status; error.inconclusive = response.status >= 500
      throw error
    }
    return data
  }
  return {
    name: 'infinitepay', test: false, live: true, hostedCheckout: true, label: 'InfinitePay', config: cfg,
    async createCheckout({ charge, amountCents, description, customer, validUntil }) {
      const data = await call('/links', {
        order_nsu: charge.id,
        redirect_url: `${cfg.origin}/?payment_return=infinitepay#/assinatura`,
        items: [{ quantity: 1, price: amountCents, description: String(description || 'Assinatura ORNY').slice(0, 120) }],
        customer: { name: String(customer.name || '').slice(0, 100), email: String(customer.email || '').slice(0, 160), phone_number: customer.phone || undefined },
        options: { single_payment: true, valid_until: validUntil.toISOString(), payment_methods_enabled: ['credit_card', 'pix'] },
        webhook: { url: `${cfg.origin}/api/billing/webhook/infinitepay`, events: ['paid', 'refunded', 'canceled', 'payment_failed'] }
      })
      const checkoutUrl = validCheckoutUrl(data.url)
      if (!checkoutUrl) {
        const error = new Error('A InfinitePay não devolveu uma URL de checkout válida.')
        error.code = 'PROVIDER_INVALID_RESPONSE'; throw error
      }
      return { status: 'pendente', checkoutUrl, expiresAt: validUntil }
    },
    async checkPayment({ charge, transactionNsu, slug }) {
      if (!transactionNsu || !slug) return null
      const data = await call('/payment_check', { handle: cfg.handle, order_nsu: charge.id, transaction_nsu: transactionNsu, slug })
      const amount = Number(data.amount)
      const paidAmount = Number(data.paid_amount)
      if (data.paid && (!Number.isInteger(amount) || amount !== charge.amount_cents || !Number.isFinite(paidAmount) || paidAmount < charge.amount_cents)) {
        return { status: 'pendente', mismatch: 'VALUE_MISMATCH', checkedAmountCents: amount, paidAmountCents: paidAmount }
      }
      return {
        status: data.paid ? 'paga' : 'pendente', providerChargeId: String(transactionNsu), transactionNsu: String(transactionNsu), invoiceSlug: String(slug),
        paymentMethod: data.capture_method === 'pix' ? 'pix' : data.capture_method === 'credit_card' ? 'card' : null,
        checkedAmountCents: Number.isInteger(amount) ? amount : null, paidAmountCents: Number.isFinite(paidAmount) ? paidAmount : null
      }
    },
    async getCharge(charge) {
      if (!charge.provider_transaction_id || !charge.provider_invoice_slug) return null
      return this.checkPayment({ charge, transactionNsu: charge.provider_transaction_id, slug: charge.provider_invoice_slug })
    }
  }
}
