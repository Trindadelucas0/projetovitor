// V5 cobranca (admin): politica, planos/precos/recursos, cupons e campanhas, parceiros, assinaturas, cobrancas,
// webhooks, reconciliacao e simulador. Tudo auditado no servidor (audit_log).
import { useState, useEffect } from 'react'
import { api } from '../../lib/api.js'
import { FEAT, brl } from './Billing.jsx'
import { isStudentPlan } from '../../lib/plans.js'
import { Checkbox, Tag } from 'antd'
import { Btn, TextIn, NumIn, Sel, Card, Warn, Field, STable, DateTimeIn, Msg as KMsg } from '../../ui/kit.jsx'
import StatusTag from '../../ui/StatusTag.jsx'
import SubTabs from '../../ui/SubTabs.jsx'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
const dBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
function useGet(path) { const [d, setD] = useState(null), [e, setE] = useState(null); const load = () => api(path).then(setD).catch(x => setE(x.message)); useEffect(() => { load() }, [path]); return [d, e, load] }
const Msg = ({ m }) => <KMsg m={m} testid="adm-billing-msg" />

export default function AdmBilling() {
  const [sub, setSub] = useState('geral')
  const T = [['geral', 'Visão geral'], ['planos', 'Planos e preços'], ['cupons', 'Cupons'], ['assinaturas', 'Quem está pagando']]
  return <div data-testid="adm-billing">
    <SubTabs items={T} current={sub} onChange={setSub} testids={Object.fromEntries(T.map(([k]) => [k, 'bill-tab-' + k]))} />
    {sub === 'geral' && <Geral />}{sub === 'planos' && <Planos />}{sub === 'cupons' && <Cupons />}{sub === 'assinaturas' && <Assinaturas />}
  </div>
}

function Geral() {
  const [d, e, load] = useGet('/api/adm/billing/overview'), [f, setF] = useState(null), [m, setM] = useState(null), [diag, setDiag] = useState(null)
  useEffect(() => { if (d) setF({ monetizacao_ativa: !!d.policy.monetizacao_ativa, carencia_dias: d.policy.cobranca_carencia_dias, retentativas_dias: (d.policy.cobranca_retentativas_dias || []).join(','), experimental_dias: d.policy.experimental_dias, aviso_fim_teste_dias: d.policy.aviso_fim_teste_dias }) }, [d])
  if (e) return <Warn type="error">{e}</Warn>; if (!d || !f) return <p>Carregando…</p>
  const pv = d.provider
  // Comissão de parceiros não aparece na tela; reenvia o valor já gravado para não zerar.
  async function save() { try { await post('/api/adm/billing/settings', { ...f, parceiros_comissao_pct: d.policy.parceiros_comissao_pct, retentativas_dias: String(f.retentativas_dias).split(',').map(s => +s.trim()).filter(Boolean) }); setM({ ok: true, t: 'Política salva.' }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  async function reconcile() { try { const r = await post('/api/adm/billing/reconcile'); setM({ ok: true, t: 'Reconciliação concluída: ' + JSON.stringify(r.reconcile) }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  async function replay(id) { try { const r = await post('/api/adm/billing/webhooks/replay', { id }); setM({ ok: true, t: 'Reprocessado: ' + JSON.stringify(r) }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  async function diagnosticar() { try { setDiag(await api('/api/adm/billing/asaas-diagnostico')) } catch (x) { setM({ ok: false, t: x.message }) } }
  return <div className="ag">
    <Msg m={m} />
    <Card data-testid="billing-provider"><h3>Provedor de pagamento</h3>
      <p><b>{pv.label}</b> {pv.test ? <Tag color="warning">TESTE — nenhum valor real</Tag> : pv.live ? <Tag color="success">PRODUÇÃO</Tag> : null}</p>
      {pv.fallback_reason && <Warn>Usando o simulador: {pv.fallback_reason}</Warn>}
      {pv.warnings?.map((w, i) => <Warn key={i}>{w}</Warn>)}
      <p className="g-xs g-mut">{pv.provider === 'infinitepay' ? 'O webhook é sempre confirmado pela consulta oficial payment_check; a API Key não é exposta ao navegador.' : `Webhook com token: ${pv.webhook_token_set ? 'configurado' : 'não configurado'}.`} A troca de provedor é feita somente por variáveis de ambiente no servidor.</p>
      {pv.provider === 'infinitepay' && <Warn type="info">Renovação por nova cobrança mensal. Cartão e Pix são preenchidos no checkout da InfinitePay. Novas comissões de parceiros estão pausadas.</Warn>}
      <Btn onClick={reconcile} data-testid="billing-reconcile">Reconciliar agora</Btn></Card>
    <Card><h3>Política de cobrança</h3>
      <Checkbox checked={f.monetizacao_ativa} onChange={e => setF({ ...f, monetizacao_ativa: e.target.checked })} data-testid="pol-monet">Monetização ativa (exige plano para os recursos pagos)</Checkbox>
      <div className="adm-row2">
        <Field label="Carência (dias)"><NumIn value={f.carencia_dias} onChange={e => setF({ ...f, carencia_dias: e.target.value })} /></Field>
        <Field label="Retentativas (dias, separados por vírgula)"><TextIn value={f.retentativas_dias} onChange={e => setF({ ...f, retentativas_dias: e.target.value })} /></Field>
        <Field label="Duração padrão para cupons antigos (dias)"><NumIn value={f.experimental_dias} onChange={e => setF({ ...f, experimental_dias: e.target.value })} /></Field>
        <Field label="Aviso de fim do teste (dias antes)"><NumIn value={f.aviso_fim_teste_dias} onChange={e => setF({ ...f, aviso_fim_teste_dias: e.target.value })} /></Field>
      </div><Btn onClick={save} data-testid="pol-save">Salvar política</Btn></Card>
    <Card><h3>Resumo</h3>
      <p>Assinaturas: {d.subscriptions.map(s => `${s.product} ${s.status}: ${s.n}`).join(' · ') || 'nenhuma'}</p>
      <p>Cobranças (30 dias): {d.charges_30d.map(c => `${c.status}: ${c.n} (${brl(c.total)})`).join(' · ') || 'nenhuma'}</p>
      <p>Cupons ativos: {d.coupons?.ativos ?? 0} · resgates: {d.coupons?.resgates ?? 0} · conversões: {d.coupons?.conversoes ?? 0}</p></Card>
    <Card><h3>Webhooks recentes</h3>
      {d.webhook_rejected?.n > 0 && <Warn data-testid="webhook-rejeitado">O Asaas tentou entregar {d.webhook_rejected.n} evento(s) e foi recusado ({d.webhook_rejected.reason === 'token_invalido' ? 'token do webhook diferente do configurado no servidor' : 'webhook sem token no servidor'}); última vez em {dBR(d.webhook_rejected.last_at)}. Confira o token cadastrado em Integrações → Webhooks no painel do Asaas — depois de várias recusas o Asaas interrompe a fila.</Warn>}
      {(pv.provider === 'asaas' || pv.provider === 'infinitepay') && <p><Btn v="ghost" onClick={diagnosticar} data-testid="asaas-diag">Diagnosticar legado Asaas</Btn></p>}
      {diag && <div className="g-xs" data-testid="asaas-diag-saida">
        {diag.errors?.map((x, i) => <Warn key={i} type="error">{x.step}: {x.code} — {x.message}</Warn>)}
        {!diag.webhooks?.length && !diag.errors?.length && <Warn>Nenhum webhook cadastrado na conta Asaas.</Warn>}
        {diag.webhooks?.map(w => <p key={w.id} className={w.interrupted || w.auth_token_matches === false ? 'orny-warn-text' : 'orny-muted'}>
          {w.name || w.id}: {w.enabled ? 'ativo' : 'desativado'}{w.interrupted ? ' · FILA INTERROMPIDA' : ''}{w.auth_token_matches === false ? ' · token diferente do servidor' : ''} · {w.events?.length || 0} eventos · {w.url}
        </p>)}
      </div>}
      <STable rows={d.webhooks} empty="Nenhum webhook recebido." cols={[{ t: 'Recebido', r: w => dBR(w.received_at) }, { t: 'Provedor', r: w => w.provider }, { t: 'Evento', r: w => w.event_type },
        { t: 'Resultado', r: w => <>{w.result}{w.error ? ' — ' + w.error : ''}</> }, { t: '', align: 'right', r: w => <Btn v="ghost" small onClick={() => replay(w.id)}>Reprocessar</Btn> }]} /></Card>
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
  return <Card data-testid={'adm-plan-' + p.id}>
    <div className="g-row"><b>{p.id}</b><Tag>{p.audience}</Tag>{p.is_free && <Tag>gratuito</Tag>}<span className="g-sp" /><span className="g-xs g-mut">v{p.version} · {p.subscribers} assinante(s)</span></div>
    <div className="adm-row2">
      <Field label="Nome"><TextIn value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      {!p.is_free && <Field label="Preço mensal (R$)"><TextIn inputMode="decimal" placeholder="a definir" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} data-testid={'price-' + p.id} /></Field>}
      {p.audience === 'profissional' && <><Field label="Alunos ativos (limite)"><NumIn min="1" max="10000" disabled={f.unlimited} value={f.alunos} onChange={e => setF({ ...f, alunos: e.target.value })} /></Field><Field label="Capacidade"><Checkbox checked={f.unlimited} onChange={e => setF({ ...f, unlimited: e.target.checked })}>Alunos ilimitados</Checkbox></Field></>}
    </div>
    <Field label="Descrição"><TextIn value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
    <div className="g-row" style={{ flexWrap: 'wrap', gap: 12, margin: '8px 0' }}>
      {featKeys.map(k => <Checkbox key={k} checked={!!f.features[k]} onChange={e => setF({ ...f, features: { ...f.features, [k]: e.target.checked } })} data-testid={'feat-' + p.id + '-' + k}>{FEAT[k]}</Checkbox>)}
    </div>
    <div className="g-row" style={{ gap: 12 }}>
      {!p.is_free && <Checkbox checked={f.sellable} onChange={e => setF({ ...f, sellable: e.target.checked })} data-testid={'sellable-' + p.id}>À venda</Checkbox>}
      <Checkbox checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })}>Ativo</Checkbox>
      <span className="g-sp" /><Btn onClick={save} data-testid={'save-' + p.id}>Salvar</Btn></div>
    <Msg m={m} />
  </Card>
}
export function Planos() {
  const [d, e, load] = useGet('/api/adm/billing/plans')
  if (e) return <Warn type="error">{e}</Warn>; if (!d) return <p>Carregando…</p>
  return <div className="ag"><p className="orny-muted">Básico (mensal) e Completo (pagamento único, 3 meses). Mudanças de recursos criam uma nova versão: quem já assina continua na versão contratada. Para vender, defina preço maior que zero e marque "À venda".</p>
    {d.plans.filter(p => isStudentPlan(p.id)).map(p => <PlanRow key={p.id + p.version + (p.updated_at || '')} p={p} onSaved={load} />)}</div>
}

export function Cupons() {
  const [d, e, load] = useGet('/api/adm/billing/campaigns'), [m, setM] = useState(null)
  const [c, setC] = useState({ name: '', kind: 'oficial', benefit: 'desconto', discount_pct: 20, discount_cycles: 1, trial_days: '', partner_user_id: '', applies_to: '' })
  const [k, setK] = useState({ campaign_id: '', code: '', max_redemptions: '' })
  const [r, setR] = useState({ owner_user_id: '', audience: 'aluno', trial_days: 7, max_redemptions: 10, ends_at: '', code: '' })
  if (e) return <Warn type="error">{e}</Warn>; if (!d) return <p>Carregando…</p>
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
    <Card data-testid="referral-coupon-create"><h3>Gerar cupom de indicação</h3><p className="orny-muted">Crie um código e um link para uma pessoa distribuir. Somente benefícios concedidos consomem o limite.</p><div className="adm-row2">
      <Field label="Pessoa responsável"><Sel value={r.owner_user_id} onChange={e => setR({ ...r, owner_user_id: e.target.value })} data-testid="ref-owner"><option value="">Escolha uma conta</option>{(d.owners || []).map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}</Sel></Field>
      <Field label="Público"><Sel value={r.audience} onChange={e => setR({ ...r, audience: e.target.value })} data-testid="ref-audience"><option value="aluno">Aluno — Básico / Completo</option></Sel></Field>
      <Field label="Dias de acesso"><NumIn min="1" max="90" value={r.trial_days} onChange={e => setR({ ...r, trial_days: e.target.value })} data-testid="ref-days" /></Field>
      <Field label="Quantidade de cadastros beneficiados"><NumIn min="1" value={r.max_redemptions} onChange={e => setR({ ...r, max_redemptions: e.target.value })} data-testid="ref-limit" /></Field>
      <Field label="Validade (opcional)"><DateTimeIn value={r.ends_at} onChange={e => setR({ ...r, ends_at: e.target.value })} data-testid="ref-ends" /></Field>
      <Field label="Código personalizado (opcional)"><TextIn value={r.code} onChange={e => setR({ ...r, code: e.target.value.toUpperCase() })} maxLength="32" placeholder="Gerado automaticamente" data-testid="ref-code" /></Field>
    </div><Btn onClick={makeReferral} data-testid="ref-create">Gerar cupom e link</Btn></Card>
    <Card><h3>Nova campanha</h3><div className="adm-row2">
      <Field label="Nome"><TextIn value={c.name} onChange={e => setC({ ...c, name: e.target.value })} data-testid="camp-name" /></Field>
      <Field label="Benefício"><Sel value={c.benefit} onChange={e => setC({ ...c, benefit: e.target.value })} data-testid="camp-benefit"><option value="desconto">Desconto (%)</option><option value="trial">Acesso experimental</option></Sel></Field>
      {c.benefit === 'desconto' ? <><Field label="Desconto (%)"><NumIn value={c.discount_pct} onChange={e => setC({ ...c, discount_pct: e.target.value })} data-testid="camp-pct" /></Field>
        <Field label="Por quantos meses"><NumIn value={c.discount_cycles} onChange={e => setC({ ...c, discount_cycles: e.target.value })} /></Field></>
        : <Field label="Dias de acesso (vazio = padrão)"><NumIn value={c.trial_days} onChange={e => setC({ ...c, trial_days: e.target.value })} /></Field>}
      <Field label="Vale para os planos (ids, vírgula; vazio = Básico e Completo)"><TextIn value={c.applies_to} onChange={e => setC({ ...c, applies_to: e.target.value })} placeholder="individual, completo" /></Field>
    </div><Btn data-testid="camp-save" onClick={() => run(() => post('/api/adm/billing/campaigns', { ...c, kind: 'oficial', applies_to: c.applies_to.split(',').map(s => s.trim()).filter(Boolean) }), 'Campanha criada.')}>Criar campanha</Btn></Card>
    <Card><h3>Novo cupom</h3><div className="adm-row2">
      <Field label="Campanha"><Sel value={k.campaign_id} onChange={e => setK({ ...k, campaign_id: e.target.value })} data-testid="code-camp"><option value="">Escolha</option>{d.campaigns.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Sel></Field>
      <Field label="Código"><TextIn value={k.code} onChange={e => setK({ ...k, code: e.target.value.toUpperCase() })} data-testid="code-code" /></Field>
      <Field label="Limite de resgates (vazio = sem limite)"><NumIn value={k.max_redemptions} onChange={e => setK({ ...k, max_redemptions: e.target.value })} /></Field>
    </div><Btn data-testid="code-save" onClick={() => run(() => post('/api/adm/billing/codes', k), 'Cupom criado.')}>Criar cupom</Btn></Card>
    <Card><h3>Campanhas</h3><STable rows={d.campaigns} empty="Nenhuma campanha." cols={[{ t: 'Nome', r: x => x.name }, { t: 'Tipo', r: x => x.kind + (x.partner_name ? ' · ' + x.partner_name : '') },
      { t: 'Benefício', r: x => x.benefit === 'desconto' ? `${+x.discount_pct}% × ${x.discount_cycles}` : `${x.trial_days || 'padrão'} dias` }, { t: 'Status', r: x => <StatusTag v={x.status} /> }, { t: 'Resgates', r: x => x.resgates }]} /></Card>
    <Card><h3>Cupons</h3><STable rows={d.codes} empty="Nenhum cupom." cols={[
      { t: 'Código / link', r: x => <><code>{x.code}</code>{x.kind === 'indicacao' && <div className="g-row" style={{ gap: 4, marginTop: 4 }}><Btn v="ghost" small onClick={() => copy(x.code)}>Copiar código</Btn><Btn v="ghost" small onClick={() => copy(linkOf(x.code))}>Copiar link</Btn></div>}</> },
      { t: 'Responsável', r: x => x.owner_name || x.partner_name || '—' },
      { t: 'Benefício', r: x => x.benefit === 'trial' ? `${x.trial_days} dias · ${x.eligible_audience === 'profissional' ? 'PRO' : x.eligible_audience === 'aluno' ? 'Individual' : 'público do cadastro'}` : `${+x.discount_pct}%` },
      { t: 'Status', r: x => <StatusTag v={x.status} /> }, { t: 'Usos', r: x => <>{x.redemptions_count}{x.max_redemptions ? ' / ' + x.max_redemptions : ''}</> }, { t: 'Conversões', r: x => x.conversoes },
      { t: '', align: 'right', r: x => x.status === 'ativo' ? <Btn v="ghost" small onClick={() => run(() => post('/api/adm/billing/codes/status', { id: x.id, status: 'pausado' }), 'Cupom pausado.')}>Pausar</Btn> : x.status === 'pausado' ? <Btn v="ghost" small onClick={() => run(() => post('/api/adm/billing/codes/status', { id: x.id, status: 'ativo' }), 'Cupom reativado.')}>Reativar</Btn> : null }]} /></Card>
  </div>
}

export function Parceiros() {
  const [d, e, load] = useGet('/api/adm/billing/partners'), [f, setF] = useState({ user_id: '', commission_pct: '', status: 'ativo' }), [m, setM] = useState(null)
  if (e) return <Warn type="error">{e}</Warn>; if (!d) return <p>Carregando…</p>
  const save = async b => { try { await post('/api/adm/billing/partners', b); setM({ ok: true, t: 'Parceiro salvo.' }); load() } catch (x) { setM({ ok: false, t: x.message }) } }
  return <div className="ag"><Msg m={m} />
    <Card><h3>Aprovar parceiro</h3><div className="adm-row2">
      <Field label="Profissional"><Sel value={f.user_id} onChange={e => setF({ ...f, user_id: e.target.value })}><option value="">Escolha</option>{d.candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}</Sel></Field>
      <Field label="Comissão (%; vazio = padrão)"><NumIn value={f.commission_pct} onChange={e => setF({ ...f, commission_pct: e.target.value })} /></Field>
    </div><Btn onClick={() => save(f)}>Salvar</Btn></Card>
    <Card><STable rows={d.partners} rowKey="user_id" empty="Nenhum parceiro." cols={[{ t: 'Parceiro', r: p => <>{p.name}<br /><span className="g-xs g-mut">{p.email}</span></> }, { t: 'Status', r: p => <StatusTag v={p.status} /> },
      { t: 'Comissão', r: p => p.commission_pct != null ? +p.commission_pct + '%' : 'padrão' }, { t: 'Campanhas', r: p => p.campanhas }, { t: 'Comissão prevista', r: p => brl(p.comissao_prevista) },
      { t: '', align: 'right', r: p => <Btn v="ghost" small onClick={() => save({ user_id: p.user_id, commission_pct: p.commission_pct, status: p.status === 'ativo' ? 'pausado' : 'ativo' })}>{p.status === 'ativo' ? 'Pausar' : 'Ativar'}</Btn> }]} /></Card>
  </div>
}

export function Assinaturas() {
  const [d, e, load] = useGet('/api/adm/billing/subscriptions'), [sel, setSel] = useState(null), [ch, setCh] = useState(null), [m, setM] = useState(null)
  const [all] = useGet('/api/adm/billing/charges')
  const open = async s => { setSel(s); setCh(await api('/api/adm/billing/charges?subscription_id=' + s.id).catch(() => null)) }
  const sim = async (action, s) => { try { const r = await post('/api/adm/billing/simulate', { action, subscription_id: s.id }); setM({ ok: true, t: `Simulado: ${action} → ${r.subscription?.status}` }); load(); open({ ...s, ...r.subscription }) } catch (x) { setM({ ok: false, t: x.message }) } }
  if (e) return <Warn type="error">{e}</Warn>; if (!d) return <p>Carregando…</p>
  return <div className="ag"><Msg m={m} />
    <Card><h3>Assinaturas pagas</h3><STable testid="adm-subs" rows={d.subscriptions} onRow={open} empty="Nenhuma assinatura paga." cols={[
      { t: 'Conta', r: s => <>{s.name}<br /><span className="g-xs g-mut">{s.email}</span></> }, { t: 'Plano', r: s => s.plan_name },
      { t: 'Status', r: s => <><StatusTag v={s.status} />{s.cancel_at_period_end ? ' (cancela no fim)' : ''}</> }, { t: 'Valor', r: s => s.price_cents != null ? brl(s.price_cents) : '—' },
      { t: 'Período até', r: s => dBR(s.current_period_end) }, { t: 'Provedor', r: s => s.provider }, { t: 'Pagamento', r: s => s.last4 ? '•••• ' + s.last4 : s.provider === 'infinitepay' ? 'Checkout' : '—' }]} /></Card>
    {sel && <Card data-testid="adm-sub-detail"><h3>{sel.name} — {sel.plan_name} ({sel.status})</h3>
      <p className="g-xs g-mut">Simulador de tempo (só com o provedor simulado): antecipa o vencimento e roda o job de cobrança na hora.</p>
      <div className="g-row" style={{ flexWrap: 'wrap', gap: 8 }}>{[['vencer_periodo', 'Vencer período (renovar)'], ['vencer_retentativa', 'Vencer retentativa'], ['vencer_carencia', 'Vencer carência']].map(([a, l]) => <Btn key={a} v="ghost" onClick={() => sim(a, sel)} data-testid={'sim-' + a}>{l}</Btn>)}</div>
      {ch && <><h4>Eventos</h4><ul className="g-sm">{ch.events.map((x, i) => <li key={i}>{dBR(x.created_at)} · {x.action} {x.from_status ? x.from_status + ' → ' + x.to_status : ''}</li>)}</ul></>}
    </Card>}
    <Card><h3>Cobranças recentes</h3>{all ? <STable rows={all.charges} empty="Nenhuma cobrança." cols={[
      { t: 'Data', r: c => dBR(c.created_at) }, { t: 'Conta', r: c => c.email }, { t: 'Provedor', r: c => c.provider }, { t: 'Tipo', r: c => c.kind + (c.confirmed_payment_method ? ` · ${c.confirmed_payment_method}` : '') },
      { t: 'Valor', r: c => brl(c.amount_cents) }, { t: 'Status', r: c => <><StatusTag v={c.status} />{c.failure_message ? ' — ' + c.failure_message : ''}</> },
      { t: 'Identificadores', r: c => <span className="g-xs">{c.provider_invoice_slug || '—'}<br />{c.provider_transaction_id || c.provider_charge_id || '—'}</span> },
      { t: 'Conciliação', r: c => c.reconciliation_error ? <span className="orny-warn-text">{c.reconciliation_error}</span> : dBR(c.last_reconciled_at) }]} /> : <p className="orny-muted">Carregando…</p>}</Card>
  </div>
}
