// Smoke test fase 13 (V5-E): troféus ligados ao resultado, premiações oficiais, homologação, empates sem sorteio, entregas
import '../env.js'
import { q } from '../db/pool.js'
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 13 — troféus e premiações')
  const t = Date.now(), day = 86400e3, iso = d => new Date(Date.now() + d).toISOString()
  // troféus
  check((await post(stu, '/api/trophies', { name: 'Porra louca', criterion: 'conclusao' })).s === 400, 'nome ofensivo de troféu recusado')
  let r = await post(stu, '/api/trophies', { name: 'Guerreiro ' + (t % 1000), icon: '🔥', criterion: 'participacao' }); check(r.s === 201 && r.d.status === 'pendente', 'troféu personalizado do aluno vai para moderação'); const custom = r.d.id
  check((await get(adm, '/api/adm/trophies')).d.trophies.some(x => x.id === custom), 'admin vê troféus pendentes')
  check((await post(adm, '/api/adm/trophies/decide', { id: custom, approve: true })).s === 200, 'admin aprova troféu')
  const cat = (await get(stu, '/api/trophies')).d.trophies, sys = k => cat.find(x => x.system && x.kind === k).id
  // desafio oficial com prêmio
  r = await post(adm, '/api/challenges', { name: 'Oficial ' + t, category: 'consistencia', type: 'competicao_individual', metric: 'sessoes', starts_at: iso(day), ends_at: iso(10 * day), audience: 'aberto', proof: 'nenhuma', official: true }); const c = r.d.id
  check((await post(adm, '/api/challenges/publish', { id: c })).s === 200, 'desafio oficial publicado')
  check((await post(adm, '/api/challenges/trophies', { id: c, template_ids: [sys('participacao'), sys('primeiro'), custom] })).d.trophies === 3, 'troféus escolhidos no desafio')
  check((await post(stu, '/api/adm/prizes', { challenge_id: c, name: 'Camiseta', criterion: 'primeiro', quantity: 1, owner: 'Academia', delivery_deadline: '2026-12-01' })).s === 403, 'só admin cria prêmio')
  check((await post(adm, '/api/adm/prizes', { challenge_id: c, name: 'Pix de R$ 100', criterion: 'primeiro', quantity: 1, owner: 'Academia', delivery_deadline: '2026-12-01' })).s === 400, 'prêmio em dinheiro recusado')
  check((await post(adm, '/api/adm/prizes', { challenge_id: c, name: 'Sorteio de brinde', criterion: 'primeiro', quantity: 1, owner: 'Academia', delivery_deadline: '2026-12-01' })).s === 400, 'sorteio recusado')
  r = await post(adm, '/api/adm/prizes', { challenge_id: c, name: 'Camiseta oficial', criterion: 'primeiro', quantity: 1, owner: 'Recepção', delivery_deadline: '2026-12-01', logistics: 'Retirar na recepção' }); check(r.s === 201 && r.d.status === 'configurado', 'prêmio configurado'); const pz = r.d.id
  check(!(await get(p1, '/api/challenges/prizes?id=' + c)).d.prizes.length, 'prêmio só configurado não aparece')
  check((await post(adm, '/api/adm/prizes/transition', { id: pz, to: 'publicado' })).d.status === 'publicado' && (await get(p1, '/api/challenges/prizes?id=' + c)).d.prizes[0]?.public_state === 'provisorio', 'publicado: aparece como provisório')
  for (const tk of [p1, p2, stu]) await post(tk, '/api/challenges/join', { id: c })
  await q(`update challenges set starts_at=now() - interval '40 days' where id=$1`, [c]); await get(adm, '/api/challenge?id=' + c)
  check((await get(adm, '/api/adm/prizes')).d.prizes.find(p => p.id === pz).status === 'aguardando_resultado', 'no início: aguardando resultado')
  const tid = (await q('select tenant_id from users where id=$1', [sid])).rows[0].tenant_id, p2id = (await q(`select id from users where email='pro2.e2e@avadesk.local'`)).rows[0].id
  // período no passado, longe dos treinos das outras fases; empate exato entre P1 e P2 (mesmos dias e horários)
  await q(`delete from sessions where user_id = any($1) and started_at < now() - interval '29 days' and started_at > now() - interval '41 days'`, [[P1.user_id, p2id, sid]])   // limpa execuções anteriores
  const now0 = Date.now(), at = d => new Date(now0 - d * day).toISOString()
  for (const u of [P1.user_id, p2id]) for (const d of [35, 34]) await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status) values($1,$2,$3,$3::timestamptz+interval '30 min','done')`, [tid, u, at(d)])
  await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status) values($1,$2,$3,$3::timestamptz+interval '30 min','done')`, [tid, sid, at(33)])
  const w0 = (await get(adm, '/api/adm/prizes')).d.prizes.find(p => p.id === pz)
  check(!w0.winners.length, 'sem vencedor antes da homologação')
  await q(`update challenges set ends_at=now() - interval '30 days' where id=$1`, [c]); await get(adm, '/api/challenge?id=' + c)
  check((await post(adm, '/api/adm/challenges/homologate', { id: c })).s === 409, 'não homologa resultado em apuração (provisório)')
  check((await post(adm, '/api/challenges/transition', { id: c, to: 'concluido' })).s === 200, 'admin conclui o oficial')
  const tro = (await q('select template_id, user_id from user_trophies where challenge_id=$1', [c])).rows
  check(tro.filter(x => x.template_id === sys('participacao')).length === 3 && tro.some(x => x.template_id === custom), 'troféus de participação e personalizado concedidos pelo resultado')
  check((await get(p1, '/api/me/trophies')).d.trophies.some(x => x.challenge_id === c), 'troféu aparece no perfil')
  check((await get(stu, '/api/users/trophies?user_id=' + P1.user_id)).d.trophies.length >= 1, 'vitrine pública de troféus')
  check((await get(adm, '/api/adm/prizes')).d.prizes.find(p => p.id === pz).status === 'aguardando_homologacao', 'após concluir: aguardando homologação')
  r = await post(adm, '/api/adm/challenges/homologate', { id: c }); check(r.s === 409 && r.d.ties, 'empate acima da quantidade exige decisão do admin (sem sorteio)')
  check((await post(adm, '/api/adm/challenges/recompute', { id: c, reason: 'Correção de sessão' })).s === 200, 'admin recalcula com justificativa antes de homologar')
  check((await post(adm, '/api/adm/challenges/homologate', { id: c, confirm_ties: true, reason: 'Empate: os dois recebem' })).s === 200, 'homologado com empate: todos os empatados recebem')
  const pr = (await get(adm, '/api/adm/prizes')).d.prizes.find(p => p.id === pz)
  check(pr.status === 'entrega_pendente' && pr.winners.length === 2 && pr.quantity === 2, 'vencedores homologados e entrega pendente')
  check((await post(adm, '/api/adm/challenges/recompute', { id: c, reason: 'Tentar mudar' })).s === 409, 'resultado homologado não pode ser alterado')
  check((await get(p1, '/api/challenges/ranking?id=' + c)).d.state === 'homologado', 'ranking mostra homologado')
  check((await post(adm, '/api/adm/prizes/deliver', { winner_id: pr.winners[0].id })).s === 400, 'entrega exige registro')
  await post(adm, '/api/adm/prizes/deliver', { winner_id: pr.winners[0].id, note: 'Retirado na recepção' })
  check((await get(adm, '/api/adm/prizes')).d.prizes.find(p => p.id === pz).status === 'entrega_pendente', 'parcial: continua pendente')
  await post(adm, '/api/adm/prizes/deliver', { winner_id: pr.winners[1].id, note: 'Enviado pelos Correios' })
  check((await get(p1, '/api/challenges/prizes?id=' + c)).d.prizes[0].public_state === 'entregue', 'todos entregues: prêmio entregue')
  check((await q(`select count(*)::int n from notifications where user_id=$1 and kind in ('desafio.premio','desafio.entrega','desafio.trofeu')`, [P1.user_id])).rows[0].n >= 3, 'notificações de troféu, prêmio e entrega')
  // amador não tem prêmio
  r = await post(stu, '/api/challenges', { name: 'Amador ' + t, category: 'geral', type: 'competicao_individual', metric: 'sessoes', starts_at: iso(day), ends_at: iso(10 * day), audience: 'aberto', proof: 'nenhuma' })
  check((await post(adm, '/api/adm/prizes', { challenge_id: r.d.id, name: 'Brinde', criterion: 'primeiro', quantity: 1, owner: 'x', delivery_deadline: '2026-12-01' })).s === 403, 'prêmio só em desafio oficial')
  const acts = (await get(adm, '/api/adm/audit')).d.audit.map(a => a.action)
  check(['premio.configurado', 'desafio.homologado', 'premio.entregue', 'trofeu.aprovado', 'desafio.resultado_recalculado'].every(a => acts.includes(a)), 'premiação e troféus na auditoria')
}
