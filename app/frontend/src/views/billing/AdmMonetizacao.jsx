// Monetizacao F7: Administração > Monetização (9 submenus). Reaproveita as telas de Cobrança (planos, assinaturas,
// cupons/campanhas, parceiros) e acrescenta painel, testes, indicações, conversões, auditoria e suspeitas de fraude.
import { useState, useEffect } from 'react'
import { api } from '../../lib/api.js'
import { brl } from './Billing.jsx'
import { Planos, Cupons, Parceiros, Assinaturas } from './AdmBilling.jsx'
import AdmFraude from './AdmFraude.jsx'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
function useGet(path) { const [d, setD] = useState(null), [e, setE] = useState(null); const load = () => api(path).then(setD).catch(x => setE(x.message)); useEffect(() => { load() }, [path]); return [d, e, load] }
const dt = s => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'
const money = c => brl(c || 0)
function Msg({ m }) { return m ? <p className={m.ok ? 'bl-ok' : 'bl-err'} role="status">{m.t}</p> : null }
function Table({ cols, rows, testid }) {
  if (!rows) return <p>Carregando…</p>
  if (!rows.length) return <p className="g-mut">Nada por aqui ainda.</p>
  return <div style={{ overflowX: 'auto' }}><table className="bl-table" data-testid={testid} style={{ width: '100%' }}><thead><tr>{cols.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.id || i}>{cols.map(([k, , f]) => <td key={k}>{f ? f(r) : (r[k] ?? '—')}</td>)}</tr>)}</tbody></table></div>
}

const T = [['geral', 'Visão geral'], ['planos', 'Planos'], ['assinaturas', 'Assinaturas'], ['cupons', 'Cupons'], ['indicacoes', 'Indicações'], ['influenciadores', 'Influenciadores'], ['conversoes', 'Conversões'], ['auditoria', 'Auditoria'], ['fraude', 'Suspeitas de fraude']]
export default function AdmMonetizacao() {
  const [sub, setSub] = useState('geral')
  return <div data-testid="adm-monetizacao">
    <div className="mg-subtabs" role="tablist" style={{ flexWrap: 'wrap' }}>{T.map(([k, l]) => <button key={k} role="tab" aria-selected={sub === k} className={'adm-btn ' + (sub === k ? '' : 'ghost')} onClick={() => setSub(k)} data-testid={'mon-tab-' + k}>{l}</button>)}</div>
    {sub === 'geral' && <Geral />}{sub === 'planos' && <Planos />}{sub === 'assinaturas' && <Assinaturas />}
    {sub === 'cupons' && <CuponsV2 />}{sub === 'indicacoes' && <Indicacoes />}{sub === 'influenciadores' && <Influenciadores />}
    {sub === 'conversoes' && <Conversoes />}{sub === 'auditoria' && <Auditoria />}{sub === 'fraude' && <AdmFraude />}
  </div>
}

function Kpi({ l, v, hint, testid }) { return <div className="adm-card" style={{ padding: 12 }} data-testid={testid}><span className="g-xs g-mut">{l}</span><br /><b style={{ fontSize: 22 }}>{v}</b>{hint && <><br /><span className="g-xs g-mut">{hint}</span></>}</div> }
function Geral() {
  const today = new Date().toISOString().slice(0, 10), ago = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [f, setF] = useState({ from: ago, to: today, plan: '', channel: '' })
  const qs = new URLSearchParams({ from: f.from + 'T00:00:00-03:00', to: f.to + 'T23:59:59-03:00', ...(f.plan ? { plan: f.plan } : {}), ...(f.channel ? { channel: f.channel } : {}) }).toString()
  const [d, e] = useGet('/api/adm/monetizacao/overview?' + qs)
  return <div className="ag">
    <div className="adm-row2" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <label className="adm-field">De<input className="adm-in" type="date" value={f.from} onChange={x => setF({ ...f, from: x.target.value })} /></label>
      <label className="adm-field">Até<input className="adm-in" type="date" value={f.to} onChange={x => setF({ ...f, to: x.target.value })} /></label>
      <label className="adm-field">Plano<select className="adm-in" value={f.plan} onChange={x => setF({ ...f, plan: x.target.value })}><option value="">Todos</option><option value="individual">Individual</option><option value="pro">Personal 15</option><option value="pro_ilimitado">Personal Ilimitado</option></select></label>
      <label className="adm-field">Canal<input className="adm-in" value={f.channel} placeholder="ex.: instagram" onChange={x => setF({ ...f, channel: x.target.value })} /></label>
    </div>
    {e ? <p className="bl-err">{e}</p> : !d ? <p>Carregando…</p> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 10 }} data-testid="mon-kpis">
        <Kpi l="Assinantes ativos" v={d.assinaturas.ativas} testid="kpi-ativos" />
        <Kpi l="Em teste agora" v={d.testes.em_teste} testid="kpi-teste" />
        <Kpi l="Testes expirados (período)" v={d.testes.expirados_periodo} />
        <Kpi l="Conversão teste → assinatura" v={d.testes.conversao_pct + '%'} hint={`${d.testes.convertidos_periodo} de ${d.testes.iniciados_periodo}`} />
        <Kpi l="Receita confirmada" v={money(d.receita.receita_confirmada)} hint="só pagamentos reais" testid="kpi-receita" />
        <Kpi l="MRR estimado" v={money(d.assinaturas.mrr_estimado)} hint="estimativa, não é dinheiro recebido" />
        <Kpi l="Em tolerância" v={d.assinaturas.tolerancia} /><Kpi l="Vencidas" v={d.assinaturas.vencidas} />
        <Kpi l="Cancelamentos (período)" v={d.cancelamentos_periodo} />
        <Kpi l="Cupons ativos / resgates" v={`${d.cupons.ativos} / ${d.cupons.resgates_periodo}`} />
        <Kpi l="Suspeitas abertas" v={d.suspeitas_abertas} testid="kpi-fraude" />
      </div>
      {(d.receita.receita_simulada > 0 || d.assinaturas.mrr_simulado > 0) && <p className="bl-warn" data-testid="mon-simulado">Simulador (teste, sem dinheiro real): {money(d.receita.receita_simulada)} em cobranças simuladas; MRR simulado {money(d.assinaturas.mrr_simulado)}. Não entra na receita.</p>}
      <h3 style={{ marginTop: 14 }}>Melhores indicadores</h3>
      <Table testid="mon-top" rows={d.top_indicadores} cols={[['name', 'Indicador'], ['cadastros', 'Cadastros'], ['testes', 'Testes'], ['pagas_reais', 'Assinaturas pagas'], ['conversao_pct', 'Conversão', r => r.conversao_pct + '%'], ['receita_liquida', 'Receita líquida', r => money(r.receita_liquida)]]} />
      <p className="g-xs g-mut">{d.avisos.join(' ')}</p>
    </>}
  </div>
}

function CuponsV2() {
  const [d, e, load] = useGet('/api/adm/monetizacao/cupons'), [camps] = useGet('/api/adm/billing/campaigns'), [m, setM] = useState(null), [hist, setHist] = useState(null)
  const [f, setF] = useState({ campaign_id: '', code: '', kind: 'teste', owner_email: '', eligible_audience: '', eligible_plans: [], channel: '', max_redemptions: '', ends_at: '', notes: '' })
  const [testes, , loadT] = useGet('/api/adm/monetizacao/testes')
  async function create() {
    try {
      let owner_user_id
      if (f.owner_email.trim()) { const u = await api('/api/adm/users?q=' + encodeURIComponent(f.owner_email.trim())); owner_user_id = (u.users || []).find(x => (x.email || '').toLowerCase() === f.owner_email.trim().toLowerCase())?.id; if (!owner_user_id) throw new Error('Usuário responsável não encontrado pelo e-mail.') }
      await post('/api/adm/billing/codes', { ...f, owner_user_id, max_redemptions: f.max_redemptions || null, ends_at: f.ends_at ? f.ends_at + 'T23:59:59-03:00' : null, eligible_audience: f.eligible_audience || null })
      setM({ ok: true, t: 'Cupom criado.' }); setF({ ...f, code: '' }); load()
    } catch (x) { setM({ ok: false, t: x.message }) }
  }
  async function status(id, s) { const reason = s === 'ativo' ? '' : prompt2(); try { await post('/api/adm/billing/codes/status', { id, status: s, reason }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  const prompt2 = () => 'alterado pelo admin'
  async function revokeTrial(id) { try { await post('/api/adm/monetizacao/testes/revogar', { id, reason: 'revogado pelo admin no painel' }); loadT() } catch (x) { setM({ ok: false, t: x.message }) } }
  return <div className="ag">
    <Msg m={m} />
    <div className="adm-card"><h3>Novo cupom</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
        <label className="adm-field">Campanha<select className="adm-in" value={f.campaign_id} onChange={x => setF({ ...f, campaign_id: x.target.value })} data-testid="cv2-campaign"><option value="">Escolha</option>{(camps?.campaigns || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="adm-field">Código<input className="adm-in" value={f.code} onChange={x => setF({ ...f, code: x.target.value.toUpperCase() })} data-testid="cv2-code" /></label>
        <label className="adm-field">Tipo<select className="adm-in" value={f.kind} onChange={x => setF({ ...f, kind: x.target.value })} data-testid="cv2-kind"><option value="teste">Período gratuito</option><option value="indicacao">Indicação + responsável</option></select></label>
        <label className="adm-field">Usuário responsável (e-mail){f.kind === 'indicacao' ? ' *' : ''}<input className="adm-in" value={f.owner_email} onChange={x => setF({ ...f, owner_email: x.target.value })} data-testid="cv2-owner" /></label>
        <label className="adm-field">Perfil<select className="adm-in" value={f.eligible_audience} onChange={x => setF({ ...f, eligible_audience: x.target.value })}><option value="">Aluno e profissional</option><option value="aluno">Só aluno</option><option value="profissional">Só profissional</option></select></label>
        <label className="adm-field">Canal<input className="adm-in" value={f.channel} placeholder="instagram, academia…" onChange={x => setF({ ...f, channel: x.target.value })} /></label>
        <label className="adm-field">Limite de usos<input className="adm-in" type="number" min="1" value={f.max_redemptions} onChange={x => setF({ ...f, max_redemptions: x.target.value })} /></label>
        <label className="adm-field">Válido até<input className="adm-in" type="date" value={f.ends_at} onChange={x => setF({ ...f, ends_at: x.target.value })} /></label>
        <label className="adm-field">Observações<input className="adm-in" value={f.notes} onChange={x => setF({ ...f, notes: x.target.value })} /></label>
      </div>
      <button className="adm-btn" onClick={create} disabled={!f.campaign_id || f.code.length < 3} data-testid="cv2-create">Criar cupom</button>
      <p className="g-xs g-mut">Campanhas (datas e limite total) ficam em Cobrança › Cupons e campanhas.</p></div>
    {e ? <p className="bl-err">{e}</p> : <Table testid="cv2-list" rows={d?.cupons} cols={[['code', 'Código'], ['kind', 'Tipo'], ['status', 'Status'], ['owner_name', 'Responsável'], ['campaign', 'Campanha'], ['channel', 'Canal'],
      ['uso', 'Usos', r => `${r.redemptions_count}${r.max_redemptions ? '/' + r.max_redemptions : ''}`], ['testes', 'Testes'], ['convertidos', 'Convertidos'], ['ends_at', 'Validade', r => dt(r.ends_at)],
      ['acoes', 'Ações', r => <span style={{ display: 'flex', gap: 4 }}>{r.status !== 'ativo' && <button className="adm-btn ghost" onClick={() => status(r.id, 'ativo')}>Ativar</button>}{r.status === 'ativo' && <button className="adm-btn ghost" onClick={() => status(r.id, 'pausado')}>Suspender</button>}{r.status !== 'revogado' && <button className="adm-btn ghost" onClick={() => status(r.id, 'revogado')}>Revogar</button>}<button className="adm-btn ghost" onClick={() => api('/api/adm/monetizacao/cupons/historico?id=' + r.id).then(h => setHist({ code: r.code, rows: h.historico }))}>Histórico</button></span>]]} />}
    {hist && <div className="adm-card"><h3>Histórico de {hist.code}</h3><Table rows={hist.rows} cols={[['created_at', 'Quando', r => dt(r.created_at)], ['actor', 'Quem'], ['action', 'Ação'], ['reason', 'Motivo'], ['after', 'Depois', r => <code className="g-xs">{JSON.stringify(r.after).slice(0, 80)}</code>]]} /><button className="adm-btn ghost" onClick={() => setHist(null)}>Fechar</button></div>}
    <h3 style={{ marginTop: 14 }}>Períodos gratuitos concedidos</h3>
    <Table testid="cv2-trials" rows={testes?.testes} cols={[['name', 'Pessoa'], ['audience', 'Perfil'], ['plan_id', 'Plano'], ['source', 'Origem'], ['code', 'Cupom'], ['ends_at', 'Termina', r => dt(r.ends_at)], ['status', 'Status'], ['x', '', r => r.status === 'ativo' ? <button className="adm-btn ghost" onClick={() => revokeTrial(r.id)}>Revogar</button> : null]]} />
    <details style={{ marginTop: 12 }}><summary>Campanhas e cupons de desconto (tela clássica)</summary><Cupons /></details>
  </div>
}

function Indicacoes() {
  const [d, e, load] = useGet('/api/adm/monetizacao/indicacoes'), [m, setM] = useState(null), [f, setF] = useState(null)
  async function save() { try { await post('/api/adm/monetizacao/indicacoes/alterar', f); setM({ ok: true, t: 'Indicador alterado (auditado).' }); setF(null); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  return <div className="ag"><Msg m={m} />
    <p className="g-xs g-mut">Regra: vale o primeiro indicador válido (link ou cupom), nunca sobrescrito automaticamente. Só o admin pode trocar, com motivo registrado.</p>
    {e ? <p className="bl-err">{e}</p> : <Table testid="mon-indicacoes" rows={d?.indicacoes} cols={[['indicado', 'Indicado'], ['indicador', 'Indicador'], ['source', 'Origem'], ['rule', 'Regra'], ['attributed_at', 'Quando', r => dt(r.attributed_at)], ['alterado_por', 'Alterado por', r => r.alterado_por ? `${r.alterado_por} (${r.change_reason})` : '—'],
      ['x', '', r => <button className="adm-btn ghost" onClick={() => setF({ user_id: r.user_id, referrer_user_id: '', reason: '' })}>Trocar</button>]]} />}
    {f && <div className="adm-card"><h3>Trocar indicador</h3>
      <label className="adm-field">ID do novo indicador<input className="adm-in" value={f.referrer_user_id} onChange={x => setF({ ...f, referrer_user_id: x.target.value.trim() })} /></label>
      <label className="adm-field">Motivo<input className="adm-in" value={f.reason} onChange={x => setF({ ...f, reason: x.target.value })} /></label>
      <button className="adm-btn" onClick={save}>Salvar</button> <button className="adm-btn ghost" onClick={() => setF(null)}>Cancelar</button></div>}
  </div>
}
function Influenciadores() {
  const [d] = useGet('/api/adm/monetizacao/overview')
  return <div className="ag"><h3>Desempenho por indicador (30 dias)</h3>
    <Table rows={d?.top_indicadores} cols={[['name', 'Indicador'], ['cadastros', 'Cadastros'], ['testes', 'Testes'], ['pagas_reais', 'Pagas (reais)'], ['pagas_simuladas', 'Pagas (simulador)'], ['receita_liquida', 'Receita líquida', r => money(r.receita_liquida)]]} />
    <h3 style={{ marginTop: 14 }}>Programa de parceiros (comissão)</h3><Parceiros /></div>
}
function Conversoes() {
  const [d, e] = useGet('/api/adm/monetizacao/conversoes')
  const K = { teste: 'Teste', assinatura: 'Assinatura', pagamento: 'Pagamento', cancelamento: 'Cancelamento', reembolso: 'Reembolso' }
  return <div className="ag">{e ? <p className="bl-err">{e}</p> : <Table testid="mon-conversoes" rows={d?.conversoes} cols={[['created_at', 'Quando', r => dt(r.created_at)], ['indicado', 'Indicado'], ['indicador', 'Indicador'], ['kind', 'Evento', r => K[r.kind] || r.kind], ['amount_cents', 'Valor', r => r.amount_cents != null ? money(r.amount_cents) : '—'], ['live', 'Real?', r => r.live ? 'Sim' : 'Simulador/sem valor']]} />}</div>
}
function Auditoria() {
  const [d, e] = useGet('/api/adm/monetizacao/auditoria')
  return <div className="ag">{e ? <p className="bl-err">{e}</p> : <Table testid="mon-auditoria" rows={d?.auditoria} cols={[['created_at', 'Quando', r => dt(r.created_at)], ['actor', 'Quem', r => r.actor || 'sistema'], ['action', 'Ação'], ['entity', 'Entidade'], ['data', 'Dados', r => <code className="g-xs">{JSON.stringify(r.data || {}).slice(0, 90)}</code>]]} />}</div>
}
