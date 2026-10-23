// Personais por público, cotas de ficha/call, agenda de calls, comunidade externa e live.
// Banco EXCLUSIVO de teste; nunca o banco de uso. Chama os handlers das rotas direto (sem subir o servidor).
//
// Uso: DB_NAME=orny_beneficios_test node test/beneficios.integration.mjs
import crypto from 'node:crypto'
// segredo aleatório só deste processo (assina os tokens de teste; não é credencial de ambiente)
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 ? process.env.JWT_SECRET : crypto.randomBytes(48).toString('hex')
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'log'
const DB = 'orny_beneficios_test'
if (process.env.DB_NAME !== DB) throw Error('Use somente DB_NAME=' + DB)

const assert = (await import('node:assert/strict')).default
const jwt = (await import('jsonwebtoken')).default
const { pool } = await import('../db/pool.js')
const { proRoutes } = await import('../pro.js')
const { personaisRoutes } = await import('../personais.js')
const { callsRoutes } = await import('../calls.js')
const { comunidadeRoutes, groupsFor } = await import('../comunidade-externa.js')
const { beneficiosRoutes } = await import('../beneficios.js')
const { fichaQuota, fichaQuotaWarning } = await import('../plan-rules.js')

let checks = 0
const ok = label => { checks++; console.log('OK', label) }
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); ok(label) }

// ---------- chamada direta dos handlers ----------
let body = null
const json = (res, status, data) => { res.status = status; res.data = data }
const readBody = async () => body
const R = { ...proRoutes({ json, readBody }), ...personaisRoutes({ json, readBody }), ...callsRoutes({ json, readBody }), ...comunidadeRoutes({ json, readBody }), ...beneficiosRoutes({ json, readBody }) }
async function call(key, userId, payload = {}, query = '') {
  body = payload
  const tok = jwt.sign({ sub: userId, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' })
  const req = { url: key.split(' ')[1] + query, headers: { authorization: 'Bearer ' + tok } }, res = {}
  await R[key](req, res)
  return res
}

const tid = crypto.randomUUID(), suffix = Date.now().toString(36)
const q = (t, p) => pool.query(t, p)
async function user(name, role, extra = {}) {
  const id = crypto.randomUUID()
  await q(`insert into users(id,tenant_id,name,email,password_hash,status) values($1,$2,$3,$4,'test-only','ativo')`, [id, tid, name, `${id}@beneficios.test`])
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,$3)`, [id, tid, role])
  if (extra.profile) await q(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish,audience_sex) values($1,$2,$3,'ativo',true,$4)`, [id, tid, name, extra.profile])
  return id
}
async function subscribe(student, planId, start, end, status = 'ativa', provider = 'infinitepay') {
  const v = (await q('select id from plan_versions where plan_id=$1 order by version desc limit 1', [planId])).rows[0].id
  const s = (await q(`insert into subscriptions(tenant_id,user_id,audience,plan_id,plan_version_id,status,current_period_start,current_period_end,started_at) values($1,$2,'aluno',$3,$4,$5,$6,$7,$6) returning id`, [tid, student, planId, v, status, start, end])).rows[0].id
  await q(`insert into billing_charges(tenant_id,subscription_id,user_id,provider,kind,amount_cents,status,paid_at,idempotency_key) values($1,$2,$3,$4,'primeira',4990,'paga',now(),$5)`, [tid, s, student, provider, 'test-' + s])
  return s
}
async function link(coach, student) { await q(`insert into coach_students(tenant_id,coach_id,student_id,origin) values($1,$2,$3,'admin')`, [tid, coach, student]) }
const days = n => new Date(Date.now() + n * 864e5)
// horário redondo de 15 min, N horas à frente
const slotAt = hours => { const t = Date.now() + hours * 36e5; return new Date(Math.ceil(t / 9e5) * 9e5).toISOString() }

try {
  await q(`insert into tenants(id,slug,name) values($1,$2,'Benefícios teste')`, [tid, 'beneficios-' + suffix])
  const admin = await user('Admin', 'admin', { profile: 'masculino' })
  const pf = await user('Personal Fem', 'profissional', { profile: 'feminino' })
  await q(`insert into app_settings(tenant_id,key,value) values($1,'personal_user_id',to_jsonb($2::text)),($1,'personal_feminino_user_id',to_jsonb($3::text))`, [tid, admin, pf])

  // ---------- 1) cadastro pelo admin grava o sexo e vincula à personal do público ----------
  let r = await call('POST /api/adm/users/create', admin, { type: 'aluno', name: 'Aluna Nova', email: `aluna-${suffix}@beneficios.test`, perfil: 'feminino' })
  check(r.status, 201, 'admin cria aluna com perfil feminino')
  const aluna = r.data.id
  check((await q('select sex from user_profiles where user_id=$1', [aluna])).rows[0]?.sex, 'feminino', 'sexo da aluna fica gravado (bug corrigido)')
  check((await q(`select coach_id from coach_students where student_id=$1 and status='ativo'`, [aluna])).rows[0].coach_id, pf, 'aluna vai para a personal feminina principal')
  r = await call('POST /api/adm/users/create', admin, { type: 'aluno', name: 'Aluno Antigo', email: `aluno-${suffix}@beneficios.test` })
  check(r.status, 201, 'chamada antiga (sem perfil) continua funcionando')
  check((await q('select sex from user_profiles where user_id=$1', [r.data.id])).rows[0]?.sex ?? null, null, 'sem perfil: sexo fica em branco (PerfilGate pergunta)')
  check((await q(`select coach_id from coach_students where student_id=$1 and status='ativo'`, [r.data.id])).rows[0].coach_id, admin, 'sem perfil: vai para o principal masculino como antes')

  // ---------- 2) personais: cadastro pelo painel com público ----------
  r = await call('POST /api/adm/users/create', admin, { type: 'profissional', name: 'Personal Fem 2', email: `pf2-${suffix}@beneficios.test`, audience_sex: 'feminino' })
  check(r.status, 201, 'admin cadastra personal pelo painel')
  const pf2 = r.data.id
  check(!!r.data.password_link, true, 'personal novo recebe link para definir a senha')
  r = await call('GET /api/adm/personais', admin)
  const p2 = r.data.personais.find(p => p.user_id === pf2)
  check([p2.audience_sex, p2.internal_managed, p2.principal], ['feminino', true, null], 'lista mostra público, personal interno e não principal')
  check(r.data.personais.find(p => p.user_id === pf).principal, 'feminino', 'principal feminina sinalizada')
  r = await call('POST /api/adm/personais/save', admin, { user_id: pf, audience_sex: 'masculino' })
  check([r.status, r.data.code], [409, 'PRINCIPAL_LOCKED'], 'principal não muda de público sem trocar o principal')
  r = await call('POST /api/adm/personais/save', admin, { user_id: pf2, audience_sex: 'masculino' })
  check(r.status, 200, 'público de personal interno pode ser alterado')

  // ---------- 3) cota de fichas: só avisa; edição não conta ----------
  const basico = await user('Aluno Básico', 'aluno')
  await link(admin, basico)
  await subscribe(basico, 'individual', days(-3), days(27))
  const plan1 = (await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,exercises,status) values($1,$2,$3,'Ficha 1','[]','ativo') returning id`, [tid, admin, basico])).rows[0].id
  await q(`insert into pro_plan_history(plan_id,actor_id,action) values($1,$2,'publicado')`, [plan1, admin])
  await q(`insert into pro_plan_history(plan_id,actor_id,action) values($1,$2,'editado'),($1,$2,'nova_versao')`, [plan1, admin])
  let f = await fichaQuota(basico)
  check([f.used, f.limit, f.over], [1, 1, false], 'Básico: 1 ficha no mês; edições não contam como ficha nova')
  check(await fichaQuotaWarning(basico), null, 'dentro da cota: sem aviso')
  const plan2 = (await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,exercises,status) values($1,$2,$3,'Ficha 2','[]','ativo') returning id`, [tid, admin, basico])).rows[0].id
  await q(`insert into pro_plan_history(plan_id,actor_id,action) values($1,$2,'criado')`, [plan2, admin])
  const w = await fichaQuotaWarning(basico)
  check(w?.code, 'FICHA_QUOTA_EXCEEDED', 'segunda ficha no mês: aviso ao personal (não bloqueia)')

  // ---------- 4) calls ----------
  r = await call('POST /api/pro/agenda/disponibilidade', admin, { zoom_url: 'https://zoom.us/j/999', availability: [0, 1, 2, 3, 4, 5, 6].map(d => ({ weekday: d, start_time: '00:00', end_time: '23:45' })) })
  check(r.status, 200, 'personal cadastra horários e link do Zoom')
  r = await call('POST /api/pro/agenda/disponibilidade', admin, { zoom_url: 'http://golpe.com' })
  check(r.status, 400, 'link que não é do Zoom é recusado')

  const t1 = slotAt(48)
  r = await call('POST /api/me/calls/reservar', basico, { starts_at: slotAt(2) })
  check([r.status, r.data.code], [400, 'TOO_LATE'], 'reserva com menos de 12h é recusada')
  r = await call('GET /api/me/calls', basico)
  check([r.data.quota.can_book, r.data.slots.length > 0, r.data.personal?.has_zoom], [true, true, true], 'aluno vê cota livre e horários do personal')
  r = await call('POST /api/me/calls/reservar', basico, { starts_at: t1 })
  check(r.status, 201, 'Básico reserva a call do mês')
  const b1 = r.data.booking.id
  r = await call('POST /api/me/calls/reservar', basico, { starts_at: slotAt(72) })
  check([r.status, r.data.code], [409, 'CALL_QUOTA_EXCEEDED'], 'segunda call no mês: aluno bloqueado com mensagem clara')
  assert.match(r.data.error, /não acumula/); ok('mensagem explica que call não usada não acumula')

  // dupla reserva do mesmo horário
  const outro = await user('Outro Completo', 'aluno'); await link(admin, outro)
  await subscribe(outro, 'completo', days(-1), days(89))
  r = await call('POST /api/me/calls/reservar', outro, { starts_at: t1 })
  check([r.status, r.data.code], [409, 'SLOT_TAKEN'], 'horário já reservado não aceita segunda reserva')

  // personal marca além da cota: passa, com aviso
  r = await call('POST /api/pro/calls/marcar', admin, { student_id: basico, starts_at: slotAt(96) })
  check([r.status, r.data.booking.over_quota, r.data.warning?.code], [201, true, 'CALL_QUOTA_EXCEEDED'], 'personal/admin marca além da cota com aviso')
  assert.ok(r.data.booking.whatsapp_url === null, 'sem telefone, sem link de WhatsApp'); ok('sem telefone cadastrado não gera link de WhatsApp')
  await q(`insert into user_contact(user_id,tenant_id,phone) values($1,$2,'11987654321')`, [basico, tid])
  r = await call('GET /api/pro/agenda', admin)
  const bk = r.data.bookings.find(b => b.id === b1)
  assert.ok(bk.whatsapp_url.startsWith('https://wa.me/5511987654321?text=')); ok('agenda do personal traz botão de WhatsApp com o telefone do aluno')
  assert.ok(decodeURIComponent(bk.whatsapp_url).includes('https://zoom.us/j/999')); ok('mensagem do WhatsApp leva o link do Zoom')
  check(bk.phone, undefined, 'telefone não vai solto na resposta')

  // cancelamento: até 6h antes; no prazo libera a cota
  r = await call('POST /api/me/calls/cancelar', basico, { id: b1 })
  check(r.status, 200, 'aluno cancela com antecedência')
  r = await call('GET /api/me/calls', basico)
  check(r.data.quota.used, 1, 'cancelada no prazo não conta (só a marcada pelo personal conta)')
  const late = (await q(`insert into call_bookings(tenant_id,personal_id,student_id,starts_at,ends_at) values($1,$2,$3,now()+interval '2 hours',now()+interval '2 hours 15 minutes') returning id`, [tid, admin, outro])).rows[0].id
  r = await call('POST /api/me/calls/cancelar', outro, { id: late })
  check([r.status, r.data.code], [409, 'CANCEL_TOO_LATE'], 'cancelamento com menos de 6h é recusado')

  // Completo: 1 a cada 15 dias
  await q(`update call_bookings set status='cancelada_personal' where id=$1`, [late])
  r = await call('POST /api/me/calls/reservar', outro, { starts_at: slotAt(24 * 3) })
  check(r.status, 201, 'Completo reserva na janela 1')
  r = await call('POST /api/me/calls/reservar', outro, { starts_at: slotAt(24 * 5) })
  check(r.data.code, 'CALL_QUOTA_EXCEEDED', 'Completo: segunda call na mesma janela de 15 dias é bloqueada')
  r = await call('POST /api/me/calls/reservar', outro, { starts_at: slotAt(24 * 16) })
  check(r.status, 201, 'Completo: janela seguinte de 15 dias libera nova call')

  const free = await user('Aluno sem plano', 'aluno'); await link(admin, free)
  r = await call('POST /api/me/calls/reservar', free, { starts_at: slotAt(48) })
  check([r.status, r.data.code], [402, 'PLAN_REQUIRED'], 'sem plano: reserva recusada pedindo assinatura')
  const sim = await user('Aluno simulado', 'aluno'); await link(admin, sim)
  await subscribe(sim, 'individual', days(-1), days(29), 'ativa', 'simulado')
  r = await call('POST /api/me/calls/reservar', sim, { starts_at: slotAt(50) })
  check(r.status, 402, 'pagamento simulado não libera benefício')

  // ---------- 5) comunidade externa ----------
  r = await call('POST /api/adm/comunidade/links', admin, { geral: 'https://chat.whatsapp.com/geral', avisos: 'https://chat.whatsapp.com/avisos', premium: 'https://chat.whatsapp.com/premium' })
  check(r.status, 200, 'admin salva convites dos grupos')
  r = await call('GET /api/adm/comunidade', admin)
  const addB = r.data.add.filter(x => x.user_id === basico), addC = r.data.add.filter(x => x.user_id === outro)
  check(addB.map(x => x.channel), ['close_friends'], 'Básico entra só na lista do Close Friends')
  const cfDays = Math.round((new Date(addB[0].expires_at) - new Date(addB[0].starts_at)) / 864e5)
  check(cfDays, 7, 'Close Friends do Básico: 7 dias no ciclo')
  check(addC.map(x => x.channel).sort(), ['close_friends', 'whatsapp_premium'], 'Completo entra no Close Friends e no grupo exclusivo')
  r = await call('POST /api/adm/comunidade/marcar', admin, { ids: addC.map(x => x.id), action: 'adicionado' })
  check(r.data.updated, 2, 'admin marca que adicionou')
  r = await call('GET /api/me/comunidade-externa', outro)
  check(r.data.groups.map(g => g.kind), ['geral', 'avisos', 'premium'], 'aluno Completo vê os 3 grupos')
  r = await call('GET /api/me/comunidade-externa', basico)
  check(r.data.groups.map(g => g.kind), ['geral', 'avisos'], 'aluno Básico não vê o grupo exclusivo')
  // fim do plano
  await q(`update subscriptions set status='vencida', current_period_end=now() - interval '1 minute' where user_id=$1`, [outro])
  r = await call('GET /api/adm/comunidade', admin)
  check(r.data.remove.filter(x => x.user_id === outro).map(x => x.channel).sort(), ['close_friends', 'whatsapp_premium'], 'plano acabou: aparece na lista de remoção')
  check((await groupsFor(outro, tid)).groups, ['geral', 'avisos'], 'ex-aluno continua vendo geral e avisos')
  await call('POST /api/adm/settings', admin, { comunidade_manter_avisos: false })
  check((await groupsFor(outro, tid)).groups, ['geral'], 'configurável: tirar avisos de quem saiu')
  r = await call('POST /api/me/comunidade-externa', basico, { instagram_handle: '@Aluno.Basico' })
  check(r.data.instagram_handle, 'aluno.basico', 'aluno informa o @ do Instagram')

  // ---------- 6) live: Completo primeiro ----------
  r = await call('POST /api/adm/lives/save', admin, { title: 'Live de quinta', youtube_url: 'https://youtube.com/live/abc', starts_at: days(2).toISOString() })
  check(r.status, 201, 'admin cadastra a live')
  const live = r.data.id
  const premium = await user('Aluna Completo', 'aluno'); await subscribe(premium, 'completo', days(-1), days(89))
  r = await call('POST /api/lives/perguntas', basico, { live_id: live, body: 'Pergunta do básico' }); check(r.status, 201, 'Básico pergunta')
  r = await call('POST /api/lives/perguntas', premium, { live_id: live, body: 'Pergunta do completo' }); check(r.status, 201, 'Completo pergunta')
  r = await call('POST /api/lives/perguntas', free, { live_id: live, body: 'Pergunta sem plano' }); check(r.status, 402, 'sem plano não pergunta')
  r = await call('GET /api/adm/lives', admin)
  check(r.data.questions.map(x => x.body), ['Pergunta do completo', 'Pergunta do básico'], 'pergunta do Completo aparece primeiro')

  // ---------- 7) início do admin e regras ----------
  r = await call('GET /api/adm/inicio', admin)
  check(typeof r.data.close_friends.add, 'number', 'início do admin traz pendências de Close Friends')
  r = await call('POST /api/adm/planos/regras', admin, { plan_id: 'individual', rules: { calls_por_janela: 2 } })
  check(r.data.rules.individual.calls_por_janela, 2, 'admin ajusta a cota do plano')
  r = await call('POST /api/adm/planos/regras', admin, { plan_id: 'desafio', rules: {} })
  check(r.status, 400, 'não existe plano desafio')
  await call('POST /api/adm/planos/regras', admin, { plan_id: 'individual', rules: { calls_por_janela: 1 } })

  console.log(`\n${checks} verificações OK`)
} finally {
  // banco exclusivo de teste: limpeza best-effort (tabelas sem cascade em users)
  for (const t of ['user_access_plans', 'access_plan_history', 'password_resets']) await pool.query(`delete from ${t} where user_id in (select id from users where tenant_id=$1)`, [tid]).catch(() => {})
  await pool.query('delete from pro_plan_history where plan_id in (select id from pro_plans where tenant_id=$1)', [tid]).catch(() => {})
  await pool.query('delete from audit_log where tenant_id=$1', [tid]).catch(() => {})
  await pool.query('delete from tenants where id=$1', [tid]).catch(e => console.log('limpeza parcial (banco de teste):', e.message))
  await pool.end()
}
