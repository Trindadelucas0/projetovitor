// Smoke test fase 3: termos (aceite de contas antigas) e LGPD (exportação, pedido de exclusão, fila do admin)
const B = process.env.API || 'http://localhost:8787'
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 3 — LGPD')
  const email = `lgpd${Date.now()}@e2e.local`, terms = (await get(null, '/api/terms')).d.terms
  const reg = await post(null, '/api/auth/register', { name: 'Titular LGPD', email, password: 'senha-forte-1', accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual' })
  const t = reg.d.token, uid = reg.d.user.id
  // V4.1: exportação de dados removida do app → endpoint não existe mais
  check((await get(t, '/api/me/export')).s === 404, 'exportação de dados removida (V4.1)')
  check((await post(t, '/api/me/delete-request', { reason: 'não uso mais' })).s === 200, 'pedido de exclusão criado')
  check((await post(t, '/api/me/delete-request', {})).s === 409, 'só um pedido de exclusão aberto por vez')
  check((await get(p1, '/api/adm/data-requests')).s === 403, 'profissional não vê a fila LGPD')
  const q = (await get(adm, '/api/adm/data-requests')).d.requests.find(r => r.user_id === uid)
  check(!!q, 'pedido aparece na fila do admin')
  check((await post(adm, '/api/adm/data-requests/decide', { id: q.id, action: 'excluir' })).s === 400, 'exclusão exige confirmação explícita (EXCLUIR)')
  check((await post(null, '/api/auth/login', { email, password: 'senha-forte-1' })).s === 200, 'nada é apagado antes da confirmação')
  let r = await post(adm, '/api/adm/data-requests/decide', { id: q.id, action: 'excluir', confirm: 'EXCLUIR', note: 'pedido do titular' })
  check(r.s === 200, 'admin confirma e executa a exclusão (anonimização)')
  check((await post(null, '/api/auth/login', { email, password: 'senha-forte-1' })).s === 401, 'conta excluída não entra mais')
  check((await get(adm, '/api/adm/audit')).d.audit.some(a => a.action === 'lgpd.exclusao_executada'), 'exclusão registrada na auditoria')
  check((await get(adm, '/api/adm/terms')).d.versions.length >= 1, 'admin vê as versões dos termos e os aceites')

  console.log('Fase 3 — contas separadas do profissional')
  check((await get(p1, '/api/guided/today')).s === 403, 'conta profissional não registra treino pessoal')
  // V4 F5: identidade única — a mesma conta pode ter os dois papéis (testado numa conta descartável para não mexer nos fixtures)
  { const terms = (await get(null, '/api/terms')).d.terms
    const reg = await post(null, '/api/auth/register', { name: 'Dupla Smoke', email: `dupla${Date.now()}@e2e.local`, password: 'e2e-Avadesk-2026', accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, plan_id: 'individual' })
    check((await post(adm, '/api/adm/users/role', { id: reg.d.user.id, role: 'profissional', on: true })).s === 200, 'V4: aluno também pode ser profissional na mesma conta')
    const roles = (await get(reg.d.token, '/api/auth/me')).d.user.roles
    check(roles.includes('aluno') && roles.includes('profissional'), 'V4: papel de aluno preservado') }
  check((await post(adm, '/api/adm/users/same-person', { id: P1.user_id, other_id: sid, note: 'teste' })).s === 200, 'admin registra que duas contas são da mesma pessoa (só auditoria)')
  check((await post(p1, '/api/adm/users/same-person', { id: P1.user_id, other_id: sid })).s === 403, 'só admin registra mesma pessoa')
  await post(adm, '/api/adm/users/same-person', { id: P1.user_id })

  console.log('Fase 3 — contato direto do profissional')
  check((await post(p2, '/api/pro/threads', { student_id: sid, body: 'Oi!' })).s === 403, 'profissional não vinculado não inicia conversa')
  await post(adm, '/api/adm/links', { student_id: sid, coach_id: P1.user_id, confirm: true })
  r = await post(p1, '/api/pro/threads', { student_id: sid, body: 'Como foi o treino de hoje?' })
  check(r.s === 201, 'profissional vinculado inicia conversa direta com o aluno')
  check((await get(stu, '/api/thread?id=' + r.d.thread.id)).d.messages?.length === 1, 'aluno vê a mensagem do profissional')
  check((await get(p1, '/api/pro/student?id=' + sid)).d.threads?.some(t => t.id === r.d.thread.id), 'ficha do aluno lista as conversas')

  console.log('Fase 3 — mídia dos exercícios e configurações')
  const exr = (await get(adm, '/api/adm/exercises?q=a')).d.exercises[0]
  check(!!exr, 'admin lista a biblioteca de exercícios')
  check((await get(p1, '/api/adm/exercises?q=a')).s === 403, 'profissional não gerencia a biblioteca')
  check((await post(adm, '/api/adm/exercises/media', { exercise_id: exr.id, kind: 'video', url: 'http://inseguro' })).s === 400, 'URL de mídia precisa ser https')
  r = await post(adm, '/api/adm/exercises/media', { exercise_id: exr.id, kind: 'video', url: 'https://example.com/video.mp4', caption: 'Execução' })
  check(r.s === 201, 'admin adiciona vídeo por URL'); const mid = r.d.id
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64)])
  let up = await fetch(B + '/api/adm/exercises/upload?exercise_id=' + encodeURIComponent(exr.id), { method: 'POST', headers: { Authorization: 'Bearer ' + adm, 'Content-Type': 'video/mp4' }, body: mp4 })
  const upd = await up.json(); check(up.status === 201 && upd.kind === 'video', 'admin envia vídeo (arquivo local)')
  up = await fetch(B + '/api/adm/exercises/upload?exercise_id=' + encodeURIComponent(exr.id), { method: 'POST', headers: { Authorization: 'Bearer ' + adm }, body: Buffer.from('<script>x</script>') })
  check(up.status === 400, 'upload recusa arquivo que não é vídeo/foto')
  const rg = await fetch(B + upd.url, { headers: { Range: 'bytes=0-9' } }); check(rg.status === 206, 'vídeo servido com suporte a Range')
  const m = (await get(stu, '/api/exercises/media?id=' + encodeURIComponent(exr.id))).d
  check(m.exercise && m.media.length >= 2 && 'media_url' in m.exercise, 'aluno vê a mídia padrão + a adicionada')
  await post(adm, '/api/adm/exercises/media/remove', { id: mid })
  check(!(await get(stu, '/api/exercises/media?id=' + encodeURIComponent(exr.id))).d.media.some(x => x.id === mid), 'mídia removida some para o aluno')
  const st = (await get(adm, '/api/adm/settings')).d.settings
  check(st.tenant_name === 'AVAGYM' && st.limite_publicacoes_dia === 5, 'tenant AVAGYM e limite de 5 publicações/dia (configurável)')
  check((await post(p1, '/api/adm/settings', { tenant_name: 'X' })).s === 403, 'só admin altera configurações')
}
