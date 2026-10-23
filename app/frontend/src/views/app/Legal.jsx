// Documentos legais renderizados no app (Termos, Privacidade, Profissional, Assinatura, Comunidade).
// Marcadores [razão social], [CNPJ]… são trocados pelos dados da tela admin "Dados da empresa"; o que faltar aparece destacado.
// Também: LegalGate (aceite por checkbox, com reaceite quando a versão muda). A tela do admin está em views/admin/AdmEmpresa.jsx.
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import termos from '../../legal/termos.js'
import privacidade from '../../legal/privacidade.js'
import profissional from '../../legal/profissional.js'
import assinatura from '../../legal/assinatura.js'
import comunidade from '../../legal/comunidade.js'

export const DOCS = {
  termos_uso: { slug: 'termos', title: 'Termos de Uso', text: termos },
  privacidade: { slug: 'privacidade', title: 'Política de Privacidade', text: privacidade },
  profissional: { slug: 'profissional', title: 'Termo do Profissional', text: profissional },
  assinatura: { slug: 'assinatura', title: 'Termos de Assinatura e Pagamento', text: assinatura },
  comunidade: { slug: 'comunidade', title: 'Regras da Comunidade', text: comunidade },
}
export const bySlug = s => Object.entries(DOCS).find(([, d]) => d.slug === s)

const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateBR = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.split('-').reverse().join('/') : s
export function placeholders(company = {}, plans = [], pro = null) {
  const c = company || {}, A = 'a preencher no admin', P = 'a preencher no perfil profissional'
  const prices = (plans || []).length ? plans.map(p => `${p.name}: ${p.is_free ? 'grátis' : p.price_status === 'definido' && p.price_cents != null ? brl(p.price_cents) : 'preço a definir'}`).join('; ') : 'Preço a definir'
  return {
    'razão social': [c.razao_social, A], 'nome fantasia': [c.nome_fantasia, A], 'cnpj': [c.cnpj, A], 'endereço': [c.endereco, A],
    'e-mail de suporte': [c.email_suporte, A], 'e-mail do dpo': [c.email_dpo, A], 'e-mail financeiro': [c.email_financeiro, A],
    'e-mail de moderação': [c.email_moderacao, A], 'canal de cancelamento': [c.url_cancelamento, A], 'foro': [c.foro, A],
    'versão': [c.doc_version, A], 'data de vigência': [dateBR(c.doc_vigencia), A],
    'preços': [prices, ''], 'índice': ['a definir', ''], 'prazo de aviso': ['a definir', ''],
    'provedor e país da vps': [c.hosting_provider_country, A],
    'nome do profissional': [pro?.name, P], 'cpf ou cnpj': [pro?.document, P], 'cref': [pro?.cref, P],
  }
}
function inline(line, map, k) {
  return line.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <b key={i}>{inline(part.slice(2, -2), map, k + i)}</b>
    const m = /^\[([^\]]+)\]$/.exec(part)
    if (m && map[m[1].toLowerCase()]) {
      const [v, miss] = map[m[1].toLowerCase()]
      return v ? <span key={i} data-legal-field={m[1]}>{v}</span> : <mark key={i} className="legal-missing" title={miss} style={{ background: '#ffe08a', color: '#5a4300', borderRadius: 4, padding: '0 4px' }}>[{m[1]} — {miss}]</mark>
    }
    return part
  })
}
export function LegalDoc({ text, map }) {
  const blocks = text.split(/\n\s*\n/)
  return <div className="g-terms legal-doc" data-testid="legal-doc">{blocks.map((b, i) => {
    const t = b.trim(); if (!t) return null
    if (t.startsWith('# ')) return <h1 key={i} className="g-h1" style={{ fontSize: 22 }}>{inline(t.slice(2), map, i)}</h1>
    if (t.startsWith('## ')) return <h3 key={i} style={{ marginTop: 18 }}>{inline(t.slice(3), map, i)}</h3>
    return <p key={i}>{t.split(/ {2}\n|\n/).map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, map, i * 100 + j)}</span>)}</p>
  })}</div>
}
export function useLegalData(withMe) {
  const [d, setD] = useState({ company: null, legalConfig: null, plans: [], me: null })
  useEffect(() => {
    let live = true
    Promise.all([api('/api/legal/company').catch(() => ({})), withMe ? api('/api/legal/me').catch(() => null) : null])
      .then(([c, me]) => live && setD({ company: c.company || {}, legalConfig: c.legal_config || null, plans: c.plans || [], me }))
    return () => { live = false }
  }, [withMe])
  return d
}

// rota pública /legal e /legal/:doc: views/app/LegalPage.jsx (Ant Design, carregada sob demanda)

// tela cheia exibida quando falta aceite da versão vigente (substitui o TermsGate antigo)
export function LegalGate({ onAccepted }) {
  const d = useLegalData(true), map = useMemo(() => placeholders(d.company, d.plans, d.me), [d])
  const [ok1, setOk1] = useState(false), [ok2, setOk2] = useState(false), [health, setHealth] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [open, setOpen] = useState('termos_uso')
  const req = d.me?.legal_required || ['termos_uso', 'privacidade'], isPro = req.includes('profissional')
  const reaccept = d.me && d.me.legal_missing && d.me.legal_missing.length < req.length
  const legalMissing = d.legalConfig?.ready === false ? d.legalConfig.missing || [] : []
  const can = ok1 && (!isPro || ok2) && d.me && legalMissing.length === 0 && !busy
  const accept = async () => {
    setBusy(true); setMsg('')
    try { await api('/api/legal/accept', { method: 'POST', body: JSON.stringify({ version: d.me.legal_version, documents: req, health_consent: health }) }); onAccepted() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <div className="ag g-page" data-testid="terms-gate">
    <h1 className="g-h1">{reaccept ? 'Documentos atualizados' : 'Termos e privacidade'}</h1>
    <p className="g-mut">Para continuar, leia e aceite os documentos abaixo{d.me ? ` (versão ${d.me.legal_version})` : ''}.</p>
    {legalMissing.length > 0 && <p className="g-bad2" data-testid="legal-config-incomplete">Não é possível continuar ainda. A administração precisa preencher em Sistema → Dados da empresa: <b>{legalMissing.map(k => ({ url_cancelamento: 'Canal/URL de cancelamento', hosting_provider_country: 'Provedor e país da hospedagem' })[k] || k).join(' e ')}</b>.</p>}
    {req.map(k => <div key={k} className="g-card" style={{ marginTop: 8 }}>
      <button className="g-btn ghost g-block" onClick={() => setOpen(open === k ? '' : k)} aria-expanded={open === k}>{open === k ? '▾' : '▸'} {DOCS[k].title}</button>
      {open === k && <div style={{ maxHeight: '45vh', overflow: 'auto' }}><LegalDoc text={DOCS[k].text} map={map} /></div>}
    </div>)}
    <div className="g-card" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={ok1} onChange={e => setOk1(e.target.checked)} data-testid="legal-ok-terms" /><span>Li e aceito os <Link to="/legal/termos" target="_blank">Termos de Uso</Link> e a <Link to="/legal/privacidade" target="_blank">Política de Privacidade</Link>. <b>(obrigatório)</b></span></label>
      {isPro && <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={ok2} onChange={e => setOk2(e.target.checked)} data-testid="legal-ok-pro" /><span>Li e aceito o <Link to="/legal/profissional" target="_blank">Termo do Profissional</Link>. <b>(obrigatório)</b></span></label>}
      <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={health} onChange={e => setHealth(e.target.checked)} data-testid="legal-health" /><span>Autorizo o tratamento dos meus dados de saúde (relatos de dor, avaliação física, IMC e fotos de evolução), inclusive o compartilhamento com o profissional vinculado. <i>(opcional — pode ser revogado em Documentos legais)</i></span></label>
    </div>
    {msg && <p className="g-bad2">{msg}</p>}
    <button className="g-btn g-block" disabled={!can} onClick={accept} style={{ marginTop: 14 }} data-testid="legal-continue">{legalMissing.length ? 'Aguardando dados da empresa' : 'Continuar'}</button>
  </div>
}

// AdmEmpresa (tela do admin) foi para views/admin/AdmEmpresa.jsx: usa antd e não pode entrar no chunk inicial.
