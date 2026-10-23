import { useState } from 'react'
import { useLoad } from '../app/kit.jsx'
import { P } from '../../lib/care.js'
import './management.css'
import { Button, Card, Collapse, Alert, Progress, Statistic } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

const num = n => Number(n || 0).toLocaleString('pt-BR')
const dayLabel = s => s.slice(8,10)+'/'+s.slice(5,7)
const status = { ativa:'Ativa', trial:'Avaliação', suspensa:'Suspensa', cancelada:'Cancelada', inadimplente:'Inativa (situação cadastral)' }
function Trend({ title, rows, comparison, period }) {
  const max = Math.max(1,...rows.map(r=>r.n)), width=640,height=160
  const x=i=>38+i*584/Math.max(1,rows.length-1), y=n=>130-n*105/max
  return <Card size="small" className="orny-card mg-chart"><h2>{title}</h2>
    <p className="orny-muted">{num(comparison.current)} no período · anterior: {num(comparison.previous)} · {comparison.percent == null?'Variação indisponível (base anterior zero)':`${comparison.percent>0?'+':''}${comparison.percent}%`}</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${comparison.current} nos últimos ${period} dias`}>
      {[0,max].map(n=><g key={n}><line x1="38" x2="622" y1={y(n)} y2={y(n)} stroke="currentColor" opacity=".15"/><text x="30" y={y(n)+4} textAnchor="end">{n}</text></g>)}
      <polyline fill="none" stroke="var(--ag-acc)" strokeWidth="3" points={rows.map((r,i)=>`${x(i)},${y(r.n)}`).join(' ')}/>
      {rows.map((r,i)=><circle key={r.day} cx={x(i)} cy={y(r.n)} r="3" fill="var(--ag-acc)"><title>{dayLabel(r.day)}: {r.n}</title></circle>)}
      <text x="38" y="153">{dayLabel(rows[0].day)}</text><text x="622" y="153" textAnchor="end">{dayLabel(rows.at(-1).day)}</text>
    </svg><p className="orny-muted">Eixo vertical: quantidade · eixo horizontal: data · linha: {title.toLowerCase()}</p>
    <Collapse ghost size="small" items={[{ key:'v', label:'Ver valores por dia', children:<ul className="mg-values">{rows.map(r=><li key={r.day}>{dayLabel(r.day)}: <b>{r.n}</b></li>)}</ul> }]} />
  </Card>
}
export default function ManagementDashboard({ go }) {
  const [period,setPeriod]=useState(30)
  const [d,err,reload]=useLoad(()=>P.management(period),[period])
  const ready=d?.period===period
  const k=(label,n,note,to)=><Card size="small" hoverable className="orny-card orny-kpi" role="button" tabIndex={0} onClick={()=>go(to)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(to)}}}>
    <Statistic value={n||0} formatter={v=>num(v)} title={label} /><small>{note}</small></Card>
  return <div className="mg-dashboard" data-testid="management-dashboard">
    {/* select nativo mantido de propósito: os testes usam getByLabel('Período').selectOption; estilizado como os campos antd */}
    <div className="orny-tools mg-period"><label htmlFor="mg-period">Período</label><select id="mg-period" className="orny-native-sel" value={period} onChange={e=>setPeriod(+e.target.value)}>{[7,30,90].map(n=><option key={n} value={n}>Últimos {n} dias</option>)}</select><Button icon={<ReloadOutlined />} onClick={reload}>Atualizar</Button></div>
    {err?<Alert type="error" showIcon role="alert" title={err} action={<Button size="small" onClick={reload}>Tentar novamente</Button>} />:!ready?<p role="status">Carregando indicadores…</p>:<>
      <h2>Atenção necessária</h2><div className="orny-grid mg-alerts">
        {k('Contas suspensas ou pendentes',d.pending.accounts,'Suspensão administrativa ou cadastro incompleto','usuarios:pendencias')}
        {k('Atendimentos atrasados',d.pending.overdue,'Ocorrências e mensagens','filas')}
      </div>
      <h2>Indicadores</h2><div className="orny-grid mg-metrics">
        {k('Contas cadastradas',d.indicators.accounts,'Situação atual · pessoas únicas','usuarios')}
        {k('Novos cadastros',d.comparison.signups.current,`Últimos ${period} dias`,'usuarios')}
        {k('Alunos que treinaram',d.indicators.trainees,`Pessoas únicas · últimos ${period} dias`,'usuarios')}
        {k('Vínculos ativos',d.indicators.links,'Situação atual','vinculos')}
        {k('Assinaturas ativas',d.indicators.subscriptions,'Situação atual · Básico e Completo','cobranca')}
      </div>
      <p className="orny-muted mg-source">Alunos do personal: {num(d.indicators.personal_students)}. O personal do ambiente não contrata plano; a cobrança é só do aluno.</p>
      <Collapse className="org-details orny-collapse" items={[{ key:'a', label:'Análises detalhadas', children:<><div className="adm-row2"><Trend title="Evolução dos cadastros" rows={d.series.signups} comparison={d.comparison.signups} period={period}/><Trend title="Treinos concluídos" rows={d.series.sessions} comparison={d.comparison.sessions} period={period}/></div>
      <div className="adm-row2">
        <Card size="small" className="orny-card"><h2>Distribuição das assinaturas</h2><p className="orny-muted">Situação atual · quantidade por plano (Básico / Completo)</p>
          {!d.subscriptions.length?<p>Nenhuma assinatura registrada.</p>:d.subscriptions.filter(s=>s.audience==='aluno').map(s=><div className="mg-bar-row" key={s.plan_id+s.audience+s.status}><div>{s.plan_name} · {status[s.status]||s.status}</div><Progress showInfo={false} strokeColor="var(--ag-acc)" percent={s.n/Math.max(1,...d.subscriptions.filter(x=>x.audience==='aluno').map(x=>x.n))*100} /><b>{num(s.n)}</b></div>)}
          <p className="orny-muted">Básico renova todo mês; Completo é pagamento único de 3 meses.</p>
        </Card>
      </div></> }]} /><p className="orny-muted mg-source">Fonte: registros do sistema · {dayLabel(d.start_date)} a {dayLabel(d.end_date)} · fuso {d.timezone} · apurado em {new Date(d.generated_at).toLocaleString('pt-BR',{timeZone:d.timezone})}. Sessões anuladas, incompletas, corrigidas manualmente e legadas não entram nas métricas.</p>
    </>}
  </div>
}
