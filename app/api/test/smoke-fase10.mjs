// Smoke test fase 10 (V5-B): desafios — assistente, publicação, estados, regras versionadas, inscrições, convites, equipes, permissões
import '../env.js'
import { q } from '../db/pool.js'
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 10 — desafios')
  const t = Date.now(), day = 86400e3, iso = d => new Date(Date.now() + d).toISOString()
  const base = { name: 'Outubro ativo ' + t, description: 'Treine 12 vezes', category: 'consistencia', type: 'meta_individual', metric: 'sessoes', goal: 12, starts_at: iso(day), ends_at: iso(31 * day), audience: 'aberto', proof: 'nenhuma' }
  check((await get(stu, '/api/challenge-categories')).d.categories.length >= 5, 'categorias com limites de duração')
  check((await post(stu, '/api/challenges', { ...base, official: true })).s === 403, 'aluno não cria desafio oficial')
  let r = await post(stu, '/api/challenges', base); check(r.s === 201 && r.d.status === 'rascunho', 'aluno salva rascunho do desafio amador'); const c1 = r.d.id
  check(!(await get(p2, '/api/challenges?view=explorar&q=' + encodeURIComponent(base.name))).d.challenges.length && (await get(p2, '/api/challenge?id=' + c1)).s === 404, 'rascunho não aparece para ninguém')
  r = await post(stu, '/api/challenges', { ...base, id: c1, ends_at: iso(day + 3 * day) }); check(r.s === 200, 'rascunho editável sem justificativa')
  check((await post(stu, '/api/challenges/publish', { id: c1 })).s === 400, 'publicação valida a duração mínima da categoria')
  await post(stu, '/api/challenges', { ...base, id: c1 })
  r = await post(stu, '/api/challenges/publish', { id: c1 }); check(r.s === 200 && r.d.status === 'inscricoes_abertas', 'publicado: inscrições abertas (início agendado)')
  check((await get(p2, '/api/challenges?view=explorar&q=' + encodeURIComponent(base.name))).d.challenges.some(x => x.id === c1), 'aparece em Explorar')
  check((await get(stu, '/api/challenges?view=criados')).d.challenges.some(x => x.id === c1), 'aparece em Criados por mim')
  check((await post(stu, '/api/challenges', { ...base, id: c1, goal: 15 })).d.needs_reason, 'mudar regra publicada exige justificativa')
  r = await post(stu, '/api/challenges', { ...base, id: c1, goal: 15, reason: 'Ajuste da meta a pedido do grupo' })
  let d = (await get(stu, '/api/challenge?id=' + c1)).d
  check(r.s === 200 && d.challenge.rules_version === 2 && d.versions.length === 2 && d.versions[0].reason, 'alteração gera nova versão com justificativa')
  check((await post(p1, '/api/challenges/join', { id: c1 })).d.status === 'aprovado', 'inscrição em desafio aberto')
  check((await post(p1, '/api/challenges/join', { id: c1 })).s === 409, 'inscrição duplicada bloqueada')
  check((await get(p1, '/api/challenges?view=participando')).d.challenges.some(x => x.id === c1), 'aparece em Participando')
  check((await post(p1, '/api/challenges/transition', { id: c1, to: 'cancelado', reason: 'x' })).s === 403, 'participante não altera estado')
  check((await post(stu, '/api/challenges/transition', { id: c1, to: 'concluido' })).s === 409, 'transição inválida é recusada (inscrições → concluído)')
  check((await post(stu, '/api/challenges/transition', { id: c1, to: 'suspenso', reason: 'teste' })).s === 403, 'só admin suspende')
  // início pelo relógio: congela regras e ativa inscritos
  await q(`update challenges set starts_at=now() - interval '1 hour' where id=$1`, [c1])
  d = (await get(stu, '/api/challenge?id=' + c1)).d
  check(d.challenge.status === 'em_andamento' && d.challenge.frozen_at && d.me === null && d.members.find(m => m.user_id === P1.user_id)?.status === 'ativo', 'no início: em andamento, regras congeladas e inscritos ativos')
  check((await post(stu, '/api/challenges', { ...base, id: c1, goal: 20, reason: 'Quero mudar a meta' })).s === 403, 'regra de pontuação congelada para o organizador')
  check((await post(p2, '/api/challenges/join', { id: c1 })).s === 409, 'sem entrada tardia quando desativada')
  check((await post(adm, '/api/challenges', { ...base, starts_at: d.challenge.starts_at, id: c1, goal: 14, reason: 'Correção administrativa' })).s === 200, 'admin corrige com justificativa')
  check((await post(adm, '/api/challenges/transition', { id: c1, to: 'suspenso', reason: 'Denúncia' })).s === 200 && (await get(p2, '/api/challenge?id=' + c1)).s === 404, 'admin suspende; desafio some')
  check((await post(adm, '/api/challenges/transition', { id: c1, restore: true, reason: 'Revisado' })).s === 200 && (await get(p2, '/api/challenge?id=' + c1)).d.challenge.status === 'em_andamento', 'admin reativa ao estado anterior')
  await q(`update challenges set ends_at=now() - interval '1 minute' where id=$1`, [c1])
  check((await get(stu, '/api/challenge?id=' + c1)).d.challenge.status === 'apurando', 'no fim: apuração')
  check((await post(stu, '/api/challenges/transition', { id: c1, to: 'concluido' })).s === 200, 'organizador conclui após apurar')
  check((await get(p1, '/api/challenges?view=historico')).d.challenges.some(x => x.id === c1), 'aparece no Histórico')
  check((await get(p1, '/api/notifications')).d.notifications.some(n => n.title === 'O desafio começou' && n.link === '/desafio/' + c1), 'notificação de início com link profundo')
  // privado + convites + profissional
  // V4.3 escopo: desafio de profissional fica no escopo dos clientes dele; o privado da comunidade geral e criado pelo admin
  r = await post(adm, '/api/challenges', { ...base, name: 'Turma fechada ' + t, audience: 'convite' }); const c2 = r.d.id
  await post(adm, '/api/challenges/publish', { id: c2 })
  check(!(await get(p2, '/api/challenges?view=explorar&q=' + encodeURIComponent('Turma fechada ' + t))).d.challenges.length && (await get(p2, '/api/challenge?id=' + c2)).s === 404, 'desafio privado nunca aparece em Explorar nem abre')
  check((await post(p2, '/api/challenges/join', { id: c2 })).s === 403, 'privado exige convite')
  check((await post(p1, '/api/challenges/invite-students', { id: c2, student_ids: [P1.user_id] })).s === 403, 'profissional só convida alunos vinculados')
  r = await post(adm, '/api/challenges/invites', { id: c2, max_uses: 1 }); const code = r.d.invite.code
  check((await post(p2, '/api/challenges/join', { id: c2, code })).d.status === 'aprovado', 'convite por código dá entrada')
  check((await post(stu, '/api/challenges/join', { id: c2, code })).s === 400, 'convite esgotado')
  // aprovação
  r = await post(stu, '/api/challenges', { ...base, name: 'Com aprovação ' + t, audience: 'aprovacao', max_participants: 2 }); const c3 = r.d.id; await post(stu, '/api/challenges/publish', { id: c3 })
  check((await post(p1, '/api/challenges/join', { id: c3 })).d.status === 'solicitado', 'pedido de inscrição')
  check((await post(stu, '/api/challenges/decide', { id: c3, user_id: P1.user_id, approve: false })).s === 400, 'recusa exige motivo')
  check((await post(stu, '/api/challenges/decide', { id: c3, user_id: P1.user_id, approve: true })).s === 200, 'organizador aprova')
  check((await post(stu, '/api/challenges/remove', { id: c3, user_id: P1.user_id, reason: 'Conta duplicada', disqualify: true })).s === 200, 'organizador desclassifica com motivo')
  check((await post(p1, '/api/challenges/join', { id: c3 })).s === 409, 'desclassificado não volta')
  // equipes
  check((await post(stu, '/api/challenges/publish', { id: (await post(stu, '/api/challenges', { ...base, name: 'Times ' + t, type: 'competicao_equipes', goal: null, teams: ['Azul'] })).d.id })).s === 400, 'competição de equipes exige 2+ equipes e tamanho mínimo')
  r = await post(stu, '/api/challenges', { ...base, name: 'Times ok ' + t, type: 'competicao_equipes', goal: null, teams: ['Azul', 'Verde'], team_min: 1, team_max: 1 }); const c4 = r.d.id
  check((await post(stu, '/api/challenges/publish', { id: c4 })).s === 200, 'competição de equipes publicada')
  const teams = (await get(p1, '/api/challenge?id=' + c4)).d.teams
  check((await post(p1, '/api/challenges/join', { id: c4 })).s === 400, 'equipe obrigatória na inscrição')
  check((await post(p1, '/api/challenges/join', { id: c4, team_id: teams[0].id })).s === 200 && (await post(p2, '/api/challenges/join', { id: c4, team_id: teams[0].id })).s === 409, 'tamanho máximo da equipe respeitado')
  check((await post(stu, '/api/adm/challenge-categories', { id: 'geral', min_days: 3, max_days: 60 })).s === 403, 'só admin altera limites de categoria')
  check((await post(adm, '/api/adm/challenge-categories', { id: 'geral', min_days: 50, max_days: 10 })).s === 400, 'limites inválidos recusados')
  check((await post(adm, '/api/adm/challenge-categories', { id: 'geral', min_days: 7, max_days: 90 })).s === 200, 'admin edita limites por categoria')
  check((await get(adm, '/api/challenge-categories')).d.categories.find(c => c.id === 'geral').max_days === 90, 'limites salvos')
  check((await get(adm, '/api/adm/challenges')).d.challenges.length >= 4, 'admin lista desafios')
  const acts = (await get(adm, '/api/adm/audit')).d.audit.map(a => a.action)
  check(['desafio.publicado', 'desafio.suspenso', 'desafio.desclassificado', 'desafio.editado'].every(a => acts.includes(a)), 'publicação, suspensão, desclassificação e edição na auditoria')
}
