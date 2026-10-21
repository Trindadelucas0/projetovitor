// AVAGYM - Monetizacao F3: motor central de acesso (decisoes do Lucas D1-D9, 16/10/2026).
// Acesso comercial: somente assinatura paga e confirmada, do proprio usuario ou do personal que cobre o aluno.
// Cupom, teste, cortesia, plano apenas escolhido e cobranca pendente nao liberam as areas internas.
// O acesso pago e sempre obrigatorio para aluno/profissional. O simulador nunca representa pagamento real.
// ALWAYS_ALLOWED exige acesso (negar por padrao: rota nova nasce protegida). Regras SO no backend.
import { q } from './db/pool.js'
import { resolve } from './entitlements.js'
import { welcomeResources } from './welcome-features.js'

export const PAID_STATUSES = ['ativa', 'inadimplente', 'carencia']
const db = c => c || { query: (t, p) => q(t, p) }

// D3: sem acesso ficam so login, assinatura/pagamento, perfil, configuracoes, LGPD e gestao da conta
// (+ aceitar convite de personal, que devolve o acesso pelo plano dele - D4). Os dados nunca sao apagados.
export const ALWAYS_ALLOWED = [
  /^[A-Z]+ \/api\/auth\//, /^POST \/api\/logout(\/all)?$/, /^[A-Z]+ \/api\/me$/,
  /^[A-Z]+ \/api\/me\/(avatar|contact|context|delete-request|delete-request\/cancel|export-request|theme|tours|tours\/reset|subscriptions|capacities|social|onboarding\/skip|invites|coaches|unlock-request|requests)$/,
  /^[A-Z]+ \/api\/billing\//, /^GET \/api\/plans?$/, /^GET \/api\/public\//, /^[A-Z]+ \/api\/terms(\/accept)?$/, /^[A-Z]+ \/api\/legal\//,
  /^[A-Z]+ \/api\/(config|health|cep|activity)$/, /^GET \/api\/media(\/pub|\/private)?$/, /^[A-Z]+ \/api\/notification-prefs$/, /^[A-Z]+ \/api\/notifications(\/read)?$/,
  /^[A-Z]+ \/api\/push\/(public-key|subscribe|unsubscribe)$/, /^[A-Z]+ \/api\/social\/(profile|handle-check)$/,
  /^[A-Z]+ \/api\/access\//, /^GET \/api\/referral\/me$/, /^[A-Z]+ \/api\/invites\/(view|accept|decline)$/, /^POST \/api\/guided\/onboarding$/,
  /^[A-Z]+ \/api\/pro\/(verification|verification\/document|profile|partner)$/, /^[A-Z]+ \/api\/verification\/document$/, /^GET \/api\/convite$/,
  // Avaliacao postural: concluir um ciclo JA consentido continua liberado mesmo se o acesso cair no meio.
  // Decisao consciente: deixar foto corporal pendurada em limbo e pior que o prejuizo comercial de um ciclo -
  // o dado pessoal sensivel ficaria no aparelho do aluno, sem chegar ao profissional nem poder ser apagado.
  // Comecar avaliacao nova continua exigindo acesso (as outras rotas do modulo nao estao aqui).
  /^POST \/api\/avaliacao-postural\/(submit|captura\/(upload|confirm))$/
]
export const isAlwaysAllowed = key => ALWAYS_ALLOWED.some(r => r.test(key))

export async function monetizationOn() { return true }
export const clearMonetizationCache = () => {}

// origens proprias de um publico (sem a origem "personal", para nao recursar)
async function ownSources(c, userId, audience) {
  const out = []
  const sub = (await c.query(`select s.id, s.plan_id, s.status, s.current_period_end, p.name plan_name from subscriptions s join plans p on p.id=s.plan_id
      where s.user_id=$1 and s.audience=$2 and s.status = any($3) and not p.is_free and s.current_period_end>now()
      and exists (select 1 from billing_charges ch where ch.subscription_id=s.id and ch.status='paga' and ch.amount_cents>0 and ch.paid_at is not null
        and ch.provider<>'simulado') order by s.started_at desc limit 1`, [userId, audience, PAID_STATUSES])).rows[0]
  if (sub) out.push({ kind: 'propria', id: sub.id, plan_id: sub.plan_id, plan_name: sub.plan_name, status: sub.status, until: sub.current_period_end })
  return out
}

// resumo de acesso por publico. has=true se existe ao menos uma origem vigente.
export async function accessOf(user, c) {
  c = db(c)
  const roles = user.roles || []
  const out = { monetized: await monetizationOn(user.tenant_id), audiences: {} }
  for (const a of ['aluno', 'profissional']) {
    if (!roles.includes(a)) continue
    const sources = await ownSources(c, user.id, a)
    if (a === 'aluno') {   // D4: aluno vinculado usa o plano do personal (vaga ja contada no aceite)
      const coaches = (await c.query(`select cs.coach_id, u.name from coach_students cs join users u on u.id=cs.coach_id where cs.student_id=$1 and cs.status='ativo'`, [user.id])).rows
      for (const k of coaches) {
        const cs = await ownSources(c, k.coach_id, 'profissional')
        if (cs.length) { sources.push({ kind: 'personal', coach_id: k.coach_id, coach_name: k.name }); break }
      }
    }
    out.audiences[a] = { has: sources.length > 0, sources, commercial_status: await commercialStatus(c, user.id, a, sources) }
  }
  out.has_any = Object.values(out.audiences).some(x => x.has)
  return out
}

// Monetizacao F6: status COMERCIAL (separado do status da conta). Deriva dos dados; nao altera a regua de cobranca.
// pendente (1a cobranca em analise) | em_teste | ativa | tolerancia (inadimplente/carencia) | vencida (teste ou assinatura acabou sem pagamento)
// | cancelada | suspensa (administrativa) | patrocinada (pelo personal) | sem_assinatura
export async function commercialStatus(c, userId, audience, sources) {
  const s = (await c.query(`select s.status, s.suspended_kind, p.is_free from subscriptions s join plans p on p.id=s.plan_id where s.user_id=$1 and s.audience=$2 order by (s.status<>'cancelada') desc, s.started_at desc limit 1`, [userId, audience])).rows[0]
  if (s && s.status === 'suspensa' && s.suspended_kind !== 'financeiro') return 'suspensa'
  const pend = (await c.query(`select 1 from billing_charges ch join subscriptions s on s.id=ch.subscription_id where s.user_id=$1 and s.audience=$2 and ch.status='pendente' and ch.meta ? 'activate_plan' limit 1`, [userId, audience])).rowCount
  if (pend) return 'pendente'
  if (sources.some(x => x.kind === 'propria') && s && !s.is_free && s.status === 'ativa') return 'ativa'
  if (sources.some(x => x.kind === 'propria') && s && !s.is_free && ['inadimplente', 'carencia'].includes(s.status)) return 'tolerancia'
  if (sources.some(x => x.kind === 'personal')) return 'patrocinada'
  if (s && !s.is_free && s.status === 'suspensa') return 'vencida'
  if (s && !s.is_free && s.status === 'cancelada') return 'cancelada'
  if ((await c.query('select 1 from trial_grants where user_id=$1 and audience=$2', [userId, audience])).rowCount) return 'vencida'
  return 'sem_assinatura'
}

const NO_ACCESS_MSG = 'O acesso ao ORNY é liberado somente após a confirmação do pagamento. Você ainda pode acessar sua conta e a tela de assinatura para concluir ou acompanhar o pagamento.'

// middleware global (server.js), depois da autenticacao. Admin nunca e cobrado.
export async function monetizationGate(key, user, res, json) {
  if (!user || (user.roles || []).includes('admin')) return true
  const roles = user.roles || []
  if (!roles.includes('aluno') && !roles.includes('profissional')) return true
  if (isAlwaysAllowed(key)) return true
  if (!(await monetizationOn(user.tenant_id))) return true
  const acc = await accessOf(user)
  const path = key.split(' ')[1] || ''
  const ok = path.startsWith('/api/pro/') ? !!acc.audiences.profissional?.has : acc.has_any
  if (ok) return true
  json(res, 402, { error: NO_ACCESS_MSG, code: 'ACCESS_REQUIRED', audience: path.startsWith('/api/pro/') ? 'profissional' : null })
  return false
}

// Lote 7 (16/10): boas-vindas depois de assinar ou ativar o teste. Uma vez por ativacao, registrada em access_welcome.
// Chave: 'assinatura:<id>:<plano>' (troca de plano = nova ativacao) ou 'teste:<id>'. A transicao da virada (D1) e as
// concessoes do admin nao abrem a tela (a pessoa nao "ativou" nada). Vale com a monetizacao ligada ou desligada.
export async function pendingWelcome(user) {
  const acc = await accessOf(user)
  const cands = []
  for (const [audience, a] of Object.entries(acc.audiences)) for (const s of a.sources) {
    if (s.kind === 'propria') cands.push({ key: `assinatura:${s.id}:${s.plan_id}`, kind: 'assinatura', audience, plan_id: s.plan_id, plan_name: s.plan_name, until: s.until || null })
    if (s.kind === 'teste' && s.source !== 'transicao') cands.push({ key: `teste:${s.id}`, kind: 'teste', audience, plan_id: s.plan_id, plan_name: s.plan_name, until: s.until })
  }
  if (!cands.length) return null
  const seen = new Set((await q('select activation_key from access_welcome where user_id=$1 and tenant_id=$3 and activation_key = any($2)', [user.id, cands.map(c => c.key), user.tenant_id])).rows.map(r => r.activation_key))
  const pending = cands.find(c => !seen.has(c.key))
  if (!pending) return null
  const e = await resolve(user.id, pending.audience)
  const scoped = user.account_type === 'personal_client' && !user.own_student_access
  const resources = welcomeResources(pending.audience, e?.active ? e.features : {}, scoped, true)
  return { ...pending, resources }
}

// GET /api/access/me: resumo do acesso comercial para a tela de assinatura.
const readJson = req => new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 4096) req.destroy() }); req.on('end', () => { try { r(JSON.parse(d || '{}')) } catch { r({}) } }); req.on('error', () => r({})) })
export function accessRoutes({ json, requireAuth, readBody }) {
  return {
    'GET /api/access/welcome': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      try { json(res, 200, { welcome: await pendingWelcome(u) }) }
      catch (e) {
        if (e.code !== '42P01' || !e.message.includes('access_welcome')) throw e
        json(res, 503, { error: 'As boas-vindas aguardam atualização do sistema.', code: 'WELCOME_SCHEMA_PENDING' })
      }
    },
    // registra que a tela foi mostrada (chamado ao abrir). So aceita a ativacao pendente da propria pessoa.
    'POST /api/access/welcome/seen': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await (readBody ? readBody(req).catch(() => ({})) : readJson(req))
      if (typeof b?.key !== 'string' || !b.key || b.key.length > 200) return json(res, 400, { error: 'Ativação inválida.', code: 'INVALID_INPUT' })
      const seen = await q('select 1 from access_welcome where user_id=$1 and tenant_id=$2 and activation_key=$3', [u.id, u.tenant_id, b.key])
      if (seen.rowCount) return json(res, 200, { ok: true })
      const w = await pendingWelcome(u)
      if (!w || w.key !== String(b.key || '')) return json(res, 409, { error: 'Nenhuma boas-vindas pendente com essa chave.', code: 'NOT_PENDING' })
      await q(`insert into access_welcome(tenant_id,user_id,activation_key,kind,plan_id) values($1,$2,$3,$4,$5) on conflict (user_id, activation_key) do nothing`, [u.tenant_id, u.id, w.key, w.kind, w.plan_id])
      json(res, 200, { ok: true })
    },
    'GET /api/access/me': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const acc = await accessOf(u)
      json(res, 200, acc)
    }
  }
}
