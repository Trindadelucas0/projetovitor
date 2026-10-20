// V4.3 · guided tours — estado por usuário no Postgres. "Ver tour de novo" marca como 'reiniciado' (nada é apagado).
import { q } from './db/pool.js'
import { requireAuth } from './auth.js'
const KEY = /^[a-z0-9:_-]{1,60}$/
export function tourRoutes({ json, readBody }) {
  return {
    'GET /api/me/tours': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const r = await q(`select tour_key, status, step, updated_at from user_tours where user_id=$1 and status<>'reiniciado'`, [u.id])
      json(res, 200, { tours: Object.fromEntries(r.rows.map(x => [x.tour_key, x])) })
    },
    'POST /api/me/tours': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!KEY.test(b.key || '') || !['concluido', 'pulado'].includes(b.status)) return json(res, 400, { error: 'Dados inválidos' })
      await q(`insert into user_tours(user_id,tour_key,status,step) values($1,$2,$3,$4)
        on conflict (user_id,tour_key) do update set status=excluded.status, step=excluded.step, updated_at=now()`, [u.id, b.key, b.status, Math.max(0, Math.min(50, +b.step || 0))])
      json(res, 200, { ok: true })
    },
    'POST /api/me/tours/reset': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      await q(`update user_tours set status='reiniciado', updated_at=now() where user_id=$1`, [u.id])
      json(res, 200, { ok: true })
    }
  }
}
