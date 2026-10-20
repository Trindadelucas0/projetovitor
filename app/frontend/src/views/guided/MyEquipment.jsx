import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G } from '../../lib/guided.js'
import './guided.css'

// V4 F4 — Perfil › Equipamentos: o aluno marca o que tem; as recomendações só mostram programas possíveis.
export default function MyEquipment() {
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [mine, setMine] = useState([])
  const [unknown, setUnknown] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { G.equipment().then(r => { setD(r); setMine(r.mine); setUnknown(r.unknown) }).catch(e => setMsg(e.message)) }, [])
  const toggle = id => { setUnknown(false); setMine(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]) }
  const save = async () => {
    setMsg('')
    try { await G.saveEquipment(mine, unknown); setMsg('Salvo. Suas recomendações já usam esta lista.') } catch (e) { setMsg(e.message || 'Não foi possível salvar') }
  }
  const list = (d?.equipment || []).filter(e => e.id !== 'peso_corporal' && e.id !== 'elastico')
  return <div className="ag g-full" data-testid="my-equipment">
    <div className="g-ob-top"><button className="g-icbtn" onClick={() => nav(-1)} aria-label="Voltar"><span style={{ transform: 'scaleX(-1)', display: 'flex' }}><Icon name="play" /></span></button></div>
    <h1>Seus equipamentos</h1>
    <p className="g-mut">Marque o que você tem. O peso do corpo já conta sempre. Não trocamos um equipamento por outro automaticamente.</p>
    {!d && !msg && <p className="g-dim">Carregando…</p>}
    <div className="g-opts">
      {list.map(e => <button key={e.id} className={'g-opt' + (mine.includes(e.id) ? ' g-on' : '')} onClick={() => toggle(e.id)}>
        <span>{e.name}{e.description && <small>{e.description}</small>}</span>
        <span className="g-tick">{mine.includes(e.id) && <Icon name="check" />}</span>
      </button>)}
      {d && <button className={'g-opt' + (unknown ? ' g-on' : '')} onClick={() => { setUnknown(!unknown); setMine([]) }}>
        <span>Não sei identificar<small>Mostramos só programas sem equipamento.</small></span><span className="g-tick">{unknown && <Icon name="check" />}</span>
      </button>}
    </div>
    <div style={{ marginTop: 16, paddingBottom: 96 }}>
      {msg && <p className="g-note" style={{ marginBottom: 10 }} data-testid="eq-msg">{msg}</p>}
      <button className="g-btn" onClick={save} disabled={!d}>Salvar</button>
    </div>
  </div>
}
