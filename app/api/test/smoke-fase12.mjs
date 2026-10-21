// Smoke test fase 12 (V6): ranking do desafio calculado no backend, minha posição, entender pontuação, resultado guardado
import '../env.js'
import { q } from '../db/pool.js'
export async function run({ adm, p1, p2, stu, sid, P1, P2, get, post, check }) {
  console.log('Fase 12 — ranking do desafio')
  const t = Date.now(), day = 86400e3, iso = d => new Date(Date.now() + d).toISOString()
  let r = await post(stu, '/api/challenges', { name: 'Ranking ' + t, category: 'consistencia', type: 'competicao_individual', metric: 'sessoes', starts_at: iso(day), ends_at: iso(10 * day), audience: 'aberto', proof: 'nenhuma', tie_break: 'primeiro_a_atingir' }); const c = r.d.id
  await post(stu, '/api/challenges/publish', { id: c })
  check((await get(p1, '/api/challenges/ranking?id=' + c)).d.state === 'nao_iniciado', 'antes do início: ranking ainda não iniciado')
  for (const tk of [p1, p2, stu]) await post(tk, '/api/challenges/join', { id: c })
  await q(`update challenges set starts_at=now() - interval '3 days' where id=$1`, [c]); await get(stu, '/api/challenge?id=' + c)
  const tid = (await q('select tenant_id from users where id=$1', [sid])).rows[0].tenant_id, p2id = (await q(`select id from users where email='pro2.e2e\u0040avadesk.local'`)).rows[0].id
  const mk = async (uid, ago, voided) => (await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status,voided_at) values($1,$2,now()-$3::interval,now()-$3::interval+interval '30 min','done',$4) returning id`, [tid, uid, ago, voided ? new Date() : null])).rows[0].id
  await mk(P1.user_id, '50 hours'); await mk(P1.user_id, '26 hours'); await mk(P1.user_id, '25 hours'); await mk(p2id, '49 hours'); const sv = await mk(sid, '2 hours', true)
  r = (await get(p1, '/api/challenges/ranking?id=' + c)).d
  check(r.state === 'provisorio' && r.mode === 'podio', 'em andamento: classificação provisória com pódio')
  // fixture P1 e compartilhada entre execucoes: o esperado sao os DIAS distintos (fuso SP) com sessao valida desde o inicio do desafio
  const expDays = +(await q(`select count(distinct (started_at at time zone 'America/Sao_Paulo')::date) n from sessions where user_id=$1 and status='done' and voided_at is null and started_at >= now() - interval '3 days'`, [P1.user_id])).rows[0].n
  check(r.list[0].user_id === P1.user_id && r.list[0].score === Math.max(2, expDays), 'líder com pontos por dia (2 sessões no mesmo dia valem 1)')
  check(r.me.position === 1 && r.me.me && typeof r.me.pending_proofs === 'number', 'minha posição com pontos e comprovantes pendentes')
  check(r.formula && !/100 pontos/.test(r.formula) && r.rules_version >= 1 && r.period.start, 'fórmula real, versão das regras e período')
  check(r.podium.length >= 2 && r.podium.length <= 3 && r.podium.every(x => x.score > 0 && x.position <= 3), 'pódio só com quem pontuou (até 3, empates incluídos)')
  check(!JSON.stringify(r).match(/volume_kg|weight|peso|pain|carga/i), 'ranking não expõe cargas, peso ou saúde')
  const sc = (await get(stu, '/api/challenges/score?id=' + c)).d
  check(sc.sessions.find(s => s.id === sv)?.why === 'anulado' && sc.sessions.filter(s => s.counted).length === sc.valid_days, 'entender pontuação: treino anulado não contou e diz por quê')
  check((await get(p1, '/api/challenges/score?id=' + c)).d.sessions.some(s => s.why === 'mesmo_dia'), 'entender pontuação: mesmo dia conta uma vez')
  await post(p2, '/api/challenges/optout', { id: c, on: true })
  r = (await get(p1, '/api/challenges/ranking?id=' + c)).d
  check(r.list.some(x => x.name === 'Participante' && x.user_id === null && !x.photo), 'privacidade: quem optou aparece como Participante sem id e foto')
  check((await get(p2, '/api/challenges/ranking?id=' + c)).d.me.name === 'Participante' && (await get(p2, '/api/challenges/ranking?id=' + c)).d.me.user_id, 'a própria pessoa ainda se encontra')
  await post(stu, '/api/challenges/remove', { id: c, user_id: P1.user_id, reason: 'Fraude nos treinos', disqualify: true })
  r = (await get(stu, '/api/challenges/ranking?id=' + c)).d
  check(!r.list.some(x => x.user_id === P1.user_id) && r.disqualified_count >= 0, 'desclassificado sai da classificação')
  await q(`update challenges set ends_at=now() - interval '1 minute' where id=$1`, [c])
  check((await get(stu, '/api/challenges/ranking?id=' + c)).d.state === 'apurando', 'no fim: em apuração')
  await post(stu, '/api/challenges/transition', { id: c, to: 'concluido' })
  const snap = (await q('select * from challenge_results where challenge_id=$1', [c])).rows
  check(snap.length === 1 && snap[0].kind === 'final' && snap[0].rules_version >= 1 && snap[0].period_start, 'ao concluir: resultado guardado com versão das regras e período')
  const before = (await get(p2, '/api/challenges/ranking?id=' + c)).d.me.score
  await mk(p2id, '1 hour')
  r = (await get(p2, '/api/challenges/ranking?id=' + c)).d
  check(r.state === 'final' && r.me.score === before, 'resultado final não muda depois de concluído')
  // coletivo e equipes pela API
  r = await post(stu, '/api/challenges', { name: 'Coletivo ' + t, category: 'geral', type: 'meta_coletiva', metric: 'soma_coletiva', goal: 10, starts_at: iso(day), ends_at: iso(10 * day), audience: 'aberto', proof: 'nenhuma' }); const cc = r.d.id
  await post(stu, '/api/challenges/publish', { id: cc }); await post(p2, '/api/challenges/join', { id: cc }); await q(`update challenges set starts_at=now() - interval '3 days' where id=$1`, [cc])
  r = (await get(p2, '/api/challenges/ranking?id=' + cc)).d
  check(r.mode === 'coletivo' && r.collective && r.collective.goal === 10 && !r.podium.length, 'coletivo: painel de progresso em vez de pódio')
}
