// V3 · Aluno: aceitar convite de um profissional (link /convite/:code ou código digitado). Aluno Free recebe a ficha sem pagar.
import { useState, useEffect } from 'react'
import { api } from '../../lib/api.js'
import { useNavigate, useParams } from 'react-router-dom'
import { V } from '../../lib/v3.js'
import { useStore } from '../../store/useStore.js'
import { Av, Load, Err, useLoad, Sheet } from '../app/kit.jsx'
import '../guided/guided.css'

export default function AcceptInvite() {
  const { code } = useParams(), nav = useNavigate(), user = useStore(s => s.user)
  const [d, err, reload] = useLoad(() => V.viewInvite(code), [code])
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [done, setDone] = useState('')
  const isStudent = (user?.roles || []).includes('aluno')
  const act = async kind => {
    setBusy(true); setMsg('')
    try { kind === 'ok' ? await V.acceptInvite(code) : await V.declineInvite(code); setDone(kind) }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  // código de aluno digitado no lugar de um convite → explica e leva ao lugar certo
  const studentCode = typeof err === 'string' && err.startsWith('Esse é um código de aluno')
  // Monetizacao F5: o mesmo /convite/CODIGO pode ser um link de indicacao (resolvido no servidor)
  const [refInfo, setRefInfo] = useState(null)
  useEffect(() => { if (err) api('/api/convite?code=' + encodeURIComponent(code)).then(d => d?.type === 'indicacao' && setRefInfo(d)).catch(() => {}) }, [err, code])
  if (refInfo) return <div className="ag" data-testid="accept-invite"><span className="g-eyebrow">Indicação</span><h1>Convite de {refInfo.referrer.first_name}</h1>
    <div className="g-card" data-testid="referral-existing"><p className="g-sm">Você já tem uma conta. Indicações valem para novos cadastros.</p>{refInfo.coupon && <p className="g-sm">Se ainda não usou seu teste, o cupom <b>{refInfo.coupon}</b> pode ser usado em Assinatura.</p>}
      <button className="g-btn" onClick={() => nav('/assinatura')}>Ir para Assinatura</button></div></div>
  const isPro = (user?.roles || []).includes('profissional')
  const toInvites = async () => { try { if (user?.context !== 'profissional') { await V.setContext('profissional'); const me = await V.me(); useStore.getState().setUser(me.user) } nav('/pro?tab=convites') } catch (e) { setMsg(e.message) } }
  if (studentCode) return <div className="ag" data-testid="accept-invite"><Sheet title="Código de aluno" onClose={() => nav(-1)}>
    <div data-testid="student-code-modal"><p>{err}</p>
      <div className="g-actions" style={{ marginTop: 12 }}>
        {isPro && <button className="g-btn" onClick={toInvites} data-testid="student-code-go-invites">Ir para Convites (modo Profissional)</button>}
        <button className="g-btn g-ghost" onClick={() => nav(-1)}>Entendi</button></div>{msg && <p className="g-warn g-sm">{msg}</p>}</div></Sheet></div>
  return <div className="ag" data-testid="accept-invite">
    <span className="g-eyebrow">Convite</span><h1>Acompanhamento profissional</h1>
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : done ? <div className="g-card" data-testid="invite-done">
      <p className="g-sm">{done === 'ok' ? `Pronto! Agora ${d.professional.name} acompanha você. Os treinos que ele enviar aparecem em Treinos.` : 'Convite recusado.'}</p>
      <button className="g-btn" onClick={() => nav(done === 'ok' ? '/acompanhamento' : '/hoje')}>Continuar</button></div> :
      <div className="g-card">
        <div className="g-row" style={{ gap: 12, alignItems: 'center' }}><Av name={d.professional.name} url={d.professional.photo_url} size={56} />
          <div><b>{d.professional.name}</b>{d.professional.verified && <span className="g-chip g-on" style={{ marginLeft: 6 }}>Verificado</span>}<br /><span className="g-xs g-mut">{d.professional.specialties.join(', ')}</span></div></div>
        {d.message && <p className="g-sm" style={{ marginTop: 10 }}>“{d.message}”</p>}
        {d.mine ? <p className="g-note">Este é o seu próprio convite. Envie o link para o aluno.</p>
          : d.already_linked ? <p className="g-note">Você já é acompanhado por este profissional.</p>
          : d.status !== 'pendente' ? <p className="g-warn">Este convite não está mais disponível ({d.status}).</p>
          : !isStudent ? <p className="g-note">Para aceitar, ative “Também quero treinar” em Perfil › Usar a conta como.</p>
          : <>
            <p className="g-xs g-mut" style={{ marginTop: 10 }}>Ao aceitar, o profissional passa a ver seus treinos e progresso para montar sua ficha. Você pode pedir o encerramento a qualquer momento. Sem custo para você.</p>
            <div className="g-actions" style={{ marginTop: 12 }}><button className="g-btn" disabled={busy} onClick={() => act('ok')} data-testid="invite-accept">{busy ? 'Aceitando…' : 'Aceitar'}</button>
              <button className="g-btn g-ghost" disabled={busy} onClick={() => act('no')} data-testid="invite-decline">Recusar</button></div></>}
        {msg && <p className="g-warn" role="alert" style={{ marginTop: 10 }}>{msg}</p>}
      </div>}
  </div>
}

// lista de convites recebidos + campo para digitar um código (Perfil do aluno)
export function MyInvites() {
  const nav = useNavigate(), [d] = useLoad(() => V.myInvites()), [code, setCode] = useState('')
  return <div className="g-card" style={{ marginTop: 14 }} data-testid="my-invites">
    <b className="g-sm">Convites de profissionais</b>
    {(d?.invites || []).map(i => <button key={i.code} className="g-li" onClick={() => nav('/convite/' + i.code)}><span><b>{i.professional}</b><br /><span className="g-xs g-mut">{(i.specialties || []).join(', ')}</span></span></button>)}
    <div className="g-row" style={{ gap: 8, marginTop: 8 }}><input className="g-in" placeholder="Tenho um código" value={code} maxLength={12} onChange={e => setCode(e.target.value.toUpperCase())} data-testid="invite-code-in" />
      <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 16px' }} disabled={code.length < 6} onClick={() => nav('/convite/' + code)}>Abrir</button></div>
  </div>
}
