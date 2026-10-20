import { useState } from 'react'
import { useLoad } from '../app/kit.jsx'
import { P } from '../../lib/care.js'
import './management.css'

const num = n => Number(n || 0).toLocaleString('pt-BR')
const dayLabel = s => s.slice(8,10)+'/'+s.slice(5,7)
const audience = { aluno:'Aluno', profissional:'Profissional' }
const status = { ativa:'Ativa', trial:'Avaliação', suspensa:'Suspensa', cancelada:'Cancelada', inadimplente:'Inativa (situação cadastral)' }
function Trend({ title, rows, comparison, period }) {
  const max = Math.max(1,...rows.map(r=>r.n)), width=640,height=160
  const x=i=>38+i*584/Math.max(1,rows.length-1), y=n=>130-n*105/max
  return <section className="adm-card mg-chart"><h2>{title}</h2>
    <p className="adm-sub">{num(comparison.current)} no período · anterior: {num(comparison.previous)} · {comparison.percent == null?'Variação indisponível (base anterior zero)':`${comparison.percent>0?'+':''}${comparison.percent}%`}</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${comparison.current} nos últimos ${period} dias`}>
      {[0,max].map(n=><g key={n}><line x1="38" x2="622" y1={y(n)} y2={y(n)} stroke="currentColor" opacity=".15"/><text x="30" y={y(n)+4} textAnchor="end">{n}</text></g>)}
      <polyline fill="none" stroke="var(--ag-acc)" strokeWidth="3" points={rows.map((r,i)=>`${x(i)},${y(r.n)}`).join(' ')}/>
      {rows.map((r,i)=><circle key={r.day} cx={x(i)} cy={y(r.n)} r="3" fill="var(--ag-acc)"><title>{dayLabel(r.day)}: {r.n}</title></circle>)}
      <text x="38" y="153">{dayLabel(rows[0].day)}</text><text x="622" y="153" textAnchor="end">{dayLabel(rows.at(-1).day)}</text>
    </svg><p className="adm-sub">Eixo vertical: quantidade · eixo horizontal: data · linha: {title.toLowerCase()}</p>
    <details><summary>Ver valores por dia</summary><ul className="mg-values">{rows.map(r=><li key={r.day}>{dayLabel(r.day)}: <b>{r.n}</b></li>)}</ul></details>
  </section>
}
export default function ManagementDashboard({ go }) {
  const [period,setPeriod]=useState(30)
  const [d,err,reload]=useLoad(()=>P.management(period),[period])
  const ready=d?.period===period
  const k=(label,n,note,to)=><button className="adm-card adm-k" onClick={()=>go(to)}><b>{num(n)}</b><span>{label}</span><small>{note}</small></button>
  return <div className="mg-dashboard" data-testid="management-dashboard">
    <div className="adm-tools mg-period"><label htmlFor="mg-period">Período</label><select id="mg-period" className="adm-in" value={period} onChange={e=>setPeriod(+e.target.value)}>{[7,30,90].map(n=><option key={n} value={n}>Últimos {n} dias</option>)}</select><button className="adm-btn ghost" onClick={reload}>Atualizar</button></div>
    {err?<div role="alert"><p>{err}</p><button className="adm-btn" onClick={reload}>Tentar novamente</button></div>:!ready?<p role="status">Carregando indicadores…</p>:<>
      <h2>Atenção necessária</h2><div className="adm-grid mg-alerts">
        {k('Contas suspensas ou pendentes',d.pending.accounts,'Suspensão administrativa ou cadastro incompleto','usuarios:pendencias')}
        {k('Documentos para revisar',d.pending.verifications,'Verificação profissional opcional','profissionais:verificacoes')}
        {k('Solicitações de vagas',d.pending.requests,'Pedidos atuais em aberto','solicitacoes')}
        {k('Atendimentos atrasados',d.pending.overdue,'Ocorrências e mensagens','filas')}
      </div>
      <h2>Indicadores</h2><div className="adm-grid mg-metrics">
        {k('Contas cadastradas',d.indicators.accounts,'Situação atual · pessoas únicas','usuarios')}
        {k('Novos cadastros',d.comparison.signups.current,`Últimos ${period} dias`,'usuarios')}
        {k('Alunos que treinaram',d.indicators.trainees,`Pessoas únicas · últimos ${period} dias`,'usuarios')}
        {k('Profissionais ativos',d.indicators.professionals,'Situação atual','profissionais')}
        {k('Vínculos ativos',d.indicators.links,'Situação atual','vinculos')}
        {k('Assinaturas ativas',d.indicators.subscriptions,'Situação atual · por área, não pessoas','assinaturas')}
      </div>
      <p className="adm-sub mg-source">Alunos independentes: {num(d.indicators.independent_students)} · alunos de personal: {num(d.indicators.personal_students)}. Uma pessoa com dois papéis aparece nos segmentos correspondentes, uma vez no total de contas.</p>
      <details className="org-details"><summary>Análises detalhadas</summary><div className="adm-row2"><Trend title="Evolução dos cadastros" rows={d.series.signups} comparison={d.comparison.signups} period={period}/><Trend title="Treinos concluídos" rows={d.series.sessions} comparison={d.comparison.sessions} period={period}/></div>
      <div className="adm-row2">
        <section className="adm-card"><h2>Distribuição das assinaturas</h2><p className="adm-sub">Situação atual · quantidade por plano, área e situação</p>
          {!d.subscriptions.length?<p>Nenhuma assinatura registrada.</p>:d.subscriptions.map(s=><div className="mg-bar-row" key={s.plan_id+s.audience+s.status}><div>{s.plan_name} · {audience[s.audience]} · {status[s.status]||s.status}</div><div className="mg-track"><i style={{width:`${s.n/Math.max(1,...d.subscriptions.map(x=>x.n))*100}%`}}/></div><b>{num(s.n)}</b></div>)}
          <p className="adm-sub">Gestão sem cobrança automática.</p>
        </section>
        <section className="adm-card"><h2>Uso de vagas por profissional</h2><p className="adm-sub">Situação atual · alunos ativos / limite do plano + concessões válidas</p>
          <p>{num(d.capacity.finite_used)} de {num(d.capacity.capacity)} vagas finitas · {num(d.capacity.unlimited)} profissional(is) sem limite.</p>
          {!d.occupancy.length?<p>Nenhum profissional ativo.</p>:<div className="mg-occupancy">{d.occupancy.map(p=><div className="mg-bar-row" key={p.user_id}><div>{p.name}{p.over_limit?' · acima do limite':''}</div>{p.effective_limit==null?<span>Sem limite</span>:<div className="mg-track"><i style={{width:`${Math.min(100,p.used/Math.max(1,p.effective_limit)*100)}%`}}/></div>}<b>{num(p.used)}{p.effective_limit==null?' aluno(s)':` / ${num(p.effective_limit)}`}</b></div>)}</div>}
        </section>
      </div>
      </details><p className="adm-sub mg-source">Fonte: registros do sistema · {dayLabel(d.start_date)} a {dayLabel(d.end_date)} · fuso {d.timezone} · apurado em {new Date(d.generated_at).toLocaleString('pt-BR',{timeZone:d.timezone})}. Sessões anuladas, incompletas, corrigidas manualmente e legadas não entram nas métricas.</p>
    </>}
  </div>
}
