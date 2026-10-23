// AVAGYM V5 - perfil social: card somente leitura (foto, nome, @, cidade, bio, seguidores, público/privado) com
// "Editar perfil" abrindo um modal (desktop) / bottom sheet (celular). O @identificador é escolhido uma única vez:
// disponibilidade verificada enquanto digita, aviso de que é permanente e confirmação antes de salvar.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useStore } from '../../store/useStore.js'
import AvatarEditor from '../../components/AvatarEditor.jsx'
import GSelect from '../../components/GSelect.jsx'
import { GOAL_LABEL, normHandle, validHandle } from '../../lib/socialRules.js'
import { Av, Btn, In, TextArea, Note } from '../../ui/gkit.jsx'
import ContactFields from '../../components/ContactFields.jsx'
import { EMPTY_CONTACT, validateContact, toApi, fromApi, maskPhone, maskCep } from '../../lib/contact.js'
import '../../components/contact.css'
import './guided.css'
import './socialProfile.css'

const HANDLE_RULE = 'Use de 3 a 30 letras minúsculas, números, ponto ou sublinhado (sem começar ou terminar com ponto).'

function useHandleCheck(h, enabled) {
  const [st, setSt] = useState({ state: 'idle' })
  useEffect(() => {
    if (!enabled || !h) { setSt({ state: 'idle' }); return }
    if (!validHandle(h)) { setSt({ state: 'invalid' }); return }
    setSt({ state: 'checking' }); let alive = true
    const t = setTimeout(() => api('/api/social/handle-check?h=' + encodeURIComponent(h))
      .then(r => alive && setSt({ state: r.available ? 'ok' : r.reason === 'invalid' ? 'invalid' : 'taken' }))
      .catch(() => alive && setSt({ state: 'error' })), 350)
    return () => { alive = false; clearTimeout(t) }
  }, [h, enabled])
  return st
}

function EditDialog({ d, contact, onClose, onSaved }) {
  const locked = !!d.handle_locked
  const [ct, setCt] = useState(() => fromApi(contact?.contact)), [vis, setVis] = useState(() => ({ show_phone: false, show_email: false, show_address: false, show_city: true, ...Object.fromEntries(Object.entries(contact?.contact || {}).filter(([k]) => k.startsWith('show_'))) }))
  const ctTouched = contact?.complete || Object.values(ct).some(v => String(v || '').trim())
  const [f, setF] = useState({ ...d.profile }), [errs, setErrs] = useState({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const box = useRef(null)
  const h = normHandle(f.handle), newHandle = !locked && !!h
  const chk = useHandleCheck(h, !locked)
  useEffect(() => {
    const prev = document.activeElement; box.current?.querySelector('input,textarea,button')?.focus()
    const onKey = e => {
      if (e.key === 'Escape' && !document.querySelector('.gs[data-open]')) { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && box.current) {   // mantém o foco dentro do diálogo
        const el = [...box.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,[tabindex="0"]')]; if (!el.length) return
        if (e.shiftKey && document.activeElement === el[0]) { e.preventDefault(); el.at(-1).focus() } else if (!e.shiftKey && document.activeElement === el.at(-1)) { e.preventDefault(); el[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey); const ov = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ov; prev?.focus?.() }
  }, [])
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const blocked = busy || (newHandle && chk.state !== 'ok')
  const doSave = async () => {
    setBusy(true); setMsg(''); setErrs({})
    try {
      if (ctTouched) { const ce = validateContact(ct); if (Object.keys(ce).length) { setErrs(ce); setMsg(Object.values(ce)[0]); setConfirm(false); setBusy(false); return } }
      const body = { display_name: f.display_name, bio: f.bio, goal: f.goal, city: f.city, is_private: f.is_private, ...(locked ? {} : { handle: h }) }
      await api('/api/me/social', { method: 'POST', body: JSON.stringify(body) })
      if (ctTouched) await api('/api/me/contact', { method: 'POST', body: JSON.stringify({ ...toApi(ct), ...vis }) })
      onSaved('Perfil salvo.')
    } catch (e) { setErrs(e.errors || {}); setMsg(e.message); setConfirm(false) } finally { setBusy(false) }
  }
  const save = () => newHandle && !confirm ? setConfirm(true) : doSave()
  const hint = { invalid: [HANDLE_RULE, 'bad'], checking: ['Verificando disponibilidade…', 'mut'], ok: [`@${h} está disponível.`, 'ok'], taken: ['Este @ já está em uso. Escolha outro.', 'bad'], error: ['Não foi possível verificar agora.', 'bad'] }[chk.state]
  return <div className="sp-back" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <div className="sp-dlg" role="dialog" aria-modal="true" aria-labelledby="sp-dlg-t" ref={box} data-testid="social-edit">
      <div className="sp-grab" aria-hidden="true" />
      <header className="sp-dlg-h"><h2 id="sp-dlg-t">Editar perfil</h2><button className="sp-x" aria-label="Fechar" onClick={onClose} disabled={busy}>✕</button></header>
      {confirm ? <div className="sp-dlg-b sp-confirm" data-testid="handle-confirm">
        <p className="sp-big">@{h}</p>
        <p>Depois de salvo, este @identificador <b>não poderá ser alterado</b> e não ficará disponível para outra pessoa.</p>
        <p className="g-mut g-sm">Confira a grafia antes de confirmar.</p>
      </div> : <div className="sp-dlg-b">
        <section className="sp-sec"><h3>Identidade</h3>
          <label className="sp-f"><span>Nome de exibição</span><In maxLength={60} value={f.display_name} placeholder={d.name} onChange={set('display_name')} data-testid="social-name" /></label>
          {locked
            ? <div className="sp-f"><span>@identificador</span><div className="sp-locked" data-testid="social-handle-locked">@{d.profile.handle}<small>Definido. Não pode ser alterado.</small></div></div>
            : <label className="sp-f"><span>@identificador (opcional)</span>
              <div className="sp-at"><b aria-hidden="true">@</b><In maxLength={31} value={f.handle} placeholder="ex.: marinafit" onChange={set('handle')} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="sp-h-hint" data-testid="social-handle" /></div>
              <small id="sp-h-hint" className={'sp-hint sp-' + (errs.handle ? 'bad' : hint?.[1] || 'mut')} data-testid="handle-status" data-state={chk.state} aria-live="polite">{errs.handle || hint?.[0] || 'Escolha com cuidado: depois de salvo, o @ não poderá ser alterado.'}</small>
            </label>}
        </section>
        <section className="sp-sec"><h3>Sobre você</h3>
          <label className="sp-f"><span>Bio <em>{160 - (f.bio || '').length} restantes</em></span><TextArea maxLength={160} rows={3} value={f.bio} onChange={set('bio')} data-testid="social-bio" /></label>
          <div className="sp-row2">
            <label className="sp-f"><span>Objetivo (opcional)</span><GSelect label="Objetivo" value={f.goal} onChange={v => setF({ ...f, goal: v })} options={[['', 'Não mostrar'], ...Object.entries(GOAL_LABEL)]} testid="social-goal" /></label>
          </div>
        </section>
        <section className="sp-sec" data-testid="social-contact"><h3>Contato e endereço</h3>
          <ContactFields value={ct} onChange={setCt} errors={errs} />
          <div className="ct-toggles" data-testid="contact-visibility"><b className="g-sm">O que aparece no meu perfil</b>
            {[['show_city', 'Cidade e UF'], ['show_phone', 'Telefone'], ['show_email', 'E-mail'], ['show_address', 'Bairro']].map(([k, l]) => <label key={k}><input type="checkbox" checked={!!vis[k]} onChange={e => setVis({ ...vis, [k]: e.target.checked })} data-testid={'vis-' + k} /><span>{l}</span></label>)}
            <small className="g-mut g-xs">Rua, número, complemento e CEP nunca aparecem para outras pessoas.</small></div>
        </section>
        <section className="sp-sec" data-testid="social-privacy"><h3>Quem vê meu perfil</h3>
          <div className="sp-opts" role="radiogroup" aria-label="Quem vê meu perfil">
            <label className={'sp-opt' + (!f.is_private ? ' on' : '')}><input type="radio" name="priv" checked={!f.is_private} onChange={() => setF({ ...f, is_private: false })} data-testid="social-public" /><span><b>Público</b><small>Qualquer pessoa da comunidade vê seu perfil, e você vê e participa das comunidades em geral.</small></span></label>
            <label className={'sp-opt' + (f.is_private ? ' on' : '')}><input type="radio" name="priv" checked={!!f.is_private} onChange={() => setF({ ...f, is_private: true })} data-testid="social-private" /><span><b>Privado</b><small>Só seguidores que você aprovar veem seu perfil completo, e você vê apenas as comunidades das quais participa.</small></span></label>
          </div>
        </section>
      </div>}
      {msg && <p className="sp-msg g-bad2 g-sm" role="alert" data-testid="social-msg">{msg}</p>}
      <footer className="sp-dlg-f">
        {confirm
          ? <><Btn variant="secondary" onClick={() => setConfirm(false)} disabled={busy} data-testid="handle-confirm-back">Voltar</Btn><Btn onClick={doSave} disabled={busy} data-testid="handle-confirm-ok">{busy ? 'Salvando…' : 'Confirmar e salvar'}</Btn></>
          : <><Btn variant="secondary" onClick={onClose} disabled={busy} data-testid="social-cancel">Cancelar</Btn><Btn onClick={save} disabled={blocked} data-testid="social-save">{busy ? 'Salvando…' : 'Salvar'}</Btn></>}
      </footer>
    </div>
  </div>
}

export default function SocialProfile() {
  const nav = useNavigate(), user = useStore(s => s.user)
  const [ct, setCt] = useState(null)
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [reqs, setReqs] = useState([]), [n, setN] = useState(0), [edit, setEdit] = useState(false)
  useEffect(() => {
    api('/api/me/social').then(setD).catch(e => setErr(e.message))
    api('/api/me/contact').then(setCt).catch(() => setCt({ contact: {}, complete: false }))
    api('/api/me/follow-requests').then(r => setReqs(r.requests || [])).catch(() => {})
  }, [n])
  useEffect(() => { if (/[?&]editar=1/.test(location.hash) && d) setEdit(true) }, [!!d])
  if (err) return <div className="ag"><h1>Perfil social</h1><Note>{err}</Note></div>
  if (!d) return <div className="ag"><p className="g-mut" role="status">Carregando.</p></div>
  const p = d.profile, name = p.display_name || d.name
  const decide = async (id, accept) => { try { await api('/api/me/follow-requests', { method: 'POST', body: JSON.stringify({ follower_id: id, accept }) }); setN(x => x + 1) } catch (e) { setMsg(e.message) } }
  return <div className="ag" data-testid="social-profile">
    <Btn variant="tertiary" className="org-back" onClick={() => nav('/perfil')}>‹ Perfil</Btn>
    <span className="g-eyebrow">Perfil</span><h1>Perfil social</h1>
    <p className="g-mut g-sm">É assim que você aparece na comunidade. Peso, medidas e informações de saúde nunca aparecem aqui.</p>
    <article className="sp-card" data-testid="social-card">
      <div className="sp-cover" aria-hidden="true" />
      <div className="sp-avatar"><AvatarEditor compact avatar={d.avatar} name={name} onChange={a => setD({ ...d, avatar: a })} /></div>
      <div className="sp-name-row">
        <h2 className="sp-name" data-testid="social-card-name">{name}{d.verified ? <span className="sp-ver" data-testid="social-verified" title="Profissional verificado"> ✓ Profissional verificado</span> : null}</h2>
        <span className={'sp-badge' + (p.is_private ? ' priv' : '')} data-testid="social-visibility">{p.is_private ? '🔒 Privado' : '🌐 Público'}</span>
      </div>
      <p className="sp-handle" data-testid="social-card-handle">{p.handle ? '@' + p.handle : <span className="g-mut">Sem @identificador</span>}</p>
      {(() => { const cc = ct?.contact?.city ? ct.contact.city + (ct.contact.uf ? '/' + ct.contact.uf : '') : p.city; return (cc || p.goal) && <p className="sp-meta">{cc && <span data-testid="social-card-city">📍 {cc}</span>}{p.goal && <span>🎯 {GOAL_LABEL[p.goal] || p.goal}</span>}</p> })()}
      <p className={'sp-bio' + (p.bio ? '' : ' g-mut')} data-testid="social-card-bio">{p.bio || 'Você ainda não escreveu uma bio.'}</p>
      <div className="sp-stats" data-testid="social-counts"><span><b>{d.followers}</b> seguidor(es)</span><span><b>{d.following}</b> seguindo</span></div>
      <div className="sp-actions">
        <Btn onClick={() => { setMsg(''); setEdit(true) }} data-testid="social-edit-open">Editar perfil</Btn>
        {user?.id && <Btn variant="secondary" onClick={() => nav('/u/' + user.id)} data-testid="social-preview">Ver como os outros me veem</Btn>}
      </div>
      {msg && <p className="g-sm" role="status" data-testid="social-saved" style={{ marginTop: 10 }}>{msg}</p>}
    </article>
    {ct && <article className="g-card ct-sum" style={{ marginTop: 12 }} data-testid="contact-summary"><div className="g-row"><h3 style={{ margin: 0 }}>Contato e endereço</h3><span className="g-sp" /><Btn variant="secondary" size="sm" onClick={() => setEdit(true)} data-testid="contact-edit">Editar</Btn></div>
      {!ct.complete && <Note data-testid="contact-incomplete">Complete seu telefone e endereço. Eles ficam privados, a menos que você escolha mostrar.</Note>}
      {(() => { const c = ct.contact || {}, V = on => <span className="ct-vis">{on ? 'público' : 'privado'}</span>
        return <dl><dt>Telefone</dt><dd>{c.phone ? maskPhone(c.phone) : '-'}{V(c.show_phone)}</dd><dt>E-mail</dt><dd>{user?.email || '-'}{V(c.show_email)}</dd>
          <dt>Endereço</dt><dd>{c.street ? `${c.street}, ${c.number}${c.complement ? ' - ' + c.complement : ''}` : '-'}<span className="ct-vis">nunca público</span></dd>
          <dt>Bairro</dt><dd>{c.neighborhood || '-'}{V(c.show_address)}</dd><dt>Cidade/UF</dt><dd>{c.city ? c.city + '/' + (c.uf || '') : '-'}{V(c.show_city)}</dd><dt>CEP</dt><dd>{c.cep ? maskCep(c.cep) : '-'}<span className="ct-vis">nunca público</span></dd></dl> })()}
    </article>}
    {reqs.length > 0 && <><h2>Pedidos para seguir</h2><div className="g-card g-list" data-testid="follow-requests">{reqs.map(r => <div key={r.id} className="g-row" style={{ gap: 8, padding: '6px 0' }}><Av name={r.name} url={r.avatar} size={36} /><span style={{ flex: 1 }}>{r.name}</span><Btn size="sm" onClick={() => decide(r.id, true)}>Aceitar</Btn><Btn variant="secondary" size="sm" onClick={() => decide(r.id, false)}>Recusar</Btn></div>)}</div></>}
    {edit && <EditDialog d={d} contact={ct} onClose={() => setEdit(false)} onSaved={m => { setEdit(false); setMsg(m); setN(x => x + 1); if (user?.profile_incomplete) useStore.getState().setUser({ ...user, profile_incomplete: false }) }} />}
  </div>
}