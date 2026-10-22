// V5 cobranca (admin): politica, planos/precos/recursos, cupons e campanhas, parceiros, assinaturas, cobrancas,
// webhooks, reconciliacao e simulador. Tudo auditado no servidor (audit_log).
import { useState, useEffect } from 'react'
import { api } from '../../lib/api.js'
import { FEAT, brl } from './Billing.jsx'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
const dBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
function useGet(path) { const [d, setD] = useState(null), [e, setE] = useState(null); const load = () => api(path).then(setD).catch(x => setE(x.message)); useEffect(() => { load() }, [path]); return [d, e, load] }
function Msg({ m }) { return m ? <p className={m.ok ? 'bl-ok' : 'bl-err'} role="status" data-testid="adm-billing-msg">{m.t}</p> : null }

export default function AdmBilling() {
  const [sub, setSub] = useState('geral')
  const T = [['geral', 'Visão geral'], ['planos', 'Planos e preços'], ['cupons', 'Cupons e campanhas'], ['parceiros', 'Parceiros'], ['assinaturas', 'Assinaturas e cobranças']]
  return <div data-testid="adm-billing">
    <div className="mg-subtabs" role="tablist">{T.map(([k, l]) => <button key={k} role="tab" aria-selected={sub === k} className={'adm-btn ' + (sub === k ? '' : 'ghost')} onClick={() => setSub(k)} data-testid={'bill-tab-' + k}>{l}</button>)}</div>
    {sub === 'geral' && <Geral />}{sub === 'planos' && <Planos />}{sub === 'cupons' && <Cupons />}{sub === 'parceiros' && <Parceiros />}{sub === 'assinaturas' && <Assinaturas />}
  </div>
}

function Geral() {
  const [d, e, load] = useGet('/api/adm/billing/overview'), [f, setF] = useState(null), [m, setM] = useState(null), [diag, setDiag] = useState(null)
  useEffect(() => { if (d) setF({ monetizacao_ativa: !!d.policy.monetizacao_ativa, carencia_dias: d.policy.cobranca_carencia_dias, retentativas_dias: (d.policy.cobranca_retentativas_dias || []).join(','), experimental_dias: d.policy.experimental_dias, parceiros_comissao_pct: d.policy.parceiros_comissao_pct, aviso_fim_teste_dias: d.policy.aviso_fim_teste_dias }) }, [d])
  if (e) return <p className="bl-err">{e}</p>; if (!d || !f) return <p>Carregando…</p>
  const pv = d.provider
  async function save() { try { await post('/api/adm/billing/settings', { ...f, retentativas_dias: String(f.retentativas_dias).split(',').map(s => +s.trim()).filter(Boolean) }); setM({ ok: true, t: 'Política salva.' }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  async function reconcile() { try { const r = await post('/api/adm/billing/reconcile'); setM({ ok: true, t: 'Reconciliação concluída: ' + JSON.stringify(r.reconcile) }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  async function replay(id) { try { const r = await post('/api/adm/billing/webhooks/replay', { id }); setM({ ok: true, t: 'Reprocessado: ' + JSON.stringify(r) }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  async function diagnosticar() { try { setDiag(await api('/api/adm/billing/asaas-diagnostico')) } catch (x) { setM({ ok: false, t: x.message }) } }
  return <div className="ag">
    <Msg m={m} />
    <div className="adm-card" data-testid="billing-provider"><h3>Provedor de pagamento</h3>
      <p><b>{pv.label}</b> {pv.test ? <span className="g-chip">TESTE — nenhum valor real</span> : pv.live ? <span className="g-chip">PRODUÇÃO</span> : null}</p>
      {pv.fallback_reason && <p className="bl-warn">Usando o simulador: {pv.fallback_reason}</p>}
      {pv.warnings?.map((w, i) => <p key={i} className="bl-warn">{w}</p>)}
      <p className="g-xs g-mut">{pv.provider === 'infinitepay' ? 'O webhook é sempre confirmado pela consulta oficial payment_check; a API Key não é exposta ao navegador.' : `Webhook com token: ${pv.webhook_token_set ? 'configurado' : 'não configurado'}.`} A troca de provedor é feita somente por variáveis de ambiente no servidor.</p>
      {pv.provider === 'infinitepay' && <p className="bl-info">Renovação por nova cobrança mensal. Cartão e Pix são preenchidos no checkout da InfinitePay. Novas comissões de parceiros estão pausadas.</p>}
      <button className="adm-btn" onClick={reconcile} data-testid="billing-reconcile">Reconciliar agora</button></div>
    <div className="adm-card"><h3>Política de cobrança</h3>
      <label className="g-row"><input type="checkbox" checked={f.monetizacao_ativa} onChange={e => setF({ ...f, monetizacao_ativa: e.target.checked })} data-testid="pol-monet" /> Monetização ativa (exige plano para os recursos pagos)</label>
      <div className="adm-row2">
        <label className="adm-field">Carência (dias)<input className="adm-in" type="number" value={f.carencia_dias} onChange={e => setF({ ...f, carencia_dias: e.target.value })} /></label>
        <label className="adm-field">Retentativas (dias, separados por vírgula)<input className="adm-in" value={f.retentativas_dias} onChange={e => setF({ ...f, retentativas_dias: e.target.value })} /></label>
        <label className="adm-field">Duração padrão para cupons antigos (dias)<input className="adm-in" type="number" value={f.experimental_dias} onChange={e => setF({ ...f, experimental_dias: e.target.value })} /></label>
        <label className="adm-field">Comissão padrão de parceiros (%)<input className="adm-in" type="number" value={f.parceiros_comissao_pct} onChange={e => setF({ ...f, parceiros_comissao_pct: e.target.value })} /></label>
        <label className="adm-field">Aviso de fim do teste (dias antes)<input className="adm-in" type="number" value={f.aviso_fim_teste_dias} onChange={e => setF({ ...f, aviso_fim_teste_dias: e.target.value })} /></label>
      </div><button className="adm-btn" onClick={save} data-testid="pol-save">Salvar política</button></div>
    <div className="adm-card"><h3>Resumo</h3>
      <p>Assinaturas: {d.subscriptions.map(s => `${s.product} ${s.status}: ${s.n}`).join(' · ') || 'nenhuma'}</p>
      <p>Cobranças (30 dias): {d.charges_30d.map(c => `${c.status}: ${c.n} (${brl(c.total)})`).join(' · ') || 'nenhuma'}</p>
      <p>Cupons ativos: {d.coupons?.ativos ?? 0} · resgates: {d.coupons?.resgates ?? 0} · conversões: {d.coupons?.conversoes ?? 0}</p></div>
    <div className="adm-card"><h3>Webhooks recentes</h3>
      {d.webhook_rejected?.n > 0 && <p className="bl-warn" data-testid="webhook-rejeitado">O Asaas tentou entregar {d.webhook_rejected.n} evento(s) e foi recusado ({d.webhook_rejected.reason === 'token_invalido' ? 'token do webhook diferente do configurado no servidor' : 'webhook sem token no servidor'}); última vez em {dBR(d.webhook_rejected.last_at)}. Confira o token cadastrado em Integrações → Webhooks no painel do Asaas — depois de várias recusas o Asaas interrompe a fila.</p>}
      {(pv.provider === 'asaas' || pv.provider === 'infinitepay') && <p><button className="adm-btn ghost" onClick={diagnosticar} data-testid="asaas-diag">Diagnosticar legado Asaas</button></p>}
      {diag && <div className="g-xs" data-testid="asaas-diag-saida">
        {diag.errors?.map((x, i) => <p key={i} className="bl-err">{x.step}: {x.code} — {x.message}</p>)}
        {!diag.webhooks?.length && !diag.errors?.length && <p className="bl-warn">Nenhum webhook cadastrado na conta Asaas.</p>}
        {diag.webhooks?.map(w => <p key={w.id} className={w.interrupted || w.auth_token_matches === false ? 'bl-warn' : 'g-mut'}>
          {w.name || w.id}: {w.enabled ? 'ativo' : 'desativado'}{w.interrupted ? ' · FILA INTERROMPIDA' : ''}{w.auth_token_matches === false ? ' · token diferente do servidor' : ''} · {w.events?.length || 0} eventos · {w.url}
        </p>)}
      </div>}
      <div className="adm-tbl-wrap"><table className="adm-table"><thead><tr><th>Recebido</th><th>Provedor</th><th>Evento</th><th>Resultado</th><th></th></tr></thead>
      <tbody>{d.webhooks.map(w => <tr key={w.id}><td>{dBR(w.received_at)}</td><td>{w.provider}</td><td>{w.event_type}</td><td>{w.result}{w.error ? ' — ' + w.error : ''}</td><td><button className="adm-btn ghost" onClick={() => replay(w.id)}>Reprocessar</button></td></tr>)}</tbody></table></div></div>
  </div>
}

function PlanRow({ p, onSaved }) {
  const [f, setF] = useState({ name: p.name, description: p.description || '', price: p.price_cents == null ? '' : (p.price_cents / 100).toFixed(2), sellable: !!p.sellable, active: !!p.active, features: { ...(p.features || {}) }, alunos: p.limits?.alunos_ativos ?? '', unlimited: p.audience === 'profissional' && p.limits?.alunos_ativos == null })
  const [m, setM] = useState(null)
  const featKeys = p.audience === 'aluno' ? ['catalogo_completo'] : ['prescrever', 'convidar_alunos', 'construtor_treino', 'fichas_publicas']
  async function save() {
    try {
      const body = { id: p.id, name: f.name, description: f.description, sellable: f.sellable, active: f.active, features: f.features }
      if (!p.is_free) body.price_cents = f.price === '' ? null : Math.round(+String(f.price).replace(',', '.') * 100)
      if (p.audience === 'profissional') body.limits = { ...(p.limits || {}), alunos_ativos: f.unlimited ? null : +f.alunos }
      await post('/api/adm/billing/plans', body); setM({ ok: true, t: 'Plano salvo.' }); onSaved()
    } catch (x) { setM({ ok: false, t: x.message }) }
  }
  return <div className="adm-card" data-testid={'adm-plan-' + p.id}>
    <div className="g-row"><b>{p.id}</b><span className="g-chip">{p.audience}</span>{p.is_free && <span className="g-chip">gratuito</span>}<span className="g-sp" /><span className="g-xs g-mut">v{p.version} · {p.subscribers} assinante(s)</span></div>
    <div className="adm-row2">
      <label className="adm-field">Nome<input className="adm-in" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      {!p.is_free && <label className="adm-field">Preço mensal (R$)<input className="adm-in" inputMode="decimal" placeholder="a definir" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} data-testid={'price-' + p.id} /></label>}
      {p.audience === 'profissional' && <><label className="adm-field">Alunos ativos (limite)<input className="adm-in" type="number" min="1" max="10000" disabled={f.unlimited} value={f.alunos} onChange={e => setF({ ...f, alunos: e.target.value })} /></label><label className="adm-field"><span>Capacidade</span><span><input type="checkbox" checked={f.unlimited} onChange={e => setF({ ...f, unlimited: e.target.checked })} /> Alunos ilimitados</span></label></>}
    </div>
    <label className="adm-field">Descrição<input className="adm-in" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
    <div className="g-row" style={{ flexWrap: 'wrap', gap: 12, margin: '8px 0' }}>
      {featKeys.map(k => <label key={k} className="g-row g-sm"><input type="checkbox" checked={!!f.features[k]} onChange={e => setF({ ...f, features: { ...f.features, [k]: e.target.checked } })} data-testid={'feat-' + p.id + '-' + k} /> {FEAT[k]}</label>)}
    </div>
    <div className="g-row" style={{ gap: 12 }}>
      {!p.is_free && <label className="g-row g-sm"><input type="checkbox" checked={f.sellable} onChange={e => setF({ ...f, sellable: e.target.checked })} data-testid={'sellable-' + p.id} /> À venda</label>}
      <label className="g-row g-sm"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Ativo</label>
      <span className="g-sp" /><button className="adm-btn" onClick={save} data-testid={'save-' + p.id}>Salvar</button></div>
    <Msg m={m} />
  </div>
}
export function Planos() {
  const [d, e, load] = useGet('/api/adm/billing/plans')
  if (e) return <p className="bl-err">{e}</p>; if (!d) return <p>Carregando…</p>
  return <div className="ag"><p className="adm-sub">Mudanças de recursos ou limites criam uma nova versão: quem já assina continua na versão contratada. Para vender, defina preço maior que zero e marque "À venda".</p>
    {d.plans.filter(p => ['aluno_free', 'profissional_free', 'individual', 'completo', 'pro', 'pro_ilimitado'].includes(p.id)).map(p => <PlanRow key={p.id + p.version + (p.updated_at || '')} p={p} onSaved={load} />)}</div>
}

export function Cupons() {
  const [d, e, load] = useGet('/api/adm/billing/campaigns'), [pt] = useGet('/api/adm/billing/partners'), [m, setM] = useState(null)
  const [c, setC] = useState({ name: '', kind: 'oficial', benefit: 'desconto', discount_pct: 20, discount_cycles: 1, trial_days: '', partner_user_id: '', applies_to: '' })
  const [k, setK] = useState({ campaign_id: '', code: '', max_redemptions: '' })
  const [r, setR] = useState({ owner_user_id: '', audience: 'aluno', trial_days: 7, max_redemptions: 10, ends_at: '', code: '' })
  if (e) return <p className="bl-err">{e}</p>; if (!d) return <p>Carregando…</p>
  const run = async (fn, t) => { try { await fn(); setM({ ok: true, t }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  const makeReferral = async () => { try { const out = await post('/api/adm/billing/referral-coupons', r); setM({ ok: true, t: `Cupom ${out.code.code} criado. Código e link já podem ser copiados abaixo.` }); setR({ owner_user_id: '', audience: 'aluno', trial_days: 7, max_redemptions: 10, ends_at: '', code: '' }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  const linkOf = code => `${location.origin}${location.pathname}#/convite/${encodeURIComponent(code)}`
  const copy = async value => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard indisponível')
      await navigator.clipboard.writeText(value)
      setM({ ok: true, t: 'Copiado.' })
    } catch { setM({ ok: false, t: 'Não foi possível copiar automaticamente.' }) }
  }
  return <div className="ag"><Msg m={m} />
    <div className="adm-card" data-testid="referral-coupon-create"><h3>Gerar cupom de indicação</h3><p className="adm-sub">Crie um código e um link para uma pessoa distribuir. Somente benefícios concedidos consomem o limite.</p><div className="adm-row2">
      <label className="adm-field">Pessoa responsável<select className="adm-in" value={r.owner_user_id} onChange={e => setR({ ...r, owner_user_id: e.target.value })} data-testid="ref-owner"><option value="">Escolha uma conta</option>{(d.owners || []).map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}</select></label>
      <label className="adm-field">Público<select className="adm-in" value={r.audience} onChange={e => setR({ ...r, audience: e.target.value })} data-testid="ref-audience"><option value="aluno">Aluno — Individual</option><option value="profissional">Profissional — PRO</option></select></label>
      <label className="adm-field">Dias de acesso<input className="adm-in" type="number" min="1" max="90" value={r.trial_days} onChange={e => setR({ ...r, trial_days: e.target.value })} data-testid="ref-days" /></label>
      <label className="adm-field">Quantidade de cadastros beneficiados<input className="adm-in" type="number" min="1" value={r.max_redemptions} onChange={e => setR({ ...r, max_redemptions: e.target.value })} data-testid="ref-limit" /></label>
      <label className="adm-field">Validade (opcional)<input className="adm-in" type="datetime-local" value={r.ends_at} onChange={e => setR({ ...r, ends_at: e.target.value })} data-testid="ref-ends" /></label>
      <label className="adm-field">Código personalizado (opcional)<input className="adm-in" value={r.code} onChange={e => setR({ ...r, code: e.target.value.toUpperCase() })} maxLength="32" placeholder="Gerado automaticamente" data-testid="ref-code" /></label>
    </div><button className="adm-btn" onClick={makeReferral} data-testid="ref-create">Gerar cupom e link</button></div>
    <div className="adm-card"><h3>Nova campanha</h3><div className="adm-row2">
      <label className="adm-field">Nome<input className="adm-in" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} data-testid="camp-name" /></label>
      <label className="adm-field">Tipo<select className="adm-in" value={c.kind} onChange={e => setC({ ...c, kind: e.target.value })}><option value="oficial">Oficial</option><option value="parceiro">Parceiro</option></select></label>
      <label className="adm-field">Benefício<select className="adm-in" value={c.benefit} onChange={e => setC({ ...c, benefit: e.target.value })} data-testid="camp-benefit"><option value="desconto">Desconto (%)</option><option value="trial">Acesso experimental</option></select></label>
      {c.benefit === 'desconto' ? <><label className="adm-field">Desconto (%)<input className="adm-in" type="number" value={c.discount_pct} onChange={e => setC({ ...c, discount_pct: e.target.value })} data-testid="camp-pct" /></label>
        <label className="adm-field">Por quantos meses<input className="adm-in" type="number" value={c.discount_cycles} onChange={e => setC({ ...c, discount_cycles: e.target.value })} /></label></>
        : <label className="adm-field">Dias de acesso (vazio = padrão)<input className="adm-in" type="number" value={c.trial_days} onChange={e => setC({ ...c, trial_days: e.target.value })} /></label>}
      {c.kind === 'parceiro' && <label className="adm-field">Parceiro<select className="adm-in" value={c.partner_user_id} onChange={e => setC({ ...c, partner_user_id: e.target.value })}><option value="">Escolha</option>{pt?.partners.map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}</select></label>}
      <label className="adm-field">Vale para os planos (ids, vírgula; vazio = todos)<input className="adm-in" value={c.applies_to} onChange={e => setC({ ...c, applies_to: e.target.value })} /></label>
    </div><button className="adm-btn" data-testid="camp-save" onClick={() => run(() => post('/api/adm/billing/campaigns', { ...c, applies_to: c.applies_to.split(',').map(s => s.trim()).filter(Boolean) }), 'Campanha criada.')}>Criar campanha</button></div>
    <div className="adm-card"><h3>Novo cupom</h3><div className="adm-row2">
      <label className="adm-field">Campanha<select className="adm-in" value={k.campaign_id} onChange={e => setK({ ...k, campaign_id: e.target.value })} data-testid="code-camp"><option value="">Escolha</option>{d.campaigns.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="adm-field">Código<input className="adm-in" value={k.code} onChange={e => setK({ ...k, code: e.target.value.toUpperCase() })} data-testid="code-code" /></label>
      <label className="adm-field">Limite de resgates (vazio = sem limite)<input className="adm-in" type="number" value={k.max_redemptions} onChange={e => setK({ ...k, max_redemptions: e.target.value })} /></label>
    </div><button className="adm-btn" data-testid="code-save" onClick={() => run(() => post('/api/adm/billing/codes', k), 'Cupom criado.')}>Criar cupom</button></div>
    <div className="adm-card"><h3>Campanhas</h3><div className="adm-tbl-wrap"><table className="adm-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Benefício</th><th>Status</th><th>Resgates</th></tr></thead>
      <tbody>{d.campaigns.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.kind}{x.partner_name ? ' · ' + x.partner_name : ''}</td><td>{x.benefit === 'desconto' ? `${+x.discount_pct}% × ${x.discount_cycles}` : `${x.trial_days || 'padrão'} dias`}</td><td>{x.status}</td><td>{x.resgates}</td></tr>)}</tbody></table></div></div>
    <div className="adm-card"><h3>Cupons</h3><div className="adm-tbl-wrap"><table className="adm-table"><thead><tr><th>Código / link</th><th>Responsável</th><th>Benefício</th><th>Status</th><th>Usos</th><th>Conversões</th><th></th></tr></thead>
      <tbody>{d.codes.map(x => <tr key={x.id}><td><code>{x.code}</code>{x.kind === 'indicacao' && <div className="g-row" style={{ gap: 4, marginTop: 4 }}><button className="adm-btn ghost" onClick={() => copy(x.code)}>Copiar código</button><button className="adm-btn ghost" onClick={() => copy(linkOf(x.code))}>Copiar link</button></div>}</td><td>{x.owner_name || x.partner_name || '—'}</td><td>{x.benefit === 'trial' ? `${x.trial_days} dias · ${x.eligible_audience === 'profissional' ? 'PRO' : x.eligible_audience === 'aluno' ? 'Individual' : 'público do cadastro'}` : `${+x.discount_pct}%`}</td><td>{x.status}</td><td>{x.redemptions_count}{x.max_redemptions ? ' / ' + x.max_redemptions : ''}</td><td>{x.conversoes}</td>
        <td>{x.status === 'ativo' ? <button className="adm-btn ghost" onClick={() => run(() => post('/api/adm/billing/codes/status', { id: x.id, status: 'pausado' }), 'Cupom pausado.')}>Pausar</button> : x.status === 'pausado' ? <button className="adm-btn ghost" onClick={() => run(() => post('/api/adm/billing/codes/status', { id: x.id, status: 'ativo' }), 'Cupom reativado.')}>Reativar</button> : null}</td></tr>)}</tbody></table></div></div>
  </div>
}

export function Parceiros() {
  const [d, e, load] = useGet('/api/adm/billing/partners'), [f, setF] = useState({ user_id: '', commission_pct: '', status: 'ativo' }), [m, setM] = useState(null)
  if (e) return <p className="bl-err">{e}</p>; if (!d) return <p>Carregando…</p>
  const save = async b => { try { await post('/api/adm/billing/partners', b); setM({ ok: true, t: 'Parceiro salvo.' }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  return <div className="ag"><Msg m={m} />
    <div className="adm-card"><h3>Aprovar parceiro</h3><div className="adm-row2">
      <label className="adm-field">Profissional<select className="adm-in" value={f.user_id} onChange={e => setF({ ...f, user_id: e.target.value })}><option value="">Escolha</option>{d.candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}</select></label>
      <label className="adm-field">Comissão (%; vazio = padrão)<input className="adm-in" type="number" value={f.commission_pct} onChange={e => setF({ ...f, commission_pct: e.target.value })} /></label>
    </div><button className="adm-btn" onClick={() => save(f)}>Salvar</button></div>
    <div className="adm-card"><div className="adm-tbl-wrap"><table className="adm-table"><thead><tr><th>Parceiro</th><th>Status</th><th>Comissão</th><th>Campanhas</th><th>Comissão prevista</th><th></th></tr></thead>
      <tbody>{d.partners.map(p => <tr key={p.user_id}><td>{p.name}<br /><span className="g-xs g-mut">{p.email}</span></td><td>{p.status}</td><td>{p.commission_pct != null ? +p.commission_pct + '%' : 'padrão'}</td><td>{p.campanhas}</td><td>{brl(p.comissao_prevista)}</td>
        <td><button className="adm-btn ghost" onClick={() => save({ user_id: p.user_id, commission_pct: p.commission_pct, status: p.status === 'ativo' ? 'pausado' : 'ativo' })}>{p.status === 'ativo' ? 'Pausar' : 'Ativar'}</button></td></tr>)}</tbody></table></div></div>
  </div>
}

export function Assinaturas() {
  const [d, e, load] = useGet('/api/adm/billing/subscriptions'), [sel, setSel] = useState(null), [ch, setCh] = useState(null), [m, setM] = useState(null)
  const [all] = useGet('/api/adm/billing/charges')
  const open = async s => { setSel(s); setCh(await api('/api/adm/billing/charges?subscription_id=' + s.id).catch(() => null)) }
  const sim = async (action, s) => { try { const r = await post('/api/adm/billing/simulate', { action, subscription_id: s.id }); setM({ ok: true, t: `Simulado: ${action} → ${r.subscription?.status}` }); load(); open({ ...s, ...r.subscription }) } catch (x) { setM({ ok: false, t: x.message }) } }
  if (e) return <p className="bl-err">{e}</p>; if (!d) return <p>Carregando…</p>
  return <div className="ag"><Msg m={m} />
    <div className="adm-card"><h3>Assinaturas pagas</h3><div className="adm-tbl-wrap"><table className="adm-table" data-testid="adm-subs"><thead><tr><th>Conta</th><th>Plano</th><th>Status</th><th>Valor</th><th>Período até</th><th>Provedor</th><th>Pagamento</th></tr></thead>
      <tbody>{d.subscriptions.map(s => <tr key={s.id} onClick={() => open(s)} style={{ cursor: 'pointer' }}><td>{s.name}<br /><span className="g-xs g-mut">{s.email}</span></td><td>{s.plan_name}</td><td>{s.status}{s.cancel_at_period_end ? ' (cancela no fim)' : ''}</td><td>{s.price_cents != null ? brl(s.price_cents) : '—'}</td><td>{dBR(s.current_period_end)}</td><td>{s.provider}</td><td>{s.last4 ? '•••• ' + s.last4 : s.provider === 'infinitepay' ? 'Checkout' : '—'}</td></tr>)}</tbody></table></div></div>
    {sel && <div className="adm-card" data-testid="adm-sub-detail"><h3>{sel.name} — {sel.plan_name} ({sel.status})</h3>
      <p className="g-xs g-mut">Simulador de tempo (só com o provedor simulado): antecipa o vencimento e roda o job de cobrança na hora.</p>
      <div className="g-row" style={{ flexWrap: 'wrap', gap: 8 }}>{[['vencer_periodo', 'Vencer período (renovar)'], ['vencer_retentativa', 'Vencer retentativa'], ['vencer_carencia', 'Vencer carência']].map(([a, l]) => <button key={a} className="adm-btn ghost" onClick={() => sim(a, sel)} data-testid={'sim-' + a}>{l}</button>)}</div>
      {ch && <><h4>Eventos</h4><ul className="g-sm">{ch.events.map((x, i) => <li key={i}>{dBR(x.created_at)} · {x.action} {x.from_status ? x.from_status + ' → ' + x.to_status : ''}</li>)}</ul></>}
    </div>}
    <div className="adm-card"><h3>Cobranças recentes</h3>{all && <div className="adm-tbl-wrap"><table className="adm-table"><thead><tr><th>Data</th><th>Conta</th><th>Provedor</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Identificadores</th><th>Conciliação</th></tr></thead>
      <tbody>{all.charges.map(c => <tr key={c.id}><td>{dBR(c.created_at)}</td><td>{c.email}</td><td>{c.provider}</td><td>{c.kind}{c.confirmed_payment_method ? ` · ${c.confirmed_payment_method}` : ''}</td><td>{brl(c.amount_cents)}</td><td>{c.status}{c.failure_message ? ' — ' + c.failure_message : ''}</td><td><span className="g-xs">{c.provider_invoice_slug || '—'}<br />{c.provider_transaction_id || c.provider_charge_id || '—'}</span></td><td>{c.reconciliation_error ? <span className="bl-err">{c.reconciliation_error}</span> : dBR(c.last_reconciled_at)}</td></tr>)}</tbody></table></div>}</div>
  </div>
}
