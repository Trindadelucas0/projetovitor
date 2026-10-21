// SOMENTE LOCAL. Remove contas específicas (ex.: contas de teste) e os dados ligados a elas.
// Uso: node scripts/remover-usuarios.mjs --confirmar REMOVER email1 email2 ... ou --e2e com E2E_EMAIL_DOMAIN definido.
import '../env.js'
import { q, pool } from '../db/pool.js'
if (process.env.NODE_ENV === 'production') { console.error('não rode em produção'); process.exit(1) }
const a = process.argv.slice(2); if (a[a.indexOf('--confirmar') + 1] !== 'REMOVER') { console.error('use: --confirmar REMOVER <emails> | --e2e'); process.exit(1) }
const emails = a.filter(x => x.includes('@')).map(x => x.toLowerCase())
const removeE2e = a.includes('--e2e'), e2eDomain = String(process.env.E2E_EMAIL_DOMAIN || '').trim().toLowerCase()
if (removeE2e && !e2eDomain) { console.error('defina E2E_EMAIL_DOMAIN no .env'); process.exit(1) }
const e2ePattern = '%.' + 'e2e' + String.fromCharCode(64) + e2eDomain
const ids = (await q(`select id from users where lower(email) = any($1) or ($2 and lower(email) like $3)`, [emails, removeE2e, e2ePattern])).rows.map(r => r.id)
const KEEP = new Set(['exercise_media', 'terms_versions', 'app_settings', 'tenants', 'exercises', 'programs', 'audit_log', 'access_plan_history'])
const fks = (await q(`select cl.relname t, att.attname col, r.relname ref, (select attname from pg_attribute where attrelid=r.oid and attnum=co.confkey[1]) refcol, not att.attnotnull nullable
  from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_class r on r.oid=co.confrelid join pg_attribute att on att.attrelid=cl.oid and att.attnum=co.conkey[1] where co.contype='f'`)).rows
const c = await pool.connect()
try {
  await c.query('begin')
  // linhas a remover por tabela (chave primária implícita via ctid), começando pelos usuários
  const doomed = new Map([['users', { col: 'id', vals: ids }]])
  const del = async (table, col, vals, depth = 0) => {
    if (!vals.length || depth > 6) return
    for (const f of fks.filter(f => f.ref === table && f.refcol === col)) {
      if (f.t === 'users' && f.col !== 'id') { await c.query(`update users set "${f.col}"=null where "${f.col}"::text = any($1::text[])`, [vals.map(String)]); continue }
      if (KEEP.has(f.t) || (f.nullable && f.t !== table && ['created_by', 'verified_by', 'assigned_by', 'actor_id', 'published_by', 'decided_by', 'author_id', 'reviewed_by', 'updated_by'].includes(f.col))) {
        if (f.nullable) await c.query(`update "${f.t}" set "${f.col}"=null where "${f.col}"::text = any($1::text[])`, [vals.map(String)]); continue }
      for (const g of fks.filter(g => g.ref === f.t)) {
        const sub = (await c.query(`select "${g.refcol}"::text v from "${f.t}" where "${f.col}"::text = any($1::text[])`, [vals.map(String)])).rows.map(r => r.v)
        await del(f.t, g.refcol, sub, depth + 1)
      }
      await c.query(`delete from "${f.t}" where "${f.col}"::text = any($1::text[])`, [vals.map(String)])
    }
  }
  await del('users', 'id', ids)
  await c.query(`delete from users where id = any($1)`, [ids])
  await c.query('commit'); console.log(`removidas ${ids.length} contas`)
} catch (e) { await c.query('rollback'); console.error('falhou, nada foi removido:', e.message, e.detail || ''); process.exitCode = 1 }
finally { c.release(); await pool.end() }
