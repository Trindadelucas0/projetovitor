// Somente testes: simula a API externa da InfinitePay dentro do processo da API isolada.
// Requisições para qualquer outro host continuam usando o fetch original.
const realFetch = globalThis.fetch

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  if (url.origin !== 'https://api.checkout.infinitepay.io') return realFetch(input, init)
  const body = JSON.parse(String(init.body || '{}'))
  if (url.pathname === '/links') {
    return new Response(JSON.stringify({ url: `https://checkout.infinitepay.io/teste?lenc=${body.order_nsu}` }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
  }
  if (url.pathname === '/payment_check') {
    const mismatch = String(body.transaction_nsu).includes('valor-divergente')
    return new Response(JSON.stringify({ paid: true, amount: mismatch ? 1 : 1290, paid_amount: mismatch ? 1 : 1290, capture_method: 'pix' }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
  }
  return new Response(JSON.stringify({ error: 'rota simulada desconhecida' }), { status: 404, headers: { 'content-type': 'application/json' } })
}
