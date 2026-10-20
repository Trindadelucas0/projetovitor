// ORNY — tipos de conta, acesso comercial e suspensão administrativa.
// • Usuário normal / profissional: cadastro aberto; pagamento, teste ou concessao liberam o uso conforme o plano.
// • Aluno do personal: criado pelo personal com link de definição de senha por e-mail;
//   incluso no plano do personal: só fichas, comunidade e desafios DO personal. O restante exige plano Individual.
// • Pagamento: ponto de extensão PAYMENT (sem gateway hoje).
import { clientIp } from './clientip.js'   // BUG-044
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { q, transaction } from './db/pool.js'
import { allowPasswordEmail, queuePasswordLink } from './password-email.js'
import { requireAuth, requireRole, audit } from './auth.js'
import { notify, getSettings } from './pro.js'
import { capacitySummary } from './entitlements.js'
import { enqueueEmail, mailConfigured } from './mailer.js'
import { buildExport } from './lgpd.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 300) => String(s ?? '').trim().slice(0, n)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isLocked = u => !!u && !u.roles?.includes('admin') && !!u.access_suspended_at
export const isScopedClient = u => !!u && u.account_type === 'personal_client' && !u.own_student_access
export const coachOf = u => isScopedClient(u) ? u.managed_by : null

// ---- ponto de extensão de pagamento (futuro): devolver { required:true, checkout_url } quando houver gateway ----
export const PAYMENT = {
  async forUnlock(/* user */) { return null },          // aluno/usuário pedindo liberação
  async forProfessional(/* user */) { return null }      // personal: conta paga no futuro (hoje: plano/assentos atuais)
}

// ações permitidas durante suspensão (conta, termos, LGPD, preferências e regularização comercial)
const ALLOW_LOCKED = [ /^(POST|DELETE) \/api\/me\/(social|avatar)$/,/^POST \/api\/auth\//, /^POST \/api\/terms/, /^POST \/api\/legal\/(accept|health-consent)$/, /^POST \/api\/me\/(theme|context|unlock-request|export-request|delete-request|delete-request\/cancel|capacities|tours|tours\/reset)$/,
  /^POST \/api\/notifications\/read$/, /^POST \/api\/notification-prefs$/, /^POST \/api\/guided\/onboarding$/, /^POST \/api\/me\/onboarding\/skip$/, /^PUT \/api\/data$/,
  // Conta suspensa ainda pode regularizar pagamento e administrar a propria conta; a suspensao continua prevalecendo no uso.
  /^POST \/api\/billing\/(cards|subscribe|coupon\/(validate|redeem)|pay-now|change-card|pix\/(regenerate|confirm-test))$/,
  /^POST \/api\/logout(\/all)?$/, /^POST \/api\/activity$/, /^POST \/api\/push\//, /^POST \/api\/me\/trophies\/show$/, /^POST \/api\/pro\/verification(\/document)?$/]
// ações do aluno do personal DENTRO do escopo do plano do personal (fichas, atendimento, comunidade, desafios do personal)
const CLIENT_SCOPE = [/^POST \/api\/guided\/sessions/, /^POST \/api\/active-training/, /^POST \/api\/(occurrences|threads|messages)$/, /^(POST|PUT) \/api\/me\/live-session/,
  /^POST \/api\/posts\/like$/, /^POST \/api\/posts\/comment/, /^POST \/api\/comments/, /^POST \/api\/challenges\/(join|leave|optout|proofs|proofs\/replace|proofs\/appeal|posts|posts\/like|posts\/comment|media|media\/stream)$/]
// GETs fora do escopo do aluno do personal (catálogo do sistema e áreas gerais)
const CLIENT_GET_BLOCK = [/^GET \/api\/guided\/(programs|program|recommendations)$/, /^GET \/api\/ranking/, /^GET \/api\/groups?$/]

// R6: aluno coberto pelo personal cujo personal NÃO está em dia (e sem mensalidade própria) → só visualiza
export const coachPending = u => isScopedClient(u) && !u.coach_has_access
export async function accessGate(key, user, res, json) {
  if (!user || user.roles?.includes('admin')) return true
  if (isLocked(user) && !ALLOW_LOCKED.some(r => r.test(key))) { json(res, 403, { error: user.access_suspension_reason || 'Esta conta está suspensa. Fale com o suporte para revisar a situação.', code: 'ACCESS_SUSPENDED' }); return false }
  if (coachPending(user) && !key.startsWith('GET ') && !ALLOW_LOCKED.some(r => r.test(key))) { json(res, 402, { error: 'O plano PRO do seu personal não está ativo. Você pode contratar o plano Individual para continuar usando outras áreas.', code: 'ACCESS_REQUIRED', reason: 'COACH_PENDING' }); return false }
  if (isScopedClient(user) && CLIENT_GET_BLOCK.some(r => r.test(key))) { json(res, 402, { error: 'Esta área não faz parte do plano do seu personal. Contrate o plano Individual para acessá-la.', code: 'CLIENT_SCOPE' }); return false }
  if (key.startsWith('GET ') || !isLocked(user)) return true
  if (ALLOW_LOCKED.some(r => r.test(key))) return true
  if (isScopedClient(user) && CLIENT_SCOPE.some(r => r.test(key))) return true
  json(res, 403, { error: user.access_suspension_reason || 'Esta conta está suspensa. Fale com o suporte para revisar a situação.', code: 'ACCESS_SUSPENDED' })
  return false
}
// teste local: contas @E2E_AUTO_UNLOCK_DOMAIN nascem liberadas (NUNCA em produção)
export async function autoUnlockForTests(uid, email) {
  const d = process.env.E2E_AUTO_UNLOCK_DOMAIN
  if (d && process.env.NODE_ENV !== 'production' && String(email).toLowerCase().endsWith('@' + d)) await q('update users set access_unlocked_at=now() where id=$1', [uid])
}
const tempPassword = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const b = crypto.randomBytes(12); return Array.from(b, x => A[x % A.length]).join('') }

async function setAccess(actor, uid, unlocked, note) {
  return transaction(async () => {
    await q(`update users set access_suspended_at=case when $2 then null else now() end,
      access_suspended_by=case when $2 then null else $3 end,
      access_suspension_reason=case when $2 then null else $4 end where id=$1`, [uid, unlocked, actor.id, txt(note, 300) || null])
    await q('insert into access_events(user_id,action,actor_id,note) values($1,$2,$3,$4)', [uid, unlocked ? 'liberada' : 'bloqueada', actor.id, txt(note, 300) || null])
    // QA AD-27: liberar a conta (botao, lote ou aprovacao) encerra os pedidos pendentes - sai da fila e do filtro 'pendente'
    if (unlocked) await q(`update unlock_requests set status='cancelada', decided_by=$2, decided_at=now(), decision_note=coalesce(decision_note, $3) where user_id=$1 and status='pendente'`, [uid, actor.id, 'fluxo de liberacao manual encerrado'])
    await audit(actor.tenant_id, actor.id, unlocked ? 'acesso.liberado' : 'acesso.bloqueado', 'user', uid, { note: txt(note, 300) || null })
    await notify(uid, 'liberacao', unlocked ? 'Suspensão removida' : 'Conta suspensa', unlocked ? 'Seu acesso voltou a seguir o plano vigente.' : (txt(note, 200) || 'Fale com o suporte para revisar a situação.'), '/perfil')
  })
}

export function accountRoutes({ json, readBody }) {
  const admin = requireRole('admin')
  return {
    // ---------- personal cria o aluno (conta incluída no plano dele) ----------
    'POST /api/pro/clients': async (req, res) => {
      const u = await requireRole('profissional')(req, res, json); if (!u) return
      const b = await readBody(req), name = txt(b.name, 80), email = txt(b.email, 160).toLowerCase()
      const errors = {}
      if (name.length < 2) errors.name = 'Informe o nome do aluno'
      if (!EMAIL_RE.test(email)) errors.email = 'E-mail inválido'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      if ((await q('select 1 from users where lower(email)=$1', [email])).rowCount) return json(res, 409, { error: 'Este e-mail já tem conta. Convide o aluno pelo código dele (Convites).', code: 'EMAIL_EXISTS', errors: { email: 'Já tem conta' } })
      const pay = await PAYMENT.forProfessional(u); if (pay?.required) return json(res, 402, { error: 'Pagamento necessário', code: 'PAYMENT_REQUIRED', ...pay })
      const cap = await capacitySummary(u.id)
      if (cap.available != null && cap.available <= 0) return json(res, 409, { error: 'Você atingiu o limite de alunos do seu plano.', code: 'LIMIT_REACHED', metric: 'alunos_ativos', used: cap.used, limit: cap.effective_limit })
      const pw = tempPassword()
      const nu = await transaction(async () => {
        const nu = (await q(`insert into users(tenant_id,name,email,password_hash,status,account_type,must_change_password,managed_by) values($1,$2,$3,$4,'ativo','personal_client',true,$5) returning id`,
          [u.tenant_id, name, email, await bcrypt.hash(pw, 12), u.id])).rows[0]
        await q(`insert into user_roles values($1,$2,'aluno') on conflict do nothing`, [nu.id, u.tenant_id])
        await q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin,created_by) values($1,$2,$3,'ativo','personal',$2)`, [u.tenant_id, u.id, nu.id])
        await audit(u.tenant_id, u.id, 'aluno_personal.criado', 'user', nu.id, { email })
        if (mailConfigured()) await queuePasswordLink(nu.id, u.id, true)   // com Resend: também manda o link por e-mail
        return nu
      })
      // senha provisória mostrada UMA vez ao personal (decisão Lucas: não expira; troca obrigatória no 1º login). Sem Resend é o único caminho.
      json(res, 201, { id: nu.id, email, temp_password: pw, email_queued: mailConfigured(), message: mailConfigured() ? 'Envie a senha provisória ao aluno; ele também recebe um link por e-mail.' : 'Envie o e-mail e a senha provisória ao aluno. No primeiro acesso ele cria uma senha nova.' })
    },
    'GET /api/pro/clients': async (req, res) => {
      const u = await requireRole('profissional')(req, res, json); if (!u) return
      json(res, 200, { clients: (await q(`select u.id,u.name,u.email,u.created_at,u.must_change_password pending_first_login,u.access_unlocked_at, cs.status link_status
        from users u left join coach_students cs on cs.student_id=u.id and cs.coach_id=$1 and cs.status='ativo' where u.managed_by=$1 order by u.created_at desc`, [u.id])).rows })
    },
    'POST /api/pro/clients/reset-password': async (req, res) => {
      const u = await requireRole('profissional')(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.id)) return json(res, 400, { error: 'id inválido' })
      const c = (await q("select u.id,u.email from users u join coach_students cs on cs.student_id=u.id and cs.coach_id=$2 and cs.status='ativo' where u.id=$1 and u.managed_by=$2 and u.account_type='personal_client' and u.tenant_id=$3", [b.id,u.id,u.tenant_id])).rows[0]
      if (!c) return json(res, 404, { error: 'Aluno não encontrado' })
      const pw = tempPassword()
      await q('update users set password_hash=$2, must_change_password=true, token_version=token_version+1 where id=$1', [c.id, await bcrypt.hash(pw, 12)])
      await audit(u.tenant_id, u.id, 'aluno_personal.senha_provisoria', 'user', c.id)
      if (mailConfigured() && await allowPasswordEmail(req, c.email)) await queuePasswordLink(c.id, u.id)
      json(res, 200, { temp_password: pw, email_queued: mailConfigured() })
    },
    // ---------- pedido de liberação (qualquer conta não liberada) ----------
    'GET /api/me/unlock-request': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      // V4.4 U4 (Modo A): estado da liberação + datas reais + previsão somente se a administração configurou (nunca contagem regressiva)
      const [rq, acc, ev, st] = await Promise.all([
        q('select id,status,reason,decision_note,created_at,decided_at from unlock_requests where user_id=$1 order by created_at desc limit 10', [u.id]),
        q('select created_at, access_unlocked_at from users where id=$1', [u.id]),
        q('select action from access_events where user_id=$1 order by created_at desc limit 1', [u.id]).catch(() => ({ rows: [] })),
        getSettings(u.tenant_id)])
      const requests = rq.rows
      json(res, 200, { retired: true, locked: isLocked(u), suspended: isLocked(u), scoped_client: isScopedClient(u), requests, state: isLocked(u) ? 'suspensa' : 'comercial', account_created_at: acc.rows[0]?.created_at || null, unlocked_at: acc.rows[0]?.access_unlocked_at || null, sla_text: String(st.liberacao_prazo_texto || '').trim() || null })
    },
    'POST /api/me/unlock-request': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      json(res, 410, { error: isLocked(u) ? 'Esta conta está suspensa. Fale com o suporte para revisar a situação.' : 'A liberação manual não é mais necessária. Escolha um plano para acessar os recursos.', code: isLocked(u) ? 'ACCESS_SUSPENDED' : 'UNLOCK_FLOW_RETIRED', action: isLocked(u) ? 'support' : 'subscription' })
    },
    // ---------- admin: suspender / reativar ----------
    'GET /api/adm/access': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const [reqs, locked] = await Promise.all([
        q(`select r.*, round((extract(epoch from (coalesce(r.decided_at, now()) - r.created_at)) / 3600.0)::numeric, 1)::float wait_hours, x.name, x.email, x.account_type, c.name coach_name from unlock_requests r join users x on x.id=r.user_id left join users c on c.id=r.coach_id where r.tenant_id=$1 order by (r.status='pendente') desc, r.created_at desc limit 200`, [u.tenant_id]),
        q(`select id,name,email,account_type,created_at,access_suspended_at,access_suspension_reason,(select name from users c where c.id=x.managed_by) coach_name
          from users x where tenant_id=$1 and access_suspended_at is not null and disabled_at is null order by access_suspended_at desc limit 300`, [u.tenant_id])])
      const active = await q(`select id,name,email,account_type,created_at,(select name from users c where c.id=x.managed_by) coach_name
          from users x where tenant_id=$1 and access_suspended_at is null and disabled_at is null
          and not exists(select 1 from user_roles r where r.user_id=x.id and r.tenant_id=$1 and r.role_id='admin')
          order by created_at desc limit 300`, [u.tenant_id])
      json(res, 200, { requests: reqs.rows, locked_users: locked.rows, unlocked_users: active.rows })
    },
    'POST /api/adm/access/decide': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!['aprovar', 'recusar'].includes(b.action)) return json(res, 400, { error: 'Ação inválida', code: 'INVALID_INPUT' })
      if (b.action === 'recusar' && txt(b.note, 300).length < 3) return json(res, 400, { error: 'Informe o motivo da recusa. Ele será mostrado para a pessoa.', code: 'REASON_REQUIRED' })
      const decided = await transaction(async () => {
        const r = (await q(`update unlock_requests set status=$2, decided_by=$3, decided_at=now(), decision_note=$4 where id=$1 and tenant_id=$5 and status='pendente' returning user_id`,
          [+b.id, b.action === 'aprovar' ? 'aprovada' : 'recusada', u.id, txt(b.note, 300) || null, u.tenant_id])).rows[0]
        if (!r) return false
        if (b.action === 'aprovar') await setAccess(u, r.user_id, true, b.note || 'pedido aprovado')
        else { await audit(u.tenant_id, u.id, 'liberacao.recusada', 'unlock_request', b.id); await notify(r.user_id, 'liberacao', 'Sua solicitação foi analisada. Consulte o motivo e saiba como solicitar novamente.', 'Motivo: ' + txt(b.note, 200) + '. Para solicitar novamente, revise as informações em Perfil e envie um novo pedido.', '/perfil') }
        return true
      })
      if (!decided) return json(res, 409, { error: 'Pedido já decidido ou inexistente' })
      json(res, 200, { ok: true })
    },
    'POST /api/adm/access/set': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!b.unlocked && txt(b.note, 300).length < 3) return json(res, 400, { error: 'Informe o motivo da suspensão. Ele será mostrado para a pessoa.', code: 'REASON_REQUIRED' })
      const x = isUuid(b.user_id) ? (await q('select id from users where id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rows[0]
        : typeof b.email === 'string' && b.email.includes('@') ? (await q('select id from users where lower(email)=lower($1) and tenant_id=$2', [b.email.trim(), u.tenant_id])).rows[0] : null
      if (!x) return json(res, 404, { error: 'Usuário não encontrado' })
      if (x.id === u.id) return json(res, 400, { error: 'Você não pode travar a própria conta' })
      await setAccess(u, x.id, !!b.unlocked, b.note)
      json(res, 200, { ok: true, unlocked: !!b.unlocked })
    },
    // ---------- LGPD: exportação por e-mail, com reconfirmação de senha + e-mail, 1 por 24 h ----------
    'GET /api/me/export-request': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      json(res, 200, { mail_configured: mailConfigured(), requests: (await q(`select r.id,r.email,r.status,r.created_at,o.status mail_status from data_export_requests r left join email_outbox o on o.id=r.outbox_id where r.user_id=$1 order by r.created_at desc limit 10`, [u.id])).rows })
    },
    'POST /api/me/export-request': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req), email = txt(b.email, 160).toLowerCase()
      const row = (await q('select password_hash from users where id=$1', [u.id])).rows[0]
      if (!row?.password_hash || !(await bcrypt.compare(String(b.password || ''), row.password_hash))) { await audit(u.tenant_id, u.id, 'lgpd.exportacao_negada', 'user', u.id, { motivo: 'senha' }); return json(res, 400, { error: 'Senha incorreta', errors: { password: 'Senha incorreta' } }) }
      if (email !== String(u.email).toLowerCase()) return json(res, 400, { error: 'Informe o e-mail da sua conta', errors: { email: 'Deve ser o e-mail cadastrado na conta' } })
      const last = (await q(`select created_at from data_export_requests where user_id=$1 and created_at > now() - interval '24 hours' order by created_at desc limit 1`, [u.id])).rows[0]
      if (last) return json(res, 429, { error: 'Você já pediu uma exportação nas últimas 24 horas. Tente novamente depois.', code: 'RATE_LIMIT', next_at: new Date(new Date(last.created_at).getTime() + 864e5).toISOString() })
      const data = await buildExport(u)
      const copy = process.env.LGPD_COPY_EMAIL || null
      const result = await transaction(async () => {
        await q('select id from users where id=$1 for update', [u.id])
        if ((await q("select 1 from data_export_requests where user_id=$1 and created_at>now()-interval '24 hours'", [u.id])).rowCount) return null
        const ob = await enqueueEmail({ tenantId: u.tenant_id, to: u.email, cc: copy, kind: 'lgpd_export', ref: u.id,
          subject: 'ORNY — exportação dos seus dados (LGPD)',
          body: `Olá, ${u.name}.\n\nSegue em anexo o arquivo com os seus dados pessoais, conforme pedido feito em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.\nSe você não fez este pedido, troque sua senha e fale com o suporte.\n\nORNY`,
          attachment: { name: 'avagym-meus-dados.json', type: 'application/json', content: JSON.stringify(data, null, 2) } })
        const r = (await q(`insert into data_export_requests(tenant_id,user_id,email,copy_email,outbox_id,ip) values($1,$2,$3,$4,$5,$6) returning id`,
          [u.tenant_id, u.id, email, copy, ob.id, clientIp(req)])).rows[0]
        await audit(u.tenant_id, u.id, 'lgpd.exportacao_solicitada', 'data_export_request', r.id, { cópia: !!copy, envio: mailConfigured() ? 'fila' : 'pendente_sem_provedor' })
        return r
      })
      if (!result) return json(res, 429, { error: 'Você já pediu uma exportação nas últimas 24 horas.' })
      json(res, 202, { id: result.id, status: 'na_fila', mail_configured: mailConfigured(), message: mailConfigured() ? 'Pedido recebido. O arquivo será enviado para o seu e-mail.' : 'Pedido recebido. O envio por e-mail está temporariamente pendente; você receberá assim que for liberado.' })
    }
  }
}

// V4.3 · cadastro com o CÓDIGO do personal: conta nasce como aluno do personal, vinculada e sem cobrança (coberta pelo personal)
export async function attachByProCode(uid, tenantId, code) {
  const c = String(code || '').trim().toUpperCase(); if (!c) return null
  const pro = (await q(`select u.id from users u join user_roles r on r.user_id=u.id and r.role_id='profissional'
      join professional_profiles pp on pp.user_id=u.id where upper(u.share_code)=$1 and u.tenant_id=$2 and u.status='ativo' and pp.state='ativo'`, [c, tenantId])).rows[0]
  if (!pro) return { error: 'Código de personal não encontrado. Confira com o seu personal.' }
  const cap = await capacitySummary(pro.id)
  if (cap.available != null && cap.available <= 0) return { error: 'Esse personal está sem vagas no momento. Fale com ele.' }
  return { pro_id: pro.id, apply: async () => {
    await q(`update users set account_type='personal_client', managed_by=$2 where id=$1`, [uid, pro.id])
    await q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin,created_by) values($1,$2,$3,'ativo','codigo',$3)`, [tenantId, pro.id, uid])
    await notify(pro.id, 'vinculo', 'Novo aluno pelo seu código', 'Um aluno se cadastrou com o seu código.', '/pro?tab=alunos').catch(() => {})
  } }
}
