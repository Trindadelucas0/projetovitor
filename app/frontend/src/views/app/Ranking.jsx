// Ranking de consistência: semanal/mensal, pontuação transparente, privacidade opcional e histórico.
// Ferramenta de motivação — não é avaliação clínica nem incentiva treinar além da rotina prescrita.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { F } from '../../lib/care.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field, Tabs } from './kit.jsx'

const DN = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
export function RankingCard() {
  const nav = useNavigate()
  const [d] = useLoad(() => F.ranking('semana'))
  if (!d) return null
  return <button className="g-card" style={{ marginTop: 14, width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => nav('/ranking')} data-testid="ranking-card">
    <span className="g-eyebrow">Ranking da semana</span>
    <div className="g-row" style={{ marginTop: 6 }}><b style={{ fontSize: 22 }}>{d.me?.points || 0} pts</b><span className="g-sp" />
      <span className="g-mut g-sm">{d.pref.public ? (d.me?.position ? 'Posição #' + d.me.position : 'Sem posição ainda') : 'Participação privada'}</span></div>
    <p className="g-mut g-xs">{d.me?.days || 0} dia(s) com treino válido · Ver ranking completo</p>
  </button>
}
function Privacy({ pref, onClose, onDone }) {
  const [pub, setPub] = useState(!!pref.public), [name, setName] = useState(pref.display_name || ''), [err, setErr] = useState('')
  return <Sheet title="Privacidade do ranking" onClose={onClose}>
    <label className="g-row" style={{ minHeight: 48 }}><input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} data-testid="rank-public" /> <b>Aparecer no ranking público</b></label>
    <p className="g-mut g-sm">Quando ativado, outras pessoas veem seu nome de exibição, foto e pontuação. Seus dados pessoais e detalhes dos treinos não são exibidos. Desativar não apaga seu histórico e você pode voltar quando quiser.</p>
    <Field label="Nome de exibição (opcional)"><input className="g-in" value={name} maxLength={40} onChange={e => setName(e.target.value)} /></Field>
    {err && <p className="g-warn">{err}</p>}
    <button className="g-btn" style={{ marginTop: 12 }} onClick={async () => { try { await F.rankPrefs({ public: pub, display_name: name }); onDone() } catch (e) { setErr(e.message) } }} data-testid="rank-save">Salvar preferências</button>
  </Sheet>
}
export default function Ranking({ embedded }) {
  const [per, setPer] = useState('semana'), [sheet, setSheet] = useState(null)
  const [d, err, reload] = useLoad(() => F.ranking(per), [per])
  const [h] = useLoad(() => F.rankHist(), [sheet])
  const body = err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : <>
    <Tabs cur={per} set={setPer} tabs={[['semana', 'Semanal'], ['mes', 'Mensal']]} />
    <div className="g-card" data-testid="rank-me">
      <span className="g-eyebrow">Sua participação</span>
      <div className="g-stat" style={{ marginTop: 8 }}><div><b>{d.me?.points || 0}</b><span>Pontos</span></div><div><b>{d.pref.public ? (d.me?.position ? '#' + d.me.position : '—') : 'privado'}</b><span>Posição</span></div><div><b>{d.me?.days || 0}</b><span>Dias</span></div></div>
      <div className="g-actions"><button className="g-btn g-ghost g-sm" onClick={() => setSheet('pts')}>Ver minha pontuação</button><button className="g-btn g-ghost g-sm" onClick={() => setSheet('priv')} data-testid="rank-privacy">Privacidade do ranking</button></div>
      {!d.pref.public && <p className="g-xs g-mut" style={{ marginTop: 8 }}>Você treina e acumula pontos normalmente, sem aparecer na lista. Ative a participação pública se quiser.</p>}
    </div>
    <h2>Classificação</h2>
    <div className="g-card">{d.top.length ? d.top.map(r => <div key={r.position} className={'g-rank' + (d.me?.position === r.position ? ' g-me' : '')}><span className="g-pos">#{r.position}</span><Av name={r.name} url={r.photo_url} size={36} /><span style={{ flex: 1 }}><b className="g-sm">{r.name}</b><br /><span className="g-xs g-mut">{r.days} dia(s)</span></span><b>{r.points}</b></div>)
      : <Empty icon="trophy">Ninguém pontuou ainda neste período. Cada treino válido vale 100 pontos.</Empty>}</div>
    <details className="org-details"><summary>Como pontua</summary><p className="g-xs g-dim" style={{ marginTop: 8 }}>Desempate: mais dias com treino, depois mais sessões, depois quem chegou primeiro à pontuação. São regras administrativas do ranking, sem significado clínico. Curtidas, comentários e cargas não pontuam.</p></details>
    {sheet === 'priv' && <Privacy pref={d.pref} onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload() }} />}
    {sheet === 'pts' && <Sheet title="Minha pontuação" onClose={() => setSheet(null)}>
      <p className="g-mut g-sm">Período: {per === 'semana' ? 'semana atual' : 'mês atual'} ({d.period.start} a {d.period.end})</p>
      <div className="g-card" style={{ marginTop: 10 }}><b>Sessões válidas</b><p className="g-sm">{d.me?.sessions || 0} × 100 = {d.me?.base || 0} pontos</p>
        <b style={{ marginTop: 8, display: 'block' }}>{per === 'semana' ? 'Consistência' : 'Regularidade (bônus semanais)'}</b><p className="g-sm">{d.me?.days || 0} dia(s) distintos = {d.me?.bonus || 0} pontos</p>
        <b style={{ marginTop: 8, display: 'block' }}>Total: {d.me?.points || 0} pontos</b></div>
      {per === 'semana' && <div className="g-row" style={{ marginTop: 10, justifyContent: 'space-between' }}>{DN.map((n, i) => { const x = new Date(d.period.start + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + i); const on = d.me?.day_list?.includes(x.toISOString().slice(0, 10))
        return <span key={n} className="g-xs g-center" style={{ color: on ? 'var(--ag-acc)' : 'var(--ag-dim)' }}>{n}<br />{on ? '●' : '○'}</span> })}</div>}
      <p className="g-xs g-mut" style={{ marginTop: 10 }}>Uma sessão vale quando você conclui pelo menos {d.rules.pct}% dos exercícios prescritos (exercícios pausados por orientação não contam contra você). Várias sessões no mesmo dia contam um dia só para o bônus.</p>
      <h3 style={{ marginTop: 12 }}>Histórico</h3>
      {(h?.history || []).length ? h.history.map(x => <p key={x.period_type + x.period_key} className="g-sm">{x.period_type === 'semana' ? 'Semana de ' : 'Mês de '}{x.period_key}: {x.points} pts{x.position ? ' · #' + x.position : ''}</p>) : <p className="g-mut g-sm">Os períodos encerrados aparecem aqui.</p>}
    </Sheet>}
  </>
  if (embedded) return <div>{body}</div>
  return <div className="ag" data-testid="ranking"><span className="g-eyebrow">Comunidade</span><h1>Ranking de alunos</h1>{body}</div>
}
