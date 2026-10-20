import crypto from 'node:crypto'
import { q, transaction } from './db/pool.js'
import { enqueueEmail } from './mailer.js'
import { appLink } from './email-templates.js'
export const tokenHash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex')
// Persistente e compartilhado entre processos. Não usa X-Forwarded-For não confiável.
export async function allowPasswordEmail(req, address) {
  return transaction(async () => {
    const checks = [[`ip:${req.socket?.remoteAddress || 'unknown'}`, 20], [`email:${String(address).toLowerCase()}`, 3]]
    for (const [key, maximum] of checks) {
      const r = await q(`insert into email_rate_limits(key_hash) values($1) on conflict(key_hash) do update set
        hits=case when email_rate_limits.window_start<now()-interval '15 minutes' then 1 else email_rate_limits.hits+1 end,
        window_start=case when email_rate_limits.window_start<now()-interval '15 minutes' then now() else email_rate_limits.window_start end returning hits`, [tokenHash(key)])
      if (r.rows[0].hits > maximum) return false
    }
    return true
  })
}
export async function invalidatePasswordLinks(userId) {
  await q('update password_resets set used_at=now() where user_id=$1 and used_at is null', [userId])
  await q(`update email_outbox set expires_at=now(),action_path=null,body='Link invalidado',status=case when status='enviado' then status else 'erro' end,attempts=5 where ref=$1 and kind in ('primeiro_acesso','recuperacao')`, [userId])
}
export async function queuePasswordLink(userId, actorId = null, initial = false) {
  return transaction(async () => {
    const user = (await q(`select id,tenant_id,email,name,disabled_at,status from users where id=$1 for update`, [userId])).rows[0]
    if (!user || user.disabled_at || user.status === 'bloqueado') return null
    await invalidatePasswordLinks(userId)
    const token = crypto.randomBytes(32).toString('base64url')
    const reset = (await q(`insert into password_resets(user_id,token_hash,expires_at,created_by) values($1,$2,now()+interval '24 hours',$3) returning id,expires_at`, [user.id, tokenHash(token), actorId])).rows[0]
    const actionPath = '/redefinir?t=' + token
    await enqueueEmail({ tenantId: user.tenant_id, to: user.email, subject: initial ? 'Defina sua senha' : 'Redefina sua senha',
      body: `Olá, ${user.name}!\n${initial ? 'Seu personal criou sua conta. Escolha sua senha para acessar.' : 'Recebemos uma solicitação para redefinir sua senha.'}\nO link tem validade de 24 horas e uso único. Se você não reconhece esta solicitação, ignore esta mensagem.`,
      kind: initial ? 'primeiro_acesso' : 'recuperacao', ref: user.id, eventKey: 'password-reset:' + reset.id, actionPath,
      actionLabel: initial ? 'Definir minha senha' : 'Redefinir senha', expiresAt: reset.expires_at })
    await q('insert into audit_log(tenant_id,actor_id,action,entity,entity_id) values($1,$2,$3,$4,$5)', [user.tenant_id, actorId || user.id, initial ? 'senha.primeiro_acesso_enfileirado' : 'senha.recuperacao_pedida', 'user', String(user.id)])
    return { link: appLink(actionPath), expires_hours: 24, email_queued: true }
  })
}
