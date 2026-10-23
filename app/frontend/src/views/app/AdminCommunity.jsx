// Aba administrativa de moderação das publicações da Comunidade.
import { useState } from 'react'
import { F, REPORT_PT, dt } from '../../lib/care.js'
import { Empty, Load, Err, useLoad } from './kit.jsx'
import { EXTRA } from './AdminPanel.jsx'
import { askText, notifyError } from '../../lib/dialog.js'
import SubTabs from '../../ui/SubTabs.jsx'
import { Btn, Card, Tools } from '../../ui/kit.jsx'

function Moderacao() {
  const [st, setSt] = useState('pendente')
  const [d, err, reload] = useLoad(() => F.reports(st), [st])
  const decide = async (r, decision) => { const reason = decision === 'em_analise' ? '' : await askText('Motivo da decisão', { required: true, multiline: true }); if (reason == null) return
    try { await F.decide({ id: r.id, decision, reason }); reload() } catch (e) { notifyError(e) } }
  return <div>
    <SubTabs current={st} onChange={setSt} items={[['pendente', 'Pendentes'], ['em_analise', 'Em análise'], ['resolvida', 'Resolvidas']]} />
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : <Card>{d.reports.length ? d.reports.map(r => <div key={r.id} className="orny-item" data-testid="report">
      <b>Denúncia #{r.id} · {r.target_type === 'post' ? 'Publicação' : 'Comentário'}</b>
      <p className="g-mut g-xs">Motivo: {REPORT_PT[r.reason]} · por {r.reporter} · {dt(r.created_at)}</p>
      {r.details && <p className="g-sm">{r.details}</p>}
      {r.target && <div className="g-msg" style={{ maxWidth: '100%' }}><span className="g-xs g-mut">Autor: {r.target.author} · status {r.target.status}</span><p className="g-sm">{r.target.title ? <b>{r.target.title}: </b> : null}{r.target.body}</p></div>}
      {r.status !== 'resolvida' ? <Tools style={{ marginTop: 8 }}>
        {r.status === 'pendente' && <Btn v="ghost" small onClick={() => decide(r, 'em_analise')}>Em análise</Btn>}
        <Btn v="ghost" small onClick={() => decide(r, 'manter')}>Manter</Btn>
        <Btn v="ghost" small onClick={() => decide(r, 'correcao')}>Solicitar correção</Btn>
        <Btn small onClick={() => decide(r, 'ocultar')} data-testid="hide">Ocultar</Btn>
        <Btn v="danger" small onClick={() => decide(r, 'remover')}>Remover</Btn>
        {r.target_type === 'post' && <Btn v="danger" small onClick={() => decide(r, 'restringir')}>Restringir publicação</Btn>}
      </Tools> : <p className="g-xs g-acc">Decisão: {r.decision} — {r.decision_reason}</p>}
    </div>) : <Empty icon="check">Nenhuma denúncia aqui.</Empty>}</Card>}
  </div>
}
EXTRA.moderacao = Moderacao
