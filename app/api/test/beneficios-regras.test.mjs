// Regras puras: janelas de cota, Close Friends, slots da agenda (fuso de São Paulo) e mensagem do WhatsApp.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quotaWindow, closeFriendsEnd, cleanRules, DEFAULT_RULES, STUDENT_PLANS, STUDENT_PLAN_IDS } from '../plan-rules.js'
import { spToUtc, spParts, buildSlots, matchesAvailability, whatsappConfirmUrl, cleanAvailability, validZoomUrl } from '../calls-core.js'
import { cleanHandle } from '../comunidade-externa.js'

const D = s => new Date(s)

test('ids dos planos do aluno ficam num lugar só: Básico=individual, premium=completo (sem plano desafio)', () => {
  assert.deepEqual(STUDENT_PLANS, { basico: 'individual', premium: 'completo' })
  assert.deepEqual(STUDENT_PLAN_IDS, ['individual', 'completo'])
  assert.equal(DEFAULT_RULES.desafio, undefined)
})

test('Básico: a cota vale para o mês pago inteiro e não acumula para o próximo ciclo', () => {
  const r = DEFAULT_RULES.individual
  const w = quotaWindow(r, D('2026-10-01T03:00:00Z'), D('2026-11-01T03:00:00Z'), D('2026-10-20T12:00:00Z'))
  assert.equal(w.start.toISOString(), '2026-10-01T03:00:00.000Z')
  assert.equal(w.end.toISOString(), '2026-11-01T03:00:00.000Z')
  assert.equal(quotaWindow(r, D('2026-10-01T03:00:00Z'), D('2026-11-01T03:00:00Z'), D('2026-11-02T00:00:00Z')), null)
})

test('Completo: janelas de 15 dias a partir do início; a última termina no fim dos 90 dias', () => {
  const r = DEFAULT_RULES.completo, s = D('2026-10-01T00:00:00Z'), e = D('2026-12-30T00:00:00Z')   // 90 dias
  const w0 = quotaWindow(r, s, e, D('2026-10-10T00:00:00Z')), w1 = quotaWindow(r, s, e, D('2026-10-16T00:00:00Z'))
  assert.equal(w0.index, 0); assert.equal(w0.end.toISOString(), '2026-10-16T00:00:00.000Z')
  assert.equal(w1.index, 1); assert.equal(w1.start.toISOString(), '2026-10-16T00:00:00.000Z')
  const last = quotaWindow(r, s, e, D('2026-12-29T00:00:00Z'))
  assert.equal(last.index, 5); assert.equal(last.end.toISOString(), e.toISOString())
})

test('Close Friends: Básico 7 dias por ciclo; Completo o período todo', () => {
  const s = D('2026-10-01T00:00:00Z'), e = D('2026-11-01T00:00:00Z')
  assert.equal(closeFriendsEnd(DEFAULT_RULES.individual, s, e).toISOString(), '2026-10-08T00:00:00.000Z')
  assert.equal(closeFriendsEnd(DEFAULT_RULES.completo, s, e).toISOString(), e.toISOString())
  assert.equal(closeFriendsEnd({ ...DEFAULT_RULES.individual, close_friends_dias: 0 }, s, e), null)
})

test('cleanRules limita valores e ignora grupos desconhecidos', () => {
  const r = cleanRules('individual', { calls_por_janela: 999, whatsapp_grupos: ['geral', 'hack'], janela_dias: '' })
  assert.equal(r.calls_por_janela, 50); assert.deepEqual(r.whatsapp_grupos, ['geral']); assert.equal(r.janela_dias, null)
})

test('fuso de São Paulo: 09:00 local = 12:00 UTC', () => {
  assert.equal(spToUtc('2026-10-23', '09:00').toISOString(), '2026-10-23T12:00:00.000Z')
  assert.deepEqual(spParts('2026-10-23T02:30:00Z'), { date: '2026-10-22', time: '23:30', weekday: 4 })
})

test('slots: quebra em 15 min, respeita antecedência de 12h e esconde horário reservado', () => {
  const availability = [{ weekday: 5, start_time: '09:00', end_time: '10:00' }]   // sexta
  const now = D('2026-10-22T12:00:00Z')   // quinta 09:00 SP
  const slots = buildSlots({ availability, now, days: 7, leadHours: 12, booked: ['2026-10-23T12:15:00.000Z'] })
  assert.deepEqual(slots.map(s => s.time), ['09:00', '09:30', '09:45'])
  assert.equal(slots[0].date, '2026-10-23')
  const tooSoon = buildSlots({ availability, now: D('2026-10-23T02:00:00Z'), days: 0, leadHours: 12 })
  assert.equal(tooSoon.length, 0)
  assert.ok(matchesAvailability(availability, '2026-10-23T12:30:00Z'))
  assert.ok(!matchesAvailability(availability, '2026-10-23T12:10:00Z'))
  assert.ok(!matchesAvailability(availability, '2026-10-23T13:00:00Z'))
})

test('disponibilidade inválida é recusada com mensagem em português', () => {
  assert.throws(() => cleanAvailability([{ weekday: 9, start_time: '09:00', end_time: '10:00' }]), /Dia da semana/)
  assert.throws(() => cleanAvailability([{ weekday: 1, start_time: '10:00', end_time: '09:00' }]), /fim precisa/)
  assert.equal(cleanAvailability([{ weekday: 1, start_time: '08:00', end_time: '09:00' }]).length, 1)
})

test('WhatsApp: wa.me com 55 + telefone e mensagem com data, hora de Brasília e Zoom', () => {
  const url = whatsappConfirmUrl({ phone: '11987654321', studentName: 'Ana Souza', startsAt: '2026-10-23T12:30:00Z', zoomUrl: 'https://us02web.zoom.us/j/123' })
  assert.ok(url.startsWith('https://wa.me/5511987654321?text='))
  const msg = decodeURIComponent(url.split('text=')[1])
  assert.match(msg, /Ana!/); assert.match(msg, /23\/10\/2026 às 09:30/); assert.match(msg, /zoom\.us\/j\/123/)
  assert.equal(whatsappConfirmUrl({ phone: '123', startsAt: new Date() }), null)
  assert.ok(validZoomUrl('https://zoom.us/j/1')); assert.ok(!validZoomUrl('http://evil.com'))
})

test('@ do Instagram é normalizado', () => {
  assert.equal(cleanHandle('@Ana.Fit'), 'ana.fit')
  assert.equal(cleanHandle('https://instagram.com/ana_fit/'), 'ana_fit')
  assert.equal(cleanHandle('ana fit'), null)
})
