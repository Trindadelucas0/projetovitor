// SOMENTE UMA VEZ por ambiente (local / VPS): importa os arquivos legados DATA_DIR/state-<uuid>.json para a tabela
// user_app_state (fase 7). Não apaga nem altera os arquivos (ficam como backup). Idempotente: linha existente mais
// nova não é sobrescrita.  Uso: node scripts/importar-estado-legado.mjs [--dir <DATA_DIR>]
import '../env.js'
import fs from 'node:fs'
import path from 'node:path'
import { q, pool } from '../db/pool.js'
const a = process.argv.slice(2), i = a.indexOf('--dir')
const dir = i >= 0 ? a[i + 1] : (process.env.DATA_DIR || '/data')
let ok = 0, skip = 0, bad = 0
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const m = /^state-([0-9a-f-]{36})\.json$/i.exec(f); if (!m) continue
  let st; try { st = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { bad++; continue }
  if (!st || typeof st !== 'object') { bad++; continue }
  delete st.active
  const ts = Number.isFinite(+st._ts) ? Math.trunc(+st._ts) : 0
  const r = await q(`insert into user_app_state(user_id, tenant_id, state, client_ts) select id, tenant_id, $2, $3 from users where id=$1
      on conflict (user_id) do update set state=excluded.state, client_ts=excluded.client_ts, updated_at=now()
        where coalesce(user_app_state.client_ts, 0) < excluded.client_ts returning user_id`, [m[1], JSON.stringify(st), ts])
  if (r.rowCount) ok++; else skip++
}
console.log(`estado legado: ${ok} importado(s), ${skip} ignorado(s) (sem usuário ou já mais novo no banco), ${bad} inválido(s) — pasta ${dir}`)
await pool.end()
