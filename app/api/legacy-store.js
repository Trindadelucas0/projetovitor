// V5 (regra do Lucas): dados do servidor legado no PostgreSQL. Substitui db.json, vapid.json, secret e state-<id>.json.
// A API mantem o objeto `db` em memoria (mesma forma de antes) e grava no banco a cada mudanca (saveDb -> persistLegacy).
// Importacao unica: se os arquivos antigos existirem em DATA_DIR, sao lidos, gravados no banco e RENOMEADOS para
// <arquivo>.importado-<data> (nunca apagados).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { q, pool } from './db/pool.js'

const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''))
const USER_KEYS = ['id', 'name', 'email', 'admin', 'disabled', 'sv', 'lastReminder', 'pg', 'created']
const CRED_KEYS = ['id', 'userId', 'publicKey', 'counter', 'transports']
const rest = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)))
const retire = f => { const to = f + '.importado-' + stamp(); fs.renameSync(f, to); return path.basename(to) }

async function writeAll(c, db, { merge }) {
  const users = (db.users || []).filter(u => u && u.id), creds = (db.creds || []).filter(x => x && x.id)
  const subs = (db.subs || []).filter(s => s && s.endpoint && s.keys), invites = (db.invites || []).filter(Boolean)
  for (const u of users)
    await c.query(`insert into legacy_session_users(id,name,email,admin,disabled,sv,last_reminder,pg,created_ms,extra,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict (id) do update set name=excluded.name, email=excluded.email, admin=excluded.admin, disabled=excluded.disabled, sv=excluded.sv,
      last_reminder=excluded.last_reminder, pg=excluded.pg, created_ms=coalesce(legacy_session_users.created_ms, excluded.created_ms), extra=excluded.extra, updated_at=now()`,
      [String(u.id), u.name ?? null, u.email ?? null, !!u.admin, !!u.disabled, Number.isInteger(u.sv) ? u.sv : 0, u.lastReminder ?? null, !!u.pg,
        Number.isFinite(+u.created) ? Math.trunc(+u.created) : null, JSON.stringify(rest(u, USER_KEYS))])
  for (const x of creds)
    await c.query(`insert into legacy_webauthn_credentials(id,user_id,public_key,counter,transports,extra) values($1,$2,$3,$4,$5,$6)
      on conflict (id) do update set user_id=excluded.user_id, public_key=excluded.public_key, counter=excluded.counter, transports=excluded.transports, extra=excluded.extra`,
      [String(x.id), String(x.userId), String(x.publicKey ?? ''), Number.isFinite(+x.counter) ? Math.trunc(+x.counter) : 0, Array.isArray(x.transports) ? x.transports.map(String) : null, JSON.stringify(rest(x, CRED_KEYS))])
  for (const s of subs)
    await c.query(`insert into legacy_push_subscriptions(endpoint,user_id,p256dh,auth,created_at) values($1,$2,$3,$4,coalesce($5::timestamptz, now()))
      on conflict (endpoint) do update set user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
      [String(s.endpoint), String(s.userId), String(s.keys.p256dh || ''), String(s.keys.auth || ''), s.created || null])
  for (const i of invites) {
    const code = String(i.code || i.id || crypto.createHash('sha256').update(JSON.stringify(i)).digest('hex').slice(0, 16))
    await c.query('insert into legacy_invites(code,data) values($1,$2) on conflict (code) do update set data=excluded.data', [code, JSON.stringify(i)])
  }
  if (!merge) {   // espelho exato do objeto em memoria: o que saiu do `db` sai do banco
    await c.query('delete from legacy_session_users where not (id = any($1::text[]))', [users.map(u => String(u.id))])
    await c.query('delete from legacy_webauthn_credentials where not (id = any($1::text[]))', [creds.map(x => String(x.id))])
    await c.query('delete from legacy_push_subscriptions where not (endpoint = any($1::text[]))', [subs.map(s => String(s.endpoint))])
    await c.query('delete from legacy_invites where not (code = any($1::text[]))', [invites.map(i => String(i.code || i.id || ''))])
  }
}
async function tx(fn) {
  const c = await pool.connect()
  try { await c.query('begin'); await fn(c); await c.query('commit') } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
}

// carrega o `db` legado do banco (importando db.json uma unica vez, se existir)
export async function loadLegacy(DATA) {
  const file = path.join(DATA, 'db.json')
  if (fs.existsSync(file)) {
    let j = null; try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.error('[legacy] db.json invalido; nao importado:', e.message) }
    if (j) { await tx(c => writeAll(c, j, { merge: true })); console.log('[legacy] db.json importado para o Postgres; arquivo renomeado para', retire(file)) }
  }
  const [u, c, s, i] = await Promise.all([
    q('select * from legacy_session_users order by created_ms nulls first, id'), q('select * from legacy_webauthn_credentials order by created_at'),
    q('select * from legacy_push_subscriptions order by created_at'), q('select * from legacy_invites order by created_at')])
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  return {
    users: u.rows.map(r => clean({ ...r.extra, id: r.id, name: r.name ?? undefined, email: r.email ?? undefined, admin: r.admin || undefined, disabled: r.disabled || undefined,
      sv: r.sv || undefined, lastReminder: r.last_reminder ?? undefined, pg: r.pg || undefined, created: r.created_ms != null ? +r.created_ms : undefined })),
    creds: c.rows.map(r => clean({ ...r.extra, id: r.id, userId: r.user_id, publicKey: r.public_key, counter: +r.counter, transports: r.transports ?? undefined })),
    subs: s.rows.map(r => ({ userId: r.user_id, endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, created: r.created_at.toISOString() })),
    invites: i.rows.map(r => r.data)
  }
}

// grava o `db` em memoria no banco (agrupa rajadas; uma escrita por vez, na ordem)
let timer = null, running = Promise.resolve(), pendingDb = null
export function persistLegacy(db) {
  pendingDb = db; clearTimeout(timer)
  timer = setTimeout(() => {
    const snap = JSON.parse(JSON.stringify(pendingDb)); pendingDb = null
    running = running.then(() => tx(c => writeAll(c, snap, { merge: false }))).catch(e => console.error('[legacy] falha ao gravar no Postgres:', e.message))
  }, 150)
}
export const flushLegacy = async () => { if (pendingDb) { clearTimeout(timer); const snap = pendingDb; pendingDb = null; running = running.then(() => tx(c => writeAll(c, snap, { merge: false }))) } await running }

// chave do servidor: variavel de ambiente > banco > arquivo antigo (importado e renomeado) > gera nova (grava no banco)
export async function serverKey(name, { envValue, file, parse = v => v, gen }) {
  if (envValue) return envValue
  const r = (await q('select value from server_keys where name=$1', [name])).rows[0]
  if (r) return r.value
  let v = null
  if (file && fs.existsSync(file)) { try { v = parse(fs.readFileSync(file, 'utf8')) } catch { v = null } }
  if (v == null) v = gen()
  await q('insert into server_keys(name,value) values($1,$2) on conflict (name) do nothing', [name, JSON.stringify(v)])
  const saved = (await q('select value from server_keys where name=$1', [name])).rows[0].value
  if (file && fs.existsSync(file)) console.log('[legacy] chave', name, 'importada para o Postgres; arquivo renomeado para', retire(file))
  return saved
}

// state-<id>.json -> legacy_state_files (copia integral) e user_app_state (quando o usuario existe e ainda nao tem estado)
export async function importStateFiles(DATA, writeStatePg) {
  let n = 0, live = 0
  for (const f of fs.existsSync(DATA) ? fs.readdirSync(DATA) : []) {
    const m = /^state-([A-Za-z0-9_-]+)\.json$/.exec(f); if (!m) continue
    const full = path.join(DATA, f); let st
    try { st = JSON.parse(fs.readFileSync(full, 'utf8')) } catch { console.error('[legacy] estado invalido, mantido:', f); continue }
    await q('insert into legacy_state_files(user_id,state) values($1,$2) on conflict (user_id) do nothing', [m[1], JSON.stringify(st)])
    if (isUuid(m[1]) && (await q('select 1 from users where id=$1', [m[1]])).rowCount && !(await q('select 1 from user_app_state where user_id=$1', [m[1]])).rowCount) { await writeStatePg(m[1], st, null); live++ }
    retire(full); n++
  }
  if (n) console.log(`[legacy] ${n} arquivo(s) state-*.json importados (${live} viraram estado ativo); arquivos renomeados *.importado-*`)
  return { files: n, live }
}
export async function legacyStateOf(uid) {
  return (await q('select state from legacy_state_files where user_id=$1', [String(uid)])).rows[0]?.state || null
}
