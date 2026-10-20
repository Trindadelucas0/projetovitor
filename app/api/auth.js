// Autenticação email+senha (bcrypt) com JWT (cookie httpOnly "avagym_token" ou Authorization: Bearer)
// + middlewares requireAuth / requireRole / escopo por tenant + rotas de catálogo (músculos, exercícios, programas).
import { attachByProCode, autoUnlockForTests } from './accounts-v42.js'
import './env.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { q, transaction } from './db/pool.js'
import { allowPasswordEmail, queuePasswordLink, tokenHash, invalidatePasswordLinks } from './password-email.js'
import { currentTerms, acceptTerms, termsStatus } from './lgpd.js'
import { parseContact, saveContact, contactOf, contactComplete } from './contact.js'
import { acceptAtSignup } from './legal.js'   // aceite no cadastro (mesma transacao)

const SECRET = process.env.JWT_SECRET
if (!SECRET || SECRET.length < 32) console.warn('[auth] JWT_SECRET ausente ou curto — defina em app/api/.env')
const TTL_H = +(process.env.JWT_TTL_HOURS || 168)
const SECURE = /^https:/i.test(process.env.ORIGIN || '') ? ' Secure;' : ''
const COOKIE = 'avagym_token'
export const tokenCookie = tok => `${COOKIE}=${tok}; Path=/; Max-Age=${TTL_H * 3600}; HttpOnly;${SECURE} SameSite=Lax`
export const clearTokenCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly;${SECURE} SameSite=Lax`
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function readToken(req) {
  const h = req.headers.authorization || ''
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim()
  const m = /(?:^|;\s*)avagym_token=([^;]+)/.exec(req.headers.cookie || '')
  return m ? m[1] : null
}
// Resolve o usuário do JWT (ou null). Confere no banco se continua ativo.
export async function authUser(req) {
  const tok = readToken(req); if (!tok || !SECRET) return null
  let p; try { p = jwt.verify(tok, SECRET) } catch { return null }
  const u = await loadUser(p.sub)
  // V4 F7: "sair de todos os dispositivos" / troca de senha sobem token_version; tokens antigos param de valer
  if (u && (p.tv || 0) !== (u.token_version || 0)) return null
  // BUG-033: logout revoga o token (jti) no banco; token antigo passa a dar 401
  if (u && p.jti && (await q('select 1 from revoked_tokens where jti=$1', [String(p.jti)])).rowCount) return null
  return u
}
// revoga o token desta requisicao. Token sem jti (emitido antes da 050) sobe token_version (encerra as sessoes antigas)
export async function revokeRequestToken(req) {
  const tok = readToken(req); if (!tok || !SECRET) return
  let p; try { p = jwt.verify(tok, SECRET) } catch { return }
  if (p.jti) await q('insert into revoked_tokens(jti,user_id,expires_at) values($1,$2,to_timestamp($3)) on conflict do nothing', [String(p.jti), p.sub, p.exp || Math.floor(Date.now() / 1000) + TTL_H * 3600])
  else await q('update users set token_version=token_version+1 where id=$1 and token_version=$2', [p.sub, p.tv || 0])
  q('delete from revoked_tokens where expires_at < now()').catch(() => {})
}
async function loadUser(id) {
  const r = await q(`select u.id,u.name,u.email,u.tenant_id,u.disabled_at,u.status,u.active_context,u.token_version,u.account_type,u.must_change_password,u.managed_by,u.access_unlocked_at,
      u.access_suspended_at,u.access_suspension_reason,
      exists(select 1 from subscriptions s join plans p on p.id=s.plan_id where s.user_id=u.id and s.audience='aluno' and not p.is_free and s.status in ('ativa','trial','inadimplente','carencia'))
        or exists(select 1 from trial_grants g where g.user_id=u.id and g.audience='aluno' and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now())
        or exists(select 1 from entitlement_grants g where g.user_id=u.id and g.audience='aluno' and g.kind='feature' and g.key='acesso' and g.revoked_at is null and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now())) own_student_access,
      exists(select 1 from subscriptions s join plans p on p.id=s.plan_id where s.user_id=u.managed_by and s.audience='profissional' and not p.is_free and s.status in ('ativa','trial','inadimplente','carencia'))
        or exists(select 1 from trial_grants g where g.user_id=u.managed_by and g.audience='profissional' and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now())
        or exists(select 1 from entitlement_grants g where g.user_id=u.managed_by and g.audience='profissional' and g.kind='feature' and g.key='acesso' and g.revoked_at is null and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now())) coach_has_access,
      (select pp.verification_status from professional_profiles pp where pp.user_id=u.id) verification,t.slug tenant_slug,t.name tenant_name,
      coalesce(array_agg(ur.role_id) filter (where ur.role_id is not null),'{}') roles
    from users u join tenants t on t.id=u.tenant_id left join user_roles ur on ur.user_id=u.id and ur.tenant_id=u.tenant_id
    where u.id=$1 group by u.id,t.slug,t.name`, [id])
  const u = r.rows[0]
  if (!u || u.disabled_at || u.status === 'bloqueado') return null
  return u
}
// Middlewares estilo "guard": retornam o usuário ou respondem 401/403 e retornam null.
// A conta nasce ativa. Acesso aos recursos depende do plano; suspensao administrativa e um controle separado.
export async function requireAuth(req, res, json, opts) {
  const u = await authUser(req)
  if (!u) { json(res, 401, { error: 'Não autenticado' }); return null }
  // V4.2: conta criada pelo personal com senha provisória — só troca de senha/termos/sair até trocar
  if (u.must_change_password && !(opts && opts.allowPending)) { json(res, 403, { error: 'Troque a senha provisória para continuar.', code: 'MUST_CHANGE_PASSWORD' }); return null }
  if (u.status !== 'ativo' && !(opts && opts.allowPending)) { json(res, 403, { pending: true, error: 'Sua conta ainda está em análise pela administração. Acompanhe a situação em Perfil; você será avisado aqui quando houver uma decisão.', code: 'ACCOUNT_NOT_ACTIVE' }); return null }
  req.user = u; req.tenantId = u.tenant_id
  return u
}
export function requireRole(...roles) {
  return async (req, res, json) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!u.roles.some(r => roles.includes(r))) { json(res, 403, { error: 'Sem permissão', code: 'PERMISSION_DENIED' }); return null }
    return u
  }
}
// Registro de auditoria (quem, o quê, quando). Nunca derruba a operação principal.
export async function audit(tenantId, actorId, action, entity, entityId, data) {
  try { await q('insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,$3,$4,$5,$6)', [tenantId, actorId, action, entity, entityId == null ? null : String(entityId), data || null]) }
  catch (e) { console.error('[audit]', e.message) }
}
// Filtro padrão para tabelas com catálogo global + dados do tenant.
export const tenantScope = (alias, idx) => `(${alias}.tenant_id is null or ${alias}.tenant_id = $${idx})`

// V3: contexto de navegação ativo (aluno | profissional | admin) — o escolhido, se a conta tiver a capacidade
export const contextOf = u => (u.active_context && u.roles.includes(u.active_context)) ? u.active_context
  : u.roles.includes('admin') ? 'admin' : u.roles.includes('aluno') ? 'aluno' : u.roles.includes('profissional') ? 'profissional' : 'aluno'
const sign = u => jwt.sign({ sub: u.id, tid: u.tenant_id, roles: u.roles, tv: u.token_version || 0, jti: crypto.randomUUID() }, SECRET, { expiresIn: TTL_H + 'h' })
export const pub = u => ({ id: u.id, name: u.name, email: u.email, roles: u.roles, admin: u.roles.includes('admin'), pro: u.roles.includes('profissional'), status: u.status,
  capacities: u.roles.filter(r => r === 'aluno' || r === 'profissional'), context: contextOf(u), verification: u.verification || null,
  tenant: { id: u.tenant_id, slug: u.tenant_slug, name: u.tenant_name },
  // Aluno coberto pelo personal fica no escopo do PRO ate adquirir acesso Individual proprio.
  account_type: u.account_type || 'normal', must_change_password: !!u.must_change_password,
  client_locked: u.account_type === 'personal_client' && !u.own_student_access,
  access_locked: !!u.access_suspended_at, access_suspended: !!u.access_suspended_at,
  access_suspension_reason: u.access_suspension_reason || null,
  coach_pending: u.account_type === 'personal_client' && !u.own_student_access && !u.coach_has_access,
  managed_by: u.managed_by || null })

export function authRoutes({ json, readBody, bridge, clearCookies }) {
  const login = async (res, id, payload = {}) => {
    const u = await loadUser(id)
    const tok = sign(u)
    const extra = bridge ? bridge(u) : []
    json(res, 200, { user: { ...pub(u), ...(await termsStatus(u.id)) }, token: tok, ...payload }, { 'Set-Cookie': [tokenCookie(tok), ...extra] })
  }

  return {
    'POST /api/auth/register': async (req, res) => {
      const b = await readBody(req)
      const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '')
      // Plano único (20/10/2026): o cadastro público cria SOMENTE aluno. Quem atende é o
      // administrador do ambiente (o personal), criado por dentro. Um 'intent' antigo
      // vindo de app em cache é ignorado de propósito: não cria papel de profissional.
      const intent = 'aluno'
      const errors = {}
      if (name.length < 2) errors.name = 'Informe seu nome'
      if (!EMAIL_RE.test(email)) errors.email = 'E-mail inválido'
      if (password.length < 8) errors.password = 'A senha deve ter pelo menos 8 caracteres'
      const terms = await currentTerms()
      // Pedido do Lucas: sem aceite dos Termos/Privacidade e sem a declaracao de 18+ o cadastro e recusado e nada e criado
      if (b.accept_terms !== true) errors.terms = 'É preciso aceitar os Termos de Uso e a Política de Privacidade'
      // BUG-027: 18+ calculado da data de nascimento (obrigatoria); menor de 18 nao cria conta
      const bd = /^\d{4}-\d{2}-\d{2}$/.test(String(b.birth_date || '')) ? new Date(b.birth_date + 'T12:00:00Z') : null
      const okDate = bd && !isNaN(bd) && bd.toISOString().slice(0, 10) === b.birth_date && bd.getUTCFullYear() >= 1900 && bd < new Date()
      if (!okDate) errors.birth_date = 'Informe uma data de nascimento válida'
      else { const n = new Date(); let age = n.getFullYear() - bd.getUTCFullYear(); const md = (n.getMonth() + 1) * 100 + n.getDate(), bm = (bd.getUTCMonth() + 1) * 100 + bd.getUTCDate(); if (md < bm) age--; if (age < 18) errors.birth_date = 'É preciso ter 18 anos ou mais para criar a conta' }
      if (terms && b.accept_terms === true && b.terms_version !== terms.version) errors.terms = 'É preciso aceitar os termos de uso (versão ' + terms.version + ')'
      // V5: contato e endereco no cadastro (a tela exige o conjunto completo; clientes antigos sem 'contact' seguem aceitos e recebem o aviso para completar)
      const ct = b.contact && typeof b.contact === 'object' ? parseContact(b.contact, { required: true }) : null
      if (ct) Object.assign(errors, ct.errors)
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      // Cadastro público só avança para uma contratação real: plano ativo, vendável e
      // compatível com o perfil. A assinatura ainda fica pendente até o provedor confirmar.
      const planId = String(b.plan_id || '').trim().slice(0, 60)
      // O catálogo de teste pode manter as vendas fechadas; fora de DB *_test só plano vendável passa.
      const testDb = /_test$/.test(process.env.DB_NAME || '')
      const signupPlan = planId && (await q(`select id from plans where id=$1 and audience=$2 and active ${testDb ? '' : 'and sellable'} and price_cents is not null and not is_free`, [planId, intent])).rows[0]
      if (!signupPlan) return json(res, 400, { error: 'Escolha um plano disponível para continuar o cadastro.', code: 'PLAN_REQUIRED', errors: { plan_id: 'Escolha um plano disponível' } })
      const t = await q('select id from tenants where slug=$1 and active', [String(b.tenant || process.env.DEFAULT_TENANT || 'avadesk')])
      if (!t.rowCount) return json(res, 400, { error: 'Academia não encontrada' })
      if ((await q('select 1 from users where lower(email)=$1', [email])).rowCount) return json(res, 409, { error: 'Este e-mail já tem conta. Quer entrar ou recuperar a senha?', code: 'EMAIL_EXISTS', errors: { email: 'Este e-mail já tem conta' } })
      const byCode = b.pro_code ? await attachByProCode(null, t.rows[0].id, b.pro_code) : null   // V4.3: cadastro com o código do personal
      if (byCode?.error) return json(res, 400, { error: byCode.error, errors: { pro_code: byCode.error } })
      const hash = await bcrypt.hash(password, 12)
      const u = await transaction(async () => {
        let u
        try { u = await q('insert into users(tenant_id,name,email,password_hash,birth_date) values($1,$2,$3,$4,$5) returning id', [t.rows[0].id, name.slice(0, 80), email, hash, b.birth_date]) }
        catch (e) { if (e.code === '23505') return null; throw e }   // corrida: o índice único decide
        await q(`insert into user_roles values($1,$2,'aluno')`, [u.rows[0].id, t.rows[0].id])
        if (ct) await saveContact(u.rows[0].id, t.rows[0].id, ct.data, u.rows[0].id, 'cadastro.contato')
        // Plano de acesso do aluno: pré-condição do vínculo com o personal (linkFailures).
        await q(`insert into user_access_plans(user_id,plan_id) values($1,'personal_unico') on conflict (user_id) do nothing`, [u.rows[0].id])
        // V3 (decisão Lucas 15/10): SaaS aberto — conta nasce ativa, sem aprovação do admin (admin ainda pode bloquear)
        await acceptAtSignup(u.rows[0].id, { professional: false, health: typeof b.health_consent === 'boolean' ? b.health_consent : null }, req)
        if (terms) await acceptTerms(u.rows[0].id, terms.version, req)
        if (byCode) { const a = await attachByProCode(u.rows[0].id, t.rows[0].id, b.pro_code); if (a?.apply) await a.apply() }
        await autoUnlockForTests(u.rows[0].id, email)   // só em teste local (E2E_AUTO_UNLOCK_DOMAIN)
        await audit(t.rows[0].id, u.rows[0].id, 'conta.cadastro', 'user', u.rows[0].id, { intent, termos: terms && terms.version })
        return u
      })
      if (!u) return json(res, 409, { error: 'Este e-mail já tem conta. Quer entrar ou recuperar a senha?', code: 'EMAIL_EXISTS', errors: { email: 'Este e-mail já tem conta' } })
      // O aluno novo já nasce vinculado ao personal do ambiente. Falha aqui não desfaz o
      // cadastro: a conta existe e o personal pode vincular pelo painel.
      try { await (await import('./pro.js')).linkToTenantPersonal(t.rows[0].id, u.rows[0].id) }
      catch (e) { console.error('vinculo automatico no cadastro', e.message) }
      // Cupom do link ou digitado: o servidor aplica depois de criar a conta. Falha nao desfaz o cadastro.
      let couponResult = null
      if (b.coupon) {
        try {
          const account = await loadUser(u.rows[0].id)
          couponResult = await (await import('./billing/coupons.js')).redeemTrial(account, b.coupon, { audience: 'aluno' })
        } catch (e) { console.error('cupom cadastro', e.message); couponResult = { status: 500, error: 'A conta foi criada, mas não foi possível aplicar o cupom agora.', code: 'COUPON_APPLY_FAILED' } }
      }
      await login(res, u.rows[0].id, { coupon_result: couponResult })
    },
    'POST /api/auth/login': async (req, res) => {
      const b = await readBody(req)
      const email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '')
      if (!email || !password) return json(res, 400, { error: 'Informe e-mail e senha' })
      const r = await q('select id,password_hash,disabled_at,status from users where lower(email)=$1', [email])
      const row = r.rows[0]
      const ok = row && row.password_hash && await bcrypt.compare(password, row.password_hash)
      if (!ok) return json(res, 401, { error: 'E-mail ou senha incorretos' })
      if (row.disabled_at || row.status === 'bloqueado') return json(res, 403, { error: 'Conta desativada' })
      await q('update users set last_seen_at=now() where id=$1', [row.id])
      await login(res, row.id)
    },
    'POST /api/auth/logout': async (req, res) => { await revokeRequestToken(req).catch(e => console.error('logout revoke', e.message)); json(res, 200, { ok: true }, { 'Set-Cookie': [clearTokenCookie, ...(clearCookies || [])] }) },
    // V4 F7: encerra a sessão em todos os aparelhos (inclusive este)
    'POST /api/auth/logout-all': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      await q('update users set token_version=token_version+1 where id=$1', [u.id])
      await audit(u.tenant_id, u.id, 'sessao.encerrada_todas', 'user', u.id)
      json(res, 200, { ok: true }, { 'Set-Cookie': [clearTokenCookie, ...(clearCookies || [])] })
    },
    // V4 F7: troca de senha logado (exige a senha atual); encerra os outros aparelhos e devolve token novo para este
    'POST /api/auth/password': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req), pw = String(b.new_password || '')
      const row = (await q('select password_hash from users where id=$1', [u.id])).rows[0]
      if (!row?.password_hash || !(await bcrypt.compare(String(b.current_password || ''), row.password_hash))) return json(res, 400, { error: 'Senha atual incorreta', errors: { current_password: 'Senha atual incorreta' } })
      if (pw.length < 8) return json(res, 400, { error: 'A nova senha deve ter pelo menos 8 caracteres', errors: { new_password: 'Mínimo de 8 caracteres' } })
      if (await bcrypt.compare(pw, row.password_hash)) return json(res, 400, { error: 'A nova senha precisa ser diferente da atual', errors: { new_password: 'Use uma senha diferente' } })
      await transaction(async () => {
        await q('select id from users where id=$1 for update', [u.id])
        const current = (await q('select password_hash from users where id=$1', [u.id])).rows[0]
        if (!await bcrypt.compare(String(b.current_password || ''), current.password_hash)) throw new Error('Senha alterada durante a operação')
        await q('update users set password_hash=$2, token_version=token_version+1, must_change_password=false where id=$1', [u.id, await bcrypt.hash(pw, 12)])
        await invalidatePasswordLinks(u.id)
      })
      await audit(u.tenant_id, u.id, 'senha.alterada', 'user', u.id)
      await login(res, u.id)
    },
    'GET /api/auth/me': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      json(res, 200, { user: { ...pub(u), ...(await termsStatus(u.id)), profile_incomplete: !u.roles?.includes('admin') && !contactComplete(await contactOf(u.id)) } })
    },
    // Resposta idêntica para contas existentes, ausentes, bloqueadas e limitadas.
    'POST /api/auth/forgot': async (req, res) => {
      const b = await readBody(req), email = String(b.email || '').trim().toLowerCase().slice(0, 254)
      if (await allowPasswordEmail(req, email)) {
        const user = EMAIL_RE.test(email) ? (await q('select id from users where lower(email)=$1 and disabled_at is null', [email])).rows[0] : null
        if (user) await queuePasswordLink(user.id)
      }
      json(res, 200, { ok: true, message: 'Se o e-mail estiver cadastrado e apto para acesso, você receberá um link para criar uma nova senha. Confira também o spam.' })
    },
    'POST /api/auth/reset': async (req, res) => {
      const b = await readBody(req), pw = String(b.password || '')
      if (pw.length < 8) return json(res, 400, { error: 'A senha deve ter pelo menos 8 caracteres' })
      const valid = await transaction(async () => {
        const candidate = (await q('select user_id from password_resets where token_hash=$1', [tokenHash(b.token)])).rows[0]
        if (!candidate) return false
        const user = (await q('select id,tenant_id,disabled_at,status from users where id=$1 for update', [candidate.user_id])).rows[0]
        if (!user || user.disabled_at || user.status === 'bloqueado') return false
        const reset = (await q('select id from password_resets where token_hash=$1 and used_at is null and expires_at>now() for update', [tokenHash(b.token)])).rows[0]
        if (!reset) return false
        await q('update users set password_hash=$2,token_version=token_version+1,must_change_password=false where id=$1', [user.id, await bcrypt.hash(pw, 12)])
        await invalidatePasswordLinks(user.id)
        await audit(user.tenant_id, user.id, 'senha.redefinida', 'user', user.id)
        return true
      })
      if (!valid) return json(res, 400, { error: 'Link inválido ou expirado. Solicite um novo em Esqueci a senha.' })
      json(res, 200, { ok: true })
    },
    'POST /api/adm/users/reset-link': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const t = (await q('select id,email from users where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
      if (!t) return json(res, 404, { error: 'Usuário não encontrado' })
      if (!await allowPasswordEmail(req, t.email)) return json(res, 429, { error: 'Aguarde antes de solicitar outro link.' })
      const result = await queuePasswordLink(t.id, u.id)
      if (!result) return json(res, 409, { error: 'Conta indisponível para recuperação.' })
      await audit(u.tenant_id, u.id, 'senha.link_gerado', 'user', t.id)
      json(res, 200, result)
    },

    // ===== catálogo =====
    'GET /api/muscles': async (req, res) => {
      if (!await requireAuth(req, res, json)) return   // catálogo só para logados (sem modo visitante)
      const [g, m] = await Promise.all([
        q('select id,name_pt,is_training from muscle_groups order by position'),
        q('select id,name_pt,name_en,group_id,mesh_ids from muscles order by name_pt')])
      json(res, 200, { groups: g.rows, muscles: m.rows }, { 'Cache-Control': 'public, max-age=300' })
    },
    'GET /api/muscles/exercises': async (req, res) => {
      const url = new URL(req.url, 'http://x')
      const muscle = url.searchParams.get('muscle') || '', group = url.searchParams.get('group') || ''
      const u = await requireAuth(req, res, json); if (!u) return; const tid = u.tenant_id
      const r = await q(`select e.id,e.name_pt,e.level,eq.name_pt equipment,
          max(case when em.muscle_id=$1 then 3 when eg.group_id=$2 and eg.role='primary' then 2 when eg.group_id=$2 then 1 else 0 end) score
        from exercises e left join equipment eq on eq.id=e.equipment_id
        left join exercise_muscles em on em.exercise_id=e.id left join exercise_groups eg on eg.exercise_id=e.id
        where ${tenantScope('e', 3)} and (em.muscle_id=$1 or eg.group_id=$2)
        group by e.id,eq.name_pt order by score desc, e.name_pt limit 30`, [muscle, group, tid])
      json(res, 200, { exercises: r.rows })
    },
    'GET /api/programs': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return; const tid = u.tenant_id
      const r = await q(`select p.id,p.slug,p.title,p.description,p.goal,p.level,p.location,p.weeks,p.days_per_week,p.minutes,p.is_rehab,p.tags,
        (select json_agg(json_build_object('name',w.name,'focus',w.focus,'exercises',(select json_agg(json_build_object('id',x.exercise_id,'name',e.name_pt,'sets',x.sets,'reps_min',x.reps_min,'reps_max',x.reps_max,'rest_sec',x.rest_sec,'duration_sec',x.duration_sec) order by x.position)
           from program_workout_exercises x join exercises e on e.id=x.exercise_id where x.program_workout_id=w.id)) order by w.position) from program_workouts w where w.program_id=p.id) workouts
        from programs p where ((p.tenant_id is null and p.visibility='public') or p.tenant_id=$1) and p.archived_at is null order by p.is_rehab, p.title`, [tid])
      json(res, 200, { programs: r.rows })
    },
    'GET /api/admin/tenant-users': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const r = await q(`select u.id,u.name,u.email,u.created_at,array_agg(ur.role_id) roles from users u left join user_roles ur on ur.user_id=u.id
        where u.tenant_id=$1 group by u.id order by u.created_at`, [u.tenant_id])
      json(res, 200, { users: r.rows })
    }
  }
}
