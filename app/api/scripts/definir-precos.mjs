// Define preco e venda dos planos pagos com as MESMAS regras e a MESMA auditoria do painel admin
// (POST /api/adm/billing/plans -> audit 'plano.editado'). Usado em 16/10/2026 a pedido do Lucas:
// Os precos oficiais do beta sao Individual R$ 12,90/mes e PRO R$ 49,90/mes.
// Este script continua sendo uma ferramenta administrativa e, ao aplicar,
// abre a venda. A migration 060 apenas define os valores e mantem sellable=false
// ate a homologacao controlada do Asaas.
// Uso: node scripts/definir-precos.mjs individual=1290 pro=4990            (simulacao: so mostra)
//      node scripts/definir-precos.mjs individual=1290 pro=4990 --apply --confirm PRECOS --backup-ok
import '../env.js'
import { q, pool } from '../db/pool.js'
import { audit } from '../auth.js'

const args = process.argv.slice(2), apply = args.includes('--apply')
const want = args.filter(a => /^[a-z_]+=\d+$/.test(a)).map(a => { const [id, c] = a.split('='); return [id, +c] })
if (!want.length) { console.error('informe plano=centavos'); process.exit(2) }
if (apply && !(args.includes('--backup-ok') && args[args.indexOf('--confirm') + 1] === 'PRECOS')) { console.error('--apply exige --confirm PRECOS --backup-ok (faca o pg_dump antes)'); process.exit(2) }
const actor = (await q(`select id, tenant_id, email from users where lower(email)=lower($1) limit 1`, [process.env.ACTOR_EMAIL || 'admin@avagym.com.br'])).rows[0]
if (!actor) { console.error('admin nao encontrado'); process.exit(2) }
for (const [id, cents] of want) {
  const cur = (await q('select id, name, is_free, price_cents, sellable, trial_days, active from plans where id=$1', [id])).rows[0]
  if (!cur || cur.is_free) { console.error(id + ': plano pago inexistente'); process.exit(2) }
  if (!(cents > 0 && cents <= 10000000)) { console.error(id + ': preco invalido'); process.exit(2) }
  console.log(`${id}: ${cur.price_cents ?? 'sem preco'} / venda=${cur.sellable} -> ${cents} / venda=true`)
  if (!apply) continue
  await q(`update plans set price_cents=$2, price_status='definido', sellable=true, updated_at=now() where id=$1`, [id, cents])
  await audit(actor.tenant_id, actor.id, 'plano.editado', 'plan', id, { price: cents, trial: cur.trial_days, sellable: true, antes: { price: cur.price_cents, sellable: cur.sellable }, via: 'script definir-precos (pedido do Lucas)' })
}
const s = (await q(`select value from app_settings where key='monetizacao_ativa'`).catch(() => ({ rows: [] }))).rows[0]
console.log(apply ? 'aplicado' : 'simulacao (nada gravado)', '| monetizacao_ativa=', s ? JSON.stringify(s.value) : 'false')
await pool.end()
