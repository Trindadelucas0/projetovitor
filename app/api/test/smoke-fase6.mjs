// Smoke test fase 6: admin gestor — editar e excluir (com confirmação, soft delete e auditoria)
export async function run({ adm, p1, p2, stu, sid, P1, P2, get, post, check }) {
  console.log('Fase 6 — admin edita e exclui')
  const t = Date.now()
  // permissões
  for (const [path, body] of [['/api/adm/users/update', { id: sid, name: 'X', email: 'x\u0040x.com' }], ['/api/adm/posts/delete', { id: sid, confirm: 'EXCLUIR' }], ['/api/adm/plans/save', { student_id: sid, title: 'X', days: [] }]])
    check((await post(p1, path, body)).s === 403 && (await post(stu, path, body)).s === 403, `só admin: ${path}`)
  // usuários: editar e excluir
  let r = await post(adm, '/api/adm/users/create', { name: 'Para Editar', email: `edit${t}@e2e.local`, type: 'aluno', password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-temporaria') }); const eid = r.d.id
  check((await post(adm, '/api/adm/users/update', { id: eid, name: 'Editado', email: 'pro1.e2e\u0040avadesk.local' })).s === 409, 'editar: e-mail único')
  check((await post(adm, '/api/adm/users/update', { id: eid, name: 'Editado', email: `editado${t}@e2e.local` })).s === 200, 'admin edita nome e e-mail')
  check((await post(adm, '/api/adm/users/delete', { id: eid })).s === 400, 'excluir exige confirmação EXCLUIR')
  check((await post(adm, '/api/adm/users/delete', { id: eid, confirm: 'EXCLUIR', reason: 'teste' })).d.anonymized, 'excluir conta anonimiza (histórico preservado)')
  check((await fetch((process.env.API || 'http://localhost:8787') + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `editado${t}@e2e.local`, password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-temporaria') }) })).status !== 200, 'conta excluída não entra')
  const me = (await get(adm, '/api/auth/me')).d.user
  check((await post(adm, '/api/adm/users/delete', { id: me.id, confirm: 'EXCLUIR' })).s === 400, 'admin não exclui a própria conta')
  // profissional: perfil e habilitações
  check((await post(adm, '/api/adm/professionals/profile', { user_id: P2.user_id, display_name: 'Prof. Bruno (editado)', bio: 'Bio', specialties: 'Musculação, Mobilidade' })).s === 200, 'admin edita perfil do profissional')
  r = await post(adm, '/api/adm/qualifications/save', { user_id: P2.user_id, kind: 'CREFITO', number: '999', area: 'Mobilidade', status: 'verificada' })
  check(r.s === 201, 'admin cadastra habilitação já verificada'); const qid = r.d.id
  check((await post(adm, '/api/adm/qualifications/save', { id: qid, kind: 'CREFITO', number: '1000', area: 'Mobilidade', status: 'rejeitada' })).s === 200, 'admin edita habilitação')
  check((await post(adm, '/api/adm/qualifications/delete', { id: qid })).s === 400 && (await post(adm, '/api/adm/qualifications/delete', { id: qid, confirm: 'EXCLUIR' })).s === 200, 'excluir habilitação com confirmação')
  // ficha do aluno
  check((await post(adm, '/api/adm/student/record', { id: sid, anamnese: { objetivo: 'x' } })).s === 400, 'ficha: validação dos campos')
  check((await post(adm, '/api/adm/student/record', { id: sid, anamnese: { objetivo: 'strength', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: 'joelho' } })).s === 200, 'admin edita a anamnese')
  r = await post(adm, '/api/adm/restrictions/save', { user_id: sid, code: 'lombar', severity: 2, notes: 'evitar carga axial' }); const rid = r.d.id
  check(r.s === 201 && (await post(adm, '/api/adm/restrictions/save', { id: rid, code: 'lombar', severity: 3 })).s === 200, 'admin cria e edita restrição')
  const rec = (await get(adm, '/api/adm/student/record?id=' + sid)).d
  check(rec.anamnese.objetivo === 'strength' && rec.restrictions.some(x => x.id === rid && x.severity === 3), 'ficha lida pelo admin')
  check((await post(adm, '/api/adm/restrictions/delete', { id: rid, confirm: 'EXCLUIR' })).s === 200, 'admin exclui restrição')
  // treinos do aluno
  const ex = (await get(adm, '/api/pro/library?q=a')).d.exercises[0]
  check((await post(adm, '/api/adm/plans/save', { student_id: sid, title: 'Admin A', status: 'ativo', days: [{ name: 'A', exercises: [{ exercise_id: 'nao-existe', sets: 3 }] }] })).s === 400, 'treino: só exercícios da biblioteca')
  r = await post(adm, '/api/adm/plans/save', { student_id: sid, title: 'Treino do admin', goal: 'strength', status: 'ativo', days: [{ name: 'A', exercises: [{ exercise_id: ex.id, sets: 3, reps_max: 10 }] }] })
  check(r.s === 201, 'admin cria treino para o aluno'); const pid = r.d.id
  check((await post(adm, '/api/adm/plans/save', { id: pid, title: 'Treino do admin v2', status: 'ativo', days: [{ name: 'A', exercises: [{ exercise_id: ex.id, sets: 4, reps: '8-12' }] }] })).s === 200, 'admin edita treino (nova versão)')
  let tr = (await get(adm, '/api/adm/student/training?id=' + sid)).d
  check(tr.plans.some(p => p.id === pid && p.version === 2), 'admin vê treinos, programas, sessões e vínculos do aluno')
  check((await post(adm, '/api/adm/plans/delete', { id: pid, confirm: 'EXCLUIR' })).d.archived, 'excluir treino = arquivar (histórico preservado)')
  if (tr.sessions[0]) check((await post(adm, '/api/adm/sessions/void', { id: tr.sessions[0].id, confirm: 'EXCLUIR' })).s === 400 && (await post(adm, '/api/adm/sessions/void', { id: tr.sessions[0].id, confirm: 'EXCLUIR', reason: 'registro duplicado' })).d.voided, 'anular sessão exige motivo (soft delete)')
  // vínculos: transferir
  const link = tr.links.find(l => l.status === 'ativo')
  if (link) {
    check((await post(adm, '/api/adm/links/transfer', { link_id: link.id, coach_id: P2.user_id, confirm: true })).s === 400, 'transferir exige motivo')
    r = await post(adm, '/api/adm/links/transfer', { link_id: link.id, coach_id: link.coach_id === P1.user_id ? P2.user_id : P1.user_id, reason: 'teste de transferência', confirm: true })
    check(r.s === 200 || (r.s === 409 && r.d.reasons), 'transferência revalida as regras do vínculo (ou explica o motivo)')
  }
  // comunidade
  r = await post(p1, '/api/posts', { title: 'Post para moderar', body: 'Texto original', category: 'tecnica' }); const post1 = r.d.id
  check((await get(adm, '/api/adm/posts?q=moderar')).d.posts.some(p => p.id === post1), 'admin lista publicações')
  check((await post(adm, '/api/adm/posts/update', { id: post1, title: 'Post editado', body: 'Texto corrigido', status: 'oculto' })).s === 400, 'ocultar exige motivo')
  check((await post(adm, '/api/adm/posts/update', { id: post1, title: 'Post editado', body: 'Texto corrigido', status: 'publicado' })).s === 200, 'admin edita publicação')
  r = await post(p1, '/api/comments', { post_id: post1, body: 'comentário' })
  const cm = (await get(adm, '/api/adm/comments?post_id=' + post1)).d.comments[0]
  if (cm) {
    check((await post(adm, '/api/adm/comments/update', { id: cm.id, body: 'comentário editado', status: 'visivel' })).s === 200, 'admin edita comentário')
    check((await post(adm, '/api/adm/comments/delete', { id: cm.id, confirm: 'EXCLUIR' })).d.removed, 'admin remove comentário')
  }
  check((await post(adm, '/api/adm/posts/delete', { id: post1, confirm: 'EXCLUIR', reason: 'teste' })).d.removed, 'admin remove publicação (soft delete)')
  check(!(await get(stu, '/api/feed')).d.posts.some(p => p.id === post1), 'publicação removida sai do feed')
  // exercícios
  r = await post(adm, '/api/adm/exercises/save', { name_pt: 'Exercício do admin ' + t, instructions_pt: 'Faça assim', level: 'beginner' }); const xid = r.d.id
  check(r.s === 201, 'admin cria exercício')
  check((await post(adm, '/api/adm/exercises/save', { id: xid, name_pt: 'Exercício editado ' + t, level: 'nivel-x' })).s === 400, 'exercício: validação')
  check((await post(adm, '/api/adm/exercises/save', { id: xid, name_pt: 'Exercício editado ' + t, level: 'advanced' })).s === 200, 'admin edita exercício')
  check((await post(adm, '/api/adm/exercises/archive', { id: xid, confirm: 'EXCLUIR' })).d.archived, 'excluir exercício = arquivar')
  check(!(await get(p1, '/api/pro/library?q=' + encodeURIComponent('editado ' + t))).d.exercises.length, 'exercício arquivado sai da biblioteca')
  check((await post(adm, '/api/adm/exercises/archive', { id: xid, restore: true })).s === 200, 'admin restaura exercício')
  // limpeza: arquiva de novo, senao o exercicio de teste fica na biblioteca do construtor
  check((await post(adm, '/api/adm/exercises/archive', { id: xid, confirm: 'EXCLUIR' })).d.archived, 'exercício de teste arquivado no fim')
  const au = JSON.stringify((await get(adm, '/api/adm/audit')).d)
  check(['usuario.editado', 'usuario.excluido', 'treino.arquivado_admin', 'post.removido_admin', 'exercicio.arquivado'].every(a => au.includes(a)), 'tudo registrado na auditoria')
}
