// Diagnostico somente-leitura da integracao Asaas: config local, IP de saida, validade da chave,
// estado da fila de webhook e se a tokenizacao de cartao esta liberada na conta.
// A saida NUNCA contem a ASAAS_API_KEY, o ASAAS_WEBHOOK_TOKEN nem o authToken do webhook,
// entao pode ser colada em chamado (docs/sistema/21-asaas-ambientes.md -> "Diagnostico seguro").
// Uso: node scripts/diagnostico-asaas.mjs [--sonda-tokenizacao] [--sem-banco]
//      --sonda-tokenizacao faz UMA chamada POST de tokenizacao com cartao invalido de proposito
//      (nao cria cobranca nem cliente) so para saber se a conta tem o recurso liberado.
import '../env.js'
import { asaasConfig, ASAAS_URLS } from '../billing/providers/asaas.js'

const args = process.argv.slice(2)
const sonda = args.includes('--sonda-tokenizacao')
const semBanco = args.includes('--sem-banco')
const causas = []
const titulo = t => console.log('\n=== ' + t + ' ===')
const linha = (k, v) => console.log('  ' + String(k).padEnd(24) + ' ' + v)

const cfg = asaasConfig()
const prefixo = !cfg.key ? 'ausente'
  : cfg.key.startsWith('$aact_prod_') ? '$aact_prod_... (producao)'
  : cfg.key.startsWith('$aact_hmlg_') ? '$aact_hmlg_... (sandbox)' : 'prefixo desconhecido'

async function call(method, path, body) {
  let r
  try {
    r = await fetch(ASAAS_URLS[cfg.mode] + path, { method, signal: AbortSignal.timeout(20000),
      headers: { access_token: cfg.key, 'Content-Type': 'application/json', 'User-Agent': 'AVAGYM/5.0' },
      body: body ? JSON.stringify(body) : undefined })
  } catch (e) { return { rede: e.name === 'TimeoutError' ? 'timeout (20s)' : e.message } }
  const data = await r.json().catch(() => ({}))
  return { status: r.status, ok: r.ok, data, err: data?.errors?.[0] || null }
}
const descreve = r => r.rede ? 'falha de rede: ' + r.rede
  : 'HTTP ' + r.status + (r.err ? ' | ' + (r.err.code || 's/codigo') + ': ' + (r.err.description || '') : r.ok ? ' ok' : '')

// ---------- 1. configuracao local ----------
titulo('1. Configuracao local (app/api/.env)')
linha('BILLING_PROVIDER', process.env.BILLING_PROVIDER || '(vazio)')
linha('ASAAS_ENV', (process.env.ASAAS_ENV || '(vazio)') + ' -> modo ' + cfg.mode)
linha('ASAAS_API_KEY', prefixo)
linha('ASAAS_WEBHOOK_TOKEN', process.env.ASAAS_WEBHOOK_TOKEN ? String(process.env.ASAAS_WEBHOOK_TOKEN).length + ' caracteres' : 'ausente')
linha('base da API', ASAAS_URLS[cfg.mode])
if (cfg.problems.length) {
  cfg.problems.forEach(p => linha('PROBLEMA', p))
  causas.push('A configuracao local e invalida: ' + cfg.problems.join('; ') + '. A API nao sobe assim.')
} else linha('validacao de partida', 'sem problemas')
if ((process.env.BILLING_PROVIDER || '') !== 'asaas') causas.push('BILLING_PROVIDER nao e "asaas": o sistema esta no simulador e nao chama o Asaas.')
const conclui = () => {
  titulo('CAUSA PROVAVEL')
  if (!causas.length) console.log('  Nada fora do lugar nas verificacoes acima.')
  else causas.forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c))
  console.log('')
}
if (!cfg.key) { console.log('\nSem ASAAS_API_KEY nao da para consultar o Asaas.'); conclui(); process.exit(0) }

// ---------- 2. IP de saida ----------
titulo('2. IP de saida deste servidor')
let ip = null
try { ip = (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) }).then(r => r.text())).trim() } catch { ip = null }
linha('IP publico', ip || 'nao foi possivel descobrir')
console.log('  (se a chave de API tiver restricao de IP no painel Asaas, este IP precisa estar liberado)')

// ---------- 3. a chave funciona? ----------
titulo('3. A chave de API e aceita?')
const conta = await call('GET', '/myAccount/status')
linha('GET /myAccount/status', descreve(conta))
if (conta.ok) for (const [k, v] of Object.entries(conta.data || {})) linha('  ' + k, typeof v === 'object' ? JSON.stringify(v) : String(v))
const saldo = await call('GET', '/finance/balance')
linha('GET /finance/balance', descreve(saldo))
if ([conta, saldo].some(r => r.status === 401)) causas.push('O Asaas respondeu 401: a chave no .env esta invalida ou foi revogada. Confira a chave no painel e reinicie com --update-env.')
if ([conta, saldo].some(r => r.status === 403)) causas.push('O Asaas respondeu 403 numa consulta basica: a chave existe mas o acesso foi negado (restricao de IP' + (ip ? ' — libere ' + ip : '') + ' ou permissao da conta).')

// ---------- 4. webhooks ----------
titulo('4. Webhooks cadastrados no Asaas')
const wh = await call('GET', '/webhooks')
linha('GET /webhooks', descreve(wh))
const lista = wh.data?.data || []
if (wh.ok && !lista.length) causas.push('Nenhum webhook cadastrado na conta Asaas: nenhuma confirmacao de pagamento chega ao ORNY.')
for (const w of lista) {
  console.log('  ---')
  linha('id', w.id)
  linha('nome', w.name || '(sem nome)')
  linha('url', w.url)
  linha('enabled', String(w.enabled))
  linha('interrupted', String(w.interrupted))
  linha('sendType', w.sendType || '(nao informado)')
  linha('eventos', (w.events || []).join(', ') || '(nenhum)')
  const tk = w.authToken
  linha('authToken', tk == null ? 'nao devolvido pela API' : tk ? 'definido (' + String(tk).length + ' caracteres)' : 'vazio')
  if (tk != null && process.env.ASAAS_WEBHOOK_TOKEN) linha('confere com o .env', String(tk) === String(process.env.ASAAS_WEBHOOK_TOKEN) ? 'SIM' : 'NAO')
  if (w.interrupted) causas.push('O webhook "' + (w.name || w.id) + '" esta INTERROMPIDO no Asaas. Reative em Integracoes -> Webhooks depois de corrigir a causa; os eventos da fila sao reenviados.')
  if (tk != null && process.env.ASAAS_WEBHOOK_TOKEN && String(tk) !== String(process.env.ASAAS_WEBHOOK_TOKEN))
    causas.push('O token do webhook cadastrado no Asaas e diferente do ASAAS_WEBHOOK_TOKEN do .env: o ORNY responde 401 e o Asaas pausa a fila.')
  if (tk === '') causas.push('O webhook esta sem token de autenticacao no Asaas: o ORNY responde 401 em toda entrega.')
  if (!/\/api\/billing\/webhook\/asaas$/.test(String(w.url || ''))) causas.push('A URL do webhook "' + (w.name || w.id) + '" nao termina em /api/billing/webhook/asaas.')
}

// ---------- 5. tokenizacao de cartao ----------
titulo('5. Tokenizacao de cartao liberada na conta?')
if (!sonda) console.log('  pulado — rode de novo com --sonda-tokenizacao para testar (nao cria cobranca)')
else {
  const cli = await call('GET', '/customers?limit=1')
  linha('GET /customers?limit=1', descreve(cli))
  const cus = cli.data?.data?.[0]?.id
  if (!cus) console.log('  nenhum cliente na conta: a sonda precisa de um customer existente. Pulado.')
  else {
    linha('customer usado', cus)
    // cartao invalido de proposito: se a conta tiver o recurso, o Asaas reclama do cartao;
    // se nao tiver, responde negando a permissao antes de validar qualquer coisa.
    const r = await call('POST', '/creditCard/tokenizeCreditCard', {
      customer: cus, remoteIp: ip || '127.0.0.1',
      creditCard: { holderName: 'DIAGNOSTICO ORNY', number: '0000000000000000', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      creditCardHolderInfo: { name: 'Diagnostico ORNY', email: 'diagnostico@ornygym.com.br', cpfCnpj: '11144477735', postalCode: '01001000', addressNumber: '1', phone: '1130000000' }
    })
    linha('POST tokenizeCreditCard', descreve(r))
    const desc = r.err?.description || ''
    if (r.status === 403 || /n[aã]o (?:possui|tem) permiss[aã]o|permission/i.test(desc))
      causas.push('CONFIRMADO: a tokenizacao de cartao NAO esta liberada nesta conta Asaas. Abra chamado no suporte/comercial do Asaas pedindo a habilitacao da tokenizacao de cartao em producao (passo 3 do runbook).')
    else if (r.status === 401)
      causas.push('A tokenizacao respondeu 401: o problema e a chave de API, nao a habilitacao do recurso.')
    else console.log('  -> o Asaas chegou a validar o cartao: a tokenizacao esta LIBERADA e a mensagem do checkout tem outra causa.')
  }
}

// ---------- 6. eventos ja recebidos ----------
titulo('6. Ultimos eventos de webhook registrados no ORNY')
if (semBanco) console.log('  pulado (--sem-banco)')
else {
  try {
    const { q, pool } = await import('../db/pool.js')
    const ev = (await q(`select provider, event_type, result, error, received_at, processed_at
      from billing_webhook_events order by received_at desc limit 10`)).rows
    if (!ev.length) { console.log('  nenhum evento registrado'); causas.push('O ORNY nunca registrou um evento de webhook: nenhuma entrega passou da autenticacao.') }
    for (const e of ev) linha(new Date(e.received_at).toISOString(), [e.provider, e.event_type, e.result || '-', e.processed_at ? 'processado' : 'NAO processado', e.error || ''].join(' | '))
    if (ev.length && !ev.some(e => e.provider === 'asaas')) causas.push('So existem eventos do simulador: nenhuma entrega real do Asaas foi aceita ate agora.')
    await pool.end()
  } catch (e) { console.log('  nao foi possivel consultar o banco: ' + e.message) }
}

// ---------- 7. conclusao ----------
conclui()
