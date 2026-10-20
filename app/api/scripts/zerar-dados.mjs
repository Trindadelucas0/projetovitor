// SOMENTE LOCAL. Apaga TODOS os dados de usuários (contas, vínculos, treinos, comunidade, ranking, solicitações,
// notificações, tokens) e mantém catálogo e sistema: exercícios + mídia, músculos/3D, programas do catálogo,
// planos de acesso, categorias, configurações, tenant e versões dos termos.
// Faça o backup antes (db\backup.ps1 antes_zerar). Uso: node scripts/zerar-dados.mjs --confirmar ZERAR
import '../env.js'
import fs from 'node:fs'; import path from 'node:path'
import { q, pool } from '../db/pool.js'
if (process.env.NODE_ENV === 'production') { console.error('não rode em produção'); process.exit(1) }
if (process.argv[process.argv.indexOf('--confirmar') + 1] !== 'ZERAR') { console.error('use: --confirmar ZERAR'); process.exit(1) }
const c = await pool.connect()
try {
  await c.query('begin')
  // referências a usuários em dados que ficam: desvincular antes de apagar
  const keepRefs = [['exercise_media', ['created_by', 'uploaded_by', 'removed_by']], ['terms_versions', ['published_by', 'created_by']], ['app_settings', ['updated_by']], ['tenants', ['owner_id']], ['exercises', ['author_id', 'created_by']]]
  for (const [t, cols] of keepRefs) for (const col of cols) {
    const ok = (await c.query(`select 1 from information_schema.columns where table_name=$1 and column_name=$2`, [t, col])).rowCount
    if (ok) await c.query(`update ${t} set ${col}=null where ${col} is not null`)
  }
  // programas criados por usuários saem; os do catálogo (sem autor) ficam
  await c.query(`delete from programs where author_id is not null`)
  // todas as tabelas com FK para users (exceto as mantidas) são truncadas junto com users
  const keep = new Set(['exercise_media', 'terms_versions', 'app_settings', 'tenants', 'exercises', 'programs', 'access_plans', 'feed_categories', 'muscles', 'muscle_groups', 'equipment', 'roles'])
  const fk = (await c.query(`select distinct cl.relname t from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_class r on r.oid=co.confrelid where co.contype='f' and r.relname='users'`)).rows.map(r => r.t).filter(t => !keep.has(t))
  const extra = ['post_likes', 'post_comments', 'content_reports', 'pro_request_history', 'ranking_snapshots', 'workout_templates', 'audit_log', 'password_resets', 'term_acceptances', 'data_requests', 'notifications', 'messages', 'threads']
  const exists = (await c.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r => r.tablename)
  const all = [...new Set([...fk, ...extra])].filter(t => exists.includes(t) && t !== 'users')
  // fecho: toda tabela que referencia uma tabela zerada também é zerada (as mantidas não podem depender delas)
  const refs = (await c.query(`select cl.relname t, r.relname r from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_class r on r.oid=co.confrelid where co.contype='f' and cl.relname<>r.relname`)).rows
  for (let grew = true; grew;) { grew = false
    for (const { t, r } of refs) if ((all.includes(r) || r === 'users') && !all.includes(t) && t !== 'users') {
      if (keep.has(t)) { if (r !== 'users') throw new Error(`tabela mantida ${t} depende de ${r}`); continue }
      all.push(t); grew = true } }
  await c.query(`truncate ${all.map(t => `"${t}"`).join(',')} restart identity`)
  // users: delete (tabelas mantidas ainda referenciam users, com as colunas já anuladas)
  await c.query('update users set same_person_id=null').catch(() => {})
  await c.query('delete from users')
  await c.query('commit')
  console.log('tabelas zeradas:', ['users', ...all].sort().join(', '))
} catch (e) { await c.query('rollback'); console.error('falhou, nada foi apagado:', e.message); process.exitCode = 1 }
finally { c.release() }
if (!process.exitCode) {
  // estado legado (arquivos) e fotos de publicações; mídia dos exercícios fica
  const DATA = process.env.DATA_DIR || '/data'
  for (const f of fs.existsSync(DATA) ? fs.readdirSync(DATA) : []) if (/^state-.*\.json$/.test(f)) fs.unlinkSync(path.join(DATA, f))
  const dbf = path.join(DATA, 'db.json'); if (fs.existsSync(dbf)) { const d = JSON.parse(fs.readFileSync(dbf, 'utf8')); d.users = []; fs.writeFileSync(dbf, JSON.stringify(d)) }
  const UP = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'uploads')
  const keepFiles = new Set((await q(`select url from exercise_media`)).rows.map(r => { const u = r.url || ''; const m = u.match(/[?&]f=([^&]+)/); return m ? decodeURIComponent(m[1]) : path.basename(u) }))
  let n = 0; for (const f of fs.existsSync(UP) ? fs.readdirSync(UP) : []) if (!keepFiles.has(f)) { fs.unlinkSync(path.join(UP, f)); n++ }
  const k = (await q(`select (select count(*) from users) u, (select count(*) from exercises) e, (select count(*) from exercise_media) m, (select count(*) from muscles) mu, (select count(*) from programs) p, (select count(*) from terms_versions) t, (select string_agg(name, ',') from tenants) tn`)).rows[0]
  console.log(`ok: ${k.u} usuários; mantidos ${k.e} exercícios, ${k.m} mídias, ${k.mu} músculos, ${k.p} programas, ${k.t} versões de termos, tenant ${k.tn}; ${n} arquivos de publicações removidos`)
}
await pool.end()
