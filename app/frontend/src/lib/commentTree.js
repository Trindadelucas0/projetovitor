// AVAGYM V5 - organiza comentários em discussões: cada comentário raiz com todas as respostas (de qualquer nível)
// achatadas em ordem cronológica, guardando a quem cada resposta responde. Indentação de 1 nível = legível no celular.
export function buildThreads(comments = []) {
  const byId = new Map(comments.map(c => [c.id, c]))
  const rootOf = c => { let x = c, guard = 0; while (x.parent_id != null && byId.has(x.parent_id) && guard++ < 50) x = byId.get(x.parent_id); return x }
  const threads = new Map()
  for (const c of [...comments].sort((a, b) => a.id - b.id)) {
    const r = rootOf(c)
    if (!threads.has(r.id)) threads.set(r.id, { root: r, replies: [] })
    if (r.id !== c.id) { const p = byId.get(c.parent_id); threads.get(r.id).replies.push({ ...c, reply_to: p && p.id !== r.id ? p.author_name : null }) }
  }
  return [...threads.values()]
}
export const visibleCount = (comments = []) => comments.filter(c => c.status === 'visivel').length
export const REPLIES_PREVIEW = 2