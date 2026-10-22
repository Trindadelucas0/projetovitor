// Paridade entre a validação da tela e a do servidor. Os dois módulos são espelhos
// (ver o cabeçalho de workout-validate.js); este teste é o que garante que continuam
// iguais: mesmo corpus, mesmas mensagens, mesma ordem.
//
// O import do módulo da API é por caminho relativo e protegido por existsSync, porque
// num checkout só de `frontend/` (o que o Dockerfile monta) ele não está lá. Nesse caso
// a paridade é pulada e os testes de forma continuam valendo.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { normDays, shapeMessages, problemsOf, weekdayClash, fieldId } from './workout-validate.js'

const apiUrl = new URL('../../../api/workout-schema.js', import.meta.url)
const temApi = fs.existsSync(apiUrl)
const api = temApi ? await import(/* @vite-ignore */ apiUrl.href) : null

const E = (extra = {}) => ({ exercise_id: 'agachamento_livre', name: 'Agachamento livre', sets: 3, reps: '8-12', rest_sec: 90, ...extra })
const D = (exercises, extra = {}) => ({ name: 'Treino A', description: '', weekday: null, exercises, ...extra })

// Cada entrada quebra uma regra isolada (ou nenhuma, no caso válido).
const CORPUS = {
  'ficha válida': [D([E(), E({ exercise_id: 'leg_press_45', name: 'Leg press 45°', reps: '10' })])],
  'sem dias': [],
  'dia vazio': [D([])],
  'séries 0': [D([E({ sets: 0 })])],
  'séries 11': [D([E({ sets: 11 })])],
  'séries texto': [D([E({ sets: 'três' })])],
  'reps texto': [D([E({ reps: '8-x' })])],
  'reps invertidas': [D([E({ reps: '12-8' })])],
  'reps acima de 100': [D([E({ reps: '10-120' })])],
  'sem reps e sem tempo': [D([E({ reps: '' })])],
  'tempo zero': [D([E({ reps: '', duration_sec: 0 })])],
  'tempo acima do limite': [D([E({ reps: '', duration_sec: 5000 })])],
  'descanso negativo': [D([E({ rest_sec: -5 })])],
  'descanso acima de 600': [D([E({ rest_sec: 900 })])],
  'carga acima de 1000': [D([E({ load_kg: 2000 })])],
  'carga texto': [D([E({ load_kg: 'muito' })])],
  'carga com vírgula': [D([E({ load_kg: '42,5' })])],
  'cadência inválida': [D([E({ tempo: 'lento' })])],
  'cadência válida de 4 tempos': [D([E({ tempo: '3-0-1-0' })])],
  'rpe acima de 10': [D([E({ rpe: 14 })])],
  'rpe texto': [D([E({ rpe: 'alto' })])],
  'rir acima de 10': [D([E({ rir: 12 })])],
  'per_set maior que séries': [D([E({ sets: 2, per_set: [{ reps: '10' }, { reps: '8' }, { reps: '6' }] })])],
  'per_set com reps inválida': [D([E({ per_set: [{ reps: 'x' }, { reps: '8' }] })])],
  'per_set com carga inválida': [D([E({ per_set: [{ reps: '10', load_kg: 'abc' }] })])],
  'grupo de 1': [D([E({ group: 1 }), E({ exercise_id: 'b', name: 'B' })])],
  'grupo de 4': [D([E({ group: 1 }), E({ exercise_id: 'b', name: 'B', group: 1 }), E({ exercise_id: 'c', name: 'C', group: 1 }), E({ exercise_id: 'd', name: 'D', group: 1 })])],
  'grupo fora de sequência': [D([E({ group: 1 }), E({ exercise_id: 'b', name: 'B' }), E({ exercise_id: 'c', name: 'C', group: 1 })])],
  'bi-set correto': [D([E({ group: 1, rest_sec: 0 }), E({ exercise_id: 'b', name: 'B', group: 1 })])],
  'vídeo que não é vídeo': [D([E({ video_url: 'https://www.youtube.com/@canal' })])],
  'vídeo do YouTube válido': [D([E({ video_url: 'https://youtu.be/dQw4w9WgXcQ' })])],
  'vídeo enviado': [D([E({ video_url: '/api/media?f=v1.mp4' })])],
  'dois dias no mesmo dia da semana': [D([E()], { name: 'A', weekday: 1 }), D([E()], { name: 'B', weekday: 1 })],
  'dias da semana distintos': [D([E()], { name: 'A', weekday: 1 }), D([E()], { name: 'B', weekday: 3 })],
  'reps legado reps_max': [D([{ exercise_id: 'a', name: 'A', sets: 3, reps_max: 10, rest_sec: 60 }])],
  'reps legado faixa': [D([{ exercise_id: 'a', name: 'A', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 60 }])],
  'exercício sem nome usa o id': [D([E({ name: '' })])],
  'oito dias (o servidor corta no sétimo)': Array.from({ length: 8 }, (_, i) => D([E({ sets: 0 })], { name: 'Dia ' + i })),
  '41 exercícios (o servidor corta no quadragésimo)': [D(Array.from({ length: 41 }, (_, i) => E({ exercise_id: 'e' + i, name: 'Ex ' + i, sets: i === 40 ? 0 : 3 })))],
}

describe('normDays espelha o servidor', () => {
  it.skipIf(!temApi).each(Object.keys(CORPUS))('%s', nome => {
    expect(normDays(CORPUS[nome])).toEqual(api.normDays(CORPUS[nome]))
  })
})

describe('shapeProblems espelha o servidor', () => {
  it.skipIf(!temApi).each(Object.keys(CORPUS))('%s', nome => {
    expect(shapeMessages(CORPUS[nome])).toEqual(api.shapeProblems(api.normDays(CORPUS[nome])))
  })
})

describe('limites de forma', () => {
  it('corta em 7 dias e 40 exercícios, como o servidor', () => {
    expect(normDays(CORPUS['oito dias (o servidor corta no sétimo)'])).toHaveLength(7)
    expect(normDays(CORPUS['41 exercícios (o servidor corta no quadragésimo)'])[0].exercises).toHaveLength(40)
  })
  it('aceita vírgula como separador decimal na carga', () => {
    expect(normDays(CORPUS['carga com vírgula'])[0].exercises[0].load_kg).toBe(42.5)
  })
})

describe('problemas ancorados', () => {
  it('aponta o dia, o exercício e o campo', () => {
    const p = problemsOf({ title: 'Ficha', goal: 'hypertrophy', days: CORPUS['séries 11'] })
    const sets = p.find(x => x.field === 'sets')
    expect(sets).toMatchObject({ step: 'days', dayIndex: 0, exIndex: 0, field: 'sets' })
    expect(sets.id).toBe(fieldId(0, 0, 'sets'))
    expect(sets.message).toContain('séries entre 1 e 10')
  })
  it('aponta a série na variação por série', () => {
    const p = problemsOf({ title: 'Ficha', goal: 'strength', days: CORPUS['per_set com reps inválida'] })
    expect(p.find(x => x.field === 'per_set')).toMatchObject({ setIndex: 0 })
  })
  it('cobra nome, objetivo e aluno ao publicar', () => {
    const p = problemsOf({ title: 'x', goal: '', days: CORPUS['ficha válida'] }, { needStudent: true })
    expect(p.map(x => x.message)).toEqual([
      'Escolha o aluno que vai receber o treino',
      'Dê um nome ao treino',
      'Informe o objetivo',
    ])
    expect(p.every(x => x.step === 'identity')).toBe(true)
  })
  it('não cobra nada de uma ficha completa', () => {
    const p = problemsOf({ title: 'Hipertrofia A/B', goal: 'hypertrophy', days: CORPUS['ficha válida'] }, { needStudent: true, student: 'u1' })
    expect(p).toEqual([])
  })
  it('reclama de dia sem exercícios apontando o dia', () => {
    const p = problemsOf({ title: 'Ficha', goal: 'strength', days: [...CORPUS['ficha válida'], { name: 'Treino B', exercises: [] }] })
    expect(p).toEqual([expect.objectContaining({ dayIndex: 1, field: 'exercises', message: 'Treino B está sem exercícios' })])
  })
})

describe('weekdayClash', () => {
  it('nomeia os dois treinos em conflito', () => {
    expect(weekdayClash([{ name: 'A', weekday: 1 }, { name: 'B', weekday: 1 }]))
      .toBe('Segunda está em dois treinos (A e B). Deixe um deles como Livre.')
  })
  it('deixa passar o dia Livre repetido', () => {
    expect(weekdayClash([{ name: 'A', weekday: null }, { name: 'B', weekday: '' }])).toBe(null)
  })
})
