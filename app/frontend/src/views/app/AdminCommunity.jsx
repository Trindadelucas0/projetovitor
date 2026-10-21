// Aba administrativa de moderação das publicações da Comunidade.
import { useState } from 'react'
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
EXTRA.moderacao = Moderacao
