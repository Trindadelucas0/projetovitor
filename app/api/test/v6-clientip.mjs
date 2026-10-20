// BUG-044: IP real. cf-connecting-ip so vale vindo do gateway local (loopback); X-Forwarded-For do cliente e ignorado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientIp } from '../clientip.js'
process.env.GATEWAY_NO_LISTEN = '1'
const { proxyHeaders } = await import('../../web/gateway.mjs')
const R = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers })
test('API: cf-connecting-ip vindo do gateway local e aceito', () => {
  assert.equal(clientIp(R('127.0.0.1', { 'cf-connecting-ip': '200.1.2.3' })), '200.1.2.3')
  assert.equal(clientIp(R('::ffff:127.0.0.1', { 'cf-connecting-ip': '2804:14c::1' })), '2804:14c::1')
})
test('API: conexao direta de fora ignora cf-connecting-ip / x-real-ip / x-forwarded-for', () => {
  assert.equal(clientIp(R('::ffff:45.6.7.8', { 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' })), '45.6.7.8')
})
test('API: X-Forwarded-For nunca e usado, nem do gateway local', () => {
  assert.equal(clientIp(R('127.0.0.1', { 'x-forwarded-for': '9.9.9.9' })), '127.0.0.1')
})
test('API: valor invalido no cabecalho e descartado', () => {
  assert.equal(clientIp(R('127.0.0.1', { 'cf-connecting-ip': 'x; drop table' })), '127.0.0.1')
})
test('API: TRUST_PROXY=off ignora cabecalhos', () => {
  process.env.TRUST_PROXY = 'off'; try { assert.equal(clientIp(R('127.0.0.1', { 'cf-connecting-ip': '200.1.2.3' })), '127.0.0.1') } finally { delete process.env.TRUST_PROXY }
})
test('gateway: cloudflared local -> repassa o cf-connecting-ip e descarta XFF do cliente', () => {
  const h = proxyHeaders(R('127.0.0.1', { 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '6.6.6.6', host: 'x' }))
  assert.equal(h['cf-connecting-ip'], '200.1.2.3'); assert.equal(h['x-real-ip'], '200.1.2.3'); assert.equal(h['x-forwarded-for'], '200.1.2.3')
})
test('gateway: origem nao-local -> remove cf-connecting-ip forjado', () => {
  const h = proxyHeaders(R('45.6.7.8', { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '6.6.6.6' }))
  assert.equal(h['cf-connecting-ip'], undefined); assert.equal(h['x-real-ip'], '45.6.7.8'); assert.equal(h['x-forwarded-for'], '45.6.7.8')
})
