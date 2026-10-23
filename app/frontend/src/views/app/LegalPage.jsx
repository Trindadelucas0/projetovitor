// Rota pública /legal e /legal/:doc (com ou sem login). Fase 6: Ant Design, carregada sob demanda;
// o LegalGate (aceite obrigatório) continua em Legal.jsx, sem antd, porque roda antes do app.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Breadcrumb, Card, Switch } from 'antd'
import { api } from '../../lib/api.js'
import { DOCS, LegalDoc, bySlug, placeholders, useLegalData } from './Legal.jsx'
import { Load, Note, Row, Rows } from '../../ui/gkit.jsx'
import '../guided/guided.css'

export default function LegalPage({ authed }) {
  const { doc } = useParams(), nav = useNavigate(), d = useLegalData(!!authed), hit = doc && bySlug(doc)
  const map = useMemo(() => placeholders(d.company, d.plans, d.me), [d])
  const [hc, setHc] = useState(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (d.me) setHc(d.me.health_consent) }, [d.me])
  const toggleHealth = async v => { setBusy(true); try { await api('/api/legal/health-consent', { method: 'POST', body: JSON.stringify({ granted: v }) }); setHc(v); setMsg(v ? 'Consentimento registrado.' : 'Consentimento revogado.') } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  return <div className="ag g-page lg-page" data-testid="legal-page">
    <Breadcrumb className="lg-crumb" items={[{ title: <Link to="/legal">Documentos legais</Link> }, ...(hit ? [{ title: hit[1].title }] : [])]} />
    {hit ? (d.company ? <Card className="gk-card lg-doc"><LegalDoc text={hit[1].text} map={map} /></Card> : <Load rows={8} />) : <>
      <h1 className="g-h1">Documentos legais</h1>
      <Rows>{Object.values(DOCS).map(x => <Link key={x.slug} to={'/legal/' + x.slug} className="gk-row gk-row-click lg-link" data-testid={'legal-link-' + x.slug}>
        <span className="gk-row-t"><b>{x.title}</b></span><span className="gk-row-chev" aria-hidden="true">›</span></Link>)}</Rows>
      {authed && d.me && <Card className="gk-card" title="Consentimento para dados de saúde">
        <p className="g-mut g-xs" style={{ marginTop: 0 }}>Relatos de dor, avaliação física, IMC e fotos de evolução. Você pode conceder ou revogar quando quiser.</p>
        <label className="lg-switch"><Switch checked={!!hc} loading={busy} onChange={toggleHealth} data-testid="legal-health-toggle" aria-label="Autorizo o tratamento dos meus dados de saúde" />
          <span>Autorizo o tratamento dos meus dados de saúde</span></label>
        <Note type="info">{msg}</Note>
      </Card>}
    </>}
    {authed && <Rows style={{ marginTop: 12 }}><Row icon="chevronLeft" title="Voltar ao app" chevron={false} onClick={() => nav(-1)} /></Rows>}
  </div>
}
