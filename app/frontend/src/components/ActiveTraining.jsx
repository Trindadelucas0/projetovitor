// V4.1 — treino ativo (UMA ficha por vez) e como trocar. Regras do Lucas:
// programa do sistema → o aluno pode desvincular (arquiva) e escolher outro ou aceitar a ficha do profissional;
// V4.3 R13: ficha do personal tem prioridade; desvincular a ficha só com mensalidade própria (coberto pelo personal não desvincula).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { AT, activeLabel } from '../lib/active.js'
import { ask, notify, notifyError } from '../lib/dialog.js'
import { useStore } from '../store/useStore.js'

// Mantido como export de compatibilidade para telas antigas que ainda podem estar em
// cache; a ação não altera o estado e não reativa catálogo algum.
export async function detachSystem() {
  notify('Os programas do sistema foram desativados. Aguarde a ficha do seu personal.', 'error')
  return null
}

export async function detachPro(at, then) {
  if (!await ask('Desvincular a ficha do personal?', { text: `"${at?.pro_plan?.title || 'Ficha'}" sai do treino ativo e fica no histórico, somente para consulta.`, ok: 'Desvincular ficha', cancel: 'Manter', danger: true })) return null
  try { const r = await AT.detach(); notify('Ficha desvinculada. Aguarde seu personal adicionar uma nova ficha.'); then?.(r); return r } catch (e) { notifyError(e); return null }
}

export function CoachLockNote() {
  const [at, setAt] = useState(null)
  useEffect(() => { AT.get().then(setAt).catch(() => {}) }, [])
  if (!at?.locked_to_pro) return null
  return <p className="g-note" style={{ margin: '10px 0' }} role="note" data-testid="coach-lock">Você treina com a ficha de <b>{at.pro_plan?.owner_name}</b>. Ela é o seu único treino ativo.</p>
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
    {at.kind === 'profissional' && <>
      <p className="g-mut g-xs" style={{ marginTop: 6 }} data-testid="pro-locked">{at.can_detach
        ? 'Ficha do seu personal: é o seu único treino ativo.'
        : 'Ficha do seu personal: é o seu único treino ativo.'}</p>
      {at.can_detach && <button className="g-link" onClick={() => detachPro(at, onChange)} data-testid="active-detach-pro">Desvincular ficha do personal</button>}
    </>}
    {!at.kind && <p className="g-xs g-mut" data-testid="client-wait-pro">Aguardando a ficha do seu personal. Quando ele enviar, ela aparece aqui.</p>}
  </div>
}
