// Ficha do personal: dia da semana por treino e vídeo por exercício.
// Só o formato da ficha (sem banco): node --test test/ficha-dias-video.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyWeekdaySchedule, normDays, shapeProblems, videoKind } from '../workout-schema.js'

const ex = (over = {}) => ({ exercise_id: 'supino', name: 'Supino', sets: 3, reps: '10-12', rest_sec: 60, ...over })

test('orientação da próxima vez fica no treino certo e é limitada no servidor', () => {
  const days = normDays([
    { name: 'Treino A', next_time_guidance: '  Repita a carga.  ', exercises: [ex()] },
    { name: 'Treino B', next_time_guidance: 'A'.repeat(1600), exercises: [ex()] },
    { name: 'Treino C', exercises: [ex()] },
  ])
  assert.equal(days[0].next_time_guidance, 'Repita a carga.')
  assert.equal(days[1].next_time_guidance.length, 1500)
  assert.equal(days[2].next_time_guidance, null)
})

test('dia da semana: aceita 0 a 6 e trata vazio como Livre', () => {
  const d = normDays([
    { name: 'A', weekday: 1, exercises: [ex()] },
    { name: 'B', weekday: '', exercises: [ex()] },
    { name: 'C', exercises: [ex()] },
    { name: 'D', weekday: 6, exercises: [ex()] },
  ])
  assert.equal(d[0].weekday, 1)
  assert.equal(d[1].weekday, null)
  assert.equal(d[2].weekday, null)
  assert.equal(d[3].weekday, 6)
})

test('dia da semana fora da faixa é trazido para dentro, nunca gera dia inválido', () => {
  const d = normDays([{ name: 'A', weekday: 99, exercises: [ex()] }, { name: 'B', weekday: -5, exercises: [ex()] }])
  assert.equal(d[0].weekday, 6)
  assert.equal(d[1].weekday, 0)
})

test('dois treinos na mesma segunda-feira são recusados, com os nomes no aviso', () => {
  const p = shapeProblems(normDays([
    { name: 'Treino A', weekday: 1, exercises: [ex()] },
    { name: 'Treino B', weekday: 1, exercises: [ex()] },
  ]))
  const msg = p.find(x => x.includes('Segunda'))
  assert.ok(msg, 'esperava aviso de conflito de dia da semana')
  assert.ok(msg.includes('Treino A') && msg.includes('Treino B'))
})

test('vários dias Livre não entram em conflito', () => {
  const p = shapeProblems(normDays([
    { name: 'A', exercises: [ex()] },
    { name: 'B', exercises: [ex()] },
    { name: 'C', weekday: 3, exercises: [ex()] },
  ]))
  assert.deepEqual(p, [])
})

test('aluno troca somente a agenda e preserva os exercícios da ficha', () => {
  const original = normDays([{ name: 'Treino A', weekday: 1, exercises: [ex()] }, { name: 'Treino B', weekday: 3, exercises: [ex({ name: 'Remada' })] }])
  const r = applyWeekdaySchedule(original, [{ day_index: 0, weekday: 5 }, { day_index: 1, weekday: null }])
  assert.equal(r.error, undefined)
  assert.deepEqual(r.days.map(d => d.weekday), [5, null])
  assert.deepEqual(r.days.map(d => d.exercises), original.map(d => d.exercises))
})

test('agenda do aluno recusa dia repetido e payload incompleto', () => {
  const original = normDays([{ name: 'Treino A', exercises: [ex()] }, { name: 'Treino B', exercises: [ex()] }])
  assert.match(applyWeekdaySchedule(original, [{ day_index: 0, weekday: 2 }, { day_index: 1, weekday: 2 }]).error, /Terça.*Treino A.*Treino B/)
  assert.match(applyWeekdaySchedule(original, [{ day_index: 0, weekday: 2 }]).error, /agenda completa/i)
})

test('vídeo: reconhece YouTube, arquivo enviado e endereço externo', () => {
  assert.equal(videoKind('https://youtu.be/dQw4w9WgXcQ'), 'youtube')
  assert.equal(videoKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube')
  assert.equal(videoKind('https://m.youtube.com/watch?t=5&v=dQw4w9WgXcQ'), 'youtube')
  assert.equal(videoKind('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'youtube')
  assert.equal(videoKind('/api/media?f=abc123.mp4'), 'arquivo')
  assert.equal(videoKind('https://www.instagram.com/reel/Cabc123/'), 'externo')
})

test('vídeo: recusa http, canal do YouTube e texto solto', () => {
  assert.equal(videoKind('http://youtu.be/dQw4w9WgXcQ'), null)
  assert.equal(videoKind('https://www.youtube.com/channel/UCabc'), null)
  assert.equal(videoKind('https://www.youtube.com/playlist?list=PLabc'), null)
  assert.equal(videoKind('qualquer texto'), null)
  assert.equal(videoKind(''), null)
})

test('exercício com vídeo inválido não passa pela validação da ficha', () => {
  const ok = shapeProblems(normDays([{ name: 'A', exercises: [ex({ video_url: 'https://youtu.be/dQw4w9WgXcQ' })] }]))
  assert.deepEqual(ok, [])
  const bad = shapeProblems(normDays([{ name: 'A', exercises: [ex({ video_url: 'https://www.youtube.com/channel/UCabc' })] }]))
  assert.ok(bad.some(x => x.includes('vídeo')), 'esperava aviso sobre o vídeo')
})

test('exercício sem vídeo continua válido: o vídeo é opcional', () => {
  const d = normDays([{ name: 'A', exercises: [ex()] }])
  assert.equal(d[0].exercises[0].video_url, null)
  assert.deepEqual(shapeProblems(d), [])
})

test('aquecimento geral e por exercício são normalizados e validados separadamente', () => {
  const d = normDays([{ name: 'A', warmup_items: [{ id: 'bike', activity: 'bicicleta', duration_sec: 480, instructions: 'Leve' }], exercises: [ex({ warmup_sets: [{ id: 'w1', reps: '10', load_mode: 'percent', load_value: 50, rest_sec: 45 }] })] }])
  assert.equal(d[0].warmup_items[0].duration_sec, 480)
  assert.equal(d[0].exercises[0].warmup_sets[0].load_value, 50)
  assert.deepEqual(shapeProblems(d), [])
})

test('aquecimentos inválidos não passam e ficha antiga continua compatível', () => {
  const legacy = normDays([{ name: 'A', exercises: [ex()] }])
  assert.deepEqual(legacy[0].warmup_items, [])
  assert.deepEqual(legacy[0].exercises[0].warmup_sets, [])
  const bad = normDays([{ name: 'A', warmup_items: [{ activity: 'personalizado', duration_sec: 10 }], exercises: [ex({ warmup_sets: [{ reps: '', duration_sec: '', load_mode: 'percent', load_value: 150, rest_sec: 700 }] })] }])
  const p = shapeProblems(bad)
  assert.ok(p.some(x => x.includes('nome da atividade')))
  assert.ok(p.some(x => x.includes('duração entre 30')))
  assert.ok(p.some(x => x.includes('percentual entre 0 e 100')))
})
