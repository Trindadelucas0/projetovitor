import assert from 'node:assert/strict'
import { canMove, canMoveMember, wizardProblems, timeStatus, CH_FLOW, spMidnight, spEndOfDay } from '../challenge-rules.js'
const cat = { min_days: 7, max_days: 90 }, now = Date.parse('2026-10-14T15:00:00Z')
const base = { name: 'Outubro ativo', type: 'meta_individual', metric: 'sessoes', goal: 12, starts_at: '2026-10-15T03:00:00Z', ends_at: '2026-11-14T03:00:00Z', audience: 'aberto', proof: 'nenhuma' }
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ✓', name) }
t('fluxo: rascunho→publicado, não pula para concluído', () => { assert(canMove('rascunho', 'publicado')); assert(!canMove('rascunho', 'concluido')); assert(!canMove('concluido', 'em_andamento')) })
t('cancelado e concluído são finais', () => { assert.equal(CH_FLOW.cancelado.length, 0); assert.equal(CH_FLOW.concluido.length, 0) })
t('apuração não volta para andamento', () => assert(!canMove('apurando', 'em_andamento')))
t('inscrição: solicitado→aprovado→ativo; removido é final', () => { assert(canMoveMember('solicitado', 'aprovado')); assert(canMoveMember('aprovado', 'ativo')); assert(!canMoveMember('removido', 'ativo')); assert(!canMoveMember('desclassificado', 'ativo')) })
t('assistente válido', () => assert.deepEqual(wizardProblems(base, cat, now), []))
t('fim antes do início', () => assert(wizardProblems({ ...base, ends_at: '2026-10-14T00:00:00Z' }, cat, now).some(p => /depois do início/.test(p))))
t('duração mínima/máxima por categoria', () => { assert(wizardProblems({ ...base, ends_at: '2026-10-18T03:00:00Z' }, cat, now).some(p => /Duração/.test(p))); assert(wizardProblems({ ...base, ends_at: '2027-03-01T03:00:00Z' }, cat, now).some(p => /Duração/.test(p))) })
t('início no passado', () => assert(wizardProblems({ ...base, starts_at: '2026-10-01T03:00:00Z' }, cat, now).some(p => /passado/.test(p))))
t('comprovação exige mídia', () => assert(wizardProblems({ ...base, proof: 'obrigatoria' }, cat, now).some(p => /foto/.test(p))))
t('equipes exigem 2+ equipes e mínimo', () => assert.equal(wizardProblems({ ...base, type: 'competicao_equipes', goal: null, teams: ['A'] }, cat, now).length, 2))
t('meta coletiva usa soma', () => assert(wizardProblems({ ...base, type: 'meta_coletiva' }, cat, now).length))
t('consistência exige sessões previstas', () => assert(wizardProblems({ ...base, metric: 'consistencia', type: 'competicao_individual' }, cat, now).some(p => /previstas/.test(p))))
t('meta semanal acima de 7 é recusada (sem excesso)', () => assert(wizardProblems({ ...base, metric: 'semanas_meta', weekly_goal: 9 }, cat, now).length))
t('relógio: começa no início e apura no fim', () => { const c = { ...base, status: 'inscricoes_abertas' }; assert.equal(timeStatus(c, Date.parse('2026-10-14T00:00:00Z')), 'inscricoes_abertas'); assert.equal(timeStatus(c, Date.parse('2026-10-20T00:00:00Z')), 'em_andamento'); assert.equal(timeStatus({ ...c, status: 'em_andamento' }, Date.parse('2026-11-20T00:00:00Z')), 'apurando') })
t('suspenso não avança pelo relógio', () => assert.equal(timeStatus({ ...base, status: 'suspenso' }, Date.parse('2026-11-20T00:00:00Z')), 'suspenso'))
t('meia-noite de São Paulo', () => assert.equal(spMidnight('2026-10-15').toISOString(), '2026-10-15T03:00:00.000Z'))
t('fim inclusivo: 23:59:59 de Brasília do dia final', () => { assert.equal(spEndOfDay('2026-11-13').toISOString(), '2026-11-14T02:59:59.999Z'); assert.equal(wizardProblems({ ...base, ends_at: spEndOfDay('2026-11-13').toISOString() }, cat, now).length, 0) })
console.log(`desafios (regras): ${n} testes passaram`)
