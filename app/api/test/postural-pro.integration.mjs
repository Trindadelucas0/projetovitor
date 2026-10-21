// Integração da Avaliação Postural — lado do profissional. SOMENTE contra banco de teste e API local.
// Uso: pwsh db/test-db-reset.ps1 && node test/setup-e2e.mjs && node --test test/postural-pro.integration.mjs
// Cobre solicitar, analisar etapa a etapa, recaptura, devolutiva e recorrência, e os negativos do plano:
// profissional sem vínculo, profissional vinculado mas NÃO designado, vínculo encerrado depois do envio,
// publicação com etapa sem parecer, publicação sem resumo e segunda solicitação com ciclo aberto.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { q, pool } from '../db/pool.js'

const B = process.env.API || 'http://127.0.0.1:8799'
const PASS = 'PosturalPro-e2e-2026A'
const ORIGIN = 'http://127.0.0.1:4449'

async function call(jar, method, path, body) {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(jar.c ? { Cookie: jar.c } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  })
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function account(tag) {
  const jar = {}, terms = (await call({}, 'GET', '/api/terms')).d.terms
  const email = `pospro.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'PosPro ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  return { jar, id: r.d.user.id, email }
}
// o monetizationGate é deny-by-default e exige assinatura PAGA; o cadastro não cria nenhuma,
// então a fixture monta assinatura ativa + cobrança paga, como em produção (ver api/access.js ownSources)
async function paidAccess(u, tenant, audience = 'aluno', planId = 'individual') {
  const pv = (await q(`select id from plan_versions where plan_id=$1 order by version desc limit 1`, [planId])).rows[0]
  const s = (await q(`insert into subscriptions(tenant_id, user_id, audience, plan_id, plan_version_id, status, payment_type, started_at, current_period_start, current_period_end)
    values($1,$2,$3,$4,$5,'ativa','card', now(), now(), now() + interval '30 days')
    on conflict (user_id, audience) where status <> 'cancelada'
    do update set status='ativa', current_period_end = now() + interval '30 days' returning id`, [tenant, u.id, audience, planId, pv.id])).rows[0]
  await q(`insert into billing_charges(tenant_id, subscription_id, user_id, provider, kind, payment_type, amount_cents, status, paid_at, period_start, period_end, idempotency_key)
    values($1,$2,$3,'fixture','primeira','card',3990,'paga', now(), now(), now() + interval '30 days', $4)`, [tenant, s.id, u.id, 'fixture-' + crypto.randomUUID()])
}
async function unlock(u, { health = true, paid = true } = {}) {
  const t = (await q('select tenant_id from users where id=$1', [u.id])).rows[0].tenant_id
  await q('update users set access_unlocked_at=coalesce(access_unlocked_at, now()) where id=$1', [u.id])
  if (paid) await paidAccess(u, t)
  if (health) {
    const v = (await q(`select coalesce(value->>'doc_version','1.0') v from app_settings where tenant_id=$1 and key='empresa_legal'`, [t])).rows[0]?.v || '1.0'
    await q(`insert into legal_acceptances(tenant_id,user_id,document,version,granted,ip,user_agent)
      values($1,$2,'consentimento_saude',$3,true,'127.0.0.1','fixture-postural')`, [t, u.id, v])
  }
  return t
}
async function makePro(u, tenant, { admin = false } = {}) {
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'profissional') on conflict do nothing`, [u.id, tenant])
  // /api/pro/* exige acesso do público 'profissional'. O plano 'pro' está inativo no catálogo (plano único),
  // mas ownSources() só exige que não seja gratuito — é o que um profissional pagante teria.
  if (!admin) await paidAccess(u, tenant, 'profissional', 'pro')
  if (admin) await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'admin') on conflict do nothing`, [u.id, tenant])
  await q(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish) values($1,$2,'Prof','ativo',true)
    on conflict (user_id) do update set state='ativo', can_publish=true`, [u.id, tenant])
  u.jar = {}
  assert.equal((await call(u.jar, 'POST', '/api/auth/login', { email: u.email, password: PASS })).s, 200)
}
const link = (tenant, coach, student) =>
  q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$2,'admin') on conflict do nothing`, [tenant, coach, student])

// O aluno manda foto de verdade em duas etapas e dispensa (justificado) o resto, para o ciclo chegar
// rápido ao profissional. A ordem importa: tudo antes do submit, porque depois dele a avaliação fecha
// para edição — é o que o próprio servidor garante.
async function studentSubmits(aluno, id, comFoto = 2) {
  assert.equal((await call(aluno.jar, 'POST', '/api/avaliacao-postural/start', { id })).s, 200)
  assert.equal((await call(aluno.jar, 'POST', '/api/avaliacao-postural/consent', { id, granted: true, share_granted: false })).s, 200)
  const item = await call(aluno.jar, 'GET', '/api/avaliacao-postural/item?id=' + id)
  const steps = item.d.steps
  const fotos = steps.filter(s => s.capture_kind === 'foto').slice(0, comFoto)
  const caps = []
  for (const s of fotos) caps.push(await upload(aluno, id, s.id))
  for (const s of steps.filter(x => !fotos.some(f => f.id === x.id))) {
    const r = await call(aluno.jar, 'POST', '/api/avaliacao-postural/captura/skip', { id, step_id: s.id, reason: 'Não consigo executar hoje.' })
    assert.equal(r.s, 200, `${s.code}: ${JSON.stringify(r.d)}`)
  }
  const sent = await call(aluno.jar, 'POST', '/api/avaliacao-postural/submit', { id })
  assert.equal(sent.s, 200, JSON.stringify(sent.d))
  return { steps, caps }
}
// uma foto real para exercitar parecer, recaptura e acesso à mídia
async function upload(aluno, id, stepId) {
  const body = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2000)])
  const init = await call(aluno.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id, step_id: stepId, mime: 'image/jpeg', bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') })
  assert.equal(init.s, 201, JSON.stringify(init.d))
  const r = await fetch(`${B}/api/avaliacao-postural/captura/upload?id=${init.d.capture.id}&token=${init.d.capture.upload_token}`,
    { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Origin: ORIGIN, Cookie: aluno.jar.c }, body })
  assert.equal(r.status, 200)
  return (await r.json()).capture
}

let tenant, pro, outroPro, aluno, protocolId, av

test('prepara profissional, aluno vinculado e protocolo oficial', async () => {
  aluno = await account('aluno'); pro = await account('pro'); outroPro = await account('pro2')
  tenant = await unlock(aluno)
  await unlock(pro, { health: false }); await unlock(outroPro, { health: false })
  // o personal e o admin do tenant sao a mesma pessoa (migration 069)
  await makePro(pro, tenant, { admin: true })
  await makePro(outroPro, tenant)
  await link(tenant, pro.id, aluno.id)
  await link(tenant, outroPro.id, aluno.id)   // vinculado, mas NAO designado na avaliacao
  protocolId = (await q(`select id from posture_protocols where slug='postural-masculino' and tenant_id is null`)).rows[0]?.id
  assert.ok(protocolId, 'protocolo oficial precisa estar semeado (npm run migrate)')
})

test('profissional sem vínculo não solicita', async () => {
  const estranho = await account('estranho')
  const t = await unlock(estranho, { health: false })
  await makePro(estranho, t)
  const r = await call(estranho.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno.id, protocol_id: protocolId })
  assert.equal(r.s, 403)
  assert.equal(r.d.code, 'PERMISSION_DENIED')
})

test('solicitação cria o ciclo, avisa o aluno e fica presa à versão publicada', async () => {
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacoes/solicitar',
    { student_id: aluno.id, protocol_id: protocolId, due_days: 10, message: 'Faça em local iluminado.' })
  assert.equal(r.s, 201, JSON.stringify(r.d))
  av = r.d.assessment
  assert.equal(av.status, 'solicitada')
  assert.equal(av.professional_id, pro.id)
  assert.ok(av.protocol_version_id)
  assert.ok(av.due_at)
  const pub = (await q(`select status from posture_protocol_versions where id=$1`, [av.protocol_version_id])).rows[0]
  assert.equal(pub.status, 'publicada', 'nunca prende a avaliação a um rascunho')
  assert.equal((await q(`select count(*)::int n from notifications where user_id=$1 and kind='avaliacao'`, [aluno.id])).rows[0].n >= 1, true)
})

test('segunda solicitação com ciclo aberto é recusada', async () => {
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno.id, protocol_id: protocolId })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'ASSESSMENT_OPEN')
})

test('protocolo sem versão publicada não pode ser solicitado', async () => {
  // slug único por execução: a suíte precisa poder rodar de novo no mesmo banco
  const slug = 'so-rascunho-' + crypto.randomBytes(4).toString('hex')
  const p = (await q(`insert into posture_protocols(tenant_id, slug, name, audience) values($1,$2,$3,'geral') returning id`, [tenant, slug, 'Só rascunho ' + slug])).rows[0]
  await q(`insert into posture_protocol_versions(tenant_id, protocol_id, version, status) values($1,$2,1,'rascunho')`, [tenant, p.id])
  const outro = await account('aluno2'); await unlock(outro); await link(tenant, pro.id, outro.id)
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: outro.id, protocol_id: p.id })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'PROTOCOL_UNAVAILABLE')
})

test('fila mostra o ciclo com progresso e contadores', async () => {
  const r = await call(pro.jar, 'GET', '/api/pro/avaliacoes')
  assert.equal(r.s, 200, JSON.stringify(r.d))
  const row = r.d.assessments.find(x => x.id === av.id)
  assert.ok(row)
  assert.equal(row.total, 18)
  assert.equal(row.done, 0)
  assert.equal(row.student_name.startsWith('PosPro'), true)
  assert.equal(r.d.counts.solicitadas >= 1, true)
  // busca por nome
  assert.equal((await call(pro.jar, 'GET', '/api/pro/avaliacoes?q=PosPro')).d.assessments.length >= 1, true)
})

test('não dá para analisar antes do aluno enviar', async () => {
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacao/devolutiva', { id: av.id, summary: 'adiantado' })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'CONFLICT')
})

test('profissional vinculado mas NÃO designado não acessa o ciclo', async () => {
  assert.equal((await call(outroPro.jar, 'GET', '/api/pro/avaliacao?id=' + av.id)).s, 404,
    'a especificação proíbe compartilhar automaticamente entre vários profissionais vinculados')
  assert.equal((await call(outroPro.jar, 'POST', '/api/pro/avaliacao/cancelar', { id: av.id, reason: 'não é meu' })).s, 404)
  assert.equal((await call(outroPro.jar, 'GET', '/api/pro/avaliacoes')).d.assessments.find(x => x.id === av.id), undefined)
})

test('aluno preenche e envia; o profissional recebe para análise', async () => {
  const { steps, caps } = await studentSubmits(aluno, av.id)
  av.steps = steps
  av.cap1 = caps[0]   // duas etapas com foto de verdade, para exercitar parecer e recaptura
  av.cap2 = caps[1]

  const r = await call(pro.jar, 'GET', '/api/pro/avaliacao?id=' + av.id)
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.assessment.status, 'enviada')
  assert.equal(r.d.steps.length, 18)
  assert.equal(r.d.pending_review, 2, 'as duas fotos enviadas esperam parecer')
  assert.equal(r.d.captures.filter(c => c.status === 'dispensada').length, 16)
  assert.equal(JSON.stringify(r.d).includes('media_key'), false, 'a chave da mídia não sai nem para o profissional')
  assert.equal(JSON.stringify(r.d).includes('upload_token'), false)
})

test('profissional vê a mídia do aluno e o acesso fica auditado', async () => {
  const r = await fetch(`${B}/api/pro/avaliacao/media?id=${av.cap1.id}`, { headers: { Cookie: pro.jar.c } })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0')
  const ev = (await q(`select count(*)::int n from posture_events where assessment_id=$1 and event='midia.acessada'`, [av.id])).rows[0].n
  assert.equal(ev >= 1, true, 'acesso a mídia sensível é registrado')

  const outro = await fetch(`${B}/api/pro/avaliacao/media?id=${av.cap1.id}`, { headers: { Cookie: outroPro.jar.c } })
  assert.equal(outro.status, 404, 'profissional não designado não lê os bytes')
  assert.equal((await fetch(`${B}/api/pro/avaliacao/media?id=${av.cap1.id}`)).status, 401)
})

test('parecer por etapa exige decisão válida, e recaptura exige motivo para o aluno', async () => {
  assert.equal((await call(pro.jar, 'POST', '/api/pro/avaliacao/etapa', { capture_id: av.cap1.id, decision: 'mais ou menos' })).s, 400)
  const semMotivo = await call(pro.jar, 'POST', '/api/pro/avaliacao/etapa', { capture_id: av.cap2.id, decision: 'recapturar' })
  assert.equal(semMotivo.s, 400)
  assert.equal(semMotivo.d.errors.correction_reason, 'Obrigatório para pedir recaptura')

  const ok = await call(pro.jar, 'POST', '/api/pro/avaliacao/etapa', { capture_id: av.cap1.id, decision: 'adequada', note: 'nota interna sobre a foto' })
  assert.equal(ok.s, 200, JSON.stringify(ok.d))
  assert.equal(ok.d.capture.review_status, 'adequada')
  assert.equal((await q('select status, reviewer_id from posture_assessments where id=$1', [av.id])).rows[0].status, 'em_revisao')
})

test('publicação é barrada com etapa sem parecer e sem resumo escrito', async () => {
  const semParecer = await call(pro.jar, 'POST', '/api/pro/avaliacao/publicar', { id: av.id })
  assert.equal(semParecer.s, 409)
  assert.equal(semParecer.d.code, 'REVIEW_INCOMPLETE')
  assert.equal(semParecer.d.pending_review, 1)

  const r = await call(pro.jar, 'POST', '/api/pro/avaliacao/etapa',
    { capture_id: av.cap2.id, decision: 'recapturar', correction_reason: 'A foto ficou na diagonal. Centralize a câmera na altura do umbigo.' })
  assert.equal(r.s, 200)

  const semResumo = await call(pro.jar, 'POST', '/api/pro/avaliacao/publicar', { id: av.id })
  assert.equal(semResumo.s, 409)
  assert.equal(semResumo.d.code, 'SUMMARY_REQUIRED')
})

test('rascunho da devolutiva não chega ao aluno', async () => {
  const d = await call(pro.jar, 'POST', '/api/pro/avaliacao/devolutiva',
    { id: av.id, summary: 'Resumo em rascunho com observações internas.', recommendations: 'Mobilidade de ombro.', next_assessment_on: '2026-12-01' })
  assert.equal(d.s, 200, JSON.stringify(d.d))

  const item = await call(aluno.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  assert.equal(JSON.stringify(item.d).includes('rascunho com observações internas'), false)
  assert.equal(JSON.stringify(item.d).includes('nota interna sobre a foto'), false)
  assert.equal((await call(aluno.jar, 'GET', '/api/avaliacao-postural/devolutiva?id=' + av.id)).s, 409)
  // mas o motivo da recaptura o aluno precisa ver
  const cap2 = item.d.captures.find(c => c.id === av.cap2.id)
  assert.match(cap2.correction_reason, /diagonal/)
})

test('recaptura devolve as etapas marcadas e o aluno refaz', async () => {
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacao/recaptura', { id: av.id })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.redo, 1)
  assert.equal((await q('select status from posture_assessments where id=$1', [av.id])).rows[0].status, 'recaptura_solicitada')
  assert.equal((await q('select status from posture_captures where id=$1', [av.cap2.id])).rows[0].status, 'substituida')

  // a etapa voltou a aceitar envio e a de parecer adequado não foi tocada
  const nova = await upload(aluno, av.id, av.steps[1].id)
  assert.notEqual(nova.id, av.cap2.id, 'recaptura gera captura nova e preserva a anterior no histórico')
  assert.equal((await q('select status from posture_captures where id=$1', [av.cap1.id])).rows[0].status, 'enviada')
  av.cap2b = nova

  const back = await call(aluno.jar, 'POST', '/api/avaliacao-postural/submit', { id: av.id })
  assert.equal(back.s, 200, JSON.stringify(back.d))
  assert.equal(back.d.assessment.status, 'enviada')
})

test('nada para refazer é recusado', async () => {
  await call(pro.jar, 'POST', '/api/pro/avaliacao/etapa', { capture_id: av.cap2b.id, decision: 'adequada' })
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacao/recaptura', { id: av.id })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'NOTHING_TO_REDO')
})

test('publicar libera a devolutiva e avisa o aluno', async () => {
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacao/publicar', { id: av.id })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.assessment.status, 'publicada')
  assert.ok(r.d.assessment.published_at)

  const dev = await call(aluno.jar, 'GET', '/api/avaliacao-postural/devolutiva?id=' + av.id)
  assert.equal(dev.s, 200, JSON.stringify(dev.d))
  assert.match(dev.d.assessment.devolutiva_summary, /rascunho com observações internas/)
  assert.equal(dev.d.captures.find(c => c.id === av.cap1.id).review_note, 'nota interna sobre a foto',
    'depois de publicada, o parecer por etapa passa a ser visível')
  assert.equal((await q(`select count(*)::int n from notifications where user_id=$1 and dedupe_key=$2`, [aluno.id, 'postural-devolutiva:' + av.id])).rows[0].n, 1)

  assert.equal((await call(pro.jar, 'POST', '/api/pro/avaliacao/publicar', { id: av.id })).s, 409, 'publicar duas vezes não repete')
})

test('vínculo encerrado depois do envio remove o acesso na hora', async () => {
  await q(`update coach_students set status='encerrado', ended_at=now() where coach_id=$1 and student_id=$2`, [outroPro.id, aluno.id])
  // outroPro já não tinha acesso; agora o teste vale para um profissional designado
  const aluno3 = await account('aluno3'); const t3 = await unlock(aluno3)
  const pro3 = await account('pro3'); await unlock(pro3, { health: false }); await makePro(pro3, t3)
  await link(t3, pro3.id, aluno3.id)
  const nova = await call(pro3.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno3.id, protocol_id: protocolId })
  assert.equal(nova.s, 201, JSON.stringify(nova.d))
  assert.equal((await call(pro3.jar, 'GET', '/api/pro/avaliacao?id=' + nova.d.assessment.id)).s, 200)

  await q(`update coach_students set status='encerrado', ended_at=now() where coach_id=$1 and student_id=$2`, [pro3.id, aluno3.id])
  assert.equal((await call(pro3.jar, 'GET', '/api/pro/avaliacao?id=' + nova.d.assessment.id)).s, 404,
    'a checagem de vínculo é na leitura, não só na criação')
  const cap = (await q(`select id from posture_captures where assessment_id=$1 limit 1`, [nova.d.assessment.id])).rows[0]
  if (cap) assert.equal((await fetch(`${B}/api/pro/avaliacao/media?id=${cap.id}`, { headers: { Cookie: pro3.jar.c } })).status, 404)
})

test('recorrência mensal é criada, ajustada e pausada', async () => {
  const r = await call(pro.jar, 'POST', '/api/pro/avaliacao/recorrencia',
    { student_id: aluno.id, protocol_id: protocolId, period_months: 1, day_of_month: 5, due_days: 10 })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.recurrence.period_months, 1)
  assert.equal(r.d.recurrence.day_of_month, 5)
  assert.ok(r.d.recurrence.next_due_on)

  const ajuste = await call(pro.jar, 'POST', '/api/pro/avaliacao/recorrencia', { student_id: aluno.id, protocol_id: protocolId, period_months: 3, day_of_month: 5 })
  assert.equal(ajuste.s, 200)
  assert.equal(ajuste.d.recurrence.period_months, 3, 'ajusta em vez de duplicar')
  assert.equal((await q(`select count(*)::int n from posture_recurrences where student_id=$1 and protocol_id=$2 and active`, [aluno.id, protocolId])).rows[0].n, 1)

  const lista = await call(pro.jar, 'GET', '/api/pro/avaliacao/recorrencias')
  assert.equal(lista.d.recurrences.some(x => x.student_id === aluno.id), true)

  const off = await call(pro.jar, 'POST', '/api/pro/avaliacao/recorrencia', { student_id: aluno.id, protocol_id: protocolId, active: false })
  assert.equal(off.s, 200)
  assert.equal(off.d.recurrence.active, false)
  assert.ok(off.d.recurrence.paused_at)
  assert.equal((await call(pro.jar, 'POST', '/api/pro/avaliacao/recorrencia', { student_id: aluno.id, protocol_id: protocolId, active: false })).s, 404)
})

test('cancelar exige motivo e encerra o ciclo sem apagar nada', async () => {
  const aluno4 = await account('aluno4'); const t4 = await unlock(aluno4)
  const pro4 = await account('pro4'); await unlock(pro4, { health: false }); await makePro(pro4, t4)
  await link(t4, pro4.id, aluno4.id)
  const nova = (await call(pro4.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno4.id, protocol_id: protocolId })).d.assessment

  assert.equal((await call(pro4.jar, 'POST', '/api/pro/avaliacao/cancelar', { id: nova.id, reason: 'x' })).s, 400)
  const r = await call(pro4.jar, 'POST', '/api/pro/avaliacao/cancelar', { id: nova.id, reason: 'Aluno viajou neste mês.' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.assessment.status, 'cancelada')
  assert.ok(r.d.assessment.cancel_reason)
  assert.equal((await q('select count(*)::int n from posture_assessments where id=$1', [nova.id])).rows[0].n, 1, 'o registro continua existindo')
  // com o ciclo encerrado, cabe outro
  assert.equal((await call(pro4.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno4.id, protocol_id: protocolId })).s, 201)
})

test('aluno não alcança as rotas do profissional', async () => {
  for (const [m, p, b] of [['GET', '/api/pro/avaliacoes', null], ['POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno.id, protocol_id: protocolId }]]) {
    const r = await call(aluno.jar, m, p, b)
    assert.ok([402, 403].includes(r.s), `${m} ${p} devolveu ${r.s}`)
  }
})

test('histórico anterior aparece para comparar posição equivalente', async () => {
  const r = await call(pro.jar, 'GET', '/api/pro/avaliacao?id=' + av.id)
  assert.equal(r.s, 200)
  assert.ok(Array.isArray(r.d.previous), 'o detalhe traz os ciclos publicados anteriores do aluno')
})

test.after(async () => { await pool.end() })
