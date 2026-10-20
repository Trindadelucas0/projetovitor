import assert from 'node:assert/strict'
import { compute, podiumOf, formulaOf, spDay } from '../challenge-score.js'
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ✓ ' + name) }
const C = { id: 'c', type: 'competicao_individual', metric: 'sessoes', goal: null, starts_at: '2026-10-01T03:00:00Z', ends_at: '2026-10-31T02:59:59.999Z', proof: 'nenhuma', tie_break: 'primeiro_a_atingir', rules_version: 2 }
const M = (id, extra = {}) => ({ user_id: id, name: id.toUpperCase(), status: 'ativo', ...extra })
let k = 0; const S = (u, ts, extra = {}) => ({ id: 's' + k++, user_id: u, started_at: ts, ...extra })
t('1 contagem por dia (duas sessões no mesmo dia valem 1)', () => { const r = compute(C, [M('a')], [S('a', '2026-10-02T12:00:00Z'), S('a', '2026-10-02T20:00:00Z')]); assert.equal(r.rows[0].score, 1) })
t('dia de Brasília: 23h30 e 00h30 são dias diferentes', () => { assert.equal(spDay('2026-10-03T02:30:00Z'), '2026-10-02'); assert.equal(spDay('2026-10-03T03:30:00Z'), '2026-10-03') })
t('sessão anulada/invalidada não conta', () => { const r = compute(C, [M('a')], [S('a', '2026-10-02T12:00:00Z', { voided: true }), S('a', '2026-10-03T12:00:00Z', { invalid: true })]); assert.equal(r.rows[0].score, 0) })
t('fora do período não conta (fim inclusivo até 23:59:59)', () => { const r = compute(C, [M('a')], [S('a', '2026-09-30T12:00:00Z'), S('a', '2026-10-31T02:30:00Z'), S('a', '2026-10-31T03:30:00Z')]); assert.equal(r.rows[0].score, 1) })
t('mesma sessão nunca conta duas vezes', () => { const s = S('a', '2026-10-02T12:00:00Z'); const r = compute({ ...C, metric: 'dias_distintos' }, [M('a')], [s, s]); assert.equal(r.rows[0].score, 1) })
t('comprovante obrigatório: só aprovado conta, pendente não', () => { const r = compute({ ...C, proof: 'obrigatoria' }, [M('a')], [S('a', '2026-10-02T12:00:00Z', { proof_status: 'aprovado' }), S('a', '2026-10-03T12:00:00Z', { proof_status: null })]); assert.equal(r.rows[0].score, 1) })
t('consistência proporcional limitada a 100%', () => { const ss = [2, 3, 4, 5].map(d => S('a', `2026-10-0${d}T12:00:00Z`)); assert.equal(compute({ ...C, metric: 'consistencia', planned_sessions: 8 }, [M('a')], ss).rows[0].score, 50); assert.equal(compute({ ...C, metric: 'consistencia', planned_sessions: 2 }, [M('a')], ss).rows[0].score, 100) })
t('semanas com meta cumprida', () => { const ss = ['01', '02', '03', '08', '15', '16', '17'].map(d => S('a', `2026-10-${d}T12:00:00Z`)); assert.equal(compute({ ...C, metric: 'semanas_meta', weekly_goal: 3 }, [M('a')], ss).rows[0].score, 2) })
t('ranking ordena por pontos e desempata por quem atingiu primeiro', () => { const r = compute(C, [M('a'), M('b'), M('c')], [S('a', '2026-10-02T12:00:00Z'), S('b', '2026-10-02T10:00:00Z'), S('c', '2026-10-02T12:00:00Z'), S('c', '2026-10-03T12:00:00Z')]); assert.deepEqual(r.rows.map(x => [x.user_id, x.position]), [['c', 1], ['b', 2], ['a', 3]]) })
t('empate exato divide a posição', () => { const r = compute({ ...C, tie_break: 'mais_dias_distintos' }, [M('a'), M('b')], [S('a', '2026-10-02T12:00:00Z'), S('b', '2026-10-02T13:00:00Z')]); assert.deepEqual(r.rows.map(x => x.position), [1, 1]); assert(r.rows.every(x => x.tied)) })
t('pódio com menos de 3 e sem quem tem zero', () => { const r = compute(C, [M('a'), M('b')], [S('a', '2026-10-02T12:00:00Z')]); assert.equal(podiumOf(r.rows).length, 1) })
t('desclassificado sai da classificação', () => { const r = compute(C, [M('a'), M('b', { status: 'desclassificado' })], [S('b', '2026-10-02T12:00:00Z'), S('b', '2026-10-03T12:00:00Z')]); assert.equal(r.rows.length, 1); assert.equal(r.disqualified.length, 1) })
t('quem saiu não aparece', () => assert.equal(compute(C, [M('a', { status: 'saiu' })], []).rows.length, 0))
t('privacidade: sem nome e foto quando optou', () => { const r = compute(C, [M('a', { optout: true, photo: 'x' })], []); assert.equal(r.rows[0].name, 'Participante'); assert.equal(r.rows[0].photo, null) })
t('equipes: média proporcional, contribuições e tamanho mínimo', () => {
  const r = compute({ ...C, type: 'competicao_equipes', team_min: 2 }, [M('a', { team_id: 'T1' }), M('b', { team_id: 'T1' }), M('c', { team_id: 'T2' }), M('d', { team_id: 'T3' }), M('e', { team_id: 'T3' }), M('f', { team_id: 'T3' })],
    [S('a', '2026-10-02T12:00:00Z'), S('a', '2026-10-03T12:00:00Z'), S('c', '2026-10-02T12:00:00Z'), S('c', '2026-10-03T12:00:00Z'), S('c', '2026-10-04T12:00:00Z'), S('d', '2026-10-02T12:00:00Z'), S('e', '2026-10-02T12:00:00Z'), S('f', '2026-10-02T12:00:00Z')], [{ id: 'T1', name: 'Um' }, { id: 'T2', name: 'Dois' }, { id: 'T3', name: 'Três' }])
  assert.equal(r.mode, 'equipes'); const t1 = r.teams.find(x => x.team_id === 'T1'), t2 = r.teams.find(x => x.team_id === 'T2'), t3 = r.teams.find(x => x.team_id === 'T3')
  assert.equal(t1.score, 1); assert.equal(t3.score, 1); assert(!t2.eligible && t2.position === null); assert.equal(t1.contributions[0].share, 100)
  assert.equal(r.teams.filter(x => x.position).length, 2)
})
t('coletivo: painel de progresso, sem pódio', () => { const r = compute({ ...C, type: 'meta_coletiva', metric: 'soma_coletiva', goal: 4 }, [M('a'), M('b')], [S('a', '2026-10-02T12:00:00Z'), S('b', '2026-10-02T12:00:00Z'), S('b', '2026-10-03T12:00:00Z')]); assert.equal(r.mode, 'coletivo'); assert.equal(r.collective.total, 3); assert.equal(r.collective.pct, 75) })
t('fórmula real do desafio (sem 100 pontos fixos)', () => { const f = formulaOf({ ...C, metric: 'consistencia', planned_sessions: 12, proof: 'obrigatoria' }); assert(/12 sessões previstas/.test(f) && /comprovante aprovado/.test(f) && !/100 pontos/.test(f)) })
t('guarda versão das regras e período', () => { const r = compute(C, [], []); assert.equal(r.rules_version, 2); assert.equal(r.period.start, C.starts_at) })
console.log(`desafios (pontuação): ${n} testes passaram`)
