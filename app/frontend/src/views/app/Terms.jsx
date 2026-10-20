// Termos de uso versionados: leitura, aceite no cadastro e reaceite quando uma nova versão é publicada.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

export function useTerms() {
  const [t, setT] = useState(null)
  useEffect(() => { api('/api/terms').then(r => setT(r.terms)).catch(() => {}) }, [])
  return t
}
export function TermsText({ terms }) {
  if (!terms) return <p className="g-mut">Carregando…</p>
  return <div className="g-terms" data-testid="terms-text"><b>{terms.title}</b><p className="g-mut g-xs">Versão {terms.version}</p>
    {terms.body.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>
}
// tela cheia exibida quando a conta ainda não aceitou a versão vigente
export function TermsGate({ onAccepted }) {
  const terms = useTerms(), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const accept = async () => {
    setBusy(true); setMsg('')
    try { await api('/api/terms/accept', { method: 'POST', body: JSON.stringify({ version: terms.version }) }); onAccepted() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <div className="ag g-page" data-testid="terms-gate">
    <h1 className="g-h1">Termos de uso atualizados</h1>
    <p className="g-mut">Para continuar, leia e aceite a versão atual.</p>
    <div className="g-card" style={{ maxHeight: '55vh', overflow: 'auto' }}><TermsText terms={terms} /></div>
    {msg && <p className="g-bad2">{msg}</p>}
    <button className="g-btn g-block" disabled={!terms || busy} onClick={accept} style={{ marginTop: 14 }}>Li e aceito</button>
  </div>
}
