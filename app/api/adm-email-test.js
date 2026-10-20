// Envio de teste de e-mail pelo admin (BUG-026): confirma que o provedor (Resend) entrega, sem depender de conta do destinatario.
// Somente admin; limite de 10 por hora; o destinatario nao e gravado na auditoria (so no email_outbox, como todo envio).
import { q } from './db/pool.js'
import { enqueueEmail, processOutbox, mailConfigured } from './mailer.js'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export function admEmailTestRoutes({ json, readBody, requireRole }) {
  return {
    'POST /api/adm/email-test': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req), to = String(b?.to || '').trim().toLowerCase()
      if (!EMAIL_RE.test(to) || to.length > 200) return json(res, 400, { error: 'E-mail inválido', errors: { to: 'E-mail inválido' } })
      if (!mailConfigured()) return json(res, 503, { error: 'Envio de e-mail não configurado neste servidor', code: 'EMAIL_OFF' })
      const n = +(await q(`select count(*)::int n from email_outbox where kind='teste_admin' and ref=$1 and created_at > now() - interval '1 hour'`, [String(u.id)])).rows[0].n
      if (n >= 10) return json(res, 429, { error: 'Limite de 10 e-mails de teste por hora', code: 'RATE_LIMITED' })
      const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      const row = await enqueueEmail({ to, kind: 'teste_admin', ref: String(u.id), eventKey: `teste_admin:${u.id}:${Date.now()}`,
        subject: 'ORNY - e-mail de teste',
        body: `Este é um e-mail de TESTE do ORNY, enviado pelo administrador em ${when} (horário de Brasília) para conferir a entrega de e-mails do sistema.\n\nNão é preciso fazer nada. Se você não esperava esta mensagem, pode ignorá-la.` })
      await processOutbox(5).catch(() => {})
      const r = (await q('select status, provider_id, last_error from email_outbox where id=$1', [row.id])).rows[0] || {}
      json(res, 200, { ok: r.status === 'enviado', outbox_id: row.id, status: r.status, provider_id: r.provider_id || null, error: r.last_error || null })
    },
  }
}