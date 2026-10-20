// AVAGYM V5 - interface de armazenamento de mídia: put / get / delete / signedUrl.
// Driver por configuração: STORAGE_DRIVER=local (padrão) | r2 (Cloudflare R2 - ponto de extensão, ainda não implementado).
// Áreas separadas: 'public' (avatares, chave aleatória) e 'private' (ex.: fotos de evolução), servida só com autenticação ou URL assinada.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// QA: avatares (area publica) ficam dentro do DATA_DIR (persistente e no backup), nao mais em api/uploads/pub.
export const LEGACY_PUBLIC_DIR = path.join(HERE, '..', 'uploads', 'pub')
export const PUBLIC_DIR = process.env.STORAGE_LOCAL_PUBLIC_DIR || path.join(process.env.DATA_DIR || path.join(HERE, '..', 'data'), 'public-media')
// migracao unica e idempotente: copia (sem apagar) o que ainda estiver so na pasta antiga
export function migrateLegacyPublic(from = LEGACY_PUBLIC_DIR, to = PUBLIC_DIR) {
  if (path.resolve(from) === path.resolve(to) || !fs.existsSync(from)) return 0
  let n = 0
  for (const rel of fs.readdirSync(from, { recursive: true })) {
    const src = path.join(from, String(rel)); if (!fs.statSync(src).isFile() || !/\.(jpg|png|webp)$/i.test(src)) continue
    const dst = path.join(to, String(rel)); if (fs.existsSync(dst)) continue
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++
  }
  return n
}
try { const n = migrateLegacyPublic(); if (n) console.log('[storage] avatares migrados para DATA_DIR:', n) } catch (e) { console.error('[storage] migracao', e.message) }
// QA BUG-013: TODA midia gravada pela API fica no DATA_DIR (persistente e no backup). As pastas antigas (api/uploads,
// api/private/pro-docs) so sao lidas como fallback; a copia para o DATA_DIR e feita por scripts/migrar-midia-data-dir.mjs.
const DATA_ROOT = process.env.DATA_DIR || path.join(HERE, '..', 'data')
export const UPLOADS_DIR = process.env.STORAGE_LOCAL_UPLOADS_DIR || path.join(DATA_ROOT, 'uploads')
export const PRO_DOCS_DIR = process.env.STORAGE_LOCAL_PRODOCS_DIR || path.join(DATA_ROOT, 'private-docs')
export const LEGACY_UPLOADS_DIR = path.join(HERE, '..', 'uploads')
export const LEGACY_PRO_DOCS_DIR = path.join(HERE, '..', 'private', 'pro-docs')
const locate = (dir, legacy, name) => { const b = path.basename(String(name || '')); const p = path.join(dir, b); if (fs.existsSync(p)) return p; const l = path.join(legacy, b); return fs.existsSync(l) ? l : p }
export const uploadFile = name => locate(UPLOADS_DIR, LEGACY_UPLOADS_DIR, name)
export const proDocFile = name => locate(PRO_DOCS_DIR, LEGACY_PRO_DOCS_DIR, name)
export const PRIVATE_DIR = process.env.STORAGE_LOCAL_PRIVATE_DIR || path.join(process.env.DATA_DIR || path.join(HERE, '..', 'data'), 'private-media')
const AREAS = ['public', 'private']
export const validKey = k => typeof k === 'string' && /^[a-z0-9][a-z0-9_\-/]{0,150}\.(jpg|png|webp)$/i.test(k) && !k.includes('..') && !k.includes('//')
export const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export const mimeOf = key => MIME[String(key).split('.').pop().toLowerCase()] || 'application/octet-stream'

function secret() {
  if (process.env.STORAGE_SIGNING_SECRET) return process.env.STORAGE_SIGNING_SECRET
  // V5: o arquivo DATA_DIR/secret foi para o banco (server_keys); URLs assinadas usam STORAGE_SIGNING_SECRET ou JWT_SECRET (sao curtas)
  return process.env.JWT_SECRET || (secret._eph ||= crypto.randomBytes(32).toString('hex'))   // segurança: nunca um segredo fixo no código
}
export const sign = (area, key, exp) => crypto.createHmac('sha256', secret()).update(area + '|' + key + '|' + exp).digest('hex').slice(0, 32)
export function verifySig(area, key, exp, sig) {
  if (!sig || !exp || !(+exp > Date.now() / 1000)) return false
  const a = Buffer.from(sign(area, key, +exp)), b = Buffer.from(String(sig))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
function check(area, key) { if (!AREAS.includes(area)) throw new Error('área de armazenamento inválida'); if (!validKey(key)) throw new Error('chave de arquivo inválida') }

function localDriver() {
  const file = (area, key) => path.join(area === 'private' ? PRIVATE_DIR : PUBLIC_DIR, ...key.split('/'))
  return {
    name: 'local',
    async put(area, key, buf) { check(area, key); const f = file(area, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f); return { key } },
    async get(area, key) { check(area, key); const f = file(area, key); if (fs.existsSync(f)) return fs.readFileSync(f)
      const old = area === 'public' ? path.join(LEGACY_PUBLIC_DIR, ...key.split('/')) : null   // QA: pasta antiga como reserva durante a migracao
      return old && fs.existsSync(old) ? fs.readFileSync(old) : null },
    async delete(area, key) { check(area, key); fs.rmSync(file(area, key), { force: true }) },
    async signedUrl(area, key, ttlSec = 300) {
      check(area, key)
      if (area === 'public') return '/api/media/pub?k=' + key
      const exp = Math.floor(Date.now() / 1000) + ttlSec
      return '/api/media/private?k=' + encodeURIComponent(key) + '&exp=' + exp + '&sig=' + sign(area, key, exp)
    },
  }
}
function r2Driver() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_PUBLIC', 'R2_BUCKET_PRIVATE'].filter(k => !process.env[k])
  const fail = async () => { throw new Error('Driver R2 ainda não implementado' + (need.length ? ' (faltam: ' + need.join(', ') + ')' : '') + '. Use STORAGE_DRIVER=local.') }
  return { name: 'r2', put: fail, get: fail, delete: fail, signedUrl: fail }
}
let driver = null
export function storage() { if (!driver) driver = (process.env.STORAGE_DRIVER || 'local') === 'r2' ? r2Driver() : localDriver(); return driver }