// AVAGYM V3 · Fase 4 — planos gratuitos: o profissional convida (código, link ou código do aluno) e o ALUNO aceita.
// O aceite revalida tudo dentro de uma transação com trava na assinatura do profissional: dois aceites simultâneos
// pela última vaga → só um entra; o outro recebe LIMIT_REACHED. Convite não consome vaga.
import crypto from 'node:crypto'
import { q, pool } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify } from './pro.js'
import { checkLimitLocked, refreshUsage } from './entitlements.js'
import { fail } from './errors.js'

const txt = (s, n = 300) => String(s ?? '').trim().slice(0, n)
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const qs = req => new URL(req.url, 'http://x').searchParams
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 8 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('')
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
const linkOf = code => (process.env.ORIGIN || 'http://localhost:4449') + '/#/convite/' + code
const proInfo = async uid => (await q(`select pp.state, pp.capacity, pp.verification_status, coalesce(pp.display_name,u.name) name, pp.specialties, pp.photo_url,
    (select count(*)::int from coach_students c where c.coach_id=pp.user_id and c.status='ativo') active
  from professional_profiles pp join users u on u.id=pp.user_id where pp.user_id=$1`, [uid])).rows[0]
// convites vencidos deixam de valer (sem job: marcados na leitura)
const expire = () => q(`update pro_invites set status='expirado' where status='pendente' and expires_at < now()`)

// Código digitado não é convite mas é o código de um aluno (share_code): avisa sem expor dados da pessoa
const STUDENT_CODE_MSG = 'Esse é um código de aluno, não um convite. Para convidar um aluno, troque para o modo Profissional e vá em Convites → Novo convite, colocando esse código em Código do aluno.'
const notFound = async (code, tenantId) => (await q(`select 1 from users where upper(share_code)=upper($1) and tenant_id=$2 and not exists (select 1 from user_roles r where r.user_id=users.id and r.role_id='profissional')`, [code, tenantId])).rowCount
  ? { error: STUDENT_CODE_MSG, code: 'is_student_code' } : { error: 'Convite não encontrado' }
export function inviteRoutes({ json, readBody }) {
  const proOnly = async (req, res) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!u.roles.includes('profissional')) { fail(json, res, 'PERMISSION_DENIED', 'Somente profissionais convidam alunos'); return null }
    return u
  }
  return {
    // ===== profissional =====
    'GET /api/pro/invites': async (req, res) => {
      const u = await proOnly(req, res); if (!u) return
      await expire()
      const r = await q(`select i.id, i.code, i.status, i.message, i.expires_at, i.created_at, i.accepted_at, s.name student_name, a.name accepted_name
        from pro_invites i left join users s on s.id=i.student_id left join users a on a.id=i.accepted_by where i.professional_id=$1 order by i.created_at desc limit 100`, [u.id])
      const p = await proInfo(u.id), sub = await refreshUsage(u.id, 'profissional')
      json(res, 200, { invites: r.rows.map(x => ({ ...x, link: linkOf(x.code) })), active: p?.active || 0, limit: sub?.limits?.alunos_ativos ?? null,
        capacity: p?.capacity ?? 0, verification: p?.verification_status || 'pendente', plan: sub?.plan_name, over_limit: !!sub?.over_limit })
    },
    // criar convite (o gate central já exige verificação + recurso convidar_alunos + assinatura ativa)
    'POST /api/pro/invites': async (req, res) => {
      const u = await proOnly(req, res); if (!u) return
      const b = await readBody(req)
      const p = await proInfo(u.id)
      if (!p || p.state !== 'ativo') return fail(json, res, 'PERMISSION_DENIED', 'Seu perfil profissional precisa estar ativo para convidar alunos')
      // bloqueio antecipado: sem vaga no plano não adianta convidar (a checagem definitiva é no aceite)
      const c = await pool.connect()
      try { await c.query('begin'); const lim = await checkLimitLocked(c, u.id, 'alunos_ativos'); await c.query('rollback'); if (lim) return fail(json, res, lim.code, lim.error, lim) }
      finally { c.release() }
      let studentId = null
      if (b.student_code) {
        const s = (await q(`select u.id from users u join user_roles r on r.user_id=u.id and r.role_id='aluno' where u.share_code=$1 and u.tenant_id=$2 and u.status='ativo'`, [normCode(b.student_code), u.tenant_id])).rows[0]
        if (!s) return json(res, 404, { error: 'Código de aluno não encontrado' })   // não revela dados de ninguém
        if (s.id === u.id) return json(res, 400, { error: 'Você não pode convidar a si mesmo' })
        if ((await q(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [u.id, s.id])).rowCount) return json(res, 409, { error: 'Este aluno já está vinculado a você', code: 'ALREADY_LINKED' })
        if ((await q(`select 1 from pro_invites where professional_id=$1 and student_id=$2 and status='pendente'`, [u.id, s.id])).rowCount) return json(res, 409, { error: 'Já existe um convite pendente para este aluno' })
        studentId = s.id
      }
      if ((await q(`select count(*)::int n from pro_invites where professional_id=$1 and status='pendente'`, [u.id])).rows[0].n >= 20) return json(res, 409, { error: 'Máximo de 20 convites pendentes. Cancele algum antes.' })
      const days = Math.max(1, Math.min(30, +b.days || 14))
      let r
      for (let i = 0; i < 5 && !r; i++) r = (await q(`insert into pro_invites(tenant_id,professional_id,code,student_id,message,expires_at) values($1,$2,$3,$4,$5,now()+($6||' days')::interval) on conflict (code) do nothing returning id, code, expires_at`,
        [u.tenant_id, u.id, newCode(), studentId, txt(b.message, 300) || null, String(days)])).rows[0]
      await audit(u.tenant_id, u.id, 'convite.criado', 'invite', r.id, { direcionado: !!studentId })
      if (studentId) await notify(studentId, 'convite', 'Convite de acompanhamento', `${p.name} convidou você para acompanhamento.`, '/convite/' + r.code)
      json(res, 201, { ...r, link: linkOf(r.code) })
    },
    'POST /api/pro/invites/cancel': async (req, res) => {
      const u = await proOnly(req, res); if (!u) return
      const b = await readBody(req)
      const r = await q(`update pro_invites set status='cancelado' where id=$1 and professional_id=$2 and status='pendente' returning id`, [isUuid(b.id) ? b.id : null, u.id])
      if (!r.rowCount) return json(res, 404, { error: 'Convite pendente não encontrado' })
      await audit(u.tenant_id, u.id, 'convite.cancelado', 'invite', b.id)
      json(res, 200, { ok: true })
    },

    // ===== aluno =====
    'GET /api/me/invites': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      await expire()
      const r = await q(`select i.code, i.message, i.expires_at, coalesce(pp.display_name,p.name) professional, pp.specialties from pro_invites i join users p on p.id=i.professional_id
        left join professional_profiles pp on pp.user_id=i.professional_id where i.student_id=$1 and i.status='pendente' order by i.created_at desc`, [u.id])
      json(res, 200, { invites: r.rows })
    },
    // pré-visualização para a tela de aceite: só dados públicos do profissional
    'GET /api/invites/view': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      await expire()
      const i = (await q(`select * from pro_invites where code=$1`, [normCode(qs(req).get('code'))])).rows[0]
      if (!i) return json(res, 404, await notFound(normCode(qs(req).get('code')), u.tenant_id))
      if (i.tenant_id !== u.tenant_id || (i.student_id && i.student_id !== u.id)) return json(res, 404, { error: 'Convite não encontrado' })
      const p = await proInfo(i.professional_id)
      json(res, 200, { code: i.code, status: i.status, expires_at: i.expires_at, message: i.message, mine: i.professional_id === u.id,
        professional: { id: i.professional_id, name: p?.name, specialties: p?.specialties || [], photo_url: p?.photo_url || null, verified: p?.verification_status === 'verificado' },
        already_linked: (await q(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [i.professional_id, u.id])).rowCount > 0 })
    },
    'POST /api/invites/accept': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!u.roles.includes('aluno')) return fail(json, res, 'PERMISSION_DENIED', 'Ative "Também quero treinar" no Perfil para aceitar acompanhamento')
      const b = await readBody(req), code = normCode(b.code)
      const c = await pool.connect()
      let out
      try {
        await c.query('begin')
        const i = (await c.query(`select * from pro_invites where code=$1 for update`, [code])).rows[0]
        const bad = (status, body) => { out = [status, body] }
        if (!i) bad(404, await notFound(code, u.tenant_id))
        else if (i.tenant_id !== u.tenant_id || (i.student_id && i.student_id !== u.id)) bad(404, { error: 'Convite não encontrado' })
        else if (i.professional_id === u.id) bad(400, { error: 'Você não pode aceitar o próprio convite' })
        else if (i.status !== 'pendente' || i.expires_at < new Date()) bad(410, { error: i.status === 'aceito' ? 'Este convite já foi usado' : 'Convite expirado ou cancelado', status: i.status })
        if (!out) {
          // Revalida apenas suspensao/encerramento. Verificacao cadastral nao bloqueia o uso do plano PRO.
          const p = (await c.query(`select state, capacity from professional_profiles where user_id=$1`, [i.professional_id])).rows[0]
          if (!p || p.state !== 'ativo') bad(409, { error: 'Este profissional não pode receber novos alunos agora', code: 'PERMISSION_DENIED' })
        }
        if (!out && (await c.query(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [i.professional_id, u.id])).rowCount) bad(409, { error: 'Você já é acompanhado por este profissional', code: 'ALREADY_LINKED' })
        if (!out) {
          // plano de acesso do aluno (regra antiga: só vale se o admin definiu um)
          const s = (await c.query(`select ap.max_professionals from user_access_plans x join access_plans ap on ap.id=x.plan_id where x.user_id=$1`, [u.id])).rows[0]
          const links = (await c.query(`select count(*)::int n from coach_students where student_id=$1 and status='ativo'`, [u.id])).rows[0].n
          if (s && s.max_professionals != null && links >= s.max_professionals) bad(409, { error: `Seu plano de acesso permite no máximo ${s.max_professionals} profissional(is)`, code: 'LIMIT_REACHED', metric: 'profissionais_do_aluno', used: links, limit: s.max_professionals })
        }
        if (!out) {
          const lim = await checkLimitLocked(c, i.professional_id, 'alunos_ativos')   // trava + reconta após o bloqueio
          if (lim) bad(lim.code === 'LIMIT_REACHED' ? 409 : 402, { ...lim, error: lim.code === 'LIMIT_REACHED' ? 'O profissional atingiu o limite de alunos do plano dele. Peça para ele liberar uma vaga ou fazer upgrade.' : lim.error })
        }
        if (out) { await c.query('rollback'); return json(res, out[0], out[1]) }
        const l = (await c.query(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$4,'convite') returning id`, [i.tenant_id, i.professional_id, u.id, u.id])).rows[0]
        await c.query(`update pro_invites set status='aceito', accepted_by=$2, accepted_at=now(), link_id=$3, student_id=coalesce(student_id,$2) where id=$1`, [i.id, u.id, l.id])
        await c.query('commit')
        out = { link_id: l.id, professional_id: i.professional_id, invite: i.id }
      } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
      await refreshUsage(out.professional_id, 'profissional')
      await audit(u.tenant_id, u.id, 'vinculo.criado_por_convite', 'link', out.link_id, { coach: out.professional_id, invite: out.invite })
      await notify(out.professional_id, 'vinculo', 'Convite aceito', `${u.name} aceitou seu convite.`, '/admin/painel?tab=usuarios')
      json(res, 201, { ok: true, link_id: out.link_id })
    },
    'POST /api/invites/decline': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q(`update pro_invites set status='recusado' where code=$1 and student_id=$2 and status='pendente' returning professional_id`, [normCode(b.code), u.id])
      if (!r.rowCount) return json(res, 404, { error: 'Convite pendente não encontrado' })
      await notify(r.rows[0].professional_id, 'convite', 'Convite recusado', '', '/admin/painel?tab=vinculos&secao=convites')
      json(res, 200, { ok: true })
    }
  }
}
