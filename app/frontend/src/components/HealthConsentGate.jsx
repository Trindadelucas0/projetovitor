// Portão do consentimento de dados de saúde (não existia: o app tinha Gate comercial e ScopeGate, não este).
// A política de privacidade do próprio app já diz que a recusa impede "relatos de dor, avaliação física e
// fotos de evolução" — então a avaliação postural não pode simplesmente começar sem esse aceite.
// O servidor é quem manda: /start responde 409 CONSENT_REQUIRED sem ele. Aqui só oferecemos conceder,
// reusando POST /api/legal/health-consent, que já existe e já registra em legal_acceptances.
import { useState } from 'react'
import Icon from './Icon.jsx'
import { Btn } from '../views/app/kit.jsx'
import { api } from '../lib/api.js'
import { notifyError } from '../lib/dialog.js'

export default function HealthConsentGate({ onGranted }) {
  const [busy, setBusy] = useState(false)
  const conceder = async () => {
    setBusy(true)
    try {
      await api('/api/legal/health-consent', { method: 'POST', body: JSON.stringify({ granted: true }) })
      onGranted?.()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return (
    <div className="g-card ap-consent" data-testid="health-consent-gate">
      <h2><Icon name="shield" /> Antes de começar</h2>
      <p className="g-sm">
        A avaliação postural usa fotos e vídeos do seu corpo, que são dados de saúde. Para isso, a lei pede
        uma autorização específica sua, separada dos termos gerais de uso.
      </p>
      <ul className="g-sm g-mut">
        <li>As imagens ficam em área privada e saem apenas para você e para o seu profissional.</li>
        <li>Nunca aparecem no Feed, na Comunidade ou em notificações.</li>
        <li>Você pode revogar depois, em Perfil → Documentos legais.</li>
      </ul>
      <Btn onClick={conceder} loading={busy} loadingLabel="Registrando…" data-testid="health-consent-accept">
        Autorizar e continuar
      </Btn>
      <p className="g-mut g-xs" style={{ marginTop: 10 }}>
        Sem esta autorização a avaliação não é iniciada, e nenhuma foto é pedida.
      </p>
    </div>
  )
}
