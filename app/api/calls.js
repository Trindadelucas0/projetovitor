// Agenda de calls (Zoom). Personal cadastra horários e link do Zoom; aluno reserva dentro da cota do plano
// (Básico: 1 por mês pago; Completo: 1 a cada 15 dias). Personal/admin podem marcar além da cota (com aviso).
// Um horário só aceita uma reserva ativa (índice único call_bookings_slot_uq). Call não usada não acumula.
import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { getSettings, notify, isLinked } from './pro.js'
import { studentPlanOf, quotaWindow } from './plan-rules.js'
import { CALL_DEFAULTS, buildSlots, cleanAvailability, matchesAvailability, whatsappConfirmUrl, validZoomUrl, formatSp } from './calls-core.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const has = (u, r) => u.roles.includes(r)
const COUNTS = ['reservada', 'realizada', 'faltou']   // cancelamento no prazo libera a cota

async function callSettings(tid) {
  const s = await getSettings(tid)
  return { antecedencia: +(s.calls_antecedencia_horas ?? CALL_DEFAULTS.calls_antecedencia_horas), cancelamento: +(s.calls_cancelamento_horas ?? CALL_DEFAULTS.calls_cancelamento_horas),
    janela_dias: CALL_DEFAULTS.calls_janela_dias }
}
/** Personal responsável pelo aluno: vínculo ativo mais recente com um perfil profissional. */
export async function studentPersonal(studentId) {
  return (await q(`select cs.coach_id id, coalesce(pp.display_name,u.name) name, pp.zoom_url from coach_students cs
      join professional_profiles pp on pp.user_id=cs.coach_id join users u on u.id=cs.coach_id
      where cs.student_id=$1 and cs.status='ativo' and u.disabled_at is null order by cs.since desc nulls last limit 1`, [studentId])).rows[0] || null
}
const availabilityOf = async personalId => (await q(`select weekday, to_char(start_time,'HH24:MI') start_time, to_char(end_time,'HH24:MI') end_time from personal_availability where personal_id=$1 order by weekday, start_time`, [personalId])).rows

/** Cota de calls do aluno para a janela que contém `at` (padrão: agora). */
export async function callQuota(studentId, at = new Date(), c) {
  const plan = await studentPlanOf(studentId, c)
  if (!plan) return { plan: null, can_book: false, reason: 'Calls fazem parte dos planos Básico e Completo. Assine um plano para reservar.', code: 'PLAN_REQUIRED' }
  const w = quotaWindow(plan.rules, plan.period_start, plan.period_end, at)
  const limit = plan.rules.calls_por_janela, minutes = plan.rules.call_minutos
  const unit = plan.rules.janela_dias ? `a cada ${plan.rules.janela_dias} dias` : 'por mês'
  if (!w) return { plan: plan.plan_id, label: plan.label, limit, used: 0, minutes, unit, period_end: plan.period_end, can_book: false, reason: 'Esse horário fica fora do período pago do seu plano.', code: 'OUTSIDE_PERIOD' }
  const used = (await (c || { query: (t, p) => q(t, p) }).query(`select count(*)::int n from call_bookings where student_id=$1 and status = any($2) and starts_at >= $3 and starts_at < $4`, [studentId, COUNTS, w.start, w.end])).rows[0].n
  const can = used < limit
  return { plan: plan.plan_id, label: plan.label, limit, used, minutes, unit, window_start: w.start, window_end: w.end, period_end: plan.period_end, can_book: can,
    reason: can ? null : `Você já usou a call deste período (${plan.label}: ${limit} ${unit}). A próxima libera em ${formatSp(w.end).date}. Call não usada não acumula.`, code: can ? null : 'CALL_QUOTA_EXCEEDED' }
}

async function bookingRows(where, params) {
  return (await q(`select b.*, su.name student_name, coalesce(pp.display_name,pu.name) personal_name, pp.zoom_url, uc.phone
      from call_bookings b join users su on su.id=b.student_id join users pu on pu.id=b.personal_id
      left join professional_profiles pp on pp.user_id=b.personal_id left join user_contact uc on uc.user_id=b.student_id
      where ${where} order by b.starts_at`, params)).rows
}
// o telefone do aluno só vai para quem atende a call (personal/admin), dentro do link do WhatsApp
const forStaff = b => {
  const { phone, ...rest } = b
  return { ...rest, has_phone: !!phone, local: formatSp(b.starts_at), whatsapp_url: b.status === 'reservada' ? whatsappConfirmUrl({ phone, studentName: b.student_name, startsAt: b.starts_at, zoomUrl: b.zoom_url, minutes: Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 6e4) }) : null }
}
const forStudent = b => { const { phone, student_name, ...rest } = b; return { ...rest, local: formatSp(b.starts_at) } }

async function insertBooking(c, { tid, personalId, studentId, startsAt, minutes, planId, over, actor, from }) {
  const ends = new Date(new Date(startsAt).getTime() + minutes * 6e4)
  try {
    return (await c.query(`insert into call_bookings(tenant_id,personal_id,student_id,starts_at,ends_at,plan_id,over_quota,created_by,rescheduled_from) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [tid, personalId, studentId, startsAt, ends, planId, !!over, actor, from || null])).rows[0]
  } catch (e) {
    if (e.code === '23505') { const err = new Error('Esse horário acabou de ser reservado. Escolha outro.'); err.code = 'SLOT_TAKEN'; throw err }
    throw e
  }
}

export function callsRoutes({ json, readBody }) {
  const staff = async (req, res) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!has(u, 'admin') && !has(u, 'profissional')) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
    return u
  }
  // admin pode agir em nome de qualquer personal do ambiente; personal só em si mesmo
  const targetPersonal = async (u, id) => {
    if (!id || String(id) === String(u.id) || !has(u, 'admin')) return u.id
    return (await q('select user_id from professional_profiles where user_id=$1 and tenant_id=$2', [id, u.tenant_id])).rows[0]?.user_id || null
  }
  return {
    // ---------- aluno ----------
    'GET /api/me/calls': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const cfg = await callSettings(u.tenant_id)
      const quota = await callQuota(u.id)
      const personal = await studentPersonal(u.id)
      const bookings = (await bookingRows('b.student_id=$1 and b.starts_at > now() - interval \'60 days\'', [u.id])).map(forStudent)
      let slots = []
      if (personal && quota.plan) {
        const booked = (await q(`select starts_at from call_bookings where personal_id=$1 and status='reservada' and starts_at > now()`, [personal.id])).rows.map(r => r.starts_at)
        slots = buildSlots({ availability: await availabilityOf(personal.id), days: cfg.janela_dias, slotMin: quota.minutes || 15, leadHours: cfg.antecedencia, booked, until: quota.period_end })
      }
      json(res, 200, { quota, personal: personal ? { id: personal.id, name: personal.name, has_zoom: !!personal.zoom_url } : null, bookings, slots, settings: cfg })
    },
    'POST /api/me/calls/reservar': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const startsAt = new Date(b.starts_at)
      if (!b.starts_at || isNaN(startsAt)) return json(res, 400, { error: 'Escolha um horário.', code: 'INVALID_INPUT' })
      const cfg = await callSettings(u.tenant_id)
      if (startsAt.getTime() < Date.now() + cfg.antecedencia * 36e5) return json(res, 400, { error: `Reserve com pelo menos ${cfg.antecedencia}h de antecedência.`, code: 'TOO_LATE' })
      const personal = await studentPersonal(u.id)
      if (!personal) return json(res, 409, { error: 'Você ainda não tem personal vinculado. Fale com o suporte.', code: 'NO_PERSONAL' })
      try {
        const out = await transaction(async c => {
          await c.query('select pg_advisory_xact_lock(hashtext($1))', ['call:' + u.id])   // reservas simultâneas do mesmo aluno
          const quota = await callQuota(u.id, startsAt, c)
          if (!quota.can_book) { const e = new Error(quota.reason); e.code = quota.code; e.status = quota.code === 'PLAN_REQUIRED' ? 402 : 409; throw e }
          if (!matchesAvailability(await availabilityOf(personal.id), startsAt, quota.minutes)) { const e = new Error('Esse horário não está na agenda do personal.'); e.code = 'SLOT_UNAVAILABLE'; e.status = 400; throw e }
          return insertBooking(c, { tid: u.tenant_id, personalId: personal.id, studentId: u.id, startsAt, minutes: quota.minutes, planId: quota.plan, over: false, actor: u.id, from: isUuid(b.reschedule_from) ? b.reschedule_from : null })
        })
        const { date, time } = formatSp(out.starts_at)
        await notify(personal.id, 'call', 'Nova call reservada', `${u.name} reservou ${date} às ${time}. Confirme pelo WhatsApp.`, '/pro?tab=agenda')
        await audit(u.tenant_id, u.id, 'call.reservada', 'call', out.id, { starts_at: out.starts_at })
        json(res, 201, { booking: forStudent({ ...out, personal_name: personal.name }) })
      } catch (e) {
        if (e.code === 'SLOT_TAKEN') return json(res, 409, { error: e.message, code: e.code })
        if (e.status) return json(res, e.status, { error: e.message, code: e.code })
        throw e
      }
    },
    'POST /api/me/calls/cancelar': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.id)) return json(res, 400, { error: 'Call inválida', code: 'INVALID_INPUT' })
      const bk = (await q(`select * from call_bookings where id=$1 and student_id=$2`, [b.id, u.id])).rows[0]
      if (!bk || bk.status !== 'reservada') return json(res, 404, { error: 'Call não encontrada', code: 'NOT_FOUND' })
      const cfg = await callSettings(u.tenant_id)
      if (new Date(bk.starts_at).getTime() < Date.now() + cfg.cancelamento * 36e5) return json(res, 409, { error: `Cancelamento só até ${cfg.cancelamento}h antes. Fale com seu personal.`, code: 'CANCEL_TOO_LATE' })
      await q(`update call_bookings set status='cancelada_aluno', canceled_at=now(), canceled_by=$2, cancel_reason=$3, updated_at=now() where id=$1`, [bk.id, u.id, txt(b.reason, 300) || null])
      const { date, time } = formatSp(bk.starts_at)
      await notify(bk.personal_id, 'call', 'Call cancelada pelo aluno', `${u.name} cancelou a call de ${date} às ${time}.`, '/pro?tab=agenda')
      await audit(u.tenant_id, u.id, 'call.cancelada', 'call', bk.id, {})
      json(res, 200, { ok: true })
    },

    // ---------- personal / admin ----------
    'GET /api/pro/agenda': async (req, res) => {
      const u = await staff(req, res); if (!u) return
      const pid = await targetPersonal(u, qs(req).get('personal_id')); if (!pid) return json(res, 404, { error: 'Personal não encontrado', code: 'NOT_FOUND' })
      const pp = (await q('select zoom_url from professional_profiles where user_id=$1', [pid])).rows[0]
      const bookings = (await bookingRows(`b.personal_id=$1 and b.starts_at > now() - interval '30 days'`, [pid])).map(forStaff)
      json(res, 200, { personal_id: pid, zoom_url: pp?.zoom_url || '', availability: await availabilityOf(pid), bookings, settings: await callSettings(u.tenant_id) })
    },
    'POST /api/pro/agenda/disponibilidade': async (req, res) => {
      const u = await staff(req, res); if (!u) return
      const b = await readBody(req)
      const pid = await targetPersonal(u, b.personal_id); if (!pid) return json(res, 404, { error: 'Personal não encontrado', code: 'NOT_FOUND' })
      if (!(await q('select 1 from professional_profiles where user_id=$1', [pid])).rowCount) return json(res, 409, { error: 'Complete o perfil profissional antes de abrir a agenda.', code: 'NO_PROFILE' })
      const zoom = b.zoom_url !== undefined ? txt(b.zoom_url, 300) : undefined
      if (zoom !== undefined && !validZoomUrl(zoom)) return json(res, 400, { error: 'Cole o link do Zoom (https://...zoom.us/...).', code: 'INVALID_ZOOM' })
      let slots
      if (b.availability !== undefined) { try { slots = cleanAvailability(b.availability) } catch (e) { return json(res, 400, { error: e.message, code: 'INVALID_INPUT' }) } }
      await transaction(async c => {
        if (zoom !== undefined) await c.query('update professional_profiles set zoom_url=$2, updated_at=now() where user_id=$1', [pid, zoom || null])
        if (slots) {
          await c.query('delete from personal_availability where personal_id=$1', [pid])
          for (const s of slots) await c.query('insert into personal_availability(tenant_id,personal_id,weekday,start_time,end_time) values($1,$2,$3,$4,$5)', [u.tenant_id, pid, s.weekday, s.start_time, s.end_time])
        }
      })
      await audit(u.tenant_id, u.id, 'agenda.disponibilidade', 'user', pid, { faixas: slots?.length, zoom: zoom !== undefined })
      json(res, 200, { ok: true, availability: await availabilityOf(pid), zoom_url: (await q('select zoom_url from professional_profiles where user_id=$1', [pid])).rows[0]?.zoom_url || '' })
    },
    // marcação manual: personal (aluno vinculado) ou admin; pode passar da cota — só avisa
    'POST /api/pro/calls/marcar': async (req, res) => {
      const u = await staff(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.student_id)) return json(res, 400, { error: 'Escolha o aluno', code: 'INVALID_INPUT' })
      const startsAt = new Date(b.starts_at); if (!b.starts_at || isNaN(startsAt)) return json(res, 400, { error: 'Escolha data e horário', code: 'INVALID_INPUT' })
      if (startsAt.getTime() < Date.now()) return json(res, 400, { error: 'Escolha um horário no futuro', code: 'INVALID_INPUT' })
      const st = (await q('select id,name from users where id=$1 and tenant_id=$2', [b.student_id, u.tenant_id])).rows[0]
      if (!st) return json(res, 404, { error: 'Aluno não encontrado', code: 'NOT_FOUND' })
      let pid = await targetPersonal(u, b.personal_id)
      if (has(u, 'admin') && !b.personal_id) pid = (await studentPersonal(st.id))?.id || u.id
      if (!pid) return json(res, 404, { error: 'Personal não encontrado', code: 'NOT_FOUND' })
      if (!has(u, 'admin') && !(await isLinked(pid, st.id))) return json(res, 403, { error: 'Esse aluno não está vinculado a você.', code: 'NOT_LINKED' })
      const quota = await callQuota(st.id, startsAt)
      const minutes = Math.max(5, Math.min(120, +b.minutes || quota.minutes || 15))
      try {
        const bk = await transaction(c => insertBooking(c, { tid: u.tenant_id, personalId: pid, studentId: st.id, startsAt, minutes, planId: quota.plan, over: !quota.can_book, actor: u.id }))
        const { date, time } = formatSp(bk.starts_at)
        await notify(st.id, 'call', 'Call marcada', `Sua call foi marcada para ${date} às ${time} (horário de Brasília).`, '/beneficios')
        await audit(u.tenant_id, u.id, 'call.marcada', 'call', bk.id, { over_quota: bk.over_quota })
        const full = (await bookingRows('b.id=$1', [bk.id])).map(forStaff)[0]
        json(res, 201, { booking: full, warning: quota.can_book ? null : { code: 'CALL_QUOTA_EXCEEDED', message: `Marcada além da cota do aluno. ${quota.reason || ''}`.trim() } })
      } catch (e) { if (e.code === 'SLOT_TAKEN') return json(res, 409, { error: 'Esse horário já tem uma call reservada.', code: e.code }); throw e }
    },
    'POST /api/pro/calls/status': async (req, res) => {
      const u = await staff(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id) || !['realizada', 'faltou', 'cancelada_personal'].includes(b.status)) return json(res, 400, { error: 'Dados inválidos', code: 'INVALID_INPUT' })
      const bk = (await q('select * from call_bookings where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
      if (!bk || (!has(u, 'admin') && String(bk.personal_id) !== String(u.id))) return json(res, 404, { error: 'Call não encontrada', code: 'NOT_FOUND' })
      if (bk.status !== 'reservada') return json(res, 409, { error: 'Essa call já foi encerrada.', code: 'ALREADY_CLOSED' })
      const cancel = b.status === 'cancelada_personal'
      await q(`update call_bookings set status=$2, canceled_at=case when $3 then now() end, canceled_by=case when $3 then $4::uuid end, cancel_reason=$5, updated_at=now() where id=$1`, [bk.id, b.status, cancel, u.id, txt(b.reason, 300) || null])
      if (cancel) { const { date, time } = formatSp(bk.starts_at); await notify(bk.student_id, 'call', 'Call cancelada', `Sua call de ${date} às ${time} foi cancelada pelo personal. Reserve outro horário.`, '/beneficios') }
      await audit(u.tenant_id, u.id, 'call.' + b.status, 'call', bk.id, {})
      json(res, 200, { ok: true })
    },
    // visão do admin: todas as calls do ambiente num intervalo (padrão: hoje até +14 dias)
    'GET /api/adm/calls': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'admin')) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      const p = qs(req), from = p.get('from') ? new Date(p.get('from')) : new Date(Date.now() - 864e5), to = p.get('to') ? new Date(p.get('to')) : new Date(Date.now() + 14 * 864e5)
      if (isNaN(from) || isNaN(to)) return json(res, 400, { error: 'Datas inválidas', code: 'INVALID_INPUT' })
      json(res, 200, { bookings: (await bookingRows('b.tenant_id=$1 and b.starts_at >= $2 and b.starts_at < $3', [u.tenant_id, from, to])).map(forStaff), settings: await callSettings(u.tenant_id) })
    }
  }
}
