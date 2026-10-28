import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, GOALS } from '../../lib/guided.js'
import { useStore } from '../../store/useStore.js'
import { api } from '../../lib/api.js'
import './guided.css'

const STEPS = [
  { k: 'objetivo', q: 'Qual é o seu objetivo?', sub: 'Escolha um. O ORNY encontra o programa certo para você.',
    opts: GOALS.map(([v, l, i]) => ({ v, l, i, s: { hypertrophy: 'Ganhar músculos e definição', weight_loss: 'Perder gordura e ganhar disposição', strength: 'Levantar mais peso com segurança', conditioning: 'Mais fôlego e resistência', mobility: 'Corpo mais solto e boa postura', home: 'Treinar sem sair de casa' }[v] })) },
  { k: 'nivel', q: 'Você já treina?', sub: 'Sem problema se estiver começando agora.',
    opts: [{ v: 'beginner', l: 'Estou começando', s: 'Nunca treinei ou parei há muito tempo', i: 'person' }, { v: 'intermediate', l: 'Já treino', s: 'Treino há alguns meses', i: 'dumbbell' }, { v: 'advanced', l: 'Treino há anos', s: 'Conheço bem os exercícios', i: 'chart' }] },
  { k: 'local', q: 'Onde você vai treinar?', sub: '',
    opts: [{ v: 'gym', l: 'Na academia', s: 'Aparelhos, halteres e barras', i: 'dumbbell' }, { v: 'home', l: 'Em casa, com algum equipamento', s: 'Halteres, elástico ou kettlebell', i: 'kettlebell' }, { v: 'home_noequip', l: 'Sem equipamento', s: 'Só o peso do corpo', i: 'person' }] },
  { k: 'equipamentos', only: a => a.local === 'home', multi: true, q: 'Quais equipamentos você tem?', sub: 'Marque todos. Só mostramos programas que você consegue fazer com o que tem.',
    opts: [['halter', 'Halteres', 'dumbbell'], ['kettlebell', 'Kettlebell', 'kettlebell'], ['barra', 'Barra com anilhas', 'dumbbell'], ['banco', 'Banco', 'person'], ['barra_fixa', 'Barra fixa', 'arm'],
      ['faixa_elastica', 'Faixa elástica (lisa)', 'bolt'], ['mini_band', 'Mini band (anel curto)', 'bolt'], ['elastico_pegadores', 'Elástico com pegadores', 'bolt'], ['super_band', 'Super band (anel longo)', 'bolt'],
      ['colchonete', 'Colchonete', 'person'], ['naosei', 'Não sei identificar', 'info']].map(([v, l, i]) => ({ v, l, i })) },
  { k: 'dias', q: 'Quantos dias por semana?', sub: 'Escolha o que cabe na sua rotina de verdade.', grid: 'g-grid3',
    opts: [2, 3, 4, 5, 6].map(v => ({ v, l: String(v), s: 'dias' })) },
  { k: 'minutos', q: 'Quanto tempo por treino?', sub: '', grid: 'g-grid2',
    opts: [20, 30, 45, 60].map(v => ({ v, l: String(v), s: 'minutos' })) },
  { k: 'restricoes', q: 'Sente dor ou tem alguma restrição?', sub: 'Assim evitamos exercícios que não combinam com você.', multi: true,
    opts: [{ v: 'none', l: 'Nenhuma', i: 'check' }, { v: 'knee', l: 'Joelho', i: 'legs' }, { v: 'lumbar', l: 'Lombar (parte baixa das costas)', i: 'person' }, { v: 'shoulder', l: 'Ombro', i: 'arm' }, { v: 'other', l: 'Outra', i: 'info' }] }
]

export default function Onboarding() {
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const [a, setA] = useState({ restricoes: [], equipamentos: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const steps = STEPS.filter(x => !x.only || x.only(a))
  const st = steps[i]
  const first = (useStore(s => s.user)?.name || '').split(' ')[0]
  const val = a[st.k]

  const pick = v => {
    if (st.multi) {
      const solo = st.k === 'restricoes' ? 'none' : 'naosei'
      let r = a[st.k]
      if (v === solo) r = r.includes(solo) ? [] : [solo]
      else r = r.includes(v) ? r.filter(x => x !== v) : [...r.filter(x => x !== solo), v]
      setA({ ...a, [st.k]: r })
    } else { setA({ ...a, [st.k]: v }); setTimeout(() => setI(n => Math.min(n + 1, steps.length - 1)), 160) }
  }
  const finish = async () => {
    setBusy(true); setErr('')
    try {
      const eq = a.local === 'home' ? { equipamentos: a.equipamentos.filter(x => x !== 'naosei'), equipamento_nao_sei: a.equipamentos.includes('naosei') }
        : a.local === 'home_noequip' ? { equipamentos: [] } : {}
      await G.onboarding({ ...a, ...eq, restricoes: a.restricoes.filter(r => r !== 'none') })
      nav('/recomendados', { replace: true })
    } catch (e) { setErr(e.message || 'Não foi possível salvar') } finally { setBusy(false) }
  }
  const back = () => (i ? setI(i - 1) : nav(-1))

  return <div className="ag g-full" data-testid="onboarding">
    <div className="g-ob-top">
      <button className="g-icbtn" onClick={back} aria-label="Voltar"><span style={{ transform: 'scaleX(-1)', display: 'flex' }}><Icon name="play" /></span></button>
      <div className="g-bar"><i style={{ width: ((i + 1) / steps.length * 100) + '%' }} /></div>
      <span className="g-dim g-sm">{i + 1}/{steps.length}</span>
    </div>
    {i === 0 && first && <span className="g-eyebrow" data-testid="onb-welcome">Bem-vindo(a), {first}!</span>}
    <h1>{st.q}</h1>
    {st.sub && <p className="g-mut">{st.sub}</p>}
    <div className={st.grid || 'g-opts'}>
      {st.opts.map(o => {
        const on = st.multi ? a[st.k].includes(o.v) : val === o.v
        return <button key={o.v} className={'g-opt' + (on ? ' g-on' : '')} onClick={() => pick(o.v)}>
          {st.grid ? <>{o.l}<small>{o.s}</small></> : <>
            {o.i && <span className="g-ico"><Icon name={o.i} /></span>}
            <span>{o.l}{o.s && <small>{o.s}</small>}</span>
            <span className="g-tick">{on && <Icon name="check" />}</span>
          </>}
        </button>
      })}
    </div>
    {i === 0 && <button className="g-link" style={{ marginTop: 16 }} onClick={async () => { try { await api('/api/me/onboarding/skip', { method: 'POST', body: '{}' }) } catch { /* segue mesmo offline */ } nav('/hoje', { replace: true }) }} data-testid="onb-skip">Agora não — quero conhecer o app primeiro</button>}
    {st.k === 'equipamentos' && <div className="g-bottom">
      {a.equipamentos.includes('naosei') && <p className="g-note" style={{ marginBottom: 12 }}>Tudo bem. Vamos mostrar só programas sem equipamento. Depois você pode marcar seus equipamentos em Perfil › Equipamentos.</p>}
      <button className="g-btn" data-testid="onb-eq-next" disabled={!a.equipamentos.length} onClick={() => setI(i + 1)}>Continuar</button>
    </div>}
    {st.k === 'restricoes' && <div className="g-bottom">
      {err && <p className="g-warn" style={{ marginBottom: 10 }}>{err}</p>}
      {a.restricoes.some(r => r !== 'none') && <p className="g-note" style={{ marginBottom: 12 }}>O ORNY não faz diagnóstico. Se a dor for forte ou frequente, procure um médico ou fisioterapeuta.</p>}
      <button className="g-btn" disabled={!a.restricoes.length || busy} onClick={finish}>{busy ? 'Buscando programas…' : 'Ver meus programas'}</button>
    </div>}
  </div>
}
