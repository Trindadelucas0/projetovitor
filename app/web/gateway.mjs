// AVAGYM gateway (producao): serve o frontend (dist) + midia /img /gif e faz proxy de /api -> API.
// Versionado no repo (BUG-020). Na VPS roda via PM2 (avagym-web) atras do Cloudflare Tunnel.
// Cabecalhos de seguranca em TODA resposta servida aqui (HTML, estaticos, midia): CSP com
// frame-ancestors 'none', nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP e HSTS.
// HTTP -> HTTPS (BUG-022): se o Cloudflare informar X-Forwarded-Proto: http, redireciona 301.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const PORT = +(process.env.PORT || 5551), API = +(process.env.API_PORT || 3449)
const DIST = path.resolve(process.env.DIST_DIR || '/opt/avagym/app/frontend/dist')
const MEDIA = path.resolve(process.env.MEDIA_DIR || '/opt/avagym-runtime/media')
const FORCE_HTTPS = process.env.FORCE_HTTPS !== '0'
export const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:", "media-src 'self' blob: https:", "font-src 'self' data:",
  "connect-src 'self' https://www.gstatic.com https://cdn.jsdelivr.net", "worker-src 'self' blob:", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ')
// BUG-044: so o cloudflared local (loopback) pode informar cf-connecting-ip (o Cloudflare sobrescreve esse cabecalho na
// borda). X-Forwarded-For do cliente e descartado; a API recebe x-real-ip/x-forwarded-for limpos, escritos aqui.
const LOOP = /^(127\.|::1$|::ffff:127\.)/
export function proxyHeaders(req) {
  const sock = String(req.socket?.remoteAddress || '')
  const cf = String(req.headers['cf-connecting-ip'] || '').trim()
  const trusted = LOOP.test(sock) && /^[0-9a-fA-F:.]{2,45}$/.test(cf) ? cf : ''
  const ip = trusted || sock.replace(/^::ffff:/, '')
  const h = { ...req.headers }
  delete h['x-forwarded-for']; delete h['cf-connecting-ip']; delete h['x-real-ip']
  if (trusted) h['cf-connecting-ip'] = trusted
  return { ...h, 'x-real-ip': ip, 'x-forwarded-for': ip, 'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http' }
}
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' }
// Range: o Safari do iOS so toca <video> quando o servidor responde 206 a um pedido de faixa.
// Formato aceito: "bytes=inicio-fim", "bytes=inicio-" e "bytes=-ultimosN".
function range(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (!m || (!m[1] && !m[2])) return null
  let start, end
  if (m[1]) { start = Number(m[1]); end = m[2] ? Number(m[2]) : size - 1 }
  else { start = size - Number(m[2]); end = size - 1 }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return null
  if (end > size - 1) end = size - 1
  if (start > end) return 'invalid'
  return { start, end }
}
function send(req, res, file, cc) {
  fs.stat(file, (e, s) => {
    if (e || !s.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found') }
    const type = T[path.extname(file).toLowerCase()] || 'application/octet-stream'
    const r = req.headers.range ? range(req.headers.range, s.size) : null
    if (r === 'invalid') { res.writeHead(416, { 'Content-Range': `bytes */${s.size}`, 'Accept-Ranges': 'bytes' }); return res.end() }
    if (r) {
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': r.end - r.start + 1, 'Content-Range': `bytes ${r.start}-${r.end}/${s.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': cc })
      if (req.method === 'HEAD') return res.end()
      return fs.createReadStream(file, { start: r.start, end: r.end }).pipe(res)
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': s.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cc })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  })
}
function safe(root, p) { const f = path.join(root, path.normalize(p).replace(/^(\.\.[\/\\])+/, '')); return (f === root || f.startsWith(root + path.sep)) ? f : null }
export function handler(req, res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
  const host = String(req.headers.host || '')
  if (FORCE_HTTPS && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'http' && host && !/^(localhost|127\.)/.test(host)) {
    res.writeHead(301, { Location: 'https://' + host + req.url }); return res.end()
  }
  let u; try { u = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.writeHead(400); return res.end() }
  if (u.startsWith('/api/') || u === '/api') {
    const h = proxyHeaders(req)
    const p = http.request({ host: '127.0.0.1', port: API, path: req.url, method: req.method, headers: h }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
    p.setTimeout(60000, () => p.destroy()); p.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('bad gateway') })
    return req.pipe(p)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end() }
  if (/^\/(img|gif)\//.test(u)) { const f = safe(MEDIA, u); return f ? send(req, res, f, 'public, max-age=2592000, immutable') : (res.writeHead(404), res.end()) }
  if (u.startsWith('/assets/')) { const f = safe(DIST, u); return f ? send(req, res, f, 'public, max-age=31536000, immutable') : (res.writeHead(404), res.end()) }
  const f = safe(DIST, u)
  if (f && u !== '/' && fs.existsSync(f) && fs.statSync(f).isFile()) {
    // midia estatica de marca/landing: sem hash no nome, mas troca raramente. Com 'no-cache'
    // o video e as fotos do hero eram rebaixados a cada visita.
    const cc = /^\/(sw\.js|version\.json|manifest\.json|index\.html)$/.test(u) ? 'no-cache, no-store, must-revalidate'
      : /^\/(video|landing|brand)\//.test(u) ? 'public, max-age=2592000'
        : 'no-cache'
    return send(req, res, f, cc)
  }
  send(req, res, path.join(DIST, 'index.html'), 'no-cache, no-store, must-revalidate')
}
if (process.env.GATEWAY_NO_LISTEN !== '1') http.createServer(handler).listen(PORT, process.env.BIND || '127.0.0.1', () => console.log('avagym gateway :' + PORT + ' -> api :' + API))
