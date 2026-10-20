import { describe, it, expect } from 'vitest'
import { EXDB, EXIDX, exName } from './exercises.js'
import { setLang } from './i18n.js'
import ptDict from '../locales/pt.js'

describe('Exercise Portuguese Localization', () => {
  it('translates iconic exercises correctly to Brazilian Portuguese', async () => {
    await setLang('pt')

    const barbellBench = EXDB.find(e => e.n === 'barbell bench press')
    expect(exName(barbellBench)).toBe('supino reto com barra')

    const squat = EXDB.find(e => e.n === 'barbell full squat')
    expect(exName(squat)).toBe('agachamento com barra')

    const deadlift = EXDB.find(e => e.n === 'barbell romanian deadlift')
    expect(exName(deadlift)).toBe('levantamento terra romeno (RDL) com barra')

    const bicepCurl = EXDB.find(e => e.n === 'dumbbell alternate biceps curl')
    expect(exName(bicepCurl)).toBe('rosca bíceps alternada com halteres')

    const pushup = EXDB.find(e => e.n === 'push-up')
    expect(exName(pushup)).toBe('flexão de braço tradicional')

    const pullup = EXDB.find(e => e.n === 'pull-up')
    expect(exName(pullup)).toBe('barra fixa pronada (pull-up)')

    const latPulldown = EXDB.find(e => e.n === 'cable pulldown')
    expect(exName(latPulldown)).toBe('puxada alta no cabo')
  })

  it('covers all 1324 exercises in the catalog with translations in pt.js', () => {
    let missingCount = 0
    for (const ex of EXDB) {
      if (!ptDict[ex.n]) {
        missingCount++
      }
    }
    expect(missingCount).toBe(0)
  })

  it('handles string id or object seamlessly with exName', () => {
    const bench = EXDB.find(e => e.n === 'barbell bench press')
    expect(exName(bench.id)).toBe('supino reto com barra')
    expect(exName(bench)).toBe('supino reto com barra')
  })

  it('falls back gracefully to custom exercise name', () => {
    const custom = { id: 'c123', n: 'Meu Exercício Personalizado', bp: 'chest' }
    expect(exName(custom)).toBe('Meu Exercício Personalizado')
    expect(exName('unknown_id_xyz')).toBe('unknown_id_xyz')
    expect(exName(null)).toBe('')
  })
})
