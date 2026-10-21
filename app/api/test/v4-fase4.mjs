// V4 · Fase 4 — equipamentos: compatível só com todos os obrigatórios; "não sei" não conta; sem compatível → resposta explícita.
import { call, get, post, login, signup, check, summary, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
import { hasEquipment } from '../guided.js'
const adm = await login('admin.e2e\u0040avadesk.local')
check(hasEquipment(['halter'], { equipment_answered: true, equipamentos: ['halter'] }), 'obrigatório possuído → compatível')
check(!hasEquipment(['halter', 'banco'], { equipment_answered: true, equipamentos: ['halter'] }), 'falta um obrigatório → incompatível')
check(!hasEquipment(['halter'], { equipment_answered: true, equipment_unknown: true, equipamentos: [] }), '"Não sei identificar" não marca compatível')
check(hasEquipment(['elastico'], { equipment_answered: true, equipamentos: ['mini_band'] }), 'qualquer tipo de elástico atende "elástico" genérico')
check(!hasEquipment(['mini_band'], { equipment_answered: true, equipamentos: ['faixa_elastica'] }), 'tipo específico de elástico não é trocado por outro')
check(hasEquipment(['peso_corporal'], { equipment_answered: true, equipamentos: [] }), 'peso corporal sempre disponível')
check(hasEquipment(['maquina'], { local: 'gym' }), 'perfil antigo sem resposta continua como antes')
const s = await signup(adm, 'v4f4aluno')
let r = await post(s.tok, '/api/guided/onboarding', { objetivo: 'hypertrophy', local: 'home', restricoes: [], equipamentos: ['halter'] })
check(r.s === 200 && r.d.profile.nivel === null && r.d.profile.equipamentos.join() === 'halter', 'perfil parcial (sem nível/dias/minutos) com equipamentos')
r = await get(s.tok, '/api/guided/recommendations')
const all = (await get(s.tok, '/api/guided/programs')).d.programs
const ok = r.d.recommendations.every(p => p.is_rehab || (p.req_equipment || []).every(e => ['halter', 'peso_corporal'].includes(e)))
check(r.s === 200 && ok, 'recomendações só com programas cujos obrigatórios o aluno tem')
r = await call(s.tok, 'PUT', '/api/guided/equipment', { ids: ['xyz'] })
check(r.s === 400, 'equipamento desconhecido recusado')
r = await post(s.tok, '/api/guided/onboarding', { objetivo: 'strength', local: 'home', nivel: 'beginner', restricoes: [], equipamentos: [], equipamento_nao_sei: true })
r = await get(s.tok, '/api/guided/recommendations')
check(r.s === 200 && (r.d.no_compatible ? r.d.notes.length > 0 : r.d.recommendations.every(p => p.is_rehab || (p.req_equipment || []).every(e => e === 'peso_corporal'))), 'sem equipamento e "não sei": só sem equipamento ou resposta explícita de nenhum compatível')
r = await get(s.tok, '/api/guided/equipment')
check(r.s === 200 && r.d.equipment.some(e => e.id === 'mini_band' && e.parent_id === 'elastico') && r.d.equipment.some(e => e.id === 'elastico'), 'catálogo com tipos de elástico, sem remover "elástico"')
check((await q(`select count(*)::int n from program_equipment`)).rows[0].n > 0 && all.some(p => (p.req_equipment || []).length), 'programas com equipamentos obrigatórios (backfill)')
await pool.end(); process.exit(summary() ? 1 : 0)
