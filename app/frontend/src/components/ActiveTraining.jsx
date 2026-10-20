// V4.1 — treino ativo (UMA ficha por vez) e como trocar. Regras do Lucas:
// programa do sistema → o aluno pode desvincular (arquiva) e escolher outro ou aceitar a ficha do profissional;
// V4.3 R13: ficha do personal tem prioridade; desvincular a ficha só com mensalidade própria (coberto pelo personal não desvincula).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { AT, activeLabel } from '../lib/active.js'
import { ask, notify, notifyError } from '../lib/dialog.js'
import { useStore } from '../store/useStore.js'

export async function detachSystem(at, then) {
  if (!await ask('Desvincular este programa?', { text: `"${at?.program?.title || 'Programa'}" sai do seu treino ativo e fica no histórico (nada é apagado). Depois você escolhe outro programa ou aceita a ficha do seu profissional.`, ok: 'Desvincular', cancel: 'Manter', danger: true })) return null
  try { const r = await AT.detach(); notify('Programa desvinculado.'); then?.(r); return r } catch (e) { notifyError(e); return null }
}

export async function detachPro(at, then) {
  if (!await ask('Desvincular a ficha do personal?', { text: `"${at?.pro_plan?.title || 'Ficha'}" sai do seu treino ativo e fica no histórico, só para consulta (nada é apagado). Você continua vinculado ao personal e pode ativar um programa do sistema. Só um treino fica ativo por vez.`, ok: 'Desvincular ficha', cancel: 'Manter', danger: true })) return null
  try { const r = await AT.detach(); notify('Ficha desvinculada. Agora você pode escolher um programa do sistema.'); then?.(r); return r } catch (e) { notifyError(e); return null }
}

export function CoachLockNote() {
  const [at, setAt] = useState(null)
  useEffect(() => { AT.get().then(setAt).catch(() => {}) }, [])
  if (!at?.locked_to_pro) return null
  return <p className="g-note" style={{ margin: '10px 0' }} role="note" data-testid="coach-lock">Você treina com a ficha de <b>{at.pro_plan?.owner_name}</b>. Só um treino fica ativo por vez: os programas do sistema podem ser consultados, mas não iniciados enquanto ela estiver ativa. {at.can_detach ? 'Para trocar, desvincule a ficha no seu treino ativo.' : 'Sua conta é coberta pelo personal; para usar os programas do sistema, contrate o plano Individual.'}</p>
}

export default function ActiveTrainingBanner({ at, compact, onChange }) {
  const nav = useNavigate()
  if (!at) return null
  const name = at.kind === 'sistema' ? at.program?.title : at.pro_plan ? `${at.pro_plan.title} · ${at.pro_plan.owner_name}` : null
  return <div className="g-card" style={{ marginTop: compact ? 10 : 14 }} data-testid="active-training">
    <div className="g-row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <span className="g-activebadge"><Icon name="check" /> Treino ativo</span>
      <span className="g-mut g-xs">{activeLabel(at)}</span>
    </div>
    {name ? <b style={{ display: 'block', marginTop: 6 }}>{name}</b> : <p className="g-mut g-sm" style={{ marginTop: 6 }}>Você ainda não tem treino ativo.</p>}
    {at.kind === 'sistema' && <>
      {at.pending_pro_plans?.length > 0 && <p className="g-note" style={{ marginTop: 8 }} data-testid="pending-pro">Seu profissional enviou a ficha <b>{at.pending_pro_plans[0].title}</b>. Você só pode ter uma ficha por vez: desvincule o programa atual para aceitá-la.</p>}
      {!compact && <button className="g-link" onClick={() => detachSystem(at, onChange)} data-testid="active-detach">Desvincular programa</button>}
    </>}
    {at.kind === 'profissional' && <>
      <p className="g-mut g-xs" style={{ marginTop: 6 }} data-testid="pro-locked">{at.can_detach
        ? 'Ficha do seu personal: é o seu único treino ativo. Para usar um programa do sistema, desvincule a ficha (ela fica no histórico).'
        : 'Ficha do seu personal: é o seu único treino ativo. A sua conta é coberta pelo personal, por isso os programas do sistema ficam travados.'}</p>
      {at.paused_program && <p className="g-xs g-mut" data-testid="paused-program">Programa pausado: {at.paused_program.title} (a ficha do personal tem prioridade).</p>}
      {at.can_detach && <button className="g-link" onClick={() => detachPro(at, onChange)} data-testid="active-detach-pro">Desvincular ficha do personal</button>}
    </>}
    {!at.kind && (useStore.getState().user?.client_locked
      ? <p className="g-xs g-mut" data-testid="client-wait-pro">Aguardando a ficha do seu personal. Quando ele enviar, ela aparece aqui.</p>
      : <button className="g-link" onClick={() => nav('/programas')}>Explorar programas</button>)}
  </div>
}
