// Smoke test fase 2: comunidade e ranking (chamado por smoke.mjs com o contexto da fase 1)
export async function run({ stu, adm, p1, p2, sid, P1, get, post, check, origin }) {
  console.log('Recuperação de senha')
  // V4 F7: redefinir a senha desconecta os aparelhos da conta — por isso o fluxo usa uma conta descartável, não o aluno do smoke
  const terms = (await get(null, '/api/terms')).d.terms
  const reg = await post(null, '/api/auth/register', { name: 'Reset Smoke', email: `reset${Date.now()}@e2e.local`, password: 'e2e-Avadesk-2026', accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, plan_id: 'individual' })
  const me = reg.d.user, rid = me.id
  await post(adm, '/api/adm/users/status', { id: rid, status: 'ativo' })
  check((await post(null, '/api/auth/forgot', { email: me.email })).s === 200, 'pedido de recuperação (resposta genérica)')
  check((await post(stu, '/api/adm/users/reset-link', { id: sid })).s === 403, 'aluno não gera link de redefinição')
  const link = (await post(adm, '/api/adm/users/reset-link', { id: rid })).d.link, tok = link.split('t=')[1]
  check((await post(null, '/api/auth/reset', { token: tok, password: 'nova-senha-123' })).s === 200, 'redefinição com link de uso único')
  check((await post(null, '/api/auth/reset', { token: tok, password: 'outra-senha-123' })).s === 400, 'link não pode ser reutilizado')
  check((await post(null, '/api/auth/login', { email: me.email, password: 'nova-senha-123' })).s === 200, 'login com a nova senha')
  check((await get(reg.d.token, '/api/auth/me')).s === 401, 'V4: redefinir a senha desconecta os aparelhos antigos')

  console.log('Fase 2 — comunidade')
  check((await post(stu, '/api/posts', { title: 'Post de aluno', body: 'não pode' })).s === 403, 'aluno não publica')
  check((await post(stu, '/api/uploads', { data: 'data:image/png;base64,iVBORw0KGgo=' })).s === 403, 'aluno não envia fotos')
  await post(adm, '/api/adm/professionals', { user_id: P1.user_id, can_publish: true, state: 'ativo' })
  let r = await post(p1, '/api/posts', { scope: 'sistema', title: 'Técnica do agachamento', body: 'Mantenha os pés firmes.', category: 'tecnica' })
  check(r.s === 201, 'profissional autorizado publica'); const pid = r.d.id
  check((await post(p1, '/api/uploads', { data: 'data:image/png;base64,' + Buffer.from('nao-e-imagem').toString('base64') })).s === 400, 'upload valida o arquivo de imagem')
  check((await get(stu, '/api/feed')).d.posts[0]?.id === pid, 'feed cronológico mostra a publicação mais recente')
  await post(stu, '/api/posts/like', { id: pid }); r = await post(stu, '/api/posts/like', { id: pid })
  check(r.d.likes === 1, 'curtida idempotente (máx. 1 por usuário)')
  r = await post(stu, '/api/posts/like', { id: pid, on: false }); check(r.d.likes === 0, 'retirar curtida')
  await post(stu, '/api/posts/like', { id: pid })
  await post(adm, '/api/adm/settings', { comentarios_alunos: false })
  check((await post(stu, '/api/comments', { post_id: pid, body: 'Ótimo!' })).s === 403, 'comentários de alunos desativados por padrão')
  check((await post(p2, '/api/comments', { post_id: pid, body: 'Complementando…' })).s === 201, 'profissional comenta')
  await post(adm, '/api/adm/settings', { comentarios_alunos: true })
  r = await post(stu, '/api/comments', { post_id: pid, body: 'Sinto dor no joelho quando faço' })
  check(r.s === 201 && !!r.d.hint, 'admin libera comentários; relato de dor recebe orientação de canal')
  await post(adm, '/api/adm/settings', { comentarios_alunos: false })
  check((await post(stu, '/api/follows', { professional_id: P1.user_id })).d.following, 'aluno segue profissional')
  check((await get(stu, '/api/feed?following=1')).d.posts.some(p => p.id === pid), 'filtro Seguindo')
  check((await get(stu, '/api/care')).d.professionals.length === 0, 'seguir não cria vínculo')
  r = await post(stu, '/api/reports', { target_type: 'post', target_id: pid, reason: 'prejudicial' })
  check(r.s === 201 && (await get(stu, '/api/feed')).d.posts.some(p => p.id === pid), 'denúncia não remove automaticamente')
  check((await get(stu, '/api/adm/reports?status=pendente')).s === 403, 'aluno não acessa moderação')
  const rep = (await get(adm, '/api/adm/reports?status=pendente')).d.reports.find(x => x.target_id === pid)
  check((await post(adm, '/api/adm/reports/decide', { id: rep.id, decision: 'ocultar' })).s === 400, 'decisão exige motivo')
  check((await post(adm, '/api/adm/reports/decide', { id: rep.id, decision: 'ocultar', reason: 'revisar informação' })).s === 200, 'admin oculta com motivo')
  check(!(await get(stu, '/api/feed')).d.posts.some(p => p.id === pid), 'conteúdo oculto sai do feed')
  check((await get(stu, '/api/post?id=' + pid)).s === 404, 'aluno não vê publicação oculta')
  await post(adm, '/api/adm/professionals', { user_id: P1.user_id, can_publish: false })
  check((await post(p1, '/api/posts', { scope: 'sistema', title: 'Outra', body: 'texto' })).s === 403, 'publicação é permissão por profissional')
  await post(adm, '/api/adm/professionals', { user_id: P1.user_id, can_publish: true })

  console.log('Fase 2 — ranking')
  const ex = (await get(stu, '/api/exercises/search?q=a')).d.exercises
  const now = new Date(), sess = (cid, n, pres) => post(stu, '/api/guided/sessions', { ...origin, client_id: cid, workout_name: 'Treino teste', started_at: new Date(now - 3600e3).toISOString(), finished_at: now.toISOString(),
    prescribed_count: pres, sets: ex.slice(0, n).map((e, i) => ({ exercise_id: e.id, set_index: 0, weight: 10, reps: 10, done_at: now.toISOString() })) })
  const base = (await get(stu, '/api/ranking?period=semana')).d.me?.points || 0
  await sess('rk-' + sid + '-1', 2, 2)
  r = (await get(stu, '/api/ranking?period=semana')).d
  check(r.me.points === base + 100, 'sessão válida = 100 pontos')
  check(!r.top.some(x => x.points === r.me.points && x.name === 'Aluno Teste'), 'privado por padrão: não aparece na lista')
  await sess('rk-' + sid + '-1', 2, 2)
  check((await get(stu, '/api/ranking?period=semana')).d.me.points === base + 100, 'mesma sessão não pontua duas vezes')
  await sess('rk-' + sid + '-2', 2, 2)
  r = (await get(stu, '/api/ranking?period=semana')).d
  check(r.me.sessions === 2 && r.me.days === 1 && r.me.bonus === 0, 'várias sessões no mesmo dia não aumentam o bônus')
  await sess('rk-' + sid + '-3', 1, 5)
  check((await get(stu, '/api/ranking?period=semana')).d.me.sessions === 2, 'sessão abaixo de 80% dos exercícios não pontua')
  await post(stu, '/api/ranking/prefs', { public: true, display_name: 'Aluno Teste' })
  r = (await get(stu, '/api/ranking?period=semana')).d
  check(r.me.position >= 1 && r.top.some(x => x.position === r.me.position), 'participação pública: aparece com posição')
  check((await get(stu, '/api/ranking?period=mes')).d.me.sessions === 2, 'ranking mensal calculado separadamente')
  check((await get(p1, '/api/ranking')).s === 403, 'profissionais não participam do ranking de alunos')
  const adr = (await get(adm, '/api/adm/ranking?period=semana')).d
  const row = adr.rows.find(x => x.id === sid)
  check(row && row.list.length === 2, 'admin consulta os registros que geraram pontos')
  check((await post(adm, '/api/adm/ranking/invalidate', { session_id: row.list[0].id, reason: 'x' })).s === 400, 'invalidação exige justificativa')
  check((await post(adm, '/api/adm/ranking/invalidate', { session_id: row.list[0].id, reason: 'registro duplicado confirmado' })).s === 200, 'admin invalida com justificativa')
  check((await get(stu, '/api/ranking?period=semana')).d.me.sessions === 1, 'pontuação recalculada após invalidação')
  await post(stu, '/api/ranking/prefs', { public: false })
  r = (await get(stu, '/api/ranking?period=semana')).d
  check(!r.me.position && r.me.points > 0, 'desativar participação preserva a pontuação pessoal')
  check((await get(adm, '/api/adm/audit')).d.audit.some(a => a.action === 'ranking.sessao_invalidada'), 'correção registrada na auditoria')
}
