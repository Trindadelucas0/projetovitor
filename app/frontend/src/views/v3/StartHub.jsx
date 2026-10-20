// Peça compartilhada do aluno: "Retomar treino". (V4: a montagem de treino pelo aluno foi removida.)
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { loadSession } from '../../lib/guided.js'
import { liveOf, elapsedLabel } from '../../lib/start.js'

export function useLive() {
  const legacy = useStore(s => s.S?.active)
  return liveOf(loadSession(), legacy)
}

export function ResumeBar() {
  const live = useLive(), nav = useNavigate()
  if (!live) return null
  return <button className="g-resume" onClick={() => nav(live.to)} data-testid="resume-bar">
    <span className="g-ico"><Icon name={live.pending ? 'check' : 'play'} /></span>
    <span style={{ minWidth: 0, flex: 1 }}><b>{live.pending ? 'Treino concluído — falta salvar' : 'Treino em andamento'}</b><br />
      <span className="g-mut g-xs">{live.name || 'Treino'}{live.start && !live.pending ? ' · ' + elapsedLabel(live.start) : ''}</span></span>
    <span className="g-resume-cta">{live.pending ? 'Salvar' : 'Retomar'}</span>
  </button>
}
