// Abas administrativas de Moderação (denúncias) e Ranking (auditoria, invalidação justificada).
import { useState, Fragment } from 'react'
import { F, REPORT_PT, dt } from '../../lib/care.js'
import { Empty, Load, Err, useLoad, Tabs } from './kit.jsx'
import { EXTRA } from './AdminPanel.jsx'
import { askText, notifyError } from '../../lib/dialog.js'

function Moderacao() {
  const [st, setSt] = useState('pendente')
  const [d, err, reload] = useLoad(() => F.reports(st), [st])
  const decide = async (r, decision) => { const reason = decision === 'em_analise' ? '' : await askText('Motivo da decisão', { required: true, multiline: true }); if (reason == null) return
    try { await F.decide({ id: r.id, decision, reason }); reload() } catch (e) { notifyError(e) } }
  return <div>
    <Tabs cur={st} set={setSt} tabs={[['pendente', 'Pendentes'], ['em_analise', 'Em análise'], ['resolvida', 'Resolvidas']]} />
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : <div className="g-card g-list">{d.reports.length ? d.reports.map(r => <div key={r.id} className="g-li" style={{ display: 'block' }} data-testid="report">
      <b>Denúncia #{r.id} · {r.target_type === 'post' ? 'Publicação' : 'Comentário'}</b>
      <p className="g-mut g-xs">Motivo: {REPORT_PT[r.reason]} · por {r.reporter} · {dt(r.created_at)}</p>
      {r.details && <p className="g-sm">{r.details}</p>}
      {r.target && <div className="g-msg" style={{ maxWidth: '100%' }}><span className="g-xs g-mut">Autor: {r.target.author} · status {r.target.status}</span><p className="g-sm">{r.target.title ? <b>{r.target.title}: </b> : null}{r.target.body}</p></div>}
      {r.status !== 'resolvida' ? <div className="g-actions">
        {r.status === 'pendente' && <button className="g-btn g-ghost g-sm" onClick={() => decide(r, 'em_analise')}>Em análise</button>}
        <button className="g-btn g-ghost g-sm" onClick={() => decide(r, 'manter')}>Manter</button>
        <button className="g-btn g-ghost g-sm" onClick={() => decide(r, 'correcao')}>Solicitar correção</button>
        <button className="g-btn g-sm" onClick={() => decide(r, 'ocultar')} data-testid="hide">Ocultar</button>
        <button className="g-btn g-danger g-sm" onClick={() => decide(r, 'remover')}>Remover</button>
        {r.target_type === 'post' && <button className="g-btn g-danger g-sm" onClick={() => decide(r, 'restringir')}>Restringir publicação</button>}
      </div> : <p className="g-xs g-acc">Decisão: {r.decision} — {r.decision_reason}</p>}
    </div>) : <Empty icon="check">Nenhuma denúncia aqui.</Empty>}</div>}
  </div>
}
function RankingAdm() {
  const [per, setPer] = useState('semana'), [qq, setQq] = useState(''), [open, setOpen] = useState(null)
  const [d, err, reload] = useLoad(() => F.admRanking(per), [per])
  if (err) return <Err msg={err} retry={reload} />
  return <div>
    <Tabs cur={per} set={setPer} tabs={[['semana', 'Semanal'], ['mes', 'Mensal']]} />
    {!d ? <Load /> : <>
      <div className="g-stat"><div><b>{d.enabled}</b><span>Habilitados</span></div><div><b>{d.scored_sessions}</b><span>Sessões pontuadas</span></div><div><b>{d.invalidated.length}</b><span>Invalidadas</span></div></div>
      <input className="g-in" style={{ marginTop: 10 }} placeholder="Pesquisar aluno" value={qq} onChange={e => setQq(e.target.value)} />
      <div className="g-card" style={{ marginTop: 10, overflowX: 'auto' }}><table className="g-tbl"><thead><tr><th>Aluno</th><th>Pontos</th><th>Estado</th><th></th></tr></thead><tbody>
        {d.rows.filter(r => r.name.toLowerCase().includes(qq.toLowerCase())).map(r => <Fragment key={r.id}>
          <tr><td>{r.position ? '#' + r.position + ' ' : ''}{r.name}</td><td>{r.points}</td><td>{r.state}</td><td><button className="g-link" onClick={() => setOpen(open === r.id ? null : r.id)}>Consultar</button></td></tr>
          {open === r.id && <tr><td colSpan="4">{r.list.map(s => <div key={s.id} className="g-row g-xs" style={{ minHeight: 44 }}>{s.day} · {s.workout_name}<span className="g-sp" />
            <button className="g-link" style={{ color: 'var(--ag-bad)' }} onClick={async () => { const reason = await askText('Justificativa da invalidação', { text: 'Fica registrada e o aluno é avisado.', required: true, multiline: true, danger: true, ok: 'Invalidar' }); if (!reason) return; try { await F.invalidate(s.id, reason); reload() } catch (e) { notifyError(e) } }}>Invalidar</button></div>)}{!r.list.length && <span className="g-xs g-mut">Sem sessões pontuadas.</span>}</td></tr>}
        </Fragment>)}</tbody></table></div>
      <p className="g-xs g-mut" style={{ marginTop: 8 }}>A administração não cria pontos nem altera posições: corrige invalidando o registro responsável, com justificativa.</p>
      <h3 style={{ marginTop: 14 }}>Sessões invalidadas</h3>
      <div className="g-card g-list">{d.invalidated.length ? d.invalidated.map(s => <div key={s.id} className="g-li g-sm">{s.name} · {s.workout_name} · {dt(s.started_at)} — {s.ranking_invalid_reason}</div>) : <Empty>Nenhuma.</Empty>}</div>
      <h3 style={{ marginTop: 14 }}>Alterações de privacidade</h3>
      <div className="g-card g-list">{d.pref_changes.length ? d.pref_changes.map(p => <div key={p.id} className="g-li g-xs">{dt(p.created_at)} · {p.name} → {p.public ? 'público' : 'privado'}</div>) : <Empty>Nenhuma.</Empty>}</div>
    </>}
  </div>
}
EXTRA.moderacao = Moderacao
EXTRA.ranking = RankingAdm
