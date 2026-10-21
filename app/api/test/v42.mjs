// Conta aberta, aluno do personal (senha provisória/escopo), suspensão excepcional pelo admin,
// ficha nova substitui a anterior, exportação LGPD por e-mail (senha + e-mail, 1/24 h, fila).
import { get, post, login, check, summary, q, PASS } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e\u0040avadesk.local'), p1 = await login('pro1.e2e\u0040avadesk.local')
const terms = (await get(null, '/api/terms')).d.terms
// 1) conta nova nao entra em fila de liberacao; somente suspensao explicita bloqueia
const em = `lock${Date.now()}@lock.test`
const reg = await post(null, '/api/auth/register', { name: 'Conta Travada', email: em, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual' })
const t = reg.d.token
check(reg.s === 200 && reg.d.user.account_type === 'normal', 'cadastro aberto: conta normal criada')
check(!reg.d.user.access_suspended, 'cadastro aberto: conta não nasce suspensa')
check((await get(t, '/api/guided/programs')).s === 200, 'conta nova vê o catálogo conforme a configuração comercial')
await post(t, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
const prog = (await get(t, '/api/guided/programs')).d.programs[0]
let r = await post(t, '/api/guided/start', { program_id: prog.id })
check((await post(t, '/api/me/theme', { theme: 'dark' })).s === 200, 'preferências continuam liberadas')
r = await post(t, '/api/billing/cards', { number: '1234567812345670', holder_name: 'X Y', exp_month: 12, exp_year: 2030, cvv: '123' })
check(r.s === 400 && r.d.code === 'CARD_INVALID', 'conta não liberada pode iniciar pagamento; validação não retorna ACCESS_LOCKED')
r = await post(t, '/api/me/unlock-request', { reason: 'quero treinar' })
check(r.s === 410 && r.d.code === 'UNLOCK_FLOW_RETIRED', 'pedido de liberação foi aposentado')
const uid = reg.d.user.id
check((await post(adm, '/api/adm/access/set', { user_id: uid, unlocked: false })).s === 400, 'suspensão exige motivo')
check((await post(adm, '/api/adm/access/set', { user_id: uid, unlocked: false, note: 'violação de teste' })).s === 200 && (await get(t, '/api/guided/programs')).d.code === 'ACCESS_SUSPENDED', 'admin suspende excepcionalmente e o bloqueio prevalece')
check((await post(t, '/api/me/unlock-request', {})).d.code === 'ACCESS_SUSPENDED', 'conta suspensa é direcionada ao suporte, sem fila')
await post(adm, '/api/adm/access/set', { user_id: uid, unlocked: true })
check((await get(t, '/api/guided/programs')).s === 200, 'reativação devolve o acesso ao estado comercial')
// 2) personal cria aluno
const ce = `cli${Date.now()}@lock.test`
r = await post(p1, '/api/pro/clients', { name: 'Cliente do Personal', email: ce })
check(r.s === 201 && r.d.temp_password?.length >= 10, 'personal cadastra aluno e recebe senha provisória')
const tmp = r.d.temp_password, cid = r.d.id
check((await post(p1, '/api/pro/clients', { name: 'Xavier Duplicado', email: ce })).s === 409, 'e-mail repetido recusado')
let lg = await post(null, '/api/auth/login', { email: ce, password: tmp })
let ct = lg.d.token
check(lg.s === 200 && lg.d.user.must_change_password && lg.d.user.account_type === 'personal_client' && lg.d.user.client_locked, '1º login: obrigado a trocar a senha; conta do personal')
check((await get(ct, '/api/care')).s === 403, 'sem trocar a senha, o app não abre')
r = await post(ct, '/api/auth/password', { current_password: tmp, new_password: tmp })
check(r.s === 400, 'senha nova precisa ser diferente')
r = await post(ct, '/api/auth/password', { current_password: tmp, new_password: 'NovaSenha-123' })
check(r.s === 200 && !r.d.user.must_change_password, 'troca a senha provisória'); ct = r.d.token
await post(ct, '/api/terms/accept', { version: terms.version })
check((await get(ct, '/api/guided/programs')).d.code === 'CLIENT_SCOPE', 'aluno do personal não vê o catálogo do sistema')
check((await post(ct, '/api/guided/start', { program_id: prog.id })).s === 403, 'aluno do personal não inicia programa do sistema')
// fichas: nova substitui a anterior
const ex = (await q('select id from exercises limit 1')).rows[0].id
const f1 = (await post(p1, '/api/pro/plans', { title: 'Ficha A', student_id: cid, exercises: [{ exercise_id: ex, sets: 3, reps: '10' }] })).d.id
const f2 = (await post(p1, '/api/pro/plans', { title: 'Ficha B', student_id: cid, exercises: [{ exercise_id: ex, sets: 3, reps: '12' }] })).d.id
const care = (await get(ct, '/api/care')).d
check(care.plans.length === 1 && care.plans[0].id === f2, 'ficha nova vira a única ativa')
check(care.plan_history.some(p => p.id === f1 && p.superseded_by === f2), 'ficha antiga aparece no histórico')
check((await post(ct, '/api/guided/sessions/start', { client_id: 'v42a' + Date.now(), pro_plan_id: f1, workout_name: 'x' })).s >= 400, 'não inicia treino em ficha antiga')
check((await post(ct, '/api/guided/sessions/start', { client_id: 'v42b' + Date.now(), pro_plan_id: f2, workout_name: 'x' })).s === 201, 'aluno do personal treina a ficha ativa')
check((await get(ct, '/api/plan?id=' + f1)).s === 200, 'ficha antiga continua legível')
check((await get(p1, '/api/pro/clients')).d.clients.some(c => c.id === cid), 'personal lista seus alunos criados')
// 3) LGPD por e-mail
check((await get(ct, '/api/me/export')).s === 404, 'download direto continua desligado')
r = await post(ct, '/api/me/export-request', { password: 'errada', email: ce })
check(r.s === 400, 'exportação exige reconfirmar a senha')
r = await post(ct, '/api/me/export-request', { password: 'NovaSenha-123', email: 'outro\u0040x.com' })
check(r.s === 400, 'exportação exige o e-mail da conta')
r = await post(ct, '/api/me/export-request', { password: 'NovaSenha-123', email: ce })
check(r.s === 202, 'pedido de exportação na fila')
const ob = (await q(`select o.status,o.to_email,o.attachment from data_export_requests d join email_outbox o on o.id=d.outbox_id where d.id=$1`, [r.d.id])).rows[0]
check(ob.to_email === ce && JSON.parse(ob.attachment).conta.email === ce && ['pendente', 'enviado', 'enviando', 'erro'].includes(ob.status), 'e-mail com o arquivo entrou na fila do Postgres')
check(!ob.attachment.includes('password_hash'), 'arquivo sem segredos')
check((await post(ct, '/api/me/export-request', { password: 'NovaSenha-123', email: ce })).s === 429, 'limite de 1 pedido a cada 24 h')
check((await q(`select count(*)::int n from audit_log where actor_id=$1 and action like 'lgpd.%'`, [cid])).rows[0].n >= 2, 'auditoria registrada')
await pool.end(); process.exit(summary() ? 1 : 0)
