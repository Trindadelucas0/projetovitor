// Uso: node scripts/importar-legado.mjs   (idempotente; não apaga nem altera o JSON original)
import { importLegacyAll } from '../legacy-import.js'
import { pool } from '../db/pool.js'
import { setDataDir, legacyFileUsers, readStateRow } from '../appstate.js'
// usuários que só têm o arquivo antigo: o arquivo é lido (não apagado) e copiado para user_app_state antes da importação
if (process.env.DATA_DIR) { setDataDir(process.env.DATA_DIR); for (const uid of legacyFileUsers()) await readStateRow(uid).catch(() => null) }
const r = await importLegacyAll()
console.log('importação legado:', JSON.stringify(r))
await pool.end()
