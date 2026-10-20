// V6 · Ranking premium do desafio: pódio, Geral / Minha posição, Entender pontuação, equipes e coletivo.
// O frontend NUNCA calcula a classificação oficial: tudo vem de /api/challenges/ranking.
import { useState } from 'react'
import { RK, RK_STATE, WHY_PT, PROOF_PT, unitOf, spDate } from '../../lib/challenges.js'
import { Podium, PodAvatar } from '../../components/Podium.jsx'
import { Sheet, Empty, Load, Tabs, useLoad, Err } from './kit.jsx'
import { ReportBtn, ChDialogLite } from './DesafioFeed.jsx'

function Score({ c, close }) {
  const [d, err] = useLoad(() => RK.score(c.id), [c.id])
  return <Sheet title="Entender pontuação" onClose={close}><div data-testid="rk-score">
    {err ? <Err msg={err} /> : !d ? <Load /> : <>
      {d.disqualified && <p className="g-warn">Você foi desclassificado: seus treinos não entram na classificação.</p>}
      <p className="g-sm">{d.formula}</p>
      <p className="g-mut g-xs">Regras versão {d.rules_version} · {spDate(d.period.start)} a {spDate(d.period.end)} (até 23:59 de Brasília)</p>
      <div className="g-row" style={{ gap: 8, margin: '10px 0' }}>
        <div className="g-card" style={{ flex: 1, margin: 0 }}><b>{d.valid_days}</b><p className="g-mut g-xs">dias válidos{d.planned ? ' de ' + d.planned + ' previstos' : ''}</p></div>
        <div className="g-card" style={{ flex: 1, margin: 0 }}><b>{d.score}{unitOf(d.metric) === '%' ? '%' : ''}</b><p className="g-mut g-xs">pontuação{d.position ? ' · ' + d.position + 'º' : ''}</p></div></div>
      <p className="g-sm"><b>Comprovantes:</b> {d.proofs.aprovado} aprovados · {d.proofs.pendente} pendentes · {d.proofs.rejeitado} rejeitados</p>
      <p className="g-note g-xs">Pendente não conta. Treinar mais de uma vez no mesmo dia não dá ponto extra — descanso faz parte.</p>
      {!d.sessions.length ? <Empty>Nenhum treino no período ainda.</Empty> : <div className="g-list">{d.sessions.map(s => <div key={s.id} className="g-li" style={{ gap: 8 }}>
        <span className="g-xs" style={{ flex: 1 }}>{new Date(s.started_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {s.workout_name || 'Treino'}{s.proof ? ' · ' + PROOF_PT[s.proof] : ''}</span>
        <span className={'rk-state' + (s.counted ? ' ok' : '')}>{WHY_PT[s.why]}</span></div>)}</div>}</>}
  </div></Sheet>
}
function Person({ p, unit, close }) {   // só informação pública do desafio
  const [dlg, setDlg] = useState(null)
  return <Sheet title={p.name} onClose={close}><div style={{ textAlign: 'center' }}><PodAvatar name={p.name} photo={p.photo} size={80} />
    <p className="g-sm">{p.position ? p.position + 'º lugar' : 'Sem posição'}{p.tied ? ' (empate)' : ''} · {p.score} {unit}</p>
    <p className="g-mut g-xs">{p.days} dias com treino válido{p.goal_reached ? ' · meta atingida' : ''}</p>
    {p.contributions && <div className="g-list" style={{ textAlign: 'left' }}>{p.contributions.map((x, i) => <div key={i} className="g-li"><span style={{ flex: 1 }}>{x.name}</span><b className="g-sm">{x.score}</b><span className="g-mut g-xs" style={{ width: 52, textAlign: 'right' }}>{x.share}%</span></div>)}</div>}
    {p.user_id && !p.me && <ReportBtn type="user" id={p.user_id} setDlg={setDlg} />}
    {dlg && <ChDialogLite d={dlg} close={() => setDlg(null)} />}
  </div></Sheet>
}
export function ChRanking({ c, inIt }) {
  const [page, setPage] = useState(0), [d, err] = useLoad(() => RK.get(c.id, page), [c.id, page]), [tab, setTab] = useState('geral'), [why, setWhy] = useState(false), [pick, setPick] = useState(null)
  if (err) return <Err msg={err} />
  if (!d) return <Load />
  const unit = unitOf(d.metric), st = <span className={'rk-state' + (['final', 'homologado'].includes(d.state) ? ' ok' : '')} data-testid="rk-state">{RK_STATE[d.state]}</span>
  const meCard = d.me ? <div className="g-card" data-testid="rk-me"><div className="g-row" style={{ gap: 10 }}><PodAvatar name={d.me.name} photo={d.me.photo} size={48} />
    <div style={{ flex: 1, minWidth: 0 }}><b>{d.me.disqualified ? 'Desclassificado' : d.me.position ? d.me.position + 'º lugar' : 'Participando'}</b><p className="g-mut g-xs" style={{ margin: 0 }}>{d.me.score} {unit}{d.goal ? ` · meta ${d.goal}${unit === '%' ? '%' : ''}` : ''}</p></div></div>
    {d.goal ? <><div className="rk-bar" style={{ margin: '10px 0 4px' }} role="progressbar" aria-valuemin={0} aria-valuemax={d.goal} aria-valuenow={Math.min(d.me.score, d.goal)}><i style={{ width: Math.min(100, d.me.score * 100 / d.goal) + '%' }} /></div>
      <p className="g-xs">{d.me.left > 0 ? `Faltam ${d.me.left} ${unit}` : 'Meta atingida!'}</p></> : null}
    {d.me.pending_proofs > 0 && <p className="g-note g-xs">{d.me.pending_proofs} comprovante(s) aguardando revisão — ainda não contam.</p>}
    <button className="g-btn g-ghost g-sm" onClick={() => setWhy(true)} data-testid="rk-why">Entender pontuação</button></div> : inIt ? null : <p className="g-mut g-sm">Participe para ver sua posição.</p>
  const list = <div className="g-card" style={{ padding: 8 }}>{!d.list.length ? <Empty>Sem participantes ativos.</Empty> : d.list.map((r, i) => <button key={i} className={'rk-row' + (r.me ? ' me' : '')} onClick={() => setPick(r)} data-testid="rk-row">
      <span className="rk-pos">{r.position ? r.position + 'º' : '—'}</span><PodAvatar name={r.name} photo={r.photo} size={34} /><span className="rk-name">{r.name}{r.me ? ' (você)' : ''}{r.tied ? <span className="g-mut g-xs"> · empate</span> : ''}</span><span className="rk-pts">{r.score} {unit}</span></button>)}
    {d.pages > 1 && <div className="g-row" style={{ gap: 8, marginTop: 8 }}><button className="g-btn g-ghost g-sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="g-mut g-xs" style={{ alignSelf: 'center' }}>{page + 1}/{d.pages}</span><button className="g-btn g-ghost g-sm" disabled={page + 1 >= d.pages} onClick={() => setPage(page + 1)}>Próxima</button></div>}</div>
  return <div data-testid="ch-ranking">
    <div className="g-row" style={{ gap: 8, alignItems: 'center', margin: '8px 0' }}>{st}<span className="g-mut g-xs">Atualizado {new Date(d.computed_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} · regras v{d.rules_version}</span></div>
    {d.state === 'apurando' && <p className="g-note g-xs">Em apuração: o resultado pode mudar até a conclusão (comprovantes em revisão).</p>}
    {d.mode === 'coletivo' ? <>
      <div className="g-card" data-testid="rk-collective"><b>Progresso do grupo</b><p className="g-sm" style={{ margin: '6px 0' }}>{d.collective.total} de {d.collective.goal} · {d.collective.pct}%</p>
        <div className="rk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.collective.pct}><i style={{ width: d.collective.pct + '%' }} /></div>
        <p className="g-mut g-xs">{d.collective.contributors} pessoas já contribuíram{d.collective.reached ? ' · meta atingida!' : ''}</p></div>
      {meCard}</> : <>
      <Tabs cur={tab} set={setTab} tabs={[['geral', 'Geral'], ['eu', 'Minha posição']]} />
      {tab === 'geral' && <>
        {d.mode === 'podio' && <Podium items={d.podium} unit={unit} onPick={setPick} />}
        {d.mode === 'equipes' && <><Podium title="Pódio das equipes" items={d.podium.map(t => ({ ...t, photo: null }))} unit={unit} onPick={setPick} />
          <p className="g-mut g-xs">Pontuação proporcional: média dos membros ativos. Equipes abaixo do tamanho mínimo não classificam.</p>
          <div className="g-card" style={{ padding: 8 }}>{(d.teams || []).map(t => <button key={t.team_id} className="rk-row" onClick={() => setPick(t)}><span className="rk-pos">{t.position ? t.position + 'º' : '—'}</span><span className="rk-name">{t.name} <span className="g-mut g-xs">· {t.size} membros{!t.eligible ? ' · abaixo do mínimo' : ''}</span></span><span className="rk-pts">{t.score} {unit}</span></button>)}</div></>}
        {d.mode === 'meta' && <p className="g-mut g-xs">Desafio de meta: cada um compete consigo mesmo. A lista mostra o progresso de todos.</p>}
        {list}
        {d.disqualified_count > 0 && <p className="g-mut g-xs">{d.disqualified_count} desclassificado(s) fora da classificação.</p>}</>}
      {tab === 'eu' && meCard}</>}
    {why && <Score c={c} close={() => setWhy(false)} />}
    {pick && <Person p={pick} unit={unit} close={() => setPick(null)} />}
  </div>
}
