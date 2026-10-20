import { q } from './db/pool.js'
import { appLink, renderEmail } from './email-templates.js'
export const mailConfigured = () => process.env.EMAIL_PROVIDER === 'resend'
  ? !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
  : !!(process.env.SMTP_HOST && process.env.SMTP_FROM)
export async function enqueueEmail({ tenantId = null, to, cc = null, subject, body, attachment = null, kind = 'geral', ref = null, eventKey = null, actionPath = null, actionLabel = null, expiresAt = null }) {
  return (await q(`insert into email_outbox(tenant_id,to_email,cc_email,subject,body,attachment_name,attachment_type,attachment,kind,ref,event_key,action_path,action_label,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(event_key) do update set event_key=excluded.event_key returning id,status`,
    [tenantId, to, cc, subject, body, attachment?.name || null, attachment?.type || null, attachment?.content || null, kind, ref, eventKey, actionPath, actionLabel, expiresAt])).rows[0]
}
export async function sendResend(message, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `avagym-outbox-${message.id}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to: [message.to_email], ...(message.cc_email ? { cc: message.cc_email.split(',').map(x => x.trim()).filter(Boolean) } : {}),
      subject: message.subject, ...renderEmail({ subject: message.subject, body: message.body, preview: !!message.preview, actionUrl: message.preview ? 'https://example.invalid/avagym-amostra' : message.action_path ? appLink(message.action_path) : null, actionLabel: message.action_label || 'Abrir AVAGYM' }),
      ...(message.attachment ? { attachments: [{ filename: message.attachment_name, content: Buffer.from(message.attachment).toString('base64'), content_type: message.attachment_type || 'application/json' }] } : {}) })
  })
  if (!r.ok) { const e = new Error(`Resend HTTP ${r.status}`); e.status = r.status; e.retryAfter = Math.min(3600, Math.max(1, Number(r.headers.get('retry-after')) || 60)); throw e }
  const data = await r.json()
  if (!data.id) throw new Error('Resend: resposta sem identificador')
  return data.id
}
let busy = false
export async function processOutbox(limit = 10, { query = q, deliver = sendResend, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (busy || !mailConfigured()) return { sent: 0, pending: true }
  busy = true
  let sent = 0
  try {
    // Só recupera leases recentes automaticamente: idempotência do provedor tem janela finita.
    await query(`update email_outbox set status='erro', attempts=5, last_error='Revisão manual: resultado de envio antigo desconhecido' where status='enviando' and coalesce(locked_at,created_at)<now()-interval '23 hours'`)
    await query(`update email_outbox set status='erro', next_attempt_at=now() where status='enviando' and locked_at<now()-interval '5 minutes'`)
    await query(`update email_outbox set status='erro', attempts=5, last_error='Link expirado ou invalidado', body='Link indisponível', action_path=null where status in ('pendente','erro') and expires_at<=now()`)
    const rows = (await query(`update email_outbox set status='enviando',locked_at=now(),attempts=attempts+1 where id in
      (select id from email_outbox where status in ('pendente','erro') and attempts<5 and next_attempt_at<=now() and (expires_at is null or expires_at>now()) order by id limit $1 for update skip locked) returning *`, [limit])).rows
    for (const m of rows) {
      try {
        // Um link pode ter sido invalidado após o claim.
        if (m.expires_at && !(await query('select 1 from email_outbox where id=$1 and expires_at>now()', [m.id])).rowCount) {
          await query("update email_outbox set status='erro',attempts=5,locked_at=null,last_error='Link expirado ou invalidado' where id=$1",[m.id]); continue
        }
        let providerId
        if (process.env.EMAIL_PROVIDER === 'resend') providerId = await deliver(m)
        else {
          const nm = (await import('nodemailer')).default
          const transport = nm.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined })
          const result = await transport.sendMail({ from: process.env.SMTP_FROM, to: m.to_email, cc: m.cc_email || undefined, subject: m.subject,
            ...renderEmail({ subject: m.subject, body: m.body, actionUrl: m.action_path ? appLink(m.action_path) : null, actionLabel: m.action_label || 'Abrir AVAGYM' }),
            attachments: m.attachment ? [{ filename: m.attachment_name, content: m.attachment, contentType: m.attachment_type }] : undefined })
          providerId = result.messageId
        }
        await query(`update email_outbox set status='enviado',sent_at=now(),last_error=null,provider_id=$2,locked_at=null,body=case when expires_at is not null then 'Link enviado' else body end,action_path=case when expires_at is not null then null else action_path end where id=$1`, [m.id, providerId]); sent++
        if (m.kind === 'lgpd_export') await query(`update data_export_requests set status='enviado' where outbox_id=$1`, [m.id])
      } catch (e) {
        const permanent = e.status && e.status >= 400 && e.status < 500 && ![408,409,429].includes(e.status)
        // Só registra código seguro, nunca conteúdo da requisição ou credenciais.
        await query(`update email_outbox set status='erro',locked_at=null,last_error=$2,attempts=case when $3 then 5 else attempts end,next_attempt_at=now()+($4*interval '1 second') where id=$1`,
          [m.id, e.status ? `Resend HTTP ${e.status}` : 'Falha temporária no envio', !!permanent, e.retryAfter || Math.min(3600, 60 * 2 ** (m.attempts - 1))])
        if (m.kind === 'lgpd_export' && (permanent || m.attempts >= 5)) await query(`update data_export_requests set status='erro' where outbox_id=$1`, [m.id])
      }
      if (process.env.EMAIL_PROVIDER === 'resend') await pause(600)
    }
  } finally { busy = false }
  return { sent }
}
export function startMailer() {
  const run = () => processOutbox().catch(() => console.error('[mailer] Falha ao processar fila'))
  run()
  return setInterval(run, 10000).unref?.()
}
