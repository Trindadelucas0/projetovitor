// SOMENTE LOCAL. Arquiva (não apaga) o lixo que os smoke tests deixam no banco:
// exercícios "Exercício editado <timestamp>" que ficaram ativos na biblioteca, modelos
// "Global v2 <timestamp>" / "Modelo pessoal <timestamp>", e duplicatas exatas de título
// de modelo. Nada que esteja em uso por uma ficha é tocado.
//
// Por que arquivar e não apagar: `exercises.archived_at` e `workout_templates.status`
// já são o soft delete do sistema; as telas e a API filtram por eles, e um exercício
// citado por uma ficha antiga precisa continuar existindo para a ficha abrir.
//
// Uso:
//   node scripts/limpar-dados-de-teste.mjs                      (seco: só lista)
//   node scripts/limpar-dados-de-teste.mjs --confirmar LIMPAR   (arquiva)
//   ... --autor-e2e    amplia o filtro para tudo criado pelas contas *.e2e@<dominio>
import '../env.js'
import { q, pool } from '../db/pool.js'

if (process.env.NODE_ENV === 'production') { console.error('não rode em produção'); process.exit(1) }
const argv = process.argv.slice(2)
const aplicar = argv[argv.indexOf('--confirmar') + 1] === 'LIMPAR'
const autorE2e = argv.includes('--autor-e2e')

// Exercício de teste: criado pela aplicação (o catálogo oficial entra por db/migrate.js
// com tenant_id NULL, então "tenant_id is not null" já o protege inteiro) e com o nome
// que os smoke tests geram. owner_id não serve de filtro: os scripts de limpeza de
// usuários anulam essa coluna para poder apagar a conta e manter o exercício.
const EX_NOME = `(e.name_pt ~ '^Exerc[íi]cio (editado|do admin) [0-9]{13}$' or e.id ~ '^exercicio_do_admin_[0-9]{13}_')`
// Em uso = citado em days (jsonb) de alguma ficha ou de algum modelo, ou na coluna
// legada exercises (achatada) das fichas antigas.
const EM_USO = `(
  exists (select 1 from pro_plans p, jsonb_array_elements(coalesce(p.days,'[]'::jsonb)) d,
                 jsonb_array_elements(coalesce(d->'exercises','[]'::jsonb)) x
          where x->>'exercise_id' = e.id)
  or exists (select 1 from pro_plans p, jsonb_array_elements(coalesce(p.exercises,'[]'::jsonb)) x
             where x->>'exercise_id' = e.id)
  or exists (select 1 from workout_templates t, jsonb_array_elements(coalesce(t.days,'[]'::jsonb)) d,
                    jsonb_array_elements(coalesce(d->'exercises','[]'::jsonb)) x
             where x->>'exercise_id' = e.id)
)`

const e2eIds = autorE2e
  ? (await q(`select id, email from users where lower(email) like '%.e2e@%'`)).rows
  : []
if (autorE2e) console.log(`contas e2e consideradas: ${e2eIds.length ? e2eIds.map(r => r.email).join(', ') : 'nenhuma'}`)
const ids = e2eIds.map(r => r.id)
const porAutor = autorE2e && ids.length

const exSql = `select e.id, e.name_pt, ${EM_USO} em_uso from exercises e
  where e.archived_at is null and e.tenant_id is not null
    and (${EX_NOME}${porAutor ? ' or e.owner_id = any($1)' : ''})
  order by e.name_pt`
const tplSql = `select t.id, t.title, t.scope, t.status,
    (select count(*)::int from pro_plans p where p.template_id = t.id) usos
  from workout_templates t
  where t.status = 'ativo'
    and (t.title ~ '^Global v2 [0-9]{13}$' or t.title ~ '^Modelo pessoal [0-9]{13}$'
         or t.title ~ '^Iniciante Full Body [0-9]{13}$'${porAutor ? ' or t.created_by = any($1) or t.owner_id = any($1)' : ''})
  order by t.title`
// Duplicatas: mesmo tenant + escopo + título. Mantém a mais usada e, no empate, a mais
// antiga; arquiva as outras que ninguém usa.
const dupSql = `with r as (
    select t.id, t.title, t.scope, t.tenant_id,
      (select count(*)::int from pro_plans p where p.template_id = t.id) usos,
      row_number() over (
        partition by t.tenant_id, t.scope, t.title
        order by (select count(*) from pro_plans p where p.template_id = t.id) desc, t.created_at asc, t.id asc
      ) pos,
      count(*) over (partition by t.tenant_id, t.scope, t.title) n
    from workout_templates t where t.status = 'ativo')
  select id, title, scope, usos from r where n > 1 and pos > 1 and usos = 0 order by title`

const args = porAutor ? [ids] : []
const ex = (await q(exSql, args)).rows
const tpl = (await q(tplSql, args)).rows
const dup = (await q(dupSql)).rows

const exOk = ex.filter(r => !r.em_uso), exUso = ex.filter(r => r.em_uso)
const tplOk = tpl.filter(r => !r.usos), tplUso = tpl.filter(r => r.usos)

const lista = (t, rows, f) => {
  console.log(`\n${t}: ${rows.length}`)
  for (const r of rows.slice(0, 40)) console.log('  · ' + f(r))
  if (rows.length > 40) console.log(`  … e outros ${rows.length - 40}`)
}
lista('exercícios de teste a arquivar', exOk, r => `${r.name_pt}  [${r.id}]`)
lista('modelos de teste a arquivar', tplOk, r => `${r.title} (${r.scope})`)
lista('duplicatas de título a arquivar', dup, r => `${r.title} (${r.scope})`)
if (exUso.length) lista('exercícios MANTIDOS porque estão em uso', exUso, r => `${r.name_pt}  [${r.id}]`)
if (tplUso.length) lista('modelos MANTIDOS porque geraram fichas', tplUso, r => `${r.title} — ${r.usos} ficha(s)`)

const total = exOk.length + tplOk.length + dup.length
if (!total) { console.log('\nnada a arquivar.'); await pool.end(); process.exit(0) }
if (!aplicar) {
  console.log(`\n[seco] ${total} registro(s) seriam arquivados. Para aplicar:`)
  console.log('  node scripts/limpar-dados-de-teste.mjs --confirmar LIMPAR' + (autorE2e ? ' --autor-e2e' : ''))
  await pool.end(); process.exit(0)
}

const c = await pool.connect()
try {
  await c.query('begin')
  if (exOk.length) await c.query(`update exercises set archived_at = now() where id = any($1)`, [exOk.map(r => r.id)])
  const arquivar = [...tplOk.map(r => r.id), ...dup.map(r => r.id)]
  if (arquivar.length) await c.query(`update workout_templates set status = 'arquivado', updated_at = now() where id = any($1)`, [arquivar])
  await c.query('commit')
  console.log(`\narquivados: ${exOk.length} exercício(s), ${tplOk.length} modelo(s) de teste, ${dup.length} duplicata(s).`)
} catch (e) {
  await c.query('rollback'); console.error('falhou, nada foi alterado:', e.message); process.exitCode = 1
} finally { c.release(); await pool.end() }
