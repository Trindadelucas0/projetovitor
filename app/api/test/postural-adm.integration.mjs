// Integração da Avaliação Postural — administração. SOMENTE contra banco de teste e API local.
// Uso: pwsh db/test-db-reset.ps1 && node test/setup-e2e.mjs && node --test test/postural-adm.integration.mjs
// O teste central é o da imutabilidade: publicar uma versão nova NÃO muda a avaliação que já estava em
// andamento. Cobre também protocolo oficial somente leitura, um rascunho por protocolo, editor de etapas,
// reordenação, mídia demonstrativa, termo versionado, indicadores e retenção.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { q, pool } from '../db/pool.js'

const B = process.env.API || 'http://127.0.0.1:8799'
const PASS = 'PosturalAdm-e2e-2026A'
const ORIGIN = 'http://127.0.0.1:4449'
// sufixo unico por execucao: a suite precisa poder rodar de novo no mesmo banco de teste
const RUN = Math.random().toString(36).slice(2, 7)
const JPEG = n => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(Math.max(0, n - 4))])

async function call(jar, method, path, body) {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(jar.c ? { Cookie: jar.c } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  })
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function raw(jar, path, buf, contentType) {
  const r = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': contentType, Origin: ORIGIN, Cookie: jar.c }, body: buf })
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function account(tag) {
  const jar = {}, terms = (await call({}, 'GET', '/api/terms')).d.terms
  const email = `posadm.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'PosAdm ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  return { jar, id: r.d.user.id, email }
}
// o monetizationGate é deny-by-default e exige assinatura PAGA; o cadastro não cria nenhuma (api/access.js)
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
    await q(`insert into legal_acceptances(tenant_id,user_id,document,version,granted,ip,user_agent) values($1,$2,'consentimento_saude',$3,true,'127.0.0.1','fixture')`, [t, u.id, v])
  }
  return t
}
async function login(u) { u.jar = {}; assert.equal((await call(u.jar, 'POST', '/api/auth/login', { email: u.email, password: PASS })).s, 200) }

let tenant, adm, aluno, oficial, copia, v1

test('prepara administrador e aluno', async () => {
  adm = await account('adm'); aluno = await account('aluno')
  tenant = await unlock(adm, { health: false })
  await unlock(aluno)
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'admin') on conflict do nothing`, [adm.id, tenant])
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'profissional') on conflict do nothing`, [adm.id, tenant])
  await q(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish) values($1,$2,'Personal','ativo',true)
    on conflict (user_id) do update set state='ativo', can_publish=true`, [adm.id, tenant])
  await q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$2,'admin') on conflict do nothing`, [tenant, adm.id, aluno.id])
  await login(adm)
})

test('catálogo traz os protocolos oficiais semeados com as versões', async () => {
  const r = await call(adm.jar, 'GET', '/api/adm/avaliacao/protocolos')
  assert.equal(r.s, 200, JSON.stringify(r.d))
  oficial = r.d.protocols.find(p => p.slug === 'postural-masculino')
  assert.ok(oficial, 'o protocolo oficial masculino precisa estar semeado (npm run migrate)')
  assert.equal(oficial.oficial, true)
  assert.equal(oficial.tenant_id, null)
  assert.equal(oficial.versions[0].status, 'publicada')
  assert.equal(oficial.versions[0].steps, 18)
  assert.equal(oficial.versions[0].a_validar, 1, 'a etapa 18 (borboletinha) nasce marcada para validação do profissional')
  assert.ok(r.d.protocols.find(p => p.slug === 'postural-feminino'), 'o protocolo feminino também é semeado')
})

test('aluno e não-admin não entram na administração', async () => {
  await login(aluno)
  for (const [m, p] of [['GET', '/api/adm/avaliacao/protocolos'], ['GET', '/api/adm/avaliacao/metricas'], ['POST', '/api/adm/avaliacao/protocolos']]) {
    const r = await call(aluno.jar, m, p, m === 'POST' ? {} : null)   // fetch recusa corpo em GET
    assert.equal(r.s, 403, `${m} ${p} devolveu ${r.s}`)
  }
  assert.equal((await call({}, 'GET', '/api/adm/avaliacao/protocolos')).s, 401)
})

test('protocolo oficial é somente leitura: o caminho é duplicar', async () => {
  const edit = await call(adm.jar, 'POST', '/api/adm/avaliacao/protocolos', { id: oficial.id, name: 'Tentando renomear o oficial' })
  assert.equal(edit.s, 409)
  assert.equal(edit.d.code, 'OFFICIAL_READONLY')

  const novaVersao = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes', { protocol_id: oficial.id })
  assert.equal(novaVersao.s, 409)
  assert.equal(novaVersao.d.code, 'OFFICIAL_READONLY')

  const stepOficial = (await q(`select s.id from posture_steps s where s.version_id=$1 limit 1`, [oficial.versions[0].id])).rows[0]
  const editStep = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { id: stepOficial.id, title: 'Mudando o oficial' })
  assert.equal(editStep.s, 409)
  assert.equal(editStep.d.code, 'OFFICIAL_READONLY')
})

test('duplicar o oficial cria cópia do tenant em rascunho com as 18 etapas', async () => {
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/protocolos/duplicar', { id: oficial.id, name: 'Postural da Academia ' + RUN })
  assert.equal(r.s, 201, JSON.stringify(r.d))
  copia = r.d.protocol
  v1 = r.d.version
  assert.equal(copia.tenant_id, tenant)
  assert.equal(copia.official, false)
  assert.equal(copia.source_protocol_id, oficial.id)
  assert.equal(v1.status, 'rascunho')
  assert.equal(v1.version, 1)
  assert.equal(r.d.steps, 18)

  const etapas = await call(adm.jar, 'GET', '/api/adm/avaliacao/etapas?version_id=' + v1.id)
  assert.equal(etapas.d.version.editable, true)
  assert.equal(etapas.d.steps.length, 18)
  assert.equal(etapas.d.steps[0].position, 1)
  assert.equal(JSON.stringify(etapas.d).includes('reference_media_key'), false, 'a chave da mídia não sai nem na administração')
})

test('um rascunho por protocolo', async () => {
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes', { protocol_id: copia.id })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'DRAFT_EXISTS')
})

test('editor de etapas: cria, valida e exige repetições em vídeo', async () => {
  const semTitulo = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { version_id: v1.id, title: '', instructions: ['a'] })
  assert.equal(semTitulo.s, 400)

  const semInstrucao = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { version_id: v1.id, title: 'Etapa nova', instructions: [] })
  assert.equal(semInstrucao.s, 400)
  assert.equal(semInstrucao.d.errors.instructions, 'Obrigatório')

  const videoSemReps = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas',
    { version_id: v1.id, title: 'Vídeo sem repetições', instructions: ['faça'], capture_kind: 'video' })
  assert.equal(videoSemReps.s, 400)
  assert.equal(videoSemReps.d.errors.repetitions, 'Obrigatório para vídeo')

  const ok = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas',
    { version_id: v1.id, title: 'Perfil com elástico', instructions: ['Segure o elástico', 'Eleve o braço'], cautions: ['Pare se doer'], capture_kind: 'foto', camera_position: 'lateral_direita' })
  assert.equal(ok.s, 201, JSON.stringify(ok.d))
  assert.equal(ok.d.step.position, 19, 'entra no fim da lista')
  assert.equal(ok.d.step.code, 'perfil-com-elastico', 'o código é derivado do título')
  assert.deepEqual(ok.d.step.instructions, ['Segure o elástico', 'Eleve o braço'])
  copia.novaEtapa = ok.d.step

  const dup = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { version_id: v1.id, code: 'perfil-com-elastico', title: 'Outra', instructions: ['x'] })
  assert.equal(dup.s, 409, 'código repetido na mesma versão é recusado')
})

test('reordenar exige a lista completa e renumera sem colidir', async () => {
  const atual = (await call(adm.jar, 'GET', '/api/adm/avaliacao/etapas?version_id=' + v1.id)).d.steps
  assert.equal((await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas/ordem', { version_id: v1.id, order: [atual[0].id] })).s, 400)

  const invertida = [...atual].reverse().map(s => s.id)
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas/ordem', { version_id: v1.id, order: invertida })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.steps[0].id, atual[atual.length - 1].id)
  assert.deepEqual(r.d.steps.map(s => s.position), r.d.steps.map((_, i) => i + 1), 'posições ficam 1..n sem buraco')

  // volta para a ordem original
  await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas/ordem', { version_id: v1.id, order: atual.map(s => s.id) })
})

test('remover etapa de rascunho renumera o resto', async () => {
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas/remover', { id: copia.novaEtapa.id })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  const steps = (await call(adm.jar, 'GET', '/api/adm/avaliacao/etapas?version_id=' + v1.id)).d.steps
  assert.equal(steps.length, 18)
  assert.deepEqual(steps.map(s => s.position), steps.map((_, i) => i + 1))
})

test('mídia demonstrativa sobe, é servida e pode sair', async () => {
  const steps = (await call(adm.jar, 'GET', '/api/adm/avaliacao/etapas?version_id=' + v1.id)).d.steps
  const alvo = steps[0]
  const up = await raw(adm.jar, `/api/adm/avaliacao/etapas/midia?step_id=${alvo.id}&kind=referencia`, JPEG(3000), 'image/jpeg')
  assert.equal(up.s, 200, JSON.stringify(up.d))
  assert.equal(up.d.step.has_reference, true)

  const get = await fetch(`${B}/api/adm/avaliacao/etapas/midia?step_id=${alvo.id}&kind=referencia`, { headers: { Cookie: adm.jar.c } })
  assert.equal(get.status, 200)
  assert.equal(get.headers.get('cache-control'), 'private, no-store, max-age=0')

  // vídeo não serve como foto de referência
  const errado = await raw(adm.jar, `/api/adm/avaliacao/etapas/midia?step_id=${alvo.id}&kind=referencia`,
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), crypto.randomBytes(500)]), 'video/mp4')
  assert.equal(errado.s, 400)

  const off = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas/midia/remover', { id: alvo.id, kind: 'referencia' })
  assert.equal(off.s, 200)
  assert.equal(off.d.step.has_reference, false)
})

test('publicar: barra etapa marcada para validação até confirmação explícita', async () => {
  const semConfirmar = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/publicar', { id: v1.id })
  assert.equal(semConfirmar.s, 409)
  assert.equal(semConfirmar.d.code, 'REVIEW_PENDING')
  assert.ok(semConfirmar.d.steps.length, 'diz qual etapa precisa de validação')

  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/publicar', { id: v1.id, confirm_review: true })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.version.status, 'publicada')
  assert.ok(r.d.version.published_at)
  assert.ok(r.d.version.locked_at)
})

test('versão publicada não se edita', async () => {
  const steps = (await call(adm.jar, 'GET', '/api/adm/avaliacao/etapas?version_id=' + v1.id))
  assert.equal(steps.d.version.editable, false)
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { id: steps.d.steps[0].id, title: 'Tentando editar publicada' })
  assert.equal(r.s, 409)
  assert.equal(r.d.code, 'VERSION_LOCKED')
  assert.equal((await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas/ordem', { version_id: v1.id, order: steps.d.steps.map(s => s.id) })).d.code, 'VERSION_LOCKED')
  assert.equal((await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/publicar', { id: v1.id, confirm_review: true })).s, 409)
})

// ---- o teste central do módulo ----
test('publicar versão nova NÃO muda a avaliação em andamento', async () => {
  // o aluno começa um ciclo na v1
  const pedido = await call(adm.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno.id, protocol_id: copia.id })
  assert.equal(pedido.s, 201, JSON.stringify(pedido.d))
  const av = pedido.d.assessment
  assert.equal(av.protocol_version_id, v1.id)

  await login(aluno)
  assert.equal((await call(aluno.jar, 'POST', '/api/avaliacao-postural/start', { id: av.id })).s, 200)
  assert.equal((await call(aluno.jar, 'POST', '/api/avaliacao-postural/consent', { id: av.id, granted: true, share_granted: true })).s, 200)
  const antes = await call(aluno.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  const tituloAntes = antes.d.steps[0].title
  const qtdAntes = antes.d.steps.length

  // o admin cria a v2, muda a primeira etapa e acrescenta outra
  await login(adm)
  const v2 = (await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes', { protocol_id: copia.id })).d
  assert.equal(v2.version.version, 2)
  assert.equal(v2.steps, 18, 'a versão nova nasce com as etapas copiadas')
  const stepsV2 = (await call(adm.jar, 'GET', '/api/adm/avaliacao/etapas?version_id=' + v2.version.id)).d.steps
  await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { id: stepsV2[0].id, title: 'TÍTULO MUDADO NA V2' })
  await call(adm.jar, 'POST', '/api/adm/avaliacao/etapas', { version_id: v2.version.id, title: 'Etapa só da v2', instructions: ['nova'] })
  assert.equal((await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/publicar', { id: v2.version.id, confirm_review: true })).s, 200)

  // a avaliação em andamento continua exatamente como estava
  await login(aluno)
  const depois = await call(aluno.jar, 'GET', '/api/avaliacao-postural/item?id=' + av.id)
  assert.equal(depois.d.assessment.protocol_version_id, v1.id, 'a versão pinada não muda')
  assert.equal(depois.d.steps.length, qtdAntes, 'a etapa nova da v2 não aparece no ciclo em andamento')
  assert.equal(depois.d.steps[0].title, tituloAntes, 'o título mudado na v2 não vaza para o ciclo em andamento')
  assert.equal(JSON.stringify(depois.d).includes('TÍTULO MUDADO NA V2'), false)

  // e um pedido novo já nasce na v2
  await login(adm)
  const aluno2 = await account('aluno2'); await unlock(aluno2)
  await q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$2,'admin') on conflict do nothing`, [tenant, adm.id, aluno2.id])
  const novo = await call(adm.jar, 'POST', '/api/pro/avaliacoes/solicitar', { student_id: aluno2.id, protocol_id: copia.id })
  assert.equal(novo.s, 201, JSON.stringify(novo.d))
  assert.equal(novo.d.assessment.protocol_version_id, v2.version.id, 'pedido novo usa a versão publicada mais recente')
  copia.v2 = v2.version.id
})

test('orientações gerais e preparação só mudam em rascunho', async () => {
  const bloqueada = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/orientacoes', { id: copia.v2, general_instructions: ['x'] })
  assert.equal(bloqueada.s, 409)
  assert.equal(bloqueada.d.code, 'VERSION_LOCKED')

  const v3 = (await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes', { protocol_id: copia.id })).d.version
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/orientacoes', {
    id: v3.id,
    general_instructions: ['Local bem iluminado.', 'Câmera na altura do umbigo.'],
    preparation: [{ label: 'Pés descalços', help: 'Sem meias nem tênis.' }, { label: 'Roupa adequada' }],
    clothing_note: 'Sunga ou short justo escuro.'
  })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.version.general_instructions.length, 2)
  assert.equal(r.d.version.preparation[0].key, 'pes-descalcos')
  assert.equal(r.d.version.preparation[0].help, 'Sem meias nem tênis.')
})

test('termo do módulo é versionado e não se reescreve em versão já aceita', async () => {
  const vazio = await call(adm.jar, 'POST', '/api/adm/avaliacao/termos', { version: '1.0', body: 'curto' })
  assert.equal(vazio.s, 400)

  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/termos',
    { version: 'ap-1.0', body: 'Autorizo o tratamento das minhas fotos e vídeos para a avaliação postural, conforme a política de privacidade.' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(r.d.termo.version, 'ap-1.0')

  const mesmaVersao = await call(adm.jar, 'POST', '/api/adm/avaliacao/termos', { version: 'ap-1.0', body: 'Texto diferente com o mesmo número de versão, o que não pode passar.' })
  assert.equal(mesmaVersao.s, 409)
  assert.equal(mesmaVersao.d.code, 'VERSION_IN_USE')

  const nova = await call(adm.jar, 'POST', '/api/adm/avaliacao/termos', { version: 'ap-1.1', body: 'Texto novo em versão nova, que os alunos vão aceitar de novo.' })
  assert.equal(nova.s, 200)

  const get = await call(adm.jar, 'GET', '/api/adm/avaliacao/termos')
  assert.equal(get.d.termo.version, 'ap-1.1')
  assert.ok(get.d.aceites.some(a => a.document === 'avaliacao_postural'), 'o histórico de aceites aparece agrupado')
})

test('indicadores trazem estados, pendências e consumo de armazenamento', async () => {
  const r = await call(adm.jar, 'GET', '/api/adm/avaliacao/metricas')
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal(typeof r.d.assessments.total, 'number')
  assert.ok(r.d.assessments.total >= 2)
  assert.equal(typeof r.d.pendencias.recapturas, 'number')
  assert.equal(typeof r.d.armazenamento.bytes, 'number')
  assert.equal(r.d.armazenamento.limite_gratuito_bytes, 10 * 1024 ** 3, 'o painel mostra o teto do plano gratuito do R2')
  assert.equal(typeof r.d.armazenamento.percentual_gratuito, 'number')
  assert.equal(r.d.armazenamento.driver, 'local')
  assert.equal(typeof r.d.retencao_dias, 'number')   // o valor corrente; o teste de retenção verifica a troca
  assert.ok(Array.isArray(r.d.por_mes))
})

test('retenção é configurável com limites e mostra o que seria apagado', async () => {
  assert.equal((await call(adm.jar, 'POST', '/api/adm/avaliacao/retencao', { retencao_dias: 10 })).s, 400)
  assert.equal((await call(adm.jar, 'POST', '/api/adm/avaliacao/retencao', { retencao_dias: 99999 })).s, 400)
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/retencao', { retencao_dias: 365 })
  assert.equal(r.s, 200)
  assert.equal(r.d.retencao_dias, 365)
  const get = await call(adm.jar, 'GET', '/api/adm/avaliacao/retencao')
  assert.equal(get.d.retencao_dias, 365)
  assert.equal(typeof get.d.a_apagar.arquivos, 'number')
})

test('auditoria do ciclo junta eventos do módulo e ações de negócio', async () => {
  const av = (await q(`select id from posture_assessments where tenant_id=$1 order by created_at desc limit 1`, [tenant])).rows[0]
  const r = await call(adm.jar, 'GET', '/api/adm/avaliacao/auditoria?id=' + av.id)
  assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.ok(Array.isArray(r.d.events))
  assert.ok(Array.isArray(r.d.actions))
  assert.ok(r.d.events.some(e => e.event === 'avaliacao.solicitada'))
  assert.equal((await call(adm.jar, 'GET', '/api/adm/avaliacao/auditoria?id=' + crypto.randomUUID())).s, 404)
})

test('protocolo novo do zero nasce com rascunho v1 e nome único', async () => {
  const r = await call(adm.jar, 'POST', '/api/adm/avaliacao/protocolos', { name: 'Protocolo Express ' + RUN, audience: 'geral', description: 'Três etapas.' })
  assert.equal(r.s, 201, JSON.stringify(r.d))
  assert.equal(r.d.version.version, 1)
  assert.equal(r.d.version.status, 'rascunho')
  const dup = await call(adm.jar, 'POST', '/api/adm/avaliacao/protocolos', { name: 'Protocolo Express ' + RUN })
  assert.equal(dup.s, 409)

  // sem etapa não publica
  const vazio = await call(adm.jar, 'POST', '/api/adm/avaliacao/versoes/publicar', { id: r.d.version.id })
  assert.equal(vazio.s, 409)
  assert.equal(vazio.d.code, 'NO_STEPS')
})

test.after(async () => { await pool.end() })
