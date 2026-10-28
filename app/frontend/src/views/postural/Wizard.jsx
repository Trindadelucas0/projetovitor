// Wizard da avaliação postural (tela cheia, uma decisão por tela).
// Sequência: boas-vindas → preparação → dados → termos → N capturas → revisão → envio.
// As N capturas vêm da versão do protocolo pinada na avaliação: este arquivo não sabe quantas são.
// Retomada: ao abrir uma avaliação já consentida, cai direto na primeira etapa pendente (A11).
// O rascunho da posição fica em sessionStorage; o que vale de verdade está no servidor.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import WizardShell from '../../components/WizardShell.jsx'
import HealthConsentGate from '../../components/HealthConsentGate.jsx'
import StepCard from './StepCard.jsx'
import { Btn, Err, Load, Field, useLoad } from '../app/kit.jsx'
import { notify, notifyError } from '../../lib/dialog.js'
import { AP, progressOf, missingRequired, nextPending } from '../../lib/postural.js'
import './postural.css'

const FIXAS = ['boas-vindas', 'preparo', 'dados', 'termos']
const TITULO = { 'boas-vindas': 'Vamos começar?', preparo: 'Prepare seu ambiente', dados: 'Sobre você', termos: 'Seus dados estão protegidos', revisao: 'Revisão final' }
const OBJETIVOS = ['Melhorar mobilidade', 'Ganhar massa', 'Controle de peso', 'Reduzir dor', 'Outro']

export default function Wizard() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => AP.item(id), [id])
  const [i, setI] = useState(null)
  const [consentFalta, setConsentFalta] = useState(false)
  const [prep, setPrep] = useState({})
  const [form, setForm] = useState(null)
  const [aceite, setAceite] = useState(false)
  const [divulgar, setDivulgar] = useState(false)
  const [verTermo, setVerTermo] = useState(false)
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)

  const steps = d?.steps || []
  const caps = d?.captures || []
  const a = d?.assessment
  const telas = useMemo(() => [...FIXAS, ...steps.map(s => 'etapa:' + s.id), 'revisao'], [steps])
  const prog = progressOf(steps, caps)
  const chaveRascunho = 'ap-wizard:' + id

  // começa a avaliação; sem consentimento de saúde o servidor recusa e abrimos o portão
  useEffect(() => {
    if (!a || a.status !== 'solicitada') return
    AP.start(id).then(reload).catch(e => {
      if (e.code === 'CONSENT_REQUIRED') setConsentFalta(true); else notifyError(e)
    })
  }, [a?.status]) // eslint-disable-line

  // posição inicial: retoma na primeira etapa pendente quando o termo já foi aceito
  useEffect(() => {
    if (!d || i !== null) return
    let salvo = null
    try { salvo = JSON.parse(sessionStorage.getItem(chaveRascunho) || 'null') } catch { /* sem rascunho */ }
    if (salvo?.i != null && salvo.i < telas.length) return setI(salvo.i)
    if (a?.consent_at) {
      const p = nextPending(steps, caps)
      return setI(p === null ? telas.length - 1 : FIXAS.length + p)
    }
    setI(0)
  }, [d]) // eslint-disable-line

  useEffect(() => { if (i != null) { try { sessionStorage.setItem(chaveRascunho, JSON.stringify({ i })) } catch { /* cheio */ } } }, [i, chaveRascunho])
  useEffect(() => { if (a && form === null) setForm({ ...(a.complementary || {}) }) }, [a]) // eslint-disable-line
  useEffect(() => { if (a?.consent_at) { setAceite(true); setDivulgar(!!a.consent_share_granted) } }, [a?.consent_at]) // eslint-disable-line

  if (err) return <div className="ag"><h1>Avaliação postural</h1><Err msg={err} retry={reload} /></div>
  if (!d || i === null) return <div className="ag"><Load /></div>
  if (consentFalta) return <div className="ag"><h1>Avaliação postural</h1><HealthConsentGate onGranted={() => { setConsentFalta(false); AP.start(id).then(reload).catch(notifyError) }} /></div>

  const encerrada = !['em_andamento', 'recaptura_solicitada'].includes(a.status)
  const tela = telas[i]
  const vai = n => setI(Math.max(0, Math.min(telas.length - 1, i + n)))
  const sair = () => nav('/avaliacao')

  const salvarDados = async () => {
    setBusy(true)
    try { await AP.dados({ id, ...form }); vai(1) } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const aceitar = async () => {
    setBusy(true)
    try { await AP.consent(id, true, divulgar); await reload(); vai(1) } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const enviar = async () => {
    setBusy(true)
    try {
      const r = await AP.submit(id, notas)
      try { sessionStorage.removeItem(chaveRascunho) } catch { /* ok */ }
      notify('Avaliação enviada. Seu profissional já recebeu.')
      nav('/avaliacao', { replace: true, state: { enviada: r.assessment?.id } })
    } catch (e) {
      if (e.code === 'INCOMPLETE') {
        await reload()
        notify(e.message, 'error')
        const p = nextPending(steps, caps)
        if (p !== null) setI(FIXAS.length + p)
      } else notifyError(e)
    } finally { setBusy(false) }
  }
  // desfaz uma dispensa: libera o slot para o aluno tentar registrar
  const refazerDispensa = async stepId => {
    const c = caps.find(x => x.step_id === stepId && x.status === 'dispensada')
    if (!c) return
    try { await AP.removeCapture(c.id); await reload() } catch (e) { notifyError(e) }
  }

  const shell = (titulo, conteudo, rodape, eyebrow) => (
    <WizardShell eyebrow={eyebrow} title={titulo} step={i} total={telas.length}
      onBack={i === 0 ? sair : () => vai(-1)} footer={rodape} testid="ap-wizard">
      {conteudo}
    </WizardShell>
  )

  if (tela === 'boas-vindas') return shell(TITULO['boas-vindas'], <>
    <p className="g-sm">
      {a.professional_name ? `${a.professional_name} solicitou` : 'Seu profissional solicitou'} uma avaliação
      para acompanhar sua postura e seus movimentos.
    </p>
    <ul className="ap-bullets g-sm">
      <li><Icon name="checkCircle" /> Uma foto ou vídeo por etapa, com orientação</li>
      <li><Icon name="checkCircle" /> Seu progresso fica salvo e suas imagens são privadas</li>
    </ul>
    {a.message && <div className="g-note g-sm"><strong>Recado do seu profissional:</strong><p>{a.message}</p></div>}
    <p className="g-mut g-xs">São {steps.length} etapas. Você pode sair e continuar depois sem perder nada.</p>
  </>, <Btn onClick={() => vai(1)} data-testid="ap-start">Começar preparação</Btn>, 'Avaliação postural')

  if (tela === 'preparo') {
    const itens = Array.isArray(d.version?.preparation) ? d.version.preparation : []
    const todos = itens.length > 0 && itens.every(x => prep[x.key])
    return shell(TITULO.preparo, <>
      <p className="ap-prep-intro">Confira estes pontos antes de começar:</p>
      {itens.length > 0 && <div className="ap-checklist">
        {itens.map(x => (
          <label key={x.key} className="g-chk" data-testid={'prep-' + x.key}>
            <input type="checkbox" checked={!!prep[x.key]} onChange={e => setPrep(p => ({ ...p, [x.key]: e.target.checked }))} />
            <span><b className="g-sm">{x.label}</b>{x.help ? <><br /><span className="g-mut g-xs">{x.help}</span></> : null}</span>
          </label>
        ))}
      </div>}
      {/* A vestimenta fica FORA do bloco recolhido: é ela que decide se as fotos servem para a avaliação.
          Recolhida, o aluno podia seguir vestido errado e perder as 18 etapas. Só as orientações gerais,
          que repetem a lista acima em outras palavras, ficam sob demanda. */}
      {d.version?.clothing_note && <div className="g-note" data-testid="ap-clothing"><strong>Vestimenta</strong><p>{d.version.clothing_note}</p></div>}
      {d.version?.general_instructions?.length > 0 && <details className="ap-step-details">
        <summary>Ver orientações completas</summary>
        <ul className="ap-step-list" data-testid="ap-general">{d.version.general_instructions.map((t, k) => <li key={k}>{t}</li>)}</ul>
      </details>}
    </>, <Btn onClick={() => vai(1)} disabled={itens.length > 0 && !todos} data-testid="ap-prep-done">
      {itens.length > 0 && !todos ? 'Confirme a lista para seguir' : 'Estou preparado'}
    </Btn>, `Preparação · ${i + 1} de ${telas.length}`)
  }

  if (tela === 'dados') return shell(TITULO.dados, <>
    <Field label="Altura (cm)">
      <input className="g-in" type="number" inputMode="numeric" min={90} max={250} value={form?.height_cm ?? ''}
        onChange={e => setForm(f => ({ ...f, height_cm: e.target.value }))} data-testid="ap-height" />
    </Field>
    <Field label="Peso (kg)">
      <input className="g-in" type="text" inputMode="decimal" value={form?.weight_kg ?? ''}
        onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} data-testid="ap-weight" />
    </Field>
    <Field label="Qual seu objetivo principal?">
      <div className="g-opts ap-choice-grid">
        {OBJETIVOS.map(o => (
          <button key={o} type="button" className={(form?.objectives || []).includes(o) ? 'g-on' : ''}
            onClick={() => setForm(f => ({ ...f, objectives: (f.objectives || []).includes(o) ? f.objectives.filter(x => x !== o) : [...(f.objectives || []), o] }))}>{o}</button>
        ))}
      </div>
    </Field>
    <Field label="Sente dor atualmente?">
      <div className="g-opts ap-choice-grid ap-choice-two">
        <button type="button" className={form?.pain_now === true ? 'g-on' : ''} onClick={() => setForm(f => ({ ...f, pain_now: true }))} data-testid="ap-pain-yes">Sim</button>
        <button type="button" className={form?.pain_now === false ? 'g-on' : ''} onClick={() => setForm(f => ({ ...f, pain_now: false }))} data-testid="ap-pain-no">Não</button>
      </div>
    </Field>
    {form?.pain_now === true && <Field label="Onde dói, e desde quando?">
      <textarea className="g-in" rows={3} value={(form.pain || []).join('\n')}
        onChange={e => setForm(f => ({ ...f, pain: e.target.value.split('\n') }))} maxLength={600} data-testid="ap-pain-where" />
    </Field>}
    <Field label="Lesões, cirurgias ou tratamentos que seu profissional deva saber (opcional)">
      <textarea className="g-in" rows={3} value={form?.injuries ?? ''} onChange={e => setForm(f => ({ ...f, injuries: e.target.value }))} maxLength={1000} />
    </Field>
    <p className="g-mut g-xs">O ORNY não faz diagnóstico. Se a dor for forte ou frequente, procure um médico ou fisioterapeuta.</p>
  </>, <>
    <Btn onClick={salvarDados} loading={busy} data-testid="ap-data-save">Continuar</Btn>
    <Btn variant="tertiary" onClick={() => vai(1)} data-testid="ap-data-skip">Pular opcionais</Btn>
  </>, `Sobre você · ${i + 1} de ${telas.length}`)

  if (tela === 'termos') return shell(TITULO.termos, <>
    <p className="g-sm">
      Suas fotos e vídeos são usados para a avaliação e o acompanhamento pelo seu profissional. Ficam em área
      privada: não aparecem no Feed, na Comunidade nem em notificações.
    </p>
    {d.termo?.body && <>
      <Btn variant="secondary" onClick={() => setVerTermo(v => !v)} data-testid="ap-terms-open">
        {verTermo ? 'Fechar termo' : 'Ver termo completo'}
      </Btn>
      {verTermo && <div className="g-card ap-termo g-sm" data-testid="ap-terms-body">{d.termo.body}</div>}
    </>}
    <label className="g-chk" data-testid="ap-terms-accept">
      <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} disabled={!!a.consent_at} />
      <span>Aceito o tratamento das minhas fotos e vídeos para esta avaliação.</span>
    </label>
    <p className="g-mut g-xs">Autorização separada e opcional:</p>
    <label className="g-chk" data-testid="ap-terms-share">
      <input type="checkbox" checked={divulgar} onChange={e => setDivulgar(e.target.checked)} />
      <span>Autorizo o uso das imagens como exemplo de evolução em redes sociais.</span>
    </label>
    <p className="g-mut g-xs">
      Recusar a divulgação não impede a avaliação. Você pode revogar os dois depois, em Perfil → Documentos legais.
      {' '}<a className="g-link" href="#/legal/privacidade">Política de privacidade</a>
    </p>
  </>, a.consent_at
    ? <Btn onClick={() => vai(1)} data-testid="ap-terms-next">Continuar</Btn>
    : <Btn onClick={aceitar} loading={busy} disabled={!aceite} data-testid="ap-terms-send">Continuar</Btn>,
  `Privacidade · ${i + 1} de ${telas.length}`)

  if (tela === 'revisao') {
    const faltam = missingRequired(steps, caps)
    const fotos = steps.filter(s => s.capture_kind === 'foto' && caps.find(c => c.step_id === s.id && c.status === 'enviada')).length
    const videos = steps.filter(s => s.capture_kind === 'video' && caps.find(c => c.step_id === s.id && c.status === 'enviada')).length
    const dispensadas = caps.filter(c => c.status === 'dispensada').length
    return shell(TITULO.revisao, <>
      <div className="g-card">
        <p className="g-sm"><b>{fotos}</b> fotografia(s) e <b>{videos}</b> vídeo(s) confirmados pelo servidor.</p>
        {dispensadas > 0 && <p className="g-mut g-sm">{dispensadas} etapa(s) dispensada(s) com justificativa.</p>}
        <div className="g-bar"><i style={{ width: prog.percent + '%' }} /></div>
        <p className="g-mut g-xs">{prog.done} de {prog.total} etapas</p>
      </div>
      {faltam.length > 0 && <div className="g-note g-sm" data-testid="ap-missing">
        <strong><Icon name="flag" /> Faltam {faltam.length} etapa(s) obrigatória(s)</strong>
        <ul>{faltam.slice(0, 5).map(s => <li key={s.id}>
          <button className="g-link" onClick={() => setI(FIXAS.length + steps.findIndex(x => x.id === s.id))}>{s.position}. {s.title}</button>
        </li>)}</ul>
      </div>}
      <Field label="Quer deixar alguma observação para o seu profissional? (opcional)">
        <textarea className="g-in" rows={3} value={notas} onChange={e => setNotas(e.target.value)} maxLength={2000} data-testid="ap-notes" />
      </Field>
      <p className="g-mut g-xs">Mantenha o app aberto durante o envio. Se a conexão cair, o que já foi confirmado não se perde.</p>
    </>, <Btn onClick={enviar} loading={busy} loadingLabel="Enviando…" disabled={faltam.length > 0 || encerrada} data-testid="ap-submit">
      {faltam.length > 0 ? 'Complete as etapas obrigatórias' : 'Enviar avaliação'}
    </Btn>, `Revisão · ${i + 1} de ${telas.length}`)
  }

  // etapa de captura
  const stepId = tela.slice('etapa:'.length)
  const step = steps.find(s => s.id === stepId)
  if (!step) return <div className="ag"><Err msg="Etapa não encontrada." retry={reload} /></div>
  const cap = caps.find(c => c.step_id === step.id && ['reservada', 'enviada', 'dispensada'].includes(c.status)) || null
  const pergunta = (d.questions || []).find(q => q.step_id === step.id) || null
  const pronta = cap && ['enviada', 'dispensada'].includes(cap.status)

  return shell(null, <StepCard
    assessmentId={id} step={step} capture={cap} question={pergunta} disabled={encerrada}
    onSaved={(saved, unskipStepId) => { if (unskipStepId) return refazerDispensa(unskipStepId); reload() }}
    onAsked={reload}
  />, <>
    <Btn onClick={() => vai(1)} disabled={!pronta} data-testid="ap-step-next">
      {pronta ? (i === telas.length - 2 ? 'Ir para a revisão' : 'Próxima etapa') : 'Registre esta etapa para seguir'}
    </Btn>
    {!pronta && step.allow_skip && <Btn variant="tertiary" onClick={() => vai(1)} data-testid="ap-step-later">Fazer esta depois</Btn>}
  </>, `Etapa ${step.position} de ${steps.length}`)
}
