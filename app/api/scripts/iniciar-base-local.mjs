// Reinicia somente as contas da base local, preservando o admin principal e o catálogo.
// Primeiro execute sem --apply para validar tudo em uma transação que será desfeita.
import '../env.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db/pool.js'

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const LOCAL_ADMIN_ID = String(process.env.LOCAL_ADMIN_ID || '').trim()
if (!ADMIN_EMAIL) throw new Error('Defina ADMIN_EMAIL no .env.')
const apply = process.argv.includes('--apply')
const host = process.env.DB_HOST || 'localhost'
const db = process.env.DB_NAME || 'avagym'
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host) || db !== 'avagym') {
  throw new Error('Esta rotina só pode acessar o banco local avagym.')
}
if (apply && !process.argv.includes('--confirmar=INICIAR-SEM-ALUNOS')) {
  throw new Error('Para aplicar: --apply --confirmar=INICIAR-SEM-ALUNOS')
}

const ident = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Identificador inesperado: ${name}`)
  return `"${name}"`
}
const c = await pool.connect()
try {
  await c.query('begin')
  await c.query("set local lock_timeout = '10s'")
  await c.query("set local statement_timeout = '180s'")
  const admins = await c.query(`select u.id,u.tenant_id,u.email,u.status,u.password_hash
    from users u join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='admin'
    where lower(u.email)=$1 for update of u`, [ADMIN_EMAIL])
  if (admins.rowCount !== 1 || admins.rows[0].status !== 'ativo' || !admins.rows[0].password_hash) {
    throw new Error('A conta admin escolhida não está ativa e pronta para entrar.')
  }
  const admin = admins.rows[0]
  const tenantCheck = await c.query('select count(*)::int total from tenants')
  if (tenantCheck.rows[0].total !== 1 ||
      (await c.query('select count(*)::int total from users where tenant_id<>$1', [admin.tenant_id])).rows[0].total !== 0) {
    throw new Error('A rotina exige um único ambiente local, o mesmo da conta admin preservada.')
  }
  const users = await c.query('select id from users where id<>$1 order by id', [admin.id])
  const ids = users.rows.map(r => r.id)
  if (apply) {
    const alreadyConfigured = await c.query('select 1 from schema_migrations where name=$1', ['069_personal_do_tenant.sql'])
    if ((LOCAL_ADMIN_ID && admin.id !== LOCAL_ADMIN_ID) || ids.length !== 73 || alreadyConfigured.rowCount) {
      throw new Error('Esta limpeza de 21/10/2026 já foi executada ou a base mudou; não é permitido reaplicá-la.')
    }
  }
  const before = { users: ids.length + 1, removable: ids.length }
  const keep = new Set(['app_settings', 'exercise_media', 'exercises', 'programs', 'tenants', 'terms_versions'])
  const fks = (await c.query(`select child.relname child, ca.attname child_col,
       parent.relname parent, pa.attname parent_col, not ca.attnotnull nullable
    from pg_constraint fk
    join pg_class child on child.oid=fk.conrelid
    join pg_class parent on parent.oid=fk.confrelid
    join pg_namespace ns on ns.oid=child.relnamespace and ns.nspname='public'
    join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=fk.conkey[1]
    join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=fk.confkey[1]
    where fk.contype='f' and array_length(fk.conkey,1)=1 and array_length(fk.confkey,1)=1`)).rows
  const changed = new Map()
  const purge = async (table, col, values, depth = 0) => {
    if (!values.length) return
    if (depth > 32) throw new Error(`Ciclo de referências ao remover ${table}`)
    const target = `${ident(col)}::text = any($1::text[])`
    const current = await c.query(`select 1 from ${ident(table)} where ${target} limit 1`, [values])
    if (!current.rowCount) return
    for (const fk of fks.filter(f => f.parent === table)) {
      const refs = (await c.query(`select distinct ${ident(fk.parent_col)}::text value from ${ident(table)} where ${target} and ${ident(fk.parent_col)} is not null`, [values])).rows.map(r => r.value)
      if (!refs.length) continue
      const where = `${ident(fk.child_col)}::text = any($1::text[])`
      if (fk.child === 'users' || keep.has(fk.child)) {
        if (!fk.nullable) throw new Error(`Referência obrigatória em tabela preservada: ${fk.child}.${fk.child_col}`)
        await c.query(`update ${ident(fk.child)} set ${ident(fk.child_col)}=null where ${where}`, [refs])
      } else if (fk.child === table) {
        if (!fk.nullable) throw new Error(`Autorreferência obrigatória em ${table}`)
        await c.query(`update ${ident(table)} set ${ident(fk.child_col)}=null where ${where}`, [refs])
      } else {
        await purge(fk.child, fk.child_col, refs, depth + 1)
      }
    }
    const removed = await c.query(`delete from ${ident(table)} where ${target}`, [values])
    changed.set(table, (changed.get(table) || 0) + removed.rowCount)
  }
  await purge('users', 'id', ids)
  // Históricos de testes sem dependência de conta não devem reaparecer no sistema novo.
  for (const table of ['audit_log', 'access_plan_history', 'trial_identities', 'notifications', 'user_app_state', 'user_onboarding']) {
    const result = await c.query(`delete from ${ident(table)}`)
    changed.set(table, (changed.get(table) || 0) + result.rowCount)
  }
  const migration = '069_personal_do_tenant.sql'
  const done = await c.query('select 1 from schema_migrations where name=$1', [migration])
  if (!done.rowCount) {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations', migration)
    await c.query(fs.readFileSync(file, 'utf8'))
    await c.query('insert into schema_migrations(name) values($1)', [migration])
  }
  const final = await c.query(`select (select count(*) from users)::int users,
    (select count(*) from user_roles where role_id='aluno')::int students,
    (select count(*) from user_roles where role_id='profissional')::int professionals,
    (select count(*) from coach_students)::int links,
    (select count(*) from sessions)::int sessions,
    (select count(*) from subscriptions)::int subscriptions,
    (select count(*) from notifications)::int notifications,
    (select count(*) from audit_log)::int audit_entries,
    (select value #>> '{}' from app_settings where tenant_id=$1 and key='personal_user_id') principal`, [admin.tenant_id])
  const state = final.rows[0]
  if (state.users !== 1 || state.students !== 0 || state.professionals !== 0 || state.links !== 0 ||
      state.sessions !== 0 || state.subscriptions !== 0 || state.notifications !== 0 || state.audit_entries !== 0 ||
      state.principal !== admin.id) {
    throw new Error(`Estado final inesperado: ${JSON.stringify(state)}`)
  }
  if (apply) await c.query('commit')
  else await c.query('rollback')
  console.log(JSON.stringify({ mode: apply ? 'aplicado' : 'simulado_sem_gravar', admin: ADMIN_EMAIL, before, after: state,
    removedByTable: Object.fromEntries([...changed].sort((a, b) => a[0].localeCompare(b[0]))) }))
} catch (error) {
  await c.query('rollback').catch(() => {})
  console.error('A limpeza falhou; a transação foi desfeita:', error.message)
  process.exitCode = 1
} finally {
  c.release()
  await pool.end()
}
