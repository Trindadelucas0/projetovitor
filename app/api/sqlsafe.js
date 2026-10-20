// Segurança: termos de busca para LIKE/ILIKE. O valor já vai por parâmetro ($n), mas % _ \ digitados pelo
// usuário viravam curingas (busca "%" listava tudo, "_" casava qualquer letra, padrões caros). O Postgres usa
// "\" como escape padrão do LIKE, então basta escapar esses três caracteres.
export const likeEsc = (s, max = 60) => String(s ?? '').trim().slice(0, max).replace(/[\\%_]/g, '\\$&')
export const likeTerm = (s, max = 60) => '%' + likeEsc(s, max) + '%'
export const pageNum = (v, max = 500) => Math.min(max, Math.max(0, Math.floor(+v) || 0))
