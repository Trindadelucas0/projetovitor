// Sem --send, apenas gera HTML. Envio de amostras autorizado para o destinatário abaixo.
import '../env.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { previewModels, renderEmail } from '../email-templates.js'
import { sendResend } from '../mailer.js'
import { pool } from '../db/pool.js'
const dir = fileURLToPath(new URL('../../../docs/emails/', import.meta.url))
fs.mkdirSync(dir, { recursive: true })
const results = []
try {
  for (const [kind, subject, body, label] of previewModels) {
    const rendered = renderEmail({ subject, body, actionLabel: label, actionUrl: 'https://example.invalid/avagym-amostra', preview: true })
    fs.writeFileSync(path.join(dir, kind + '.html'), rendered.html)
    if (process.argv.includes('--send')) {
      try {
        const id = await sendResend({ id: 'preview-20261015-' + kind, to_email: 'lucasrodrigues4@live.com', subject: '[TESTE AVAGYM] ' + subject, body,
          action_label: label, preview: true,
          ...(kind === 'lgpd_export' ? { attachment_name: 'amostra-lgpd.json', attachment_type: 'application/json', attachment: JSON.stringify({ teste: true, nome: 'Lucas (amostra)', dados_reais: false }) } : {}) })
        results.push({ kind, accepted: true, provider_id: id }); console.log(kind + ': aceito pelo Resend (' + id + ')')
      } catch (error) { results.push({ kind, accepted: false, error: error.status ? 'HTTP ' + error.status : 'Falha de conexão' }); console.log(kind + ': falha ' + (error.status || 'conexão')) }
      await new Promise(resolve => setTimeout(resolve, 700))
    }
  }
  if (results.length) fs.writeFileSync(path.join(dir, 'resultado-testes.json'), JSON.stringify({ recipient: 'lucasrodrigues4@live.com', at: new Date().toISOString(), results }, null, 2))
  console.log('Modelos HTML: ' + dir)
} finally { await pool.end() }
