// Monetizacao F7/F9: fila "Suspeitas de fraude". Sinais so alertam (D6); o admin descarta ou confirma com nota (auditado).
import { useState, useEffect } from 'react'
import { api } from '../../lib/api.js'
const K = { teste_reuso_identidade: 'Tentou repetir o teste (mesmo e-mail/telefone/CPF)', autoindicacao_mesmo_telefone: 'Autoindicação (mesmo telefone)', muitos_testes_mesmo_ip: 'Vários testes do mesmo IP em 24h', muitos_testes_mesmo_dispositivo: 'Vários testes do mesmo dispositivo em 24h' }
const dt = s => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'
export default function AdmFraude() {
  const [st, setSt] = useState('aberto'), [d, setD] = useState(null), [notes, setNotes] = useState({}), [msg, setMsg] = useState(null)
  const load = () => api('/api/adm/monetizacao/fraude?status=' + st).then(setD).catch(e => setMsg({ ok: false, t: e.message }))
  useEffect(() => { load() }, [st])
  async function review(id, decision) {
    try { await api('/api/adm/monetizacao/fraude/revisar', { method: 'POST', body: JSON.stringify({ id, decision, note: notes[id] || '' }) }); setMsg({ ok: true, t: decision === 'confirmado' ? 'Suspeita confirmada (registrada).' : 'Suspeita descartada (registrada).' }); load() }
    catch (e) { setMsg({ ok: false, t: e.message }) }
  }
  return <div className="ag" data-testid="mon-fraude">
    <p className="g-xs g-mut">Sinais automáticos só alertam; nenhuma conta é bloqueada automaticamente. Confirmar não bloqueia: se quiser, revogue o teste na aba Cupons.</p>
    <label className="adm-field">Mostrar<select className="adm-in" value={st} onChange={e => setSt(e.target.value)} data-testid="fraude-filtro"><option value="aberto">Abertas</option><option value="confirmado">Confirmadas</option><option value="descartado">Descartadas</option></select></label>
    {msg && <p className={msg.ok ? 'bl-ok' : 'bl-err'} role="status">{msg.t}</p>}
    {!d ? <p>Carregando…</p> : !d.sinais.length ? <p className="g-mut">Nenhuma suspeita {st === 'aberto' ? 'aberta' : 'aqui'}.</p> :
      d.sinais.map(s => <div key={s.id} className="adm-card" style={{ padding: 10, marginTop: 8 }} data-testid="fraude-item">
        <b>{K[s.kind] || s.kind}</b> · {s.score} pontos · {dt(s.created_at)}<br />
        <span className="g-xs">Conta: {s.user_name || '—'}{s.data?.contas_24h ? ` · ${s.data.contas_24h} contas em 24h` : ''}</span>
        {s.status === 'aberto' ? <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <input className="adm-in" placeholder="Nota (obrigatória)" value={notes[s.id] || ''} onChange={e => setNotes({ ...notes, [s.id]: e.target.value })} data-testid="fraude-nota" style={{ flex: 1, minWidth: 160 }} />
          <button className="adm-btn ghost" onClick={() => review(s.id, 'descartado')} data-testid="fraude-descartar">Descartar</button>
          <button className="adm-btn" onClick={() => review(s.id, 'confirmado')} data-testid="fraude-confirmar">Confirmar</button></div>
          : <p className="g-xs g-mut">{s.status} por {s.reviewed_by_name} em {dt(s.reviewed_at)}: {s.review_note}</p>}
      </div>)}
  </div>
}
