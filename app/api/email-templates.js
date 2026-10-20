// Templates transacionais: somente texto escapado e links construídos pelo servidor.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export function appLink(path = '/perfil') {
  const origin = new URL(process.env.ORIGIN || 'http://localhost:4449')
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('ORIGIN inválida')
  return origin.origin + '/#' + (String(path).startsWith('/') ? path : '/perfil')
}
export function renderEmail({ subject, body, actionUrl, actionLabel = 'Abrir ORNY', preview = false }) {
  const safeUrl = actionUrl && /^https?:\/\//.test(actionUrl) ? actionUrl : null
  const logoUrl = new URL('/brand/orny-wordmark.png', appLink('/')).href
  const text = `${preview ? '[TESTE — dados fictícios]\n\n' : ''}${subject}\n\n${body}${safeUrl ? '\n\n' + actionLabel + ': ' + safeUrl : ''}\n\nORNY · Mensagem automática`
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#000000;color:#edf0f5;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#1e1e1e;border:1px solid #363d49;border-radius:16px"><tr><td style="padding:32px"><div style="background:#000000;padding:12px;border-radius:8px;display:inline-block"><img src="${escape(logoUrl)}" alt="ORNY" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0"></div>${preview ? '<p style="color:#20f51b">TESTE · Dados fictícios · Sem acesso válido</p>' : ''}<h1 style="font-size:25px;line-height:1.3;color:#ffffff;margin:28px 0 20px">${escape(subject)}</h1><p style="font-size:16px;line-height:1.7;color:#e2e6ed">${escape(body).replace(/\n/g, '<br>')}</p>${safeUrl ? `<p style="margin:28px 0"><a href="${escape(safeUrl)}" style="display:inline-block;background:#20f51b;color:#171b12;padding:15px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${escape(actionLabel)}</a></p><p style="font-size:12px;line-height:1.6;color:#bdc5d1;word-break:break-all">Se o botão não abrir, copie este endereço:<br>${escape(safeUrl)}</p>` : ''}<p style="border-top:1px solid #363d49;padding-top:20px;margin-top:28px;font-size:12px;line-height:1.6;color:#bdc5d1">ORNY · Mensagem automática<br>Se você não reconhece esta ação, procure a administração.</p></td></tr></table></td></tr></table></body></html>`
  return { html, text }
}
export const previewModels = [
  ['cadastro', 'Bem-vindo ao ORNY', 'Olá, Lucas!\nSua conta foi criada. Escolha um plano ou ative um benefício válido para começar; pagamentos confirmados liberam o uso automaticamente.', 'Ver planos'],
  ['primeiro_acesso', 'Defina sua senha', 'Olá, Lucas!\nSeu personal criou sua conta. Escolha sua senha pelo link enviado. O link real tem validade de 24 horas e uso único.', 'Definir minha senha'],
  ['recuperacao', 'Redefina sua senha', 'Recebemos uma solicitação para redefinir sua senha. O link real tem validade de 24 horas e uso único. Se não foi você, ignore esta mensagem.', 'Redefinir senha'],
  ['senha_alterada', 'Sua senha foi alterada', 'Sua senha foi alterada e as sessões anteriores foram encerradas. Se não reconhece esta ação, recupere sua conta e procure a administração.', 'Abrir aplicativo'],
  ['liberacao', 'Suspensão removida', 'Olá, Lucas!\nSeu acesso voltou a seguir o plano vigente.', 'Acessar minha conta'],
  ['recusa', 'Fluxo de liberação encerrado', 'O acesso agora depende do plano ou benefício válido, sem pedido de análise.', 'Ver planos'],
  ['bloqueio', 'Conta suspensa', 'A administração suspendeu o acesso da sua conta. Procure o suporte para revisar a situação.', 'Ver minha conta'],
  ['convite', 'Convite de acompanhamento', 'Um profissional convidou você para acompanhamento. Abra o aplicativo para analisar o convite.', 'Ver convite'],
  ['vinculo', 'Vínculo de acompanhamento atualizado', 'A situação do seu acompanhamento foi atualizada. Consulte os detalhes no aplicativo.', 'Ver acompanhamento'],
  ['treino', 'Novo treino disponível', 'Sua ficha foi publicada ou atualizada. Consulte os exercícios e orientações no aplicativo.', 'Ver meus treinos'],
  ['lgpd_export', 'Exportação dos seus dados (LGPD)', 'Olá, Lucas!\nO envio real inclui o arquivo JSON com seus dados pessoais. Esta amostra inclui apenas dados fictícios.', 'Abrir aplicativo']
]
