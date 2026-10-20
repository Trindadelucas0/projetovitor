// Documentos legais renderizados no app (Termos, Privacidade, Profissional, Assinatura, Comunidade).
// Marcadores [razão social], [CNPJ]… são trocados pelos dados da tela admin "Dados da empresa"; o que faltar aparece destacado.
// Também: LegalGate (aceite por checkbox, com reaceite quando a versão muda) e AdmEmpresa (tela do admin).
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { ask } from '../../lib/dialog.js'
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
const bySlug = s => Object.entries(DOCS).find(([, d]) => d.slug === s)

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

// rota pública /legal e /legal/:doc
export function LegalPage({ authed }) {
  const { doc } = useParams(), d = useLegalData(!!authed), hit = doc && bySlug(doc)
  const map = useMemo(() => placeholders(d.company, d.plans, d.me), [d])
  const [hc, setHc] = useState(null), [msg, setMsg] = useState('')
  useEffect(() => { if (d.me) setHc(d.me.health_consent) }, [d.me])
  const toggleHealth = async v => { try { await api('/api/legal/health-consent', { method: 'POST', body: JSON.stringify({ granted: v }) }); setHc(v); setMsg(v ? 'Consentimento registrado.' : 'Consentimento revogado.') } catch (e) { setMsg(e.message) } }
  return <div className="ag g-page" data-testid="legal-page">
    <p><Link to="/legal">Documentos legais</Link>{hit && <> › {hit[1].title}</>}</p>
    {hit ? (d.company ? <div className="g-card"><LegalDoc text={hit[1].text} map={map} /></div> : <p className="g-mut">Carregando…</p>) : <>
      <h1 className="g-h1">Documentos legais</h1>
      <div className="g-card">{Object.values(DOCS).map(x => <p key={x.slug}><Link to={'/legal/' + x.slug} data-testid={'legal-link-' + x.slug}>{x.title}</Link></p>)}</div>
      {authed && d.me && <div className="g-card" style={{ marginTop: 12 }}>
        <b>Consentimento para dados de saúde</b>
        <p className="g-mut g-xs">Relatos de dor, avaliação física, IMC e fotos de evolução. Você pode conceder ou revogar quando quiser.</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!hc} onChange={e => toggleHealth(e.target.checked)} data-testid="legal-health-toggle" />Autorizo o tratamento dos meus dados de saúde</label>
        {msg && <p className="g-mut g-xs">{msg}</p>}
      </div>}
    </>}
  </div>
}

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

// ---------- admin: Dados da empresa ----------
const FIELDS = [
  ['razao_social', 'Razão social'], ['nome_fantasia', 'Nome fantasia'], ['cnpj', 'CNPJ'], ['chave_pix', 'Chave Pix da empresa'], ['endereco', 'Endereço completo'],
  ['email_suporte', 'E-mail de suporte'], ['email_dpo', 'E-mail do encarregado (DPO)'], ['email_financeiro', 'E-mail financeiro'],
  ['email_moderacao', 'E-mail de moderação'], ['url_cancelamento', 'Canal/URL de cancelamento'], ['foro', 'Foro (cidade/UF)'], ['hosting_provider_country', 'Provedor e país da hospedagem'],
  ['doc_version', 'Versão dos documentos'], ['doc_vigencia', 'Data de vigência'],
]
export function AdmEmpresa() {
  const [f, setF] = useState(null), [orig, setOrig] = useState(null), [acc, setAcc] = useState([]), [errs, setErrs] = useState({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api('/api/adm/company').then(r => { setF(r.company); setOrig(r.company); setAcc(r.acceptances || []) }).catch(e => setMsg(e.message))
  useEffect(() => { load() }, [])
  if (!f) return <p className="g-mut">{msg || 'Carregando…'}</p>
  const set = (k, v) => setF({ ...f, [k]: v })
  const fromCnpj = async () => {
    setBusy(true); setMsg(''); setErrs({})
    try {
      const r = await api('/api/adm/company/cnpj?cnpj=' + encodeURIComponent(f.cnpj))
      setF({ ...f, cnpj: r.cnpj, chave_pix: f.chave_pix || r.chave_pix, razao_social: r.razao_social || f.razao_social, nome_fantasia: r.nome_fantasia || f.nome_fantasia, endereco: r.endereco || f.endereco, foro: f.foro || r.foro })
      setMsg('Dados da Receita preenchidos' + (r.situacao ? ` (situação: ${r.situacao})` : '') + '. Revise e clique em Salvar.')
    } catch (e) { setMsg(e.message); if (e.status === 400) setErrs({ cnpj: e.message }) } finally { setBusy(false) }
  }
  const save = async () => {
    const vchg = orig.doc_version !== f.doc_version
    if (vchg && !(await ask('A versão dos documentos mudou: todos os usuários terão de aceitar de novo no próximo acesso. Continuar?'))) return
    setBusy(true); setMsg(''); setErrs({})
    try { const r = await api('/api/adm/company', { method: 'PUT', body: JSON.stringify(f) }); setMsg('Salvo.' + (r.reaccept ? ' Reaceite solicitado aos usuários.' : '')); load() }
    catch (e) { setErrs(e.errors || {}); setMsg(e.message) } finally { setBusy(false) }
  }
  return <div data-testid="adm-empresa">
    <p className="adm-sub">Esses dados preenchem automaticamente os Termos de Uso, a Política de Privacidade, o Termo do Profissional, os Termos de Assinatura e as Regras da Comunidade. Todos os campos legais são obrigatórios para salvar. Mudar a <b>versão</b> pede novo aceite a todos.</p>
    <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
      {FIELDS.map(([k, l]) => <label key={k} className="g-field"><span>{l}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {k === 'endereco' ? <textarea className="adm-in" rows={2} value={f[k] || ''} onChange={e => set(k, e.target.value)} data-testid={'emp-' + k} style={{ flex: 1 }} />
            : <input className="adm-in" type={k === 'doc_vigencia' ? 'date' : 'text'} value={f[k] || ''} onChange={e => set(k, e.target.value)} data-testid={'emp-' + k} style={{ flex: 1 }} placeholder={k === 'cnpj' || k === 'chave_pix' ? '00.000.000/0000-00' : k === 'foro' ? 'Cidade/UF' : ''} />}
          {k === 'cnpj' && <button className="adm-btn ghost" disabled={busy || String(f.cnpj || '').replace(/\D/g, '').length !== 14} onClick={fromCnpj} data-testid="emp-cnpj-fetch">Preencher pela Receita</button>}
        </div>
        {errs[k] && <small className="g-bad2">{errs[k]}</small>}</label>)}
    </div>
    {msg && <p className={Object.keys(errs).length ? 'g-bad2' : 'g-mut'} data-testid="emp-msg">{msg}</p>}
    <div className="adm-tools"><button className="adm-btn" disabled={busy} onClick={save} data-testid="emp-save">Salvar</button>
      <a className="adm-btn ghost" href="#/legal" target="_blank" rel="noreferrer">Ver documentos</a></div>
    {!!acc.length && <><h4>Aceites registrados</h4><table className="adm-tbl"><thead><tr><th>Documento</th><th>Versão</th><th>Aceites</th></tr></thead>
      <tbody>{acc.map(a => <tr key={a.document + a.version}><td>{DOCS[a.document]?.title || (a.document === 'consentimento_saude' ? 'Consentimento de saúde' : a.document)}</td><td>{a.version}</td><td>{a.n}</td></tr>)}</tbody></table></>}
  </div>
}
