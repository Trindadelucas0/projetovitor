// Integração da Avaliação Postural — lado do aluno. SOMENTE contra banco de teste e API local.
// Uso: pwsh db/test-db-reset.ps1 && node test/setup-e2e.mjs && node --test test/postural.integration.mjs
// Cobre o fluxo inteiro (início → consentimento → dados → capturas → envio) e os negativos do plano:
// aluno A vs aluno B, tipo declarado diferente do real, arquivo grande demais, token errado, etapa de outra
// versão, envio incompleto, consentimento ausente e mídia de outro titular.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { q, pool } from '../db/pool.js'

const B = process.env.API || 'http://127.0.0.1:8799'
const PASS = 'Postural-e2e-2026A'
const ORIGIN = 'http://127.0.0.1:4449'

const JPEG = n => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(Math.max(0, n - 4))])
const MP4 = n => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), crypto.randomBytes(Math.max(0, n - 12))])
const sha = b => crypto.createHash('sha256').update(b).digest('hex')

async function call(jar, method, path, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(jar.c ? { Cookie: jar.c } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  })
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
// corpo bruto: é assim que a foto sobe (não passa por readBody, então o teto de 5 MB não se aplica)
async function raw(jar, path, buf, contentType) {
  const r = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': contentType, Origin: ORIGIN, ...(jar.c ? { Cookie: jar.c } : {}) }, body: buf })
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function account(tag) {
  const jar = {}, terms = (await call({}, 'GET', '/api/terms')).d.terms
  const email = `postural.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'Postural ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  return { jar, id: r.d.user.id, email }
}
// Libera acesso e consentimento de saúde direto no banco: o foco aqui é o módulo, não o checkout.
// O monetizationGate (api/access.js) é deny-by-default e exige assinatura PAGA — e o cadastro não cria
// assinatura nenhuma. Então a fixture tem de criar a assinatura ativa e a cobrança paga, igual produção.
export async function paidAccess(u, tenant, audience = 'aluno', planId = 'individual') {
  const pv = (await q(`select id from plan_versions where plan_id=$1 order by version desc limit 1`, [planId])).rows[0]
  const s = (await q(`insert into subscriptions(tenant_id, user_id, audience, plan_id, plan_version_id, status, payment_type, started_at, current_period_start, current_period_end)
    values($1,$2,$3,$4,$5,'ativa','card', now(), now(), now() + interval '30 days')
    on conflict (user_id, audience) where status <> 'cancelada'
    do update set status='ativa', current_period_end = now() + interval '30 days' returning id`, [tenant, u.id, audience, planId, pv.id])).rows[0]
  // provider <> 'simulado' e paid_at preenchido: é o que ownSources() exige para considerar acesso vigente
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
// cria a solicitação no banco: a rota do profissional é da Fase 4, este teste não depende dela
async function request(tenant, studentId, proId) {
  const v = (await q(`select v.id, v.protocol_id from posture_protocol_versions v
    join posture_protocols p on p.id = v.protocol_id
    where p.slug='postural-masculino' and p.tenant_id is null and v.status='publicada' order by v.version desc limit 1`)).rows[0]
  assert.ok(v, 'protocolo oficial masculino precisa estar semeado (npm run migrate)')
  const a = (await q(`insert into posture_assessments(tenant_id, student_id, professional_id, protocol_id, protocol_version_id, status, due_at, created_by)
    values($1,$2,$3,$4,$5,'solicitada', now() + interval '7 days', $3) returning id`, [tenant, studentId, proId, v.protocol_id, v.id])).rows[0]
  return { id: a.id, versionId: v.id, protocolId: v.protocol_id }
}

let alunoA, alunoB, pro, tenant, av, steps

test('prepara contas, protocolo semeado e solicitação', async () => {
  alunoA = await account('a'); alunoB = await account('b'); pro = await account('pro')
  tenant = await unlock(alunoA)
  await unlock(alunoB)
  await unlock(pro)
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'profissional') on conflict do nothing`, [pro.id, tenant])
  await q(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish) values($1,$2,'Prof Postural','ativo',true)
    on conflict (user_id) do update set state='ativo'`, [pro.id, tenant])
  await q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$2,'admin') on conflict do nothing`, [tenant, pro.id, alunoA.id])
  av = await request(tenant, alunoA.id, pro.id)

  const r = await call(alunoA.jar, 'GET', '/api/avaliacao-postural')
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.open.id, av.id)
  assert.equal(r.d.open.status, 'solicitada')
  assert.equal(r.d.open.progress.total, 18, 'o protocolo semente tem 18 etapas e elas vêm do banco')
  assert.equal(r.d.open.progress.done, 0)
})

test('aluno sem consentimento de saúde não inicia', async () => {
  const semConsent = await account('nc')
  const t = await unlock(semConsent, { health: false })
  const outra = await request(t, semConsent.id, pro.id)
  const r = await call(semConsent.jar, 'POST', '/api/avaliacao-postural/start', { id: outra.id })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'CONSENT_REQUIRED')
})

test('aluno B não vê nem toca a avaliação do aluno A', async () => {
  assert.equal((await call(alunoB.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)).s, 404, '404 e não 403: não revela existência')
  assert.equal((await call(alunoB.jar, 'POST', '/api/avaliacao-postural/start', { id: av.id })).s, 404)
  assert.equal((await call(alunoB.jar, 'POST', '/api/avaliacao-postural/submit', { id: av.id })).s, 404)
  assert.equal((await call(alunoB.jar, 'GET', '/api/avaliacao-postural')).d.open, null)
})

test('sem sessão não se chega a nada do módulo', async () => {
  assert.equal((await call({}, 'GET', '/api/avaliacao-postural')).s, 401)
  assert.equal((await call({}, 'GET', '/api/avaliacao-postural/item?id=' + av.id)).s, 401)
})

test('início e etapas vêm da versão pinada', async () => {
  const s = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/start', { id: av.id })
  assert.equal(s.s, 200, JSON.stringify(s.d))
  assert.equal(s.d.assessment.status, 'em_andamento')

  const item = await call(alunoA.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  assert.equal(item.s, 200)
  steps = item.d.steps
  assert.equal(steps.length, 18)
  assert.equal(steps.filter(x => x.capture_kind === 'foto').length, 15)
  assert.equal(steps.filter(x => x.capture_kind === 'video').length, 3)
  assert.equal(steps[0].position, 1)
  assert.ok(Array.isArray(steps[0].instructions) && steps[0].instructions.length, 'instruções numeradas vêm do banco')
  assert.equal(steps[0].has_reference, false, 'sem mídia de referência enquanto os direitos do PDF não forem confirmados')
  assert.equal(steps[0].has_demo, false)
  assert.ok(item.d.version.preparation.length, 'o checklist de preparação vem da versão')
  assert.equal(Object.values(steps[0]).includes(undefined), false)
  assert.equal(JSON.stringify(item.d).includes('media_key'), false, 'a chave da mídia nunca sai em JSON')
})

test('captura exige consentimento do ciclo antes de qualquer byte', async () => {
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: steps[0].id, mime: 'image/jpeg', bytes: 1000, sha256: sha(JPEG(1000)) })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'CONSENT_REQUIRED')
})

test('recusar o termo não inicia a coleta; aceitar registra versão, ip e divulgação separada', async () => {
  const no = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/consent', { id: av.id, granted: false })
  assert.equal(no.s, 409)
  assert.equal(no.d.code, 'CONSENT_REQUIRED')

  const yes = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/consent', { id: av.id, granted: true, share_granted: false })
  assert.equal(yes.s, 200, JSON.stringify(yes.d))
  assert.ok(yes.d.assessment.consent_at)
  assert.equal(yes.d.assessment.consent_share_granted, false)

  const docs = (await q(`select document, granted from legal_acceptances where user_id=$1 and document like 'avaliacao_postural%' order by document`, [alunoA.id])).rows
  assert.deepEqual(docs.map(d => d.document), ['avaliacao_postural', 'avaliacao_postural_divulgacao'])
  assert.deepEqual(docs.map(d => d.granted), [true, false], 'a autorização de divulgação é independente e ficou recusada')
  const row = (await q('select consent_ip, terms_version from posture_assessments where id=$1', [av.id])).rows[0]
  assert.ok(row.consent_ip, 'a evidência do aceite guarda o ip')
})

test('dados complementares ficam no ciclo e atualizam perfil e série de peso', async () => {
  const bad = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/dados', { id: av.id, height_cm: 15 })
  assert.equal(bad.s, 400)
  assert.equal(bad.d.code, 'INVALID_INPUT')

  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/dados',
    { id: av.id, height_cm: 178, weight_kg: '80,5', pain_now: true, pain: ['lombar ao acordar'], objectives: ['Melhorar mobilidade'] })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.assessment.complementary.height_cm, 178)
  assert.equal(r.d.assessment.complementary.weight_kg, 80.5, 'aceita vírgula decimal')
  assert.equal(+(await q('select height_cm from user_profiles where user_id=$1', [alunoA.id])).rows[0].height_cm, 178)
  assert.equal((await q(`select count(*)::int n from body_weights where user_id=$1 and source='avaliacao_postural'`, [alunoA.id])).rows[0].n, 1)
})

test('foto sobe pela API e só conta como enviada depois da confirmação do servidor', async () => {
  const body = JPEG(4096), step = steps[0]
  const init = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: step.id, mime: 'image/jpeg', bytes: body.length, sha256: sha(body), client_id: 'c1' })
  assert.equal(init.s, 201, JSON.stringify(init.d))
  assert.equal(init.d.capture.status, 'reservada')
  assert.ok(init.d.capture.upload_token)
  assert.equal(init.d.put_url, null, 'foto não usa URL pré-assinada')

  const up = await raw(alunoA.jar, `/api/avaliacao-postural/captura/upload?id=${init.d.capture.id}&token=${init.d.capture.upload_token}`, body, 'image/jpeg')
  assert.equal(up.s, 200, JSON.stringify(up.d))
  assert.equal(up.d.capture.status, 'enviada')
  assert.equal(up.d.capture.has_media, true)
  assert.equal(up.d.capture.sha256, sha(body), 'o servidor recalcula o sha256 e devolve o que gravou')
  assert.equal(up.d.capture.media_key, undefined, 'a chave não vai para o cliente')

  const item = await call(alunoA.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  assert.equal(item.d.captures.filter(c => c.status === 'enviada').length, 1)
})

test('token de upload errado é recusado e o slot continua reservado', async () => {
  const body = JPEG(512), step = steps[1]
  const init = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: step.id, mime: 'image/jpeg', bytes: body.length, sha256: sha(body) })
  assert.equal(init.s, 201)
  const bad = await raw(alunoA.jar, `/api/avaliacao-postural/captura/upload?id=${init.d.capture.id}&token=${'0'.repeat(48)}`, body, 'image/jpeg')
  assert.equal(bad.s, 403)
  assert.equal((await q('select status from posture_captures where id=$1', [init.d.capture.id])).rows[0].status, 'reservada')

  const ok = await raw(alunoA.jar, `/api/avaliacao-postural/captura/upload?id=${init.d.capture.id}&token=${init.d.capture.upload_token}`, body, 'image/jpeg')
  assert.equal(ok.s, 200)
})

test('vídeo declarado como foto é recusado e nada é gravado', async () => {
  const step = steps.find(s => s.capture_kind === 'foto' && s.position > 2)
  const body = MP4(4096)
  const init = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: step.id, mime: 'image/jpeg', bytes: body.length, sha256: sha(body) })
  assert.equal(init.s, 201)
  const r = await raw(alunoA.jar, `/api/avaliacao-postural/captura/upload?id=${init.d.capture.id}&token=${init.d.capture.upload_token}`, body, 'image/jpeg')
  assert.equal(r.s, 400)
  const row = (await q('select status, media_key from posture_captures where id=$1', [init.d.capture.id])).rows[0]
  assert.equal(row.status, 'reservada')
  assert.equal(row.media_key, null, 'nenhum arquivo associado quando a assinatura do arquivo não bate')
})

test('etapa que pede vídeo não aceita foto, e vice-versa', async () => {
  const video = steps.find(s => s.capture_kind === 'video')
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: video.id, mime: 'image/jpeg', bytes: 100, sha256: sha(JPEG(100)) })
  assert.equal(r.s, 400)
  assert.match(r.d.error, /vídeo/i)
})

test('arquivo acima do limite é recusado já no init', async () => {
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: steps[2].id, mime: 'image/jpeg', bytes: 9 * 1024 * 1024, sha256: 'x'.repeat(64) })
  assert.equal(r.s, 413)
  assert.equal(r.d.code, 'PAYLOAD_TOO_LARGE')
})

test('etapa de outra versão do protocolo é recusada', async () => {
  const outra = (await q(`select s.id from posture_steps s join posture_protocols p on p.id = (select protocol_id from posture_protocol_versions where id = s.version_id)
    where p.slug='postural-feminino' limit 1`)).rows[0]
  assert.ok(outra, 'o protocolo feminino também é semeado')
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: av.id, step_id: outra.id, mime: 'image/jpeg', bytes: 100, sha256: 'x'.repeat(64) })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'STEP_OUT_OF_VERSION')
})

test('envio incompleto é barrado e diz o que falta', async () => {
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/submit', { id: av.id })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'INCOMPLETE')
  assert.ok(r.d.missing.length > 0)
  assert.ok(r.d.missing[0].title, 'o aluno recebe o nome da etapa que falta, não só o id')
})

test('dispensa justificada fecha a etapa; sem justificativa não fecha', async () => {
  const step = steps[3]
  assert.equal((await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/skip', { id: av.id, step_id: step.id, reason: 'x' })).s, 400)
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/skip', { id: av.id, step_id: step.id, reason: 'Sinto dor no ombro ao elevar o braço.' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.capture.status, 'dispensada')
  assert.ok(r.d.capture.skip_reason)
})

test('dúvida por etapa cria conversa no sistema que já existe', async () => {
  const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/duvida', { id: av.id, step_id: steps[6].id, body: 'Posso fazer o movimento sentado?' })
  assert.equal(r.s, 201, JSON.stringify(r.d))
  assert.equal(r.d.thread.context_type, 'avaliacao')
  assert.equal(r.d.thread.assessment_id, av.id)
  assert.equal(r.d.thread.assessment_step_id, steps[6].id)
  assert.ok(r.d.thread.due_at, 'herda o prazo do atendimento')
  // a conversa aparece na tela que já existe
  const t = await call(alunoA.jar, 'GET', '/api/thread?id=' + r.d.thread.id)
  assert.equal(t.s, 200)
  assert.equal(t.d.messages.length, 1)
  assert.equal((await call(alunoB.jar, 'GET', '/api/thread?id=' + r.d.thread.id)).s, 404, 'outro aluno não lê a conversa')
})

test('mídia da própria captura é servida; de outro titular, 404', async () => {
  const cap = (await q(`select id from posture_captures where assessment_id=$1 and status='enviada' limit 1`, [av.id])).rows[0]
  const mine = await fetch(`${B}/api/avaliacao-postural/media?id=${cap.id}`, { headers: { Cookie: alunoA.jar.c } })
  assert.equal(mine.status, 200)
  assert.equal(mine.headers.get('cache-control'), 'private, no-store, max-age=0')
  assert.equal(mine.headers.get('x-content-type-options'), 'nosniff')

  const other = await fetch(`${B}/api/avaliacao-postural/media?id=${cap.id}`, { headers: { Cookie: alunoB.jar.c } })
  assert.equal(other.status, 404)
  const anon = await fetch(`${B}/api/avaliacao-postural/media?id=${cap.id}`)
  assert.equal(anon.status, 401)
})

test('completa as 18 etapas e envia', async () => {
  const item = await call(alunoA.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  const feitas = new Set(item.d.captures.filter(c => ['enviada', 'dispensada'].includes(c.status)).map(c => c.step_id))
  for (const s of item.d.steps.filter(x => !feitas.has(x.id))) {
    const r = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/skip', { id: av.id, step_id: s.id, reason: 'Não consigo executar este movimento hoje.' })
    assert.equal(r.s, 200, `${s.code}: ${JSON.stringify(r.d)}`)
  }
  const sent = await call(alunoA.jar, 'POST', '/api/avaliacao-postural/submit', { id: av.id, student_notes: 'Senti desconforto na lombar.' })
  assert.equal(sent.s, 200, JSON.stringify(sent.d))
  assert.equal(sent.d.assessment.status, 'enviada')
  assert.ok(sent.d.assessment.submitted_at)

  // depois do envio o aluno não mexe mais
  assert.equal((await call(alunoA.jar, 'POST', '/api/avaliacao-postural/captura/skip', { id: av.id, step_id: steps[0].id, reason: 'mudei de ideia' })).s, 409)
  assert.equal((await call(alunoA.jar, 'POST', '/api/avaliacao-postural/submit', { id: av.id })).s, 409)
  assert.equal((await q(`select count(*)::int n from notifications where user_id=$1 and kind='avaliacao'`, [pro.id])).rows[0].n >= 1, true, 'o profissional é avisado')
})

test('uma avaliação aberta por aluno: a segunda solicitação é recusada pelo banco', async () => {
  await assert.rejects(() => request(tenant, alunoA.id, pro.id), /posture_assessments_aberta_uq|duplicate key/i)
})

test('devolutiva não publicada não chega ao aluno', async () => {
  const r = await call(alunoA.jar, 'GET', '/api/avaliacao-postural/devolutiva?id=' + av.id)
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'NOT_PUBLISHED')
  // rascunho do profissional também não vaza pelo item
  await q(`update posture_assessments set devolutiva_summary='rascunho interno', status='em_revisao' where id=$1`, [av.id])
  await q(`update posture_captures set review_status='adequada', review_note='nota interna' where assessment_id=$1`, [av.id])
  const item = await call(alunoA.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  assert.equal(JSON.stringify(item.d).includes('rascunho interno'), false, 'resumo em rascunho não vai para o aluno')
  assert.equal(JSON.stringify(item.d).includes('nota interna'), false, 'parecer por etapa em rascunho não vai para o aluno')
  assert.equal(item.d.captures.every(c => c.review_note === null), true)
})

test('trilha de eventos registrou o ciclo', async () => {
  const ev = (await q('select event from posture_events where assessment_id=$1 order by id', [av.id])).rows.map(r => r.event)
  for (const e of ['avaliacao.iniciada', 'consentimento.registrado', 'dados.salvos', 'captura.reservada', 'captura.enviada', 'captura.dispensada', 'duvida.enviada', 'avaliacao.enviada'])
    assert.ok(ev.includes(e), 'falta o evento ' + e)
})

// Teste 17 do plano: a exclusão LGPD tem de levar a mídia corporal embora. Sem o bloco novo em
// purgeMedia, as fotos sobreviveriam no armazenamento — a varredura antiga só vê a área pública.
test('exclusão LGPD apaga a mídia corporal e não exporta chave de storage', async () => {
  const vitima = await account('lgpd')
  const t = await unlock(vitima)
  const pro2 = (await q(`select coach_id from coach_students where student_id=$1 limit 1`, [alunoA.id])).rows[0]?.coach_id || pro.id
  await q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$2,'admin') on conflict do nothing`, [t, pro2, vitima.id])
  const nova = await request(t, vitima.id, pro2)

  assert.equal((await call(vitima.jar, 'POST', '/api/avaliacao-postural/start', { id: nova.id })).s, 200)
  assert.equal((await call(vitima.jar, 'POST', '/api/avaliacao-postural/consent', { id: nova.id, granted: true })).s, 200)
  const steps = (await call(vitima.jar, 'GET', '/api/avaliacao-postural/item?id=' + nova.id)).d.steps
  const body = JPEG(2048)
  const init = await call(vitima.jar, 'POST', '/api/avaliacao-postural/captura/init',
    { id: nova.id, step_id: steps[0].id, mime: 'image/jpeg', bytes: body.length, sha256: sha(body) })
  assert.equal(init.s, 201)
  assert.equal((await raw(vitima.jar, `/api/avaliacao-postural/captura/upload?id=${init.d.capture.id}&token=${init.d.capture.upload_token}`, body, 'image/jpeg')).s, 200)

  const { storage } = await import('../storage/index.js')
  const key = (await q('select media_key from posture_captures where id=$1', [init.d.capture.id])).rows[0].media_key
  assert.ok(key, 'a captura tem chave no armazenamento')
  assert.ok(await storage().get('private', key), 'o arquivo existe antes da exclusão')

  // a exportação do titular não pode conter caminho interno de storage nem token de upload
  const { buildExport, anonymizeUser } = await import('../lgpd.js')
  const dump = JSON.stringify(await buildExport({ id: vitima.id, tenant_id: t, name: 'LGPD', email: vitima.email }))
  assert.equal(dump.includes(key), false, 'a chave do arquivo não vai na exportação')
  assert.equal(dump.includes('upload_token'), false)

  await anonymizeUser(vitima.id)
  assert.equal(await storage().get('private', key), null, 'depois da exclusão o arquivo não existe mais')
  assert.equal((await q('select count(*)::int n from posture_captures where id=$1', [init.d.capture.id])).rows[0].n, 0,
    'posture_captures está em PERSONAL: as capturas somem na exclusão')
})

test.after(async () => { await pool.end() })
