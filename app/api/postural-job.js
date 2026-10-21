// Avaliação Postural — geração das avaliações recorrentes e varredura de retenção da mídia corporal.
// Mesmo formato dos outros jobs da casa: setInterval(...).unref() disparado do server.js, com chave de
// desligamento no ambiente (POSTURAL_RECURRENCE=off).
// Idempotência por construção, não por sorte: duas travas no banco, independentes entre si.
//   • posture_assessments_ciclo_uq (student_id, protocol_id, cycle_ym) → rodar 4× no mês insere uma vez;
//   • posture_assessments_aberta_uq (student_id) parcial → nunca duas avaliações abertas, venham de onde vierem.
// Por isso o tick pode rodar várias vezes ao dia, reiniciar no meio e nunca duplicar nada.
import { q, transaction } from './db/pool.js'
import { notify } from './pro.js'
import { audit } from './auth.js'
import { storage } from './storage/index.js'

const SEIS_HORAS = 6 * 3600e3
const RETENTION_KEY = 'avaliacao_postural_retencao_dias'

// Uma ocorrência da recorrência. Nunca sobrescreve avaliação anterior: cada ciclo é uma linha nova.
async function gerar(r) {
  return transaction(async c => {
    // trava a recorrência: dois processos (ou dois ticks sobrepostos) não geram o mesmo ciclo
    const lock = (await c.query('select * from posture_recurrences where id=$1 and active for update', [r.id])).rows[0]
    if (!lock) return { pulado: 'inativa' }

    const ym = (await c.query(`select to_char(now(), 'YYYY-MM') ym`)).rows[0].ym
    if (lock.last_generated_ym === ym) return { pulado: 'ja_gerado' }

    const aberta = (await c.query(`select id from posture_assessments where student_id=$1
      and status in ('solicitada','em_andamento','enviada','em_revisao','recaptura_solicitada') limit 1`, [lock.student_id])).rows[0]

    const avancar = async () => c.query(`update posture_recurrences set last_generated_ym=$2,
        next_due_on = ((date_trunc('month', next_due_on::timestamp) + make_interval(months => period_months::int))::date + (day_of_month::int - 1)),
        updated_at = now() where id=$1`, [lock.id, ym])

    // ciclo anterior ainda aberto: não empilha avaliação em cima do aluno, só adia e registra
    if (aberta) {
      await c.query(`insert into posture_events(tenant_id, assessment_id, actor_id, event, data)
        values($1,$2,null,'recorrencia.adiada',$3)`, [lock.tenant_id, aberta.id, JSON.stringify({ recurrence: lock.id, ciclo: ym })])
      await avancar()
      return { pulado: 'ciclo_aberto', assessment_id: aberta.id }
    }

    const versao = (await c.query(`select id from posture_protocol_versions where protocol_id=$1 and status='publicada'
      order by version desc limit 1`, [lock.protocol_id])).rows[0]
    if (!versao) {
      await c.query(`insert into posture_events(tenant_id, actor_id, event, data) values($1,null,'recorrencia.sem_versao',$2)`,
        [lock.tenant_id, JSON.stringify({ recurrence: lock.id, protocol_id: lock.protocol_id })])
      await avancar()
      return { pulado: 'sem_versao_publicada' }
    }

    const a = (await c.query(`insert into posture_assessments(tenant_id, student_id, professional_id, protocol_id, protocol_version_id,
        status, origin, cycle_ym, recurrence_id, due_at, created_by)
      values($1,$2,$3,$4,$5,'solicitada','recorrencia',$6,$7, now() + make_interval(days => $8::int), $3)
      on conflict do nothing returning id`,
      [lock.tenant_id, lock.student_id, lock.professional_id, lock.protocol_id, versao.id, ym, lock.id, lock.due_days])).rows[0]
    await avancar()
    if (!a) return { pulado: 'conflito' }   // outra trava pegou primeiro: idempotência fez o trabalho

    await c.query(`insert into posture_events(tenant_id, assessment_id, actor_id, event, data)
      values($1,$2,null,'avaliacao.solicitada',$3)`, [lock.tenant_id, a.id, JSON.stringify({ origem: 'recorrencia', ciclo: ym })])
    return { criada: a.id, ciclo: ym, student_id: lock.student_id, tenant_id: lock.tenant_id, due_days: lock.due_days }
  })
}

// Retenção da mídia corporal: apaga o objeto e zera a chave, mantendo a linha (histórico e auditoria ficam).
export async function cleanupCaptures(tenantId, limite = 200) {
  const dias = +((await q('select value from app_settings where tenant_id=$1 and key=$2', [tenantId, RETENTION_KEY])).rows[0]?.value) || 730
  const alvo = (await q(`select id, media_key from posture_captures
    where tenant_id=$1 and media_key is not null and created_at < now() - make_interval(days => $2::int)
    order by created_at limit $3`, [tenantId, dias, limite])).rows
  let n = 0
  for (const c of alvo) {
    try {
      await storage().delete('private', c.media_key)
      await q(`update posture_captures set media_key=null, media_mime=null, updated_at=now() where id=$1`, [c.id])
      n++
    } catch (e) { console.error('[postural] retencao', c.id, e.message) }
  }
  if (n) await audit(tenantId, null, 'avaliacao_postural.retencao_aplicada', 'posture_captures', null, { apagados: n, dias })
  return { apagados: n, dias }
}

// Um ciclo completo do job. Exportado para o teste poder rodar sem esperar o intervalo.
export async function tickOnce() {
  const out = { avaliadas: 0, criadas: 0, adiadas: 0, puladas: 0, midia_apagada: 0 }
  const devidas = (await q(`select * from posture_recurrences where active and next_due_on <= current_date order by next_due_on limit 200`)).rows
  for (const r of devidas) {
    out.avaliadas++
    try {
      const res = await gerar(r)
      if (res.criada) {
        out.criadas++
        await notify(res.student_id, 'avaliacao', 'Nova avaliação postural',
          `Chegou a avaliação postural deste mês. Você tem ${res.due_days} dia(s) para enviar.`,
          '/avaliacao', 'postural-solicitada:' + res.criada)
      } else if (res.pulado === 'ciclo_aberto') out.adiadas++
      else out.puladas++
    } catch (e) { out.puladas++; console.error('[postural] recorrencia', r.id, e.message) }
  }
  // retenção por tenant que tenha mídia guardada
  const tenants = (await q(`select distinct tenant_id from posture_captures where media_key is not null`)).rows
  for (const t of tenants) {
    try { out.midia_apagada += (await cleanupCaptures(t.tenant_id)).apagados } catch (e) { console.error('[postural] retencao', e.message) }
  }
  return out
}

export function startPosturalRecurrence() {
  if (process.env.POSTURAL_RECURRENCE === 'off') return
  const run = () => tickOnce()
    .then(o => { if (o.criadas || o.adiadas || o.midia_apagada) console.log('[postural] recorrência:', JSON.stringify(o)) })
    .catch(e => console.error('[postural] job', e.message))
  // 45 s depois do boot para não concorrer com a subida, e 4× ao dia: tolera reinício e fuso
  setTimeout(run, 45e3).unref()
  setInterval(run, SEIS_HORAS).unref()
}
