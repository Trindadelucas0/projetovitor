// V5 (regra do Lucas): log e auditoria de CADA acao, gravados no banco (request_audit), com retencao configuravel.
// Grava: toda escrita (POST/PUT/PATCH/DELETE), toda resposta de erro (>= 400) e toda leitura de /api/adm/* (consulta do admin).
// Nunca grava corpo, query string, token, senha ou e-mail digitado: so rota, usuario (id), IP, user-agent, status e codigo de erro.
import { q } from './db/pool.js'
const ADM_PREFIX = '/api/adm' + '/'   // (sem literal de rota: o teste sem-visitante varre chaves 'METODO /api/...')

const DEFAULT_RETENTION = Math.max(7, +(process.env.AUDIT_RETENTION_DAYS || 180) || 180)
const SKIP = new Set(['GET /api/health'])
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''))

export function shouldAudit(method, key, status) {
  if (SKIP.has(key)) return false
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' || status >= 400 || (method === 'GET' && key.startsWith('GET ' + ADM_PREFIX))
}
// observa a resposta sem mudar nada: guarda o status e, se for erro JSON pequeno, so o campo `code`
export function watchResponse(res) {
  const info = { status: 200, code: null }
  const wh = res.writeHead.bind(res), end = res.end.bind(res)
  res.writeHead = (status, ...a) => { info.status = status; return wh(status, ...a) }
  res.end = (chunk, ...a) => {
    if (info.status >= 400 && chunk && chunk.length < 4096) { try { const c = JSON.parse(String(chunk)).code; if (typeof c === 'string') info.code = c.slice(0, 60) } catch { /* nao JSON */ } }
    return end(chunk, ...a)
  }
  return info
}
export function recordRequest({ method, key, path, status, code, ms, ip, ua, user, legacyUser, routeKnown }) {
  if (!shouldAudit(method, key, status)) return
  const result = status >= 500 ? 'erro_servidor' : status === 401 ? 'nao_autenticado' : status === 403 ? 'negado' : status === 429 ? 'limite' : status >= 400 ? 'recusado' : 'ok'
  const actor = user ? (user.roles?.includes('admin') ? 'admin' : user.roles?.includes('profissional') ? 'profissional' : 'aluno') : legacyUser ? 'sessao_legada' : 'anonimo'
  q(`insert into request_audit(tenant_id,user_id,actor_kind,method,route,path,status,result,error_code,duration_ms,ip,user_agent) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [user?.tenant_id && isUuid(user.tenant_id) ? user.tenant_id : null, user?.id || legacyUser?.id || null, actor, method, routeKnown ? key : method + ' (rota inexistente)',
      String(path).slice(0, 300), status, result, code || null, Math.round(ms), ip ? String(ip).slice(0, 64) : null, ua ? String(ua).slice(0, 200) : null])
    .catch(e => console.error('[auditoria] falha ao gravar:', e.message))
}
async function retentionDays() {
  const r = (await q(`select s.value from app_settings s join tenants t on t.id=s.tenant_id where s.key='auditoria_retencao_dias' order by t.is_default desc limit 1`).catch(() => ({ rows: [] }))).rows[0]
  const v = r ? +r.value : DEFAULT_RETENTION
  return Number.isFinite(v) && v >= 7 ? Math.min(3650, Math.trunc(v)) : DEFAULT_RETENTION
}
export async function purgeAudit() {
  const d = await retentionDays()
  const r = await q(`delete from request_audit where at < now() - make_interval(days => $1)`, [d])
  if (r.rowCount) console.log(`[auditoria] ${r.rowCount} registro(s) com mais de ${d} dias removidos (retencao)`)
  return { removed: r.rowCount, days: d }
}
export function startAuditPurge() {
  if (process.env.AUDIT_PURGE === 'off') return
  setTimeout(() => purgeAudit().catch(() => {}), 30e3).unref()
  setInterval(() => purgeAudit().catch(e => console.error('[auditoria] purge', e.message)), 6 * 3600e3).unref()
}

// ---------- rotas do painel admin (tela "Logs e auditoria") ----------
const qs = req => new URL(req.url, 'http://x').searchParams
const pageOf = p => { const per = Math.min(200, Math.max(10, +p.get('per') || 50)), page = Math.max(1, +p.get('page') || 1); return { per, page, off: (page - 1) * per } }
function dateRange(p, col, params, where) {
  const from = p.get('from'), to = p.get('to')
  if (from && !isNaN(Date.parse(from))) { params.push(from); where.push(`${col} >= $${params.length}::timestamptz`) }
  if (to && !isNaN(Date.parse(to))) { params.push(/^\d{4}-\d{2}-\d{2}$/.test(to) ? to + 'T23:59:59.999-03:00' : to); where.push(`${col} <= $${params.length}::timestamptz`) }
}
export function auditRoutes({ json, readBody, requireRole }) {
  return {
    'GET /api/adm/logs': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const p = qs(req), { per, page, off } = pageOf(p), params = [], where = []
      const user = (p.get('user') || '').trim().slice(0, 120)
      if (user) { params.push(user); const i = params.length; where.push(isUuid(user) ? `a.user_id = $${i}` : `(a.user_id in (select id::text from users where lower(email) like '%'||lower($${i})||'%' or lower(name) like '%'||lower($${i})||'%'))`) }
      const action = (p.get('action') || '').trim().slice(0, 120)
      if (action) { params.push(action); where.push(`a.route ilike '%'||$${params.length}||'%'`) }
      const err = p.get('errors')
      if (err === '1') where.push('a.status >= 400'); else if (err === '5') where.push('a.status >= 500')
      const st = +p.get('status'); if (st >= 100 && st < 600) { params.push(st); where.push(`a.status = $${params.length}`) }
      const result = p.get('result'); if (result) { params.push(result.slice(0, 30)); where.push(`a.result = $${params.length}`) }
      dateRange(p, 'a.at', params, where)
      const W = where.length ? 'where ' + where.join(' and ') : ''
      const total = +(await q(`select count(*) n from request_audit a ${W}`, params)).rows[0].n
      const rows = (await q(`select a.id, a.at, a.user_id, a.actor_kind, a.method, a.route, a.path, a.status, a.result, a.error_code, a.duration_ms, a.ip, a.user_agent,
          coalesce(u.name, l.name) user_name, coalesce(u.email, l.email) user_email
        from request_audit a left join users u on u.id::text = a.user_id left join legacy_session_users l on l.id = a.user_id and u.id is null
        ${W} order by a.at desc, a.id desc limit ${per} offset ${off}`, params)).rows
      json(res, 200, { rows, total, page, per, pages: Math.max(1, Math.ceil(total / per)) })
    },
    'GET /api/adm/audit-log': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const p = qs(req), { per, page, off } = pageOf(p), params = [u.tenant_id], where = ['(a.tenant_id = $1 or a.tenant_id is null)']
      const user = (p.get('user') || '').trim().slice(0, 120)
      if (user) { params.push(user); const i = params.length; where.push(isUuid(user) ? `a.actor_id = $${i}::uuid` : `(lower(x.email) like '%'||lower($${i})||'%' or lower(x.name) like '%'||lower($${i})||'%')`) }
      const action = (p.get('action') || '').trim().slice(0, 120)
      if (action) { params.push(action); where.push(`(a.action ilike '%'||$${params.length}||'%' or a.entity ilike '%'||$${params.length}||'%')`) }
      dateRange(p, 'a.created_at', params, where)
      const W = 'where ' + where.join(' and ')
      const total = +(await q(`select count(*) n from audit_log a left join users x on x.id=a.actor_id ${W}`, params)).rows[0].n
      const rows = (await q(`select a.id, a.created_at at, a.actor_id, x.name actor_name, x.email actor_email, a.action, a.entity, a.entity_id, left(coalesce(a.data::text,''), 400) data
        from audit_log a left join users x on x.id=a.actor_id ${W} order by a.created_at desc, a.id desc limit ${per} offset ${off}`, params)).rows
      json(res, 200, { rows, total, page, per, pages: Math.max(1, Math.ceil(total / per)) })
    },
    'GET /api/adm/logs/meta': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const [routes, sum] = await Promise.all([
        q(`select route, count(*)::int n from request_audit where at > now() - interval '30 days' group by route order by n desc limit 300`),
        q(`select count(*)::int total, count(*) filter (where status >= 400)::int errors, count(*) filter (where status >= 500)::int server_errors, min(at) oldest from request_audit`)])
      json(res, 200, { routes: routes.rows, summary: sum.rows[0], retention_days: await retentionDays() })
    },
    'POST /api/adm/logs/settings': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req), d = Math.trunc(+b.retention_days)
      if (!(d >= 7 && d <= 3650)) return json(res, 400, { error: 'Retenção entre 7 e 3650 dias.', code: 'INVALID_INPUT', errors: { retention_days: 'Entre 7 e 3650' } })
      await q(`insert into app_settings(tenant_id,key,value,updated_by) values($1,'auditoria_retencao_dias',$2,$3) on conflict (tenant_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`, [u.tenant_id, JSON.stringify(d), u.id])
      await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,'configuracao','setting','auditoria_retencao_dias',$3)`, [u.tenant_id, u.id, JSON.stringify({ value: d })])
      json(res, 200, { ok: true, retention_days: d })
    }
  }
}
