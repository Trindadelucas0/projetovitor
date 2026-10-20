// V5-E · Seleção/criação de troféus no assistente, vitrine no perfil e seção de premiações oficiais do desafio.
import { useState } from 'react'
import { TR, PZ, CRIT_PT, PUB_PRIZE_PT } from '../../lib/challenges.js'
import { Empty, Load, useLoad, Err, Field } from './kit.jsx'
const BASE = ['participacao', 'conclusao', 'primeiro', 'segundo', 'terceiro', 'equipe_vencedora', 'consistencia']
export function TrophyPick({ value = [], onChange }) {
  const [d, err, reload] = useLoad(() => TR.list()), [nw, setNw] = useState(null), [msg, setMsg] = useState('')
  if (err) return <Err msg={err} />
  if (!d) return <Load />
  const tog = id => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  return <div data-testid="cw-trophies"><b className="g-sm">Troféus</b><p className="g-mut g-xs">Ganhos só com resultado real, no fim do desafio.</p>
    <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}>{d.trophies.map(t => <button key={t.id} type="button" className={'g-chipbtn' + (value.includes(t.id) ? ' on' : '')} aria-pressed={value.includes(t.id)} onClick={() => tog(t.id)} title={t.description || ''}>{t.icon} {t.name}{t.status === 'pendente' ? ' (em moderação)' : ''}</button>)}</div>
    {!nw ? <button type="button" className="g-btn g-ghost g-sm" style={{ marginTop: 8 }} onClick={() => setNw({ icon: '🏅', name: '', criterion: 'conclusao' })} data-testid="cw-tr-new">Criar troféu personalizado</button>
      : <div className="g-card" style={{ marginTop: 8 }}>
        <div className="g-row" style={{ gap: 8 }}><Field label="Ícone"><select className="g-in" value={nw.icon} onChange={e => setNw({ ...nw, icon: e.target.value })}>{['🏅', '🏆', '🔥', '💪', '⭐', '🚀', '🎯', '🌟'].map(i => <option key={i}>{i}</option>)}</select></Field>
          <Field label="Nome"><input className="g-in" maxLength={40} value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} data-testid="cw-tr-name" /></Field></div>
        <Field label="Critério"><select className="g-in" value={nw.criterion} onChange={e => setNw({ ...nw, criterion: e.target.value })}>{BASE.map(k => <option key={k} value={k}>{CRIT_PT[k]}</option>)}</select></Field>
        {msg && <p className="g-warn">{msg}</p>}
        <div className="g-row" style={{ gap: 8 }}><button type="button" className="g-btn g-ghost" onClick={() => setNw(null)}>Cancelar</button><button type="button" className="g-btn" onClick={async () => { try { const r = await TR.create(nw); onChange([...value, r.id]); setNw(null); setMsg(''); reload() } catch (e) { setMsg(e.message) } }} data-testid="cw-tr-save">Criar</button></div>
        <p className="g-mut g-xs">Nomes personalizados passam pela moderação antes de valer.</p></div>}
  </div>
}
export function MyTrophies() {
  const [d, err, reload] = useLoad(() => TR.mine())
  if (err) return <Err msg={err} />
  if (!d) return <Load />
  if (!d.trophies?.length) return <Empty>Sem troféus ainda. Eles vêm com resultados reais nos desafios.</Empty>
  return <div className="g-list" data-testid="my-trophies">{d.trophies.map(t => <div key={t.id} className="g-li" style={{ gap: 10 }}><span style={{ fontSize: 26 }} aria-hidden="true">{t.icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}><b className="g-sm">{t.name}</b><p className="g-mut g-xs" style={{ margin: 0 }}>{t.challenge}</p></div>
    <label className="g-chk g-xs"><input type="checkbox" checked={t.show_on_profile} onChange={async e => { await TR.show(t.id, e.target.checked); reload() }} /> No perfil</label></div>)}</div>
}
export function ChPrizes({ c }) {
  const [d, err] = useLoad(() => PZ.ofChallenge(c.id), [c.id]), [t] = useLoad(() => TR.ofChallenge(c.id), [c.id])
  if (err) return null
  if (!d) return <Load />
  return <div data-testid="ch-prizes">
    {!!t?.trophies?.length && <div className="g-card"><b className="g-sm">Troféus deste desafio</b><div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{t.trophies.map(x => <span key={x.id} className="ch-pill" title={x.description || ''}>{x.icon} {x.name}{x.awarded ? ` · ${x.awarded}` : ''}</span>)}</div></div>}
    {c.official && <div className="g-card"><b className="g-sm">Premiações oficiais</b>
      {!d.prizes.length ? <p className="g-mut g-xs">Nenhum prêmio oficial publicado.</p> : d.prizes.map(p => <div key={p.id} style={{ marginTop: 8 }}>
        <div className="g-row" style={{ gap: 8 }}><b className="g-sm" style={{ flex: 1 }}>{p.name} ×{p.quantity}</b><span className={'rk-state' + (['homologado', 'entregue'].includes(p.public_state) ? ' ok' : '')}>{PUB_PRIZE_PT[p.public_state]}</span></div>
        {p.image_url && <img src={p.image_url} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12 }} />}
        <p className="g-mut g-xs">{CRIT_PT[p.criterion]}{p.delivery_deadline ? ' · entrega até ' + new Date(p.delivery_deadline).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}{p.eligibility ? ' · ' + p.eligibility : ''}</p>
        {p.description && <p className="g-xs">{p.description}</p>}
        {!!p.winners.length && <p className="g-xs"><b>Vencedores:</b> {p.winners.map(w => w.name + (w.me ? ' (você)' : '') + (w.status === 'entregue' ? ' ✓' : '')).join(', ')}</p>}
      </div>)}
      <p className="g-mut g-xs">Sem sorteio e sem dinheiro. Entrega só depois do resultado homologado.</p></div>}
  </div>
}
