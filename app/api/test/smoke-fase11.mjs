// Smoke test fase 11 (V5-C): feed do desafio, comprovantes manuais, denúncias ampliadas, silenciar notificações sociais
import '../env.js'
import { q } from '../db/pool.js'
import crypto from 'node:crypto'
// PNG 1x1 válido + bytes aleatórios no fim (hash diferente por arquivo)
const png = (salt = crypto.randomBytes(8)) => 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'), salt]).toString('base64')
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 11 — feed do desafio e comprovantes')
  const t = Date.now(), day = 86400e3, iso = d => new Date(Date.now() + d).toISOString()
  const base = { name: 'Prova ' + t, category: 'consistencia', type: 'meta_individual', metric: 'sessoes', goal: 5, starts_at: iso(day), ends_at: iso(15 * day), audience: 'aberto', proof: 'obrigatoria', proof_media: ['foto'], late_entry: true }
  let r = await post(stu, '/api/challenges', base); const c = r.d.id
  check((await post(stu, '/api/challenges/publish', { id: c })).s === 200, 'desafio com comprovante obrigatório publicado')
  await post(p1, '/api/challenges/join', { id: c }); await post(stu, '/api/challenges/join', { id: c })
  // feed
  check((await post(p2, '/api/challenges/posts', { id: c, body: 'oi' })).s === 403, 'não participante não publica no feed do desafio')
  r = await post(p1, '/api/challenges/posts', { id: c, body: 'Bora treinar!', client_id: 'k' + t }); check(r.s === 201, 'participante publica no feed do desafio'); const post1 = r.d.id
  check((await post(p1, '/api/challenges/posts', { id: c, body: 'Bora treinar!', client_id: 'k' + t })).d.id === post1, 'reenvio com o mesmo client_id não duplica (estado enviando/falhou)')
  r = await post(p1, '/api/challenges/posts', { id: c, body: 'rascunho', draft: true }); check(r.d.status === 'rascunho', 'rascunho de post')
  check(!(await get(p2, '/api/challenges/feed?id=' + c)).d.posts.some(p => p.body === 'rascunho'), 'rascunho não aparece para os outros')
  check(!JSON.stringify((await get(p2, '/api/feed')).d).includes('Bora treinar!'), 'post do desafio não vaza no feed geral')
  check((await post(p1, '/api/challenges/posts/pin', { post_id: post1 })).s === 403 && (await post(stu, '/api/challenges/posts/pin', { post_id: post1 })).d.pinned, 'só organizador fixa')
  await post(stu, '/api/challenges/posts/like', { post_id: post1 }); await post(stu, '/api/challenges/posts/comment', { post_id: post1, body: 'Vamos!' })
  const f = (await get(stu, '/api/challenges/feed?id=' + c)).d.posts[0]
  check(f.pinned && f.likes === 1 && f.comments.length === 1, 'fixado no topo, curtida e comentário')
  // silenciar sociais
  await post(p1, '/api/notification-prefs', { mute_social: true }); await post(p2, '/api/challenges/join', { id: c })
  const before = (await q(`select count(*)::int n from notifications where user_id=$1 and kind like 'social%'`, [P1.user_id])).rows[0].n
  await post(p2, '/api/challenges/posts/like', { post_id: post1 })
  check((await q(`select count(*)::int n from notifications where user_id=$1 and kind like 'social%'`, [P1.user_id])).rows[0].n === before, 'notificações sociais silenciadas')
  await post(p1, '/api/notification-prefs', { mute_social: false })
  // mídia
  check((await post(p1, '/api/challenges/media', { id: c, data: 'data:image/png;base64,' + Buffer.from('nao e imagem').toString('base64') })).s === 400, 'arquivo falso recusado (assinatura)')
  // comprovantes: desafio em andamento
  await q(`update challenges set starts_at=now() - interval '2 days' where id=$1`, [c]); await get(stu, '/api/challenge?id=' + c)
  const tid = (await q('select tenant_id from users where id=$1', [P1.user_id])).rows[0].tenant_id
  const mk = async (uid, ago, extra = '') => (await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status${extra ? ',voided_at' : ''}) values($1,$2,now()-$3::interval,now()-$3::interval+interval '40 min','done'${extra ? ',now()' : ''}) returning id`, [tid, uid, ago])).rows[0].id
  const s1 = await mk(P1.user_id, '1 day'), sVoid = await mk(P1.user_id, '20 hours', 'void'), sOld = await mk(P1.user_id, '5 days'), sS = await mk(sid, '1 day')
  check((await get(p1, '/api/challenges/sessions?id=' + c)).d.sessions.every(s => s.id !== sVoid && s.id !== sOld), 'só sessões válidas no período aparecem')
  const m1 = (await post(p1, '/api/challenges/media', { id: c, data: png() })).d
  check(m1.sha256 && m1.media_type === 'foto', 'upload com integridade (sha256) e tipo conferido')
  check((await post(p1, '/api/challenges/proofs', { id: c, session_id: sVoid, media_url: m1.url })).s === 400, 'sessão anulada não pode ser comprovada')
  check((await post(p1, '/api/challenges/proofs', { id: c, session_id: sOld, media_url: m1.url })).s === 400, 'sessão fora do período recusada')
  r = await post(p1, '/api/challenges/proofs', { id: c, session_id: s1, media_url: m1.url }); check(r.s === 201 && r.d.status === 'enviado' && r.d.reviewer === 'organizador', 'comprovante enviado vai ao organizador'); const pr1 = r.d.id
  const dupSalt = crypto.randomBytes(8), mA = (await post(p1, '/api/challenges/media', { id: c, data: png(dupSalt) })).d, mB = (await post(stu, '/api/challenges/media', { id: c, data: png(dupSalt) })).d
  check((await post(p1, '/api/challenges/proofs', { id: c, session_id: s1, media_url: mA.url })).s === 409, 'mesma sessão não gera dois comprovantes no desafio')
  r = await post(stu, '/api/challenges/proofs', { id: c, session_id: sS, media_url: mA.url }); check(r.s === 400 || r.s === 409, 'não usa arquivo/sessão de outra pessoa')
  r = await post(stu, '/api/challenges/proofs', { id: c, session_id: sS, media_url: mB.url }); check(r.s === 201 && r.d.reviewer === 'admin', 'organizador participante: comprovante dele vai ao admin'); const prS = r.d.id
  const sS2 = await mk(sid, '10 hours'); r = await post(stu, '/api/challenges/proofs', { id: c, session_id: sS2, media_url: (await post(stu, '/api/challenges/media', { id: c, data: png(dupSalt) })).d.url }); check(r.s === 409, 'arquivo duplicado (mesmo hash) recusado')
  check((await post(stu, '/api/challenges/proofs/review', { proof_id: prS, decision: 'aprovado' })).s === 403, 'ninguém aprova o próprio comprovante')
  check((await post(p2, '/api/challenges/proofs/review', { proof_id: pr1, decision: 'aprovado' })).s === 403, 'participante comum não revisa')
  check((await get(p1, '/api/challenges/proofs?id=' + c)).d.proofs.every(p => p.mine), 'participante vê só os próprios comprovantes')
  check((await post(stu, '/api/challenges/proofs/review', { proof_id: pr1, decision: 'rejeitado' })).s === 400, 'rejeição exige motivo')
  check((await post(stu, '/api/challenges/proofs/review', { proof_id: pr1, decision: 'substituicao', reason: 'Foto escura' })).d.status === 'substituicao', 'organizador pede substituição')
  const m2 = (await post(p1, '/api/challenges/media', { id: c, data: png() })).d
  check((await post(p1, '/api/challenges/proofs/replace', { proof_id: pr1, media_url: m2.url })).d.status === 'enviado', 'participante substitui')
  check((await post(stu, '/api/challenges/proofs/review', { proof_id: pr1, decision: 'rejeitado', reason: 'Não mostra o treino' })).d.status === 'rejeitado', 'organizador rejeita')
  check((await post(p1, '/api/challenges/proofs/appeal', { proof_id: pr1, text: 'A foto é do treino de ontem' })).d.status === 'recurso', 'participante recorre')
  check((await post(p1, '/api/challenges/proofs/appeal', { proof_id: pr1, text: 'de novo de novo' })).s === 409, 'um recurso por comprovante')
  check((await post(stu, '/api/challenges/proofs/review', { proof_id: pr1, decision: 'aprovado' })).s === 403, 'recurso só pelo admin')
  check((await get(adm, '/api/adm/proofs')).d.proofs.some(p => p.id === pr1) && (await get(adm, '/api/adm/proofs')).d.proofs.some(p => p.id === prS), 'fila do admin: recursos e comprovantes encaminhados')
  check((await post(adm, '/api/challenges/proofs/review', { proof_id: pr1, decision: 'aprovado' })).d.status === 'aprovado', 'admin decide o recurso')
  check((await post(adm, '/api/adm/proofs/invalidate', { proof_id: pr1, reason: 'Fraude confirmada' })).d.status === 'invalidado', 'admin invalida aprovado com justificativa')
  check((await post(adm, '/api/challenges/proofs/review', { proof_id: prS, decision: 'aprovado' })).d.status === 'aprovado', 'admin aprova comprovante do organizador')
  await q('update sessions set voided_at=now() where id=$1', [sS2])
  // denúncias ampliadas
  r = await post(p2, '/api/reports', { target_type: 'ch_post', target_id: post1, reason: 'spam' }); check(r.s === 201, 'denúncia de post do desafio')
  check((await post(p2, '/api/reports', { target_type: 'proof', target_id: prS, reason: 'outro', details: 'foto da internet' })).s === 201 && (await post(p2, '/api/reports', { target_type: 'challenge', target_id: c, reason: 'outro' })).s === 201, 'denúncia de comprovante e de desafio')
  const reps = (await get(adm, '/api/adm/reports')).d.reports, rp = reps.find(x => x.target_type === 'ch_post' && x.target_id === post1)
  check(rp && rp.target?.body, 'admin vê a denúncia com o conteúdo')
  check((await post(adm, '/api/adm/reports/decide', { id: rp.id, decision: 'ocultar', reason: 'Spam' })).s === 200 && !(await get(p2, '/api/challenges/feed?id=' + c)).d.posts.some(p => p.id === post1), 'admin oculta post do desafio')
  const rc = reps.find(x => x.target_type === 'challenge' && x.target_id === c)
  check((await post(adm, '/api/adm/reports/decide', { id: rc.id, decision: 'manter', reason: 'Desafio legítimo' })).s === 200, 'admin mantém o desafio')
  const rpr = reps.find(x => x.target_type === 'proof' && x.target_id === prS)
  await post(adm, '/api/adm/reports/decide', { id: rpr.id, decision: 'restringir', reason: 'Reincidência' })
  check((await post(stu, '/api/challenges/posts', { id: c, body: 'oi' })).s === 403, 'restringir bloqueia publicar em feeds de desafio')
  await q('delete from challenge_feed_bans where user_id=$1', [sid])
  check((await post(stu, '/api/adm/proof-reviewers', { email: 'x@x' })).s === 403, 'só admin designa revisores')
  const acts = (await get(adm, '/api/adm/audit')).d.audit.map(a => a.action)
  check(['desafio.comprovante_enviado', 'desafio.comprovante_invalidado', 'moderacao.ocultar', 'moderacao.restringir'].every(a => acts.includes(a)), 'comprovantes e moderação na auditoria')
}
