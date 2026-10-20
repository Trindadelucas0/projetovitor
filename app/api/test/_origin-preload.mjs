// Testes de API: o servidor exige Origin em escrita sem token Bearer (CSRF, regra de producao). Node fetch nao manda
// Origin como um navegador; este preload adiciona a Origin da API de teste quando a chamada nao define uma.
// Uso: node --import ./test/_origin-preload.mjs ...  (ou NODE_OPTIONS=--import=<caminho absoluto>)
const ORIGIN = process.env.WEB_ORIGIN || process.env.TEST_ORIGIN || 'http://localhost:4459'
const orig = globalThis.fetch
globalThis.fetch = (input, init = {}) => {
  const method = String(init.method || (input && input.method) || 'GET').toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method) || init.noOrigin) return orig(input, init)
  const h = new Headers(init.headers || {})
  if (!h.has('origin') && !h.has('referer') && !h.has('authorization')) h.set('origin', ORIGIN)
  return orig(input, { ...init, headers: h })
}