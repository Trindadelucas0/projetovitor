import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarWeeks, saoPauloDay } from '../stats-calendar.js'
import { welcomeResources } from '../welcome-features.js'
test('fuso usa o dia anterior antes da meia-noite de São Paulo', () => {
  assert.equal(saoPauloDay(new Date('2026-10-19T01:30:00Z')), '2026-10-18')
})
test('semanas vazias e bordas parciais entram no denominador', () => {
  const w = calendarWeeks([{wk:'2026-10-05',n:3,vol:100,secs:30}], 30, '2026-10-05', '2026-10-17')
  assert.equal(w.length,5); assert.equal(w.filter(x=>x.n===0).length,4)
  assert.equal(w[0].wk,'2026-09-14'); assert.equal(w.at(-1).wk,'2026-10-12')
})
test('tudo cobre desde o primeiro treino; vazio mostra semana atual', () => {
  assert.equal(calendarWeeks([],0,'2026-09-28','2026-10-17').length,3)
  assert.deepEqual(calendarWeeks([],0,null,'2026-10-17'),[{wk:'2026-10-12',n:0,vol:0,secs:0}])
})
test('agradecimento respeita plano, verificação e aluno de personal', () => {
  const features={programas_guiados:true,progresso:true,ranking:true,construtor_treino:true,fichas_publicas:true,convidar_alunos:true}
  const scoped=welcomeResources('aluno',features,true)
  assert(!scoped.includes('/programas'));assert(!scoped.includes('/progresso'));assert(!scoped.includes('/ranking'))
  assert(scoped.includes('/estatisticas'))
  assert(!welcomeResources('profissional',features,false,false).includes('/pro/programas'))
  assert(welcomeResources('profissional',features,false,true).includes('/pro/programas'))
  assert(!welcomeResources('aluno',{}).includes('/programas'))
})
