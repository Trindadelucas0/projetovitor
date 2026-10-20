// QA BUG-013: copia a midia das pastas antigas (api/uploads e api/private/pro-docs) para o DATA_DIR.
// So copia arquivos REFERENCIADOS no banco configurado (DB_NAME) - assim arquivos deixados por testes nao entram nos dados reais.
// Nunca apaga nada. Padrao: simulacao. Uso: node scripts/migrar-midia-data-dir.mjs [--aplicar] [--lista arquivo.tsv]
import '../env.js'
import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../db/pool.js'
import { UPLOADS_DIR, PRO_DOCS_DIR, LEGACY_UPLOADS_DIR, LEGACY_PRO_DOCS_DIR } from '../storage/index.js'

const APPLY = process.argv.includes('--aplicar'), li = process.argv.indexOf('--lista'), LIST = li > 0 ? process.argv[li + 1] : null
async function referenced(name) {
  const base = name.replace(/\.[^.]+$/, '')
  // procura o nome em todas as colunas de texto/json das tabelas do schema public (somente leitura)
  const cols = (await pool.query(`select table_name t, column_name c from information_schema.columns where table_schema='public' and data_type in ('text','character varying','jsonb','json','ARRAY')`)).rows
  for (const { t, c } of cols) {
    const r = await pool.query(`select 1 from "${t}" where "${c}"::text like $1 limit 1`, ['%' + base + '%']).catch(() => ({ rowCount: 0 }))
    if (r.rowCount) return `${t}.${c}`
  }
  return null
}
const out = [['pasta', 'arquivo', 'bytes', 'modificado', 'referencia', 'acao']]
for (const [from, to] of [[LEGACY_UPLOADS_DIR, UPLOADS_DIR], [LEGACY_PRO_DOCS_DIR, PRO_DOCS_DIR]]) {
  if (!fs.existsSync(from) || path.resolve(from) === path.resolve(to)) continue
  for (const f of fs.readdirSync(from)) {
    const src = path.join(from, f), st = fs.statSync(src); if (!st.isFile()) continue
    const ref = await referenced(f), dst = path.join(to, f)
    let acao = !ref ? 'ignorado (sem referencia no banco)' : fs.existsSync(dst) ? 'ja existe no DATA_DIR' : APPLY ? 'copiado' : 'copiaria'
    if (ref && !fs.existsSync(dst) && APPLY) { fs.mkdirSync(to, { recursive: true }); fs.copyFileSync(src, dst) }
    out.push([path.relative(process.cwd(), from), f, st.size, st.mtime.toISOString(), ref || '', acao])
  }
}
const tsv = out.map(r => r.join('\t')).join('\n') + '\n'
if (LIST) fs.writeFileSync(LIST, tsv); else process.stdout.write(tsv)
const n = k => out.filter(r => r[5].startsWith(k)).length
console.error(`banco=${process.env.DB_NAME || 'avagym'} ${APPLY ? 'APLICADO' : 'SIMULACAO'}: copiar=${n('cop')} ja_existe=${n('ja')} ignorados=${n('ignorado')} (nada foi apagado)`)
await pool.end()
