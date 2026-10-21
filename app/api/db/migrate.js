// Uso: node db/migrate.js            -> cria o banco (se faltar), aplica migrations e seed (idempotente)
//      node db/migrate.js --no-seed
import '../env.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { dbConfig } from './pool.js'
import { GROUPS, PT, parseLabel, slug } from './muscles-pt.js'
import { EQUIPMENT, EXERCISES, PROGRAMS } from './seed-data.js'
import { PROGRAMS2, OVERRIDES, MEDIA, INSTR } from './seed-programs.js'
import { syncOfficialPrograms } from './official-programs.js'
import { syncPosturalProtocol } from './postural-protocol.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DB = process.env.DB_NAME || 'avagym'

async function ensureDatabase() {
  const c = new pg.Client(dbConfig('postgres')); await c.connect()
  const r = await c.query('select 1 from pg_database where datname=$1', [DB])
  if (!r.rowCount) { await c.query(`create database "${DB.replace(/"/g, '')}"`); console.log('banco criado:', DB) }
  await c.end()
}
async function migrate(c) {
  await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())')
  const done = new Set((await c.query('select name from schema_migrations')).rows.map(r => r.name))
  const dir = path.join(here, 'migrations')
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue
    await c.query('begin')
    try { await c.query(fs.readFileSync(path.join(dir, f), 'utf8')); await c.query('insert into schema_migrations(name) values($1)', [f]); await c.query('commit'); console.log('migration aplicada:', f) }
    catch (e) { await c.query('rollback'); throw e }
  }
}
function glbLabels() {
  const file = process.env.GLB_PATH || path.join(here, '../../frontend/public/models/corpo.glb')
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n).toString('utf8'))
  return j.nodes.filter(x => x.extras && x.extras.label).map(x => ({ label: x.extras.label, group: x.extras.group || null }))
}
async function seed(c) {
  await c.query('begin')
  // papéis e tenant padrão
  for (const [id, n] of [['admin', 'Administrador'], ['profissional', 'Profissional (personal/fisio)'], ['aluno', 'Aluno']])
    await c.query('insert into roles(id,name_pt) values($1,$2) on conflict (id) do update set name_pt=excluded.name_pt', [id, n])
  const t = await c.query(`insert into tenants(slug,name) values('avadesk','AVAGYM Academia') on conflict (slug) do update set name=tenants.name returning id`)
  // BUG-014: em banco novo a 018 roda antes deste insert e nenhuma organizacao fica padrao
  await c.query(`update tenants set is_default=true where slug='avadesk' and not exists (select 1 from tenants where is_default)`)
  const tenantId = t.rows[0].id
  // grupos e músculos (a partir do GLB)
  let pos = 0
  for (const [id, n, tr] of GROUPS) await c.query('insert into muscle_groups(id,name_pt,is_training,position) values($1,$2,$3,$4) on conflict (id) do update set name_pt=excluded.name_pt, is_training=excluded.is_training, position=excluded.position', [id, n, !!tr, pos++])
  const byBase = new Map()
  for (const { label, group } of glbLabels()) {
    const { base } = parseLabel(label)
    const e = byBase.get(base) || { base, group: null, meshes: [] }
    e.meshes.push(label); e.group = e.group || group; byBase.set(base, e)
  }
  const untranslated = []
  for (const e of byBase.values()) {
    const tr = PT[e.base]; if (!tr) untranslated.push(e.base)
    await c.query('insert into muscles(id,name_pt,name_en,group_id,mesh_ids) values($1,$2,$3,$4,$5) on conflict (id) do update set name_pt=excluded.name_pt, group_id=excluded.group_id, mesh_ids=excluded.mesh_ids',
      [slug(e.base), tr ? tr[0] : e.base, e.base, e.group || (tr && tr[1]) || null, e.meshes])
  }
  if (untranslated.length) console.warn('sem tradução:', untranslated.join(', '))
  // equipamentos e exercícios
  for (const [id, n] of EQUIPMENT) await c.query('insert into equipment values($1,$2) on conflict (id) do update set name_pt=excluded.name_pt', [id, n])
  const known = new Set((await c.query('select id from muscles')).rows.map(r => r.id))
  for (const [id, name, eq, level, prim, sec, mus, contra] of EXERCISES) {
    await c.query('insert into exercises(id,name_pt,equipment_id,level,body_part) values($1,$2,$3,$4,$5) on conflict (id) do update set name_pt=excluded.name_pt, equipment_id=excluded.equipment_id, level=excluded.level, body_part=excluded.body_part', [id, name, eq, level, prim[0]])
    for (const g of prim) await c.query(`insert into exercise_groups values($1,$2,'primary') on conflict do nothing`, [id, g])
    for (const g of sec) await c.query(`insert into exercise_groups values($1,$2,'secondary') on conflict do nothing`, [id, g])
    for (const m of mus) if (known.has(slug(m))) await c.query(`insert into exercise_muscles values($1,$2,'primary',1) on conflict do nothing`, [id, slug(m)])
    for (const [code, lv] of Object.entries(contra)) await c.query('insert into exercise_contraindications values($1,$2,$3,null) on conflict do nothing', [id, code, lv])
  }
  // mídia (catálogo do app) e instruções em linguagem simples
  for (const [id, m] of Object.entries(MEDIA)) await c.query(`update exercises set media_url=$2 where id=$1`, [id, m.startsWith('/') ? m : 'exdb:' + m])
  for (const [id, t] of Object.entries(INSTR)) await c.query(`update exercises set instructions_pt=$2 where id=$1`, [id, t])
  // biblioteca de programas: upsert por slug; treinos atualizados por posição (não apaga treinos já referenciados por sessões)
  // Decisao do Lucas (QA 2026-10-16): os 21 programas guiados sairam do seed do produto. Nao apaga os que ja existem no banco.
  // SEED_PROGRAMS=1 so para o banco de teste (as suites ainda exercitam o motor de programas).
  for (const row of (process.env.SEED_PROGRAMS === '1' ? [...PROGRAMS, ...PROGRAMS2] : [])) {
    const [sl, title0, desc, goal0, level, loc, weeks, days, min, rehab, tags, workouts, meta0] = row
    const ov = OVERRIDES[sl] || {}, meta = meta0 || {}
    const title = ov.title || title0, goal = ov.goal || goal0
    const p = await c.query(`insert into programs(slug,title,description,goal,level,location,weeks,days_per_week,minutes,is_rehab,tags,visibility,author_name,minutes_max)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'public',$12,$13) on conflict (slug) do update set title=excluded.title, description=excluded.description, goal=excluded.goal,
      level=excluded.level, location=excluded.location, weeks=excluded.weeks, days_per_week=excluded.days_per_week, minutes=excluded.minutes, is_rehab=excluded.is_rehab, tags=excluded.tags,
      author_name=excluded.author_name, minutes_max=excluded.minutes_max returning id`,
      [sl, title, desc, goal, level, loc, weeks, days, min, rehab, tags, meta.author || ov.author || (rehab ? 'Equipe AVAGYM (fisioterapia)' : 'Equipe AVAGYM'), meta.minutes_max || ov.minutes_max || null])
    const pid = p.rows[0].id
    // V4: programa que já tem revisão editorial nova (v2+) não é reescrito pelo seed — o conteúdo publicado é imutável
    if ((await c.query(`select to_regclass('program_revisions') t`)).rows[0].t && (await c.query('select 1 from program_revisions where program_id=$1 and version_number>1', [pid])).rowCount) continue
    let wi = 0
    for (const [wname, focus, exs] of workouts) {
      const label = String.fromCharCode(65 + wi)
      const ex = await c.query('select id from program_workouts where program_id=$1 and position=$2 order by id limit 1', [pid, wi])
      let wid
      if (ex.rowCount) { wid = ex.rows[0].id; await c.query('update program_workouts set name=$2, focus=$3, day_label=$4 where id=$1', [wid, wname, focus, label]) }
      else wid = (await c.query('insert into program_workouts(program_id,position,name,focus,day_label) values($1,$2,$3,$4,$5) returning id', [pid, wi, wname, focus, label])).rows[0].id
      await c.query('delete from program_workout_exercises where program_workout_id=$1', [wid])
      let ei = 0
      for (const [exId, sets, a, b, rest, dur] of exs)
        await c.query('insert into program_workout_exercises(program_workout_id,position,exercise_id,sets,reps_min,reps_max,rest_sec,duration_sec,instructions) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [wid, ei++, exId, sets, a, b, rest, dur, INSTR[exId] || null])
      wi++
    }
    // treinos excedentes: só remove os que nenhuma sessão usa
    await c.query(`delete from program_workouts w where w.program_id=$1 and w.position>=$2 and not exists (select 1 from sessions s where s.program_workout_id=w.id)`, [pid, wi])
    // equipamentos, grupos musculares e contraindicações derivados dos exercícios
    await c.query(`update programs p set
        equipment = coalesce((select array_agg(distinct e.equipment_id) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercises e on e.id=x.exercise_id where w.program_id=p.id and e.equipment_id is not null),'{}'),
        muscles = coalesce((select array_agg(distinct g.group_id) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercise_groups g on g.exercise_id=x.exercise_id and g.role='primary' where w.program_id=p.id),'{}'),
        contraindications = coalesce((select array_agg(distinct ci.restriction_code) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercise_contraindications ci on ci.exercise_id=x.exercise_id and ci.level='avoid' where w.program_id=p.id),'{}'),
        cover_url = coalesce(p.cover_url, (select e.media_url from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercises e on e.id=x.exercise_id where w.program_id=p.id and e.media_url is not null order by w.position, x.position limit 1)),
        updated_at = now()
      where p.id=$1`, [pid])
  }
  // usuário admin
  // só cria admin automático quando ADMIN_EMAIL e ADMIN_PASSWORD estão definidos; o caminho padrão é `npm run create-admin`
  const email = process.env.ADMIN_EMAIL
  const ex = email ? await c.query('select id from users where lower(email)=lower($1)', [email]) : { rowCount: 1 }
  let adminPass = null
  if (!ex.rowCount && process.env.ADMIN_PASSWORD) {
    adminPass = process.env.ADMIN_PASSWORD
    const u = await c.query('insert into users(tenant_id,name,email,password_hash) values($1,$2,$3,$4) returning id', [tenantId, 'Administrador', email, await bcrypt.hash(adminPass, 12)])
    for (const r of ['admin']) await c.query('insert into user_roles values($1,$2,$3) on conflict do nothing', [u.rows[0].id, tenantId, r])
  }
  await c.query('commit')
  // BUG-015: em banco novo a 028 roda antes do seed dos programas; refaz o backfill de program_equipment (idempotente)
  await c.query(`insert into program_equipment(program_id, equipment_id, required) select p.id, e, true from programs p, unnest(p.equipment) e where e is not null and exists (select 1 from equipment q where q.id = e) on conflict do nothing`)
  await c.query('begin')
  let official
  let postural
  try { official = await syncOfficialPrograms(c); postural = await syncPosturalProtocol(c); await c.query('commit') }
  catch (e) { await c.query('rollback'); throw e }
  const counts = (await c.query(`select (select count(*) from muscles) m, (select count(*) from exercises) e, (select count(*) from programs) p`)).rows[0]
  console.log(`seed ok: ${counts.m} músculos, ${counts.e} exercícios, ${counts.p} programas (${official.total} oficiais ORNY)`)
  console.log(`avaliação postural: ${postural.protocols} protocolo(s), ${postural.versions} versão(ões) nova(s), ${postural.steps} etapa(s)` + (postural.review ? ` — ${postural.review} etapa(s) aguardando validação do profissional` : ''))
  if (adminPass) console.log(`ADMIN CRIADO: ${email}`)
  else if (!+(await c.query(`select count(*) from user_roles where role_id='admin'`)).rows[0].count) console.log('nenhum administrador: rode npm run create-admin')
}

await ensureDatabase()
const c = new pg.Client(dbConfig(DB)); await c.connect()
try { await migrate(c); if (!process.argv.includes('--no-seed')) await seed(c) }
finally { await c.end() }
