// Smoke test fase 9 (V5-A): grupos permanentes, papéis, convites, remoção auditada, suspensão pelo admin
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 9 — grupos')
  const t = Date.now()
  check((await post(stu, '/api/groups', { name: 'x' })).s === 400, 'nome curto é recusado')
  check((await post(stu, '/api/groups', { name: 'Grupo ruim', cover_url: 'javascript:alert(1)' })).s === 400, 'capa com URL insegura é recusada')
  let r = await post(stu, '/api/groups', { name: 'Corredores ' + t, description: 'Treinos de corrida', privacy: 'aberto', join_policy: 'livre', member_limit: 3, rules: 'Respeito' })
  check(r.s === 201, 'aluno cria grupo (amador)'); const g = r.d.id
  const links0 = (await get(adm, '/api/adm/student/training?id=' + sid)).d.links.length
  r = await post(p1, '/api/groups/join', { id: g }); check(r.s === 200 && r.d.status === 'ativo', 'grupo aberto: entrada livre')
  check((await post(p1, '/api/groups/join', { id: g })).s === 409, 'entrada duplicada bloqueada')
  check((await get(adm, '/api/adm/student/training?id=' + sid)).d.links.length === links0, 'entrar em grupo não cria vínculo profissional')
  let d = (await get(p2, '/api/group?id=' + g)).d
  check(d.members.length === 2 && d.members.every(m => !('email' in m)), 'membros mostram só dados públicos')
  check((await get(p2, '/api/groups?q=Corredores ' + t)).d.groups.some(x => x.id === g), 'grupo aberto aparece na busca')
  r = await post(p2, '/api/groups/join', { id: g }); check(r.s === 200, 'segundo membro entra')
  r = await post(adm, '/api/groups/join', { id: g }); check(r.s === 409, 'limite de membros respeitado')
  check((await post(p1, '/api/groups/remove', { id: g, user_id: P1.user_id, reason: 'x' })).s === 403, 'membro comum não remove ninguém')
  check((await post(stu, '/api/groups/leave', { id: g })).s === 409, 'dono não sai sem transferir')
  check((await post(stu, '/api/groups/transfer', { id: g, user_id: P1.user_id })).s === 400, 'transferência exige confirmação explícita')
  check((await post(stu, '/api/groups/transfer', { id: g, user_id: P1.user_id, confirm: true })).s === 200, 'dono transfere a propriedade')
  d = (await get(p1, '/api/group?id=' + g)).d
  check(d.me.role === 'dono' && d.members.find(m => m.user_id === sid)?.role === 'moderador', 'novo dono; antigo vira moderador')
  check((await post(stu, '/api/groups/leave', { id: g })).s === 200, 'membro sai do grupo')
  const p2id = d.members.find(m => m.user_id !== sid && m.user_id !== P1.user_id).user_id
  check((await post(p1, '/api/groups/remove', { id: g, user_id: p2id, reason: '' })).s === 400, 'remoção exige motivo')
  check((await post(p1, '/api/groups/remove', { id: g, user_id: p2id, reason: 'Spam repetido' })).s === 200, 'dono remove membro com motivo')
  check((await post(p2, '/api/groups/join', { id: g })).s === 403, 'removido não volta sozinho')
  // privado + convite
  r = await post(p1, '/api/groups', { name: 'Fechado ' + t, privacy: 'privado' }); const gp = r.d.id
  check(!(await get(p2, '/api/groups?q=Fechado ' + t)).d.groups.length && (await get(p2, '/api/group?id=' + gp)).s === 404, 'grupo privado não aparece nem abre para quem não é membro')
  check((await post(p2, '/api/groups/join', { id: gp })).s === 403, 'grupo privado exige convite')
  r = await post(p1, '/api/groups/invites', { id: gp, expires_days: 2, max_uses: 1 }); const inv = r.d.invite
  check(r.s === 201 && inv.code.length === 8 && r.d.link.includes(inv.code), 'convite por código e link, com validade e limite de usos')
  check((await post(p2, '/api/groups/join', { id: gp, code: 'ERRADO12' })).s === 400, 'código inválido é recusado')
  check((await post(p2, '/api/groups/join', { id: gp, code: inv.code })).d.status === 'ativo', 'convite válido dá entrada')
  check((await post(stu, '/api/groups/join', { id: gp, code: inv.code })).s === 400, 'convite esgotado (máximo de usos)')
  r = await post(p1, '/api/groups/invites', { id: gp }); check((await post(p1, '/api/groups/invites/revoke', { id: gp, invite_id: r.d.invite.id })).s === 200, 'convite revogado')
  check((await post(stu, '/api/groups/join', { id: gp, code: r.d.invite.code })).s === 400, 'convite revogado não funciona')
  // moderado: pedido + aprovação
  r = await post(p1, '/api/groups', { name: 'Moderado ' + t, privacy: 'moderado' }); const gm = r.d.id
  check((await post(stu, '/api/groups/join', { id: gm })).d.status === 'solicitado', 'grupo moderado: entrada por pedido')
  check((await get(p1, '/api/group?id=' + gm)).d.requests.some(x => x.user_id === sid), 'dono vê pedidos pendentes')
  check((await post(p1, '/api/groups/decide', { id: gm, user_id: sid, approve: true })).s === 200, 'dono aprova o pedido')
  check((await get(stu, '/api/notifications')).d.notifications?.some(n => n.title === 'Seu pedido foi aprovado' && !/@/.test(n.body || '')), 'notificação de aprovação sem dados sensíveis')
  // admin
  check((await post(p1, '/api/adm/groups/status', { id: g, status: 'suspenso', reason: 'x' })).s === 403, 'só admin suspende grupos')
  check((await post(adm, '/api/adm/groups/status', { id: g, status: 'suspenso' })).s === 400, 'suspensão exige motivo')
  check((await post(adm, '/api/adm/groups/status', { id: g, status: 'suspenso', reason: 'Denúncias' })).s === 200, 'admin suspende grupo')
  check((await get(p2, '/api/group?id=' + g)).s === 404 && (await post(p1, '/api/groups/update', { id: g, name: 'Novo nome' })).s === 409, 'grupo suspenso some para não membros e congela edições')
  check((await get(adm, '/api/adm/groups?status=suspenso')).d.groups.some(x => x.id === g), 'admin lista grupos suspensos')
  const acts = (await get(adm, '/api/adm/audit')).d.audit.filter(a => a.entity_id === g || a.entity_id === gp).map(a => a.action)
  check(['grupo.membro_removido', 'grupo.transferido', 'grupo.suspenso'].every(a => acts.includes(a)) && (await get(adm, '/api/adm/audit')).d.audit.some(a => a.action === 'convite.revogado'), 'remoção, transferência, suspensão e revogação na auditoria')
}
