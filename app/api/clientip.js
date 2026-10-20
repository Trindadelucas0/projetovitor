// BUG-044: IP real do cliente. Em producao o trafego entra pelo Cloudflare Tunnel (cloudflared, local) -> gateway
// app/web/gateway.mjs (local) -> API. O Cloudflare SOBRESCREVE cf-connecting-ip na borda, entao ele so e confiavel
// quando a requisicao chega pelo gateway local (socket em loopback). X-Forwarded-For e sempre ignorado (o cliente
// escreve o que quiser). Conexao direta de fora (nao-loopback): vale so o endereco do socket.
// TRUST_PROXY=off ignora qualquer cabecalho.
const LOCAL = /^(127\.|::1$|::ffff:127\.)/
const valid = s => /^[0-9a-fA-F:.]{2,45}$/.test(s)
export const isLoopback = s => LOCAL.test(String(s || ''))
export function clientIp(req) {
  const sock = String(req.socket?.remoteAddress || '')
  if (process.env.TRUST_PROXY !== 'off' && isLoopback(sock)) {
    for (const k of ['cf-connecting-ip', 'x-real-ip']) { const v = String(req.headers?.[k] || '').trim(); if (valid(v)) return v }
  }
  return sock.replace(/^::ffff:/, '').slice(0, 64)
}
