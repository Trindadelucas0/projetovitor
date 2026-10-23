// Admin: Dados da empresa (preenchem os documentos legais). Saiu de app/Legal.jsx para não levar antd ao
// chunk inicial (Legal.jsx é importado pelo App para o LegalGate/LegalPage).
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { ask } from '../../lib/dialog.js'
import { DOCS } from '../app/Legal.jsx'
import { Btn, TextIn, Area, DateIn, Tools, Card, Warn, Field, STable } from '../../ui/kit.jsx'

// ---------- admin: Dados da empresa ----------
const FIELDS = [
  ['razao_social', 'Razão social'], ['nome_fantasia', 'Nome fantasia'], ['cnpj', 'CNPJ'], ['chave_pix', 'Chave Pix da empresa'], ['endereco', 'Endereço completo'],
  ['email_suporte', 'E-mail de suporte'], ['email_dpo', 'E-mail do encarregado (DPO)'], ['email_financeiro', 'E-mail financeiro'],
  ['email_moderacao', 'E-mail de moderação'], ['url_cancelamento', 'Canal/URL de cancelamento'], ['foro', 'Foro (cidade/UF)'], ['hosting_provider_country', 'Provedor e país da hospedagem'],
  ['doc_version', 'Versão dos documentos'], ['doc_vigencia', 'Data de vigência'],
]
export default function AdmEmpresa() {
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
    <p className="orny-muted" style={{ marginBottom: 12 }}>Esses dados preenchem automaticamente os Termos de Uso, a Política de Privacidade, o Termo do Profissional, os Termos de Assinatura e as Regras da Comunidade. Todos os campos legais são obrigatórios para salvar. Mudar a <b>versão</b> pede novo aceite a todos.</p>
    <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
      {FIELDS.map(([k, l]) => <Field key={k} label={l} error={errs[k]}>
        <div style={{ display: 'flex', gap: 8 }}>
          {k === 'endereco' ? <Area rows={2} value={f[k] || ''} onChange={e => set(k, e.target.value)} data-testid={'emp-' + k} style={{ flex: 1 }} />
            : k === 'doc_vigencia' ? <DateIn value={f[k] || ''} onChange={e => set(k, e.target.value)} data-testid={'emp-' + k} style={{ flex: 1 }} />
            : <TextIn value={f[k] || ''} onChange={e => set(k, e.target.value)} data-testid={'emp-' + k} style={{ flex: 1 }} placeholder={k === 'cnpj' || k === 'chave_pix' ? '00.000.000/0000-00' : k === 'foro' ? 'Cidade/UF' : ''} status={errs[k] ? 'error' : undefined} />}
          {k === 'cnpj' && <Btn v="ghost" disabled={busy || String(f.cnpj || '').replace(/\D/g, '').length !== 14} onClick={fromCnpj} data-testid="emp-cnpj-fetch">Preencher pela Receita</Btn>}
        </div></Field>)}
    </div>
    {msg && <Warn type={Object.keys(errs).length ? 'error' : 'info'} data-testid="emp-msg" role="status">{msg}</Warn>}
    <Tools style={{ marginTop: 12 }}><Btn disabled={busy} loading={busy} onClick={save} data-testid="emp-save">Salvar</Btn>
      <Btn v="ghost" href="#/legal" target="_blank" rel="noreferrer">Ver documentos</Btn></Tools>
    {!!acc.length && <Card title="Aceites registrados" style={{ marginTop: 16, maxWidth: 720 }}><STable rows={acc} rowKey={a => a.document + a.version} cols={[
      { t: 'Documento', r: a => DOCS[a.document]?.title || (a.document === 'consentimento_saude' ? 'Consentimento de saúde' : a.document) }, { t: 'Versão', r: a => a.version }, { t: 'Aceites', r: a => a.n }]} /></Card>}
  </div>
}
