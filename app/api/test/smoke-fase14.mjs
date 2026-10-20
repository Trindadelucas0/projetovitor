// Smoke test fase 14: upload por streaming (vídeo até 50 MB), aviso "meta atingida", denúncia de usuário e grupo
import '../env.js'
import { q } from '../db/pool.js'
import crypto from 'node:crypto'
const B = process.env.API || 'http://localhost:8787'
const raw = (tok, path, type, buf, extra = {}) => fetch(B + path, { method: 'POST', headers: { 'Content-Type': type, Authorization: 'Bearer ' + tok, ...extra }, body: buf, duplex: 'half' }).then(async r => ({ s: r.status, d: await r.json().catch(() => ({})) }))
const mp4 = n => { const b = Buffer.alloc(n); Buffer.from('000000206674797069736f6d', 'hex').copy(b); crypto.randomFillSync(b, 12); return b }
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 14 — vídeo por streaming, meta atingida, denúncias de usuário/grupo')
  const t = Date.now(), day = 86400e3, iso = d => new Date(Date.now() + d).toISOString()
  let r = await post(stu, '/api/challenges', { name: 'Video ' + t, category: 'consistencia', type: 'meta_individual', metric: 'sessoes', goal: 1, starts_at: iso(day), ends_at: iso(10 * day), audience: 'aberto', proof: 'obrigatoria', proof_media: ['video'] }); const c = r.d.id
  await post(stu, '/api/challenges/publish', { id: c }); await post(p1, '/api/challenges/join', { id: c })
  r = await raw(p1, '/api/challenges/media/stream?id=' + c, 'video/mp4', mp4(12 * 1024 * 1024)); check(r.s === 201 && r.d.media_type === 'video' && r.d.size === 12 * 1024 * 1024 && r.d.sha256, 'vídeo de 12 MB enviado por streaming (acima do limite JSON)')
  const vid = r.d
  check((await raw(p1, '/api/challenges/media/stream?id=' + c, 'video/mp4', Buffer.from('isto nao e video'))).s === 400, 'streaming: assinatura conferida')
  check((await raw(p1, '/api/challenges/media/stream?id=' + c, 'application/pdf', Buffer.from('%PDF'))).s === 415, 'streaming: tipo não aceito')
  check((await raw(p1, '/api/challenges/media/stream?id=' + c, 'video/mp4', mp4(51 * 1024 * 1024))).s === 413, 'streaming: acima de 50 MB recusado')
  check((await raw(p2, '/api/challenges/media/stream?id=' + c, 'video/mp4', mp4(1024))).s === 403, 'streaming: só participantes')
  check((await post(p1, '/api/challenges/media', { id: c, data: 'data:image/png;base64,' + 'A'.repeat(10) })).s === 400, 'rota JSON continua com o limite global')
  // meta atingida
  await q(`update challenges set starts_at=now() - interval '2 days' where id=$1`, [c]); await get(stu, '/api/challenge?id=' + c)
  const tid = (await q('select tenant_id from users where id=$1', [sid])).rows[0].tenant_id
  const s1 = (await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status) values($1,$2,now()-interval '5 hours',now()-interval '4 hours','done') returning id`, [tid, P1.user_id])).rows[0].id
  r = await post(p1, '/api/challenges/proofs', { id: c, session_id: s1, media_url: vid.url }); check(r.s === 201, 'comprovante em vídeo de 12 MB aceito')
  const link = '/desafio/' + c + '?aba=ranking', n = async () => (await q(`select count(*)::int n from notifications where user_id=$1 and kind='desafio.meta' and link=$2`, [P1.user_id, link])).rows[0].n
  check(await n() === 0, 'pendente não dispara meta atingida')
  await post(stu, '/api/challenges/proofs/review', { proof_id: r.d.id, decision: 'aprovado' })
  check(await n() === 1, 'meta atingida notificada ao aprovar')
  await get(p1, '/api/challenges/ranking?id=' + c)
  check(await n() === 1, 'meta atingida notificada uma vez só')
  // denúncias de usuário e grupo
  check((await post(p2, '/api/reports', { target_type: 'user', target_id: sid, reason: 'ofensivo', details: 'mensagens ofensivas' })).s === 201, 'denúncia de usuário')
  const g = (await post(stu, '/api/groups', { name: 'Grupo denúncia ' + t, privacy: 'aberto' })).d
  check((await post(p2, '/api/reports', { target_type: 'group', target_id: g.id, reason: 'spam' })).s === 201, 'denúncia de grupo')
  const reps = (await get(adm, '/api/adm/reports')).d.reports
  check(reps.some(x => x.target_type === 'user' && x.target?.body) && reps.some(x => x.target_type === 'group' && x.target?.body), 'admin vê denúncias de usuário e grupo')
}
