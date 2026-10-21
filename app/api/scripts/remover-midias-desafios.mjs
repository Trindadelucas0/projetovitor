// Remove somente arquivos registrados em challenge_media.
// Uso seguro:
//   node scripts/remover-midias-desafios.mjs           # apenas lista
//   node scripts/remover-midias-desafios.mjs --confirm # remove após backup
import fs from 'node:fs'
import path from 'node:path'
import { pool, q } from '../db/pool.js'
import { UPLOADS_DIR, LEGACY_UPLOADS_DIR } from '../storage/index.js'

const confirm = process.argv.includes('--confirm')
const roots = [UPLOADS_DIR, LEGACY_UPLOADS_DIR].map(p => path.resolve(p))
const inside = file => roots.some(root => file === root || file.startsWith(root + path.sep))

try {
  const exists = await q(`select to_regclass('public.challenge_media') name`)
  if (!exists.rows[0]?.name) {
    console.log('challenge_media não existe; nenhuma mídia de desafio para remover.')
    process.exitCode = 0
  } else {
    const rows = (await q('select file from challenge_media order by file')).rows
    const targets = []
    for (const row of rows) {
      const name = path.basename(String(row.file || ''))
      if (!/^[a-f0-9]{24}\.(png|jpg|webp|mp4|webm)$/i.test(name)) continue
      for (const root of roots) {
        const file = path.resolve(root, name)
        if (inside(file) && fs.existsSync(file)) targets.push(file)
      }
    }
    console.log(`${rows.length} registro(s); ${targets.length} arquivo(s) físico(s) encontrado(s).`)
    if (!confirm) {
      for (const file of targets) console.log('DRY-RUN', file)
      console.log('Nada foi removido. Use --confirm somente depois de validar o backup.')
    } else {
      for (const file of targets) fs.rmSync(file, { force: true })
      console.log(`${targets.length} arquivo(s) de desafios removido(s).`)
    }
  }
} finally {
  await pool.end()
}
