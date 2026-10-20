import assert from 'node:assert/strict'
import { pool } from '../db/pool.js'

try {
  const catalog = (await pool.query(`select p.id,p.slug,p.goal,p.level,p.location,p.progression,p.published_revision_id,
    (select count(*)::int from program_workouts w where w.program_id=p.id and w.revision_id=p.published_revision_id) workouts
    from programs p where p.status='publicado' and p.archived_at is null order by p.goal,p.level`)).rows
  assert.equal(catalog.length, 18)
  assert.equal(new Set(catalog.map(p => `${p.goal}:${p.level}`)).size, 18)
  assert.equal(catalog.some(p => p.goal === 'rehab' || !p.progression || !p.published_revision_id || p.workouts < 1), false)
  assert.equal((await pool.query(`select count(*)::int n from programs where origin_kind='seed' and status='publicado' and archived_at is null`)).rows[0].n, 0)
  const archivedSeeds = (await pool.query(`select count(*)::int n from programs where origin_kind='seed' and status='arquivado' and archived_at is not null`)).rows[0].n
  if (process.env.EXPECT_ARCHIVED_SEEDS) assert.equal(archivedSeeds, +process.env.EXPECT_ARCHIVED_SEEDS)
  const individual = (await pool.query(`select v.features from plan_versions v where v.plan_id='individual' order by version desc limit 1`)).rows[0]
  assert.equal(individual.features.catalogo_completo, true)
  console.log(JSON.stringify({ ok: true, published: catalog.length, combinations: 18, archived_seeds: archivedSeeds, individual_catalog: true }))
} finally {
  await pool.end()
}
