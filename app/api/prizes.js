// V5 fase E · Troféus (catálogo, personalizados moderados, ligados ao resultado final) e premiações oficiais
// (só admin; sem sorteio; sem dinheiro; entrega só depois de homologado). Tudo auditado.
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, notifyAdmins } from './pro.js'
import { getChallenge, canManage } from './challenges.js'
import { canMovePrize, prizeProblems, trophyNameOk, trophyWinners } from './challenge-rules.js'
import { snapshot } from './challenge-score.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const isAdm = u => u.roles.includes('admin')
const link = id => '/desafio/' + id + '?aba=ranking'
const BASE = ['participacao', 'conclusao', 'primeiro', 'segundo', 'terceiro', 'equipe_vencedora', 'consistencia']
export const PUBLIC_PRIZE = { publicado: 'provisorio', aguardando_resultado: 'provisorio', aguardando_homologacao: 'apurando', vencedor_homologado: 'homologado', entrega_pendente: 'premio_pendente', entregue: 'entregue' }
async function plog(p, to, actor, reason) {
  await q('insert into prize_log(prize_id,from_status,to_status,actor_id,reason) values($1,$2,$3,$4,$5)', [p.id, p.status, to, actor, reason || null])
  await q('update prizes set status=$2, status_reason=coalesce($3,status_reason), updated_at=now() where id=$1', [p.id, to, reason || null]); p.status = to
}
// o estado do prêmio acompanha o desafio (início → aguardando resultado; fim → aguardando homologação)
export async function syncPrizes(c) {
  const ps = (await q(`select * from prizes where challenge_id=$1 and status in ('publicado','aguardando_resultado')`, [c.id])).rows
  for (const p of ps) {
    if (['apurando', 'concluido'].includes(c.status)) await plog(p, 'aguardando_homologacao', null, 'fim do desafio')
    else if (c.status === 'em_andamento' && p.status === 'publicado') await plog(p, 'aguardando_resultado', null, 'início do desafio')
  }
  if (c.status === 'cancelado') for (const p of (await q(`select * from prizes where challenge_id=$1 and status not in ('entregue','cancelado')`, [c.id])).rows) await plog(p, 'cancelado', null, 'desafio cancelado')
}
// troféus ao concluir (a partir do resultado final guardado)
export async function awardTrophies(c, resultId, result) {
  const ts = (await q(`select t.* from challenge_trophies ct join trophy_templates t on t.id=ct.template_id where ct.challenge_id=$1 and t.status='ativo'`, [c.id])).rows
  let n = 0
  for (const t of ts) for (const uid of trophyWinners(t.kind === 'personalizado' ? t.criterion : t.kind, result, c)) {
    const r = await q('insert into user_trophies(user_id,challenge_id,template_id,result_id) values($1,$2,$3,$4) on conflict do nothing', [uid, c.id, t.id, resultId])
    if (r.rowCount) { n++; await notify(uid, 'desafio.trofeu', 'Você ganhou um troféu: ' + t.name, c.name, '/perfil?aba=trofeus') }
  }
  return n
}
export async function onConcluded(c, result) {
  const rid = (await q(`select id from challenge_results where challenge_id=$1 and kind='final' order by computed_at desc limit 1`, [c.id])).rows[0]?.id
  await awardTrophies(c, rid, result); await syncPrizes({ ...c, status: 'concluido' })
  for (const uid of (await q(`select user_id from challenge_members where challenge_id=$1 and status='ativo'`, [c.id])).rows.map(r => r.user_id)) await notify(uid, 'desafio.resultado', 'Resultado do desafio disponível', c.name, link(c.id))
}
function winnersOf(p, data) {
  const rows = data.rows || [], pos = ns => rows.filter(r => ns.includes(r.position) && r.score > 0)
  if (p.criterion === 'primeiro') return pos([1]); if (p.criterion === 'segundo') return pos([2]); if (p.criterion === 'terceiro') return pos([3]); if (p.criterion === 'top3') return pos([1, 2, 3])
  if (p.criterion === 'meta_atingida') return data.mode === 'coletivo' ? (data.collective?.reached ? rows.filter(r => r.days > 0) : []) : rows.filter(r => r.goal_reached)
  if (p.criterion === 'equipe_vencedora') { const w = (data.teams || []).filter(t => t.position === 1 && t.score > 0).map(t => t.team_id); return rows.filter(r => w.includes(r.team_id) && r.days > 0) }
  return []
}
const PCOLS = ['name', 'description', 'image_url', 'quantity', 'criterion', 'eligibility', 'availability', 'owner', 'delivery_deadline', 'logistics', 'rules']

export function prizeRoutes({ json, readBody }) {
  const auth = (req, res) => requireAuth(req, res, json)
  const adm = async (req, res) => { const u = await auth(req, res); if (!u) return null; if (!isAdm(u)) { json(res, 403, { error: 'Só o admin' }); return null } return u }
  return {
    // ---------- troféus ----------
    'GET /api/trophies': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      json(res, 200, { trophies: (await q(`select id,kind,icon,name,description,criterion,status,system from trophy_templates where (tenant_id is null or tenant_id=$1) and (status='ativo' or created_by=$2 and status='pendente') order by system desc, name`, [u.tenant_id, u.id])).rows })
    },
    'POST /api/trophies': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      if (!trophyNameOk(b.name)) return json(res, 400, { error: 'Nome entre 3 e 40 letras, sem palavras ofensivas' })
      if (!BASE.includes(b.criterion)) return json(res, 400, { error: 'Escolha o critério (ligado a um resultado real)' })
      const icon = /^\p{Extended_Pictographic}{1,2}$/u.test(String(b.icon || '')) ? b.icon : '🏅', st = isAdm(u) ? 'ativo' : 'pendente'
      const r = await q(`insert into trophy_templates(tenant_id,kind,icon,name,description,criterion,status,created_by) values($1,'personalizado',$2,$3,$4,$5,$6,$7) returning id,status`, [u.tenant_id, icon, txt(b.name, 40), txt(b.description, 200) || null, b.criterion, st, u.id])
      if (st === 'pendente') await notifyAdmins(u.tenant_id, 'desafio.trofeu_moderacao', 'Troféu personalizado para aprovar', txt(b.name, 40), '/admin/painel?tab=desafios')
      await audit(u.tenant_id, u.id, 'trofeu.criado', 'trophy', r.rows[0].id); json(res, 201, r.rows[0])
    },
    'GET /api/adm/trophies': async (req, res) => { const u = await adm(req, res); if (!u) return; json(res, 200, { trophies: (await q(`select t.*, x.name author from trophy_templates t left join users x on x.id=t.created_by where t.tenant_id=$1 and t.status=$2 order by t.created_at`, [u.tenant_id, qs(req).get('status') || 'pendente'])).rows }) },
    'POST /api/adm/trophies/decide': async (req, res) => {
      const u = await adm(req, res); if (!u) return; const b = await readBody(req), reason = txt(b.reason, 300)
      if (!b.approve && reason.length < 3) return json(res, 400, { error: 'Informe o motivo' })
      const r = await q(`update trophy_templates set status=$3, moderation_reason=$4 where id=$1 and tenant_id=$2 and status='pendente' returning created_by, name`, [isUuid(b.id) ? b.id : null, u.tenant_id, b.approve ? 'ativo' : 'rejeitado', reason || null])
      if (!r.rowCount) return json(res, 404, { error: 'Troféu não encontrado' })
      await notify(r.rows[0].created_by, 'desafio.trofeu_moderacao', b.approve ? 'Troféu aprovado' : 'Troféu não aprovado', r.rows[0].name + (reason ? ' — ' + reason : ''), '/comunidade?tab=desafios')
      await audit(u.tenant_id, u.id, b.approve ? 'trofeu.aprovado' : 'trofeu.rejeitado', 'trophy', b.id, { reason }); json(res, 200, { ok: true })
    },
    'GET /api/challenges/trophies': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const c = await getChallenge(qs(req).get('id'), u.tenant_id); if (!c) return json(res, 404, { error: 'Desafio não encontrado' })
      json(res, 200, { trophies: (await q(`select t.id,t.icon,t.name,t.description,t.kind,t.criterion,t.status,(select count(*)::int from user_trophies x where x.template_id=t.id and x.challenge_id=$1 and x.revoked_at is null) awarded from challenge_trophies ct join trophy_templates t on t.id=ct.template_id where ct.challenge_id=$1`, [c.id])).rows })
    },
    'POST /api/challenges/trophies': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req), c = await getChallenge(b.id, u.tenant_id)
      if (!c) return json(res, 404, { error: 'Desafio não encontrado' }); if (!canManage(u, c)) return json(res, 403, { error: 'Só o organizador' })
      if (c.frozen_at && !isAdm(u)) return json(res, 409, { error: 'Os troféus ficam fixos depois do início' })
      const ids = (Array.isArray(b.template_ids) ? b.template_ids : []).filter(isUuid).slice(0, 10)
      const ok = (await q(`select id from trophy_templates where id = any($1) and (tenant_id is null or tenant_id=$2) and (status='ativo' or created_by=$3 and status='pendente')`, [ids, u.tenant_id, u.id])).rows.map(r => r.id)
      await q('delete from challenge_trophies where challenge_id=$1', [c.id])
      for (const id of ok) await q('insert into challenge_trophies(challenge_id,template_id) values($1,$2) on conflict do nothing', [c.id, id])
      json(res, 200, { trophies: ok.length })
    },
    'GET /api/me/trophies': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      json(res, 200, { trophies: (await q(`select x.id,x.show_on_profile,x.awarded_at,t.icon,t.name,t.description,c.name challenge,c.id challenge_id from user_trophies x join trophy_templates t on t.id=x.template_id join challenges c on c.id=x.challenge_id where x.user_id=$1 and x.revoked_at is null order by x.awarded_at desc`, [u.id])).rows })
    },
    'POST /api/me/trophies/show': async (req, res) => { const u = await auth(req, res); if (!u) return; const b = await readBody(req); await q('update user_trophies set show_on_profile=$3 where id=$1 and user_id=$2', [+b.id, u.id, !!b.on]); json(res, 200, { ok: true }) },
    'GET /api/users/trophies': async (req, res) => {   // vitrine pública: só o que a pessoa escolheu mostrar; desafio privado não é nomeado
      const u = await auth(req, res); if (!u) return; const uid = qs(req).get('user_id'); if (!isUuid(uid)) return json(res, 400, { error: 'Usuário inválido' })
      json(res, 200, { trophies: (await q(`select t.icon,t.name,x.awarded_at,case when c.audience='convite' then 'Desafio privado' else c.name end challenge from user_trophies x join trophy_templates t on t.id=x.template_id join challenges c on c.id=x.challenge_id join users w on w.id=x.user_id where x.user_id=$1 and w.tenant_id=$2 and x.show_on_profile and x.revoked_at is null order by x.awarded_at desc limit 50`, [uid, u.tenant_id])).rows })
    },
    // ---------- premiações oficiais ----------
    'GET /api/challenges/prizes': async (req, res) => {   // só prêmios reais e publicados
      const u = await auth(req, res); if (!u) return; const c = await getChallenge(qs(req).get('id'), u.tenant_id); if (!c) return json(res, 404, { error: 'Desafio não encontrado' })
      await syncPrizes(c)
      const ps = (await q(`select p.id,p.name,p.description,p.image_url,p.quantity,p.criterion,p.eligibility,p.delivery_deadline,p.rules,p.status,
          coalesce((select json_agg(json_build_object('name',case when m.ranking_optout and w.user_id<>$2 then 'Participante' else x.name end,'position',w.position,'status',w.status,'me',w.user_id=$2)) from prize_winners w join users x on x.id=w.user_id left join challenge_members m on m.challenge_id=p.challenge_id and m.user_id=w.user_id where w.prize_id=p.id and w.status<>'cancelado'),'[]') winners
        from prizes p where p.challenge_id=$1 and p.status not in ('configurado','cancelado') order by p.created_at`, [c.id, u.id])).rows
      json(res, 200, { prizes: ps.map(p => ({ ...p, public_state: PUBLIC_PRIZE[p.status] })) })
    },
    'GET /api/adm/prizes': async (req, res) => {
      const u = await adm(req, res); if (!u) return
      for (const c of (await q(`select * from challenges where tenant_id=$1 and official and id in (select challenge_id from prizes)`, [u.tenant_id])).rows) await syncPrizes(c)
      json(res, 200, { prizes: (await q(`select p.*, c.name challenge, c.status challenge_status, (select count(*)::int from prize_winners w where w.prize_id=p.id and w.status='pendente') pending_delivery,
          coalesce((select json_agg(json_build_object('id',w.id,'name',x.name,'email',x.email,'position',w.position,'status',w.status,'delivered_at',w.delivered_at,'note',w.delivery_note)) from prize_winners w join users x on x.id=w.user_id where w.prize_id=p.id),'[]') winners
        from prizes p join challenges c on c.id=p.challenge_id where p.tenant_id=$1 order by p.created_at desc`, [u.tenant_id])).rows })
    },
    'POST /api/adm/prizes': async (req, res) => {
      const u = await adm(req, res); if (!u) return; const b = await readBody(req)
      const c = await getChallenge(b.challenge_id, u.tenant_id); if (!c) return json(res, 404, { error: 'Desafio não encontrado' })
      if (!c.official) return json(res, 403, { error: 'Premiações só em desafios oficiais' })
      if (['concluido', 'cancelado'].includes(c.status)) return json(res, 409, { error: 'Desafio encerrado' })
      const pr = prizeProblems(b); if (b.image_url && !/^(https:\/\/|\/api\/media\?f=)[^\s"'<>]{1,500}$/.test(b.image_url)) pr.push('Imagem inválida')
      if (pr.length) return json(res, 400, { error: pr[0], problems: pr })
      const v = PCOLS.map(k => k === 'quantity' ? +b.quantity : txt(b[k], 1000) || null)
      if (b.id) {
        const p = (await q('select * from prizes where id=$1 and tenant_id=$2', [isUuid(b.id) ? b.id : null, u.tenant_id])).rows[0]; if (!p) return json(res, 404, { error: 'Prêmio não encontrado' })
        if (p.status !== 'configurado' && txt(b.reason).length < 5) return json(res, 400, { error: 'Prêmio publicado: informe a justificativa da alteração', needs_reason: true })
        if (!['configurado', 'publicado', 'aguardando_resultado'].includes(p.status)) return json(res, 409, { error: 'Prêmio não pode mais ser alterado' })
        await q(`update prizes set ${PCOLS.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() where id=$1`, [p.id, ...v])
        await audit(u.tenant_id, u.id, 'premio.editado', 'prize', p.id, { reason: txt(b.reason, 300) }); return json(res, 200, { id: p.id })
      }
      const r = await q(`insert into prizes(tenant_id,challenge_id,created_by,${PCOLS.join(',')}) values($1,$2,$3,${PCOLS.map((_, i) => '$' + (i + 4)).join(',')}) returning id`, [u.tenant_id, c.id, u.id, ...v])
      await q(`insert into prize_log(prize_id,to_status,actor_id) values($1,'configurado',$2)`, [r.rows[0].id, u.id])
      await audit(u.tenant_id, u.id, 'premio.configurado', 'prize', r.rows[0].id, { challenge: c.id }); json(res, 201, { id: r.rows[0].id, status: 'configurado' })
    },
    'POST /api/adm/prizes/transition': async (req, res) => {
      const u = await adm(req, res); if (!u) return; const b = await readBody(req), reason = txt(b.reason, 300)
      const p = (await q('select * from prizes where id=$1 and tenant_id=$2', [isUuid(b.id) ? b.id : null, u.tenant_id])).rows[0]; if (!p) return json(res, 404, { error: 'Prêmio não encontrado' })
      if (!['publicado', 'cancelado'].includes(b.to)) return json(res, 400, { error: 'Use homologar e entregar para os outros passos' })
      if (!canMovePrize(p.status, b.to)) return json(res, 409, { error: `Não é possível passar de ${p.status} para ${b.to}` })
      if (b.to === 'cancelado' && reason.length < 5) return json(res, 400, { error: 'Explique o cancelamento' })
      await plog(p, b.to, u.id, reason); if (b.to === 'cancelado') await q(`update prize_winners set status='cancelado' where prize_id=$1 and status='pendente'`, [p.id])
      if (b.to === 'cancelado') for (const w of (await q('select user_id from prize_winners where prize_id=$1', [p.id])).rows) await notify(w.user_id, 'desafio.premio', 'Premiação cancelada', reason, link(p.challenge_id))
      await audit(u.tenant_id, u.id, 'premio.' + b.to, 'prize', p.id, { reason }); json(res, 200, { status: b.to })
    },
    // correção administrativa: recalcula o resultado final com justificativa, só antes da homologação
    'POST /api/adm/challenges/recompute': async (req, res) => {
      const u = await adm(req, res); if (!u) return; const b = await readBody(req), reason = txt(b.reason, 300)
      const c = await getChallenge(b.id, u.tenant_id); if (!c || c.status !== 'concluido') return json(res, 409, { error: 'Só desafios concluídos' })
      if ((await q(`select 1 from challenge_results where challenge_id=$1 and homologated_at is not null`, [c.id])).rowCount) return json(res, 409, { error: 'Resultado já homologado: não pode ser alterado' })
      if (reason.length < 5) return json(res, 400, { error: 'Informe a justificativa' })
      const r = await snapshot(c, 'final'); await audit(u.tenant_id, u.id, 'desafio.resultado_recalculado', 'challenge', c.id, { reason }); json(res, 200, { ok: true, rows: (r.rows || []).length })
    },
    'POST /api/adm/challenges/homologate': async (req, res) => {
      const u = await adm(req, res); if (!u) return; const b = await readBody(req)
      const c = await getChallenge(b.id, u.tenant_id); if (!c) return json(res, 404, { error: 'Desafio não encontrado' })
      if (c.status !== 'concluido') return json(res, 409, { error: 'Homologação só depois de concluído (nunca sobre resultado provisório)' })
      const snap = (await q(`select * from challenge_results where challenge_id=$1 and kind='final' order by computed_at desc limit 1`, [c.id])).rows[0]
      if (!snap) return json(res, 409, { error: 'Sem resultado final' }); if (snap.homologated_at) return json(res, 409, { error: 'Já homologado' })
      if ((await q(`select 1 from challenge_proofs where challenge_id=$1 and status in ('enviado','em_analise','recurso','substituicao')`, [c.id])).rowCount && !b.confirm_pending) return json(res, 409, { error: 'Há comprovantes pendentes. Revise antes ou confirme que eles não contam.', pending: true })
      await syncPrizes(c)
      const ps = (await q(`select * from prizes where challenge_id=$1 and status='aguardando_homologacao'`, [c.id])).rows, plan = []
      for (const p of ps) {
        const w = winnersOf(p, snap.data)
        if (w.length > p.quantity && !b.confirm_ties) return json(res, 409, { error: `Empate em "${p.name}": ${w.length} pessoas para ${p.quantity} unidade(s). Sem sorteio: confirme dar a todos os empatados ou ajuste a quantidade.`, ties: true, prize: p.id })
        plan.push([p, w])
      }
      await q('update challenge_results set homologated_at=now(), homologated_by=$2 where id=$1', [snap.id, u.id])
      for (const [p, w] of plan) {
        if (!w.length) { await plog(p, 'cancelado', u.id, 'sem vencedores no resultado homologado'); continue }
        if (w.length > p.quantity) await q('update prizes set quantity=$2 where id=$1', [p.id, w.length])
        for (const x of w) { await q('insert into prize_winners(prize_id,user_id,result_id,position) values($1,$2,$3,$4) on conflict do nothing', [p.id, x.user_id, snap.id, x.position]); await notify(x.user_id, 'desafio.premio', 'Você ganhou: ' + p.name, 'Resultado homologado. Veja o prazo e a logística de entrega.', link(c.id)) }
        await plog(p, 'vencedor_homologado', u.id, b.reason); await plog(p, 'entrega_pendente', u.id)
      }
      await audit(u.tenant_id, u.id, 'desafio.homologado', 'challenge', c.id, { result: snap.id, prizes: plan.length, ties_confirmed: !!b.confirm_ties })
      json(res, 200, { ok: true, prizes: plan.map(([p, w]) => ({ id: p.id, winners: w.length })) })
    },
    'POST /api/adm/prizes/deliver': async (req, res) => {
      const u = await adm(req, res); if (!u) return; const b = await readBody(req), note = txt(b.note, 500)
      const w = (await q(`select w.*, p.status prize_status, p.challenge_id, p.name prize, p.id pid from prize_winners w join prizes p on p.id=w.prize_id where w.id=$1 and p.tenant_id=$2`, [+b.winner_id, u.tenant_id])).rows[0]
      if (!w) return json(res, 404, { error: 'Vencedor não encontrado' })
      if (w.prize_status !== 'entrega_pendente') return json(res, 409, { error: 'Entrega só depois do resultado homologado' })
      if (w.status !== 'pendente') return json(res, 409, { error: 'Já entregue ou cancelado' })
      if (note.length < 3) return json(res, 400, { error: 'Registre como foi a entrega' })
      await q(`update prize_winners set status='entregue', delivered_at=now(), delivery_note=$2, delivered_by=$3 where id=$1`, [w.id, note, u.id])
      await notify(w.user_id, 'desafio.entrega', 'Prêmio entregue: ' + w.prize, null, link(w.challenge_id))
      if (!(await q(`select 1 from prize_winners where prize_id=$1 and status='pendente'`, [w.pid])).rowCount) await plog({ id: w.pid, status: 'entrega_pendente' }, 'entregue', u.id)
      await audit(u.tenant_id, u.id, 'premio.entregue', 'prize_winner', w.id, { note }); json(res, 200, { ok: true })
    }
  }
}
