import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { EXDB, BODYPARTS, allExercises, equipmentOf, exName } from '../lib/exercises.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function Library() {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(40)
  const ql = q.toLowerCase().trim()
  const base = allExercises(S).filter(e => (!bp || e.bp === bp) && (!ql || exName(e).toLowerCase().includes(ql) || e.n.toLowerCase().includes(ql) || (t(e.tg || e.bp)).toLowerCase().includes(ql) || (t(e.eq)).toLowerCase().includes(ql) || (e.desc || '').toLowerCase().includes(ql)))
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = eqOn ? base.filter(e => e.eq === eqOn) : base

  return <>
    <div className="hdr"><div><h1>{t('Exercises')}</h1><div className="sub">{t('{0} exercises with animations', EXDB.length)}</div></div><button className="btn sm" onClick={() => location.hash = '#/muscles'} style={{ marginLeft: 'auto' }}>Mapa 3D</button></div>
    <div className="search" style={{ marginBottom: 10 }}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <label className="sr-only" htmlFor="lib-q">Buscar exercício</label><input id="lib-q" className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} /></div>
    <div className="library-filters">
      <label>Grupo muscular
        <select id="lib-bp" className="input" value={bp} onChange={e => { setBp(e.target.value); setEq(''); setShown(40) }}>
          <option value="">{t('All')}</option>
          {BODYPARTS.map(b => <option key={b} value={b}>{t(b)}</option>)}
        </select>
      </label>
      {eqOpts.length > 1 && <label>Equipamento
        <select id="lib-eq" className="input" value={eqOn} onChange={e => { setEq(e.target.value); setShown(40) }}>
          <option value="">{t('Any equipment')}</option>
          {eqOpts.map(x => <option key={x} value={x}>{t(x)}</option>)}
        </select>
      </label>}
    </div>
    <div className="list">
      {f.slice(0, shown).map(e => {
        const best = bestWeightFor(S, e.id)
        return <div key={e.id} className="item" onClick={() => exerciseDetailSheet(e)}>
          <Thumb ex={e} />
          <div className="grow"><div className="tt capitalize">{exName(e)}</div><div className="ss capitalize">{t(e.tg || e.bp)} · {t(e.eq)}</div></div>
          {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
        </div>
      })}
      {f.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}
