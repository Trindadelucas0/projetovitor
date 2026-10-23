// V3 · seletor de contexto: a MESMA conta alterna entre treinar (aluno) e a área profissional / admin.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { V, VER_PT } from '../../lib/v3.js'
import { Sheet, Btn, Note } from '../../ui/gkit.jsx'

const HOME = { aluno: '/hoje', profissional: '/pro', admin: '/admin/painel' }
const LABEL = { aluno: ['Treinar', 'dumbbell'], profissional: ['Área profissional', 'clipboard'], admin: ['Administração', 'shield'] }

export default function ContextSwitch() {
  const user = useStore(s => s.user), nav = useNavigate()
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [ask, setAsk] = useState(null)
  if (!user) return null
  const roles = user.roles || [], cur = user.context
  const options = ['aluno', 'profissional', 'admin'].filter(c => roles.includes(c))
  const go = async c => {
    setBusy(c); setErr('')
    try { await V.setContext(c); const me = await V.me(); useStore.getState().setUser(me.user); nav(HOME[c]) }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const add = async cap => {
    setBusy(cap); setErr('')
    try { await V.addCapacity(cap); await V.setContext(cap); const me = await V.me(); useStore.getState().setUser(me.user); setAsk(null); nav(cap === 'profissional' ? '/pro?tab=verificacao' : '/hoje') }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  return <div className="g-card" style={{ marginTop: 14 }} data-testid="context-switch">
    <b className="g-sm">Usar a conta como</b>
    {options.length > 1 && <div className="g-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>{options.map(c =>
      <button key={c} className={'g-chipbtn' + (cur === c ? ' g-on' : '')} style={{ minHeight: 44 }} disabled={!!busy} aria-pressed={cur === c} onClick={() => cur !== c && go(c)} data-testid={'ctx-' + c}>
        <Icon name={LABEL[c][1]} /> {busy === c ? 'Trocando…' : LABEL[c][0]}</button>)}</div>}
    {options.length <= 1 && <p className="g-mut g-xs" style={{ marginTop: 6 }}>{LABEL[cur || options[0] || 'aluno']?.[0]}</p>}
    {roles.includes('profissional') && user.verification && <p className="g-xs g-mut" style={{ marginTop: 8 }}>Cadastro profissional: <b>{VER_PT[user.verification] || user.verification}</b> · <Btn variant="tertiary" onClick={() => nav('/pro?tab=verificacao')} data-testid="ver-open">{user.verification === 'verificado' ? 'Ver registro' : 'Acompanhar verificação'}</Btn></p>}
    <div className="g-actions" style={{ marginTop: 10 }}>
      {!roles.includes('profissional') && !roles.includes('admin') && <Btn variant="secondary" size="sm" onClick={() => setAsk('profissional')} data-testid="cap-pro">Ativar perfil profissional</Btn>}
      {!roles.includes('aluno') && !roles.includes('admin') && <Btn variant="secondary" size="sm" onClick={() => setAsk('aluno')} data-testid="cap-aluno">Também quero treinar</Btn>}
    </div>
    {err && <Note role="alert">{err}</Note>}
    {ask && <Sheet title={ask === 'profissional' ? 'Ativar perfil profissional' : 'Ativar treino'} onClose={() => setAsk(null)}>
      <p className="g-sm">{ask === 'profissional'
        ? 'Sua conta ganha a área profissional. Até a verificação do seu registro (conselho, número e documento), você continua treinando normalmente, mas não pode enviar treinos nem convidar alunos.'
        : 'Sua conta ganha a experiência de treino. Os dados de treino ficam separados dos seus atendimentos profissionais.'}</p>
      {ask === 'profissional' && <ol className="g-sm g-steps" data-testid="cap-pro-steps"><li>Informe seu conselho (CREF, CREFITO…), número e UF</li><li>Anexe o documento do registro (PDF ou foto)</li><li>A administração revisa: <b>Em análise</b> → <b>Verificado</b></li></ol>}
      <div className="g-actions" style={{ marginTop: 12 }}><Btn disabled={!!busy} onClick={() => add(ask)} data-testid="cap-confirm">{busy ? 'Ativando…' : 'Ativar'}</Btn><Btn variant="secondary" onClick={() => setAsk(null)}>Cancelar</Btn></div>
    </Sheet>}
  </div>
}
