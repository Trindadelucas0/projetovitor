// Construtor de treino: o professor monta a ficha e envia para o aluno. Rota /pro/treino,
// alcançada do painel do admin (aluno → "Criar no construtor"), da lista de modelos e do
// portal do profissional.
//
// Três etapas, uma decisão por tela, no mesmo molde da avaliação postural (WizardShell).
// A versão anterior empilhava tudo numa página só, com a trilha "1 → 2 → 3" escrita num
// parágrafo e o seletor de aluno no rodapé, depois de tudo.
//
// O estado vive em useBuilderState (um reducer por montagem, não um store de módulo: esta
// rota existe em duas árvores e remonta na troca, e um singleton vazaria a ficha de um
// aluno para a tela do próximo). As regras de validação vivem em lib/workout-validate.js,
// que é espelho testado do schema do servidor.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { C, P } from '../../lib/care.js'
import { api } from '../../lib/api.js'
import { useUnsavedGuard, ask, notify, notifyError } from '../../lib/dialog.js'
import { problemsOf, weekdayClash, anchorServerProblems } from '../../lib/workout-validate.js'
import WizardShell from '../../components/WizardShell.jsx'
import Icon from '../../components/Icon.jsx'
import { Btn } from '../app/kit.jsx'
import { useBuilderState, workoutFromSaved, MAX_DAYS } from './useBuilderState.js'
import { cleanDays } from './shape.js'
import StepIdentity from './StepIdentity.jsx'
import StepDays from './StepDays.jsx'
import StepReview from './StepReview.jsx'
import './builder.css'

const ETAPAS = ['Para quem', 'Dias e exercícios', 'Revisar']
const TITULOS = ['Para quem é este treino', 'Dias e exercícios', 'Revisar e enviar']

export default function WorkoutBuilder() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const user = useStore(s => s.user)
  const isAdmin = !!user?.admin

  const { st, dx, day, groups, total, dirty } = useBuilderState({
    planId: sp.get('id') || sp.get('plan') || null,
    templateId: sp.get('template') || null,
    templateScope: sp.get('scope') || (isAdmin ? 'global' : 'pessoal'),
    student: sp.get('student') || '',
  })
  const { w, meta, step } = st

  const [students, setStudents] = useState([])
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState('')
  const [tentou, setTentou] = useState(false)
  const [doServidor, setDoServidor] = useState([])
  const [rascunho, setRascunho] = useState(null)

  const carregaModelos = () => (isAdmin ? P.admTemplates() : P.templates())
    .then(r => setTemplates((r.templates || []).filter(t => t.status !== 'arquivado')))
    .catch(() => {})

  // Alunos, modelos e, se for edição, a ficha.
  useEffect(() => {
    ;(isAdmin
      ? C.users('ativo', '').then(r => r.users.filter(u => u.roles.includes('aluno')))
      : P.students('todos').then(r => r.students)
    ).then(setStudents).catch(() => {})
    carregaModelos()
    if (meta.planId) {
      (isAdmin ? api('/api/adm/plan?id=' + meta.planId) : P.get(meta.planId))
        .then(r => {
          const p = r.plan || r.prescription || r
          dx({ type: 'load', w: workoutFromSaved(p), meta: { student: p.student_id || meta.student } })
        })
        .catch(e => notifyError(e))
    }
  }, []) // eslint-disable-line

  // Chegando por ?template=, aplica o modelo quando a lista chega.
  const jaAplicou = useRef(false)
  useEffect(() => {
    if (jaAplicou.current || !meta.templateId || !templates.length || meta.planId || w.title) return
    const t = templates.find(x => x.id === meta.templateId)
    if (t) { jaAplicou.current = true; dx({ type: 'useTemplate', t }) }
  }, [templates]) // eslint-disable-line

  /* ---------------- rascunho neste aparelho ---------------- */

  const chave = `avagym:wb:${user?.id || 'anon'}:${meta.planId ? 'plan:' + meta.planId : meta.student ? 'aluno:' + meta.student : 'novo'}`
  // Lê uma vez, por chave: nunca aplica sozinho — quem decide é o usuário.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(chave)
      if (!raw) return setRascunho(null)
      const d = JSON.parse(raw)
      if (d?.v === 1 && d.w?.days?.length) setRascunho(d)
    } catch { /* aba privada ou armazenamento cheio: segue sem rascunho */ }
  }, [chave])
  // Grava com folga, e só quando há algo diferente do que foi carregado/salvo.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => {
      try { localStorage.setItem(chave, JSON.stringify({ v: 1, at: Date.now(), w, day: st.day })) } catch { /* sem espaço: o guard de saída ainda avisa */ }
    }, 600)
    return () => clearTimeout(t)
  }, [w, dirty, chave]) // eslint-disable-line
  const limpaRascunho = () => { try { localStorage.removeItem(chave) } catch { /* nada a fazer */ } setRascunho(null) }

  /* ---------------- validação ---------------- */

  const problemas = useMemo(
    () => problemsOf(w, { forPublish: true, student: meta.student, needStudent: true }),
    [w, meta.student]
  )
  const clash = weekdayClash(w.days)
  const mostrados = doServidor.length ? doServidor : problemas

  // Erros da etapa 1, por campo. Só aparecem depois de o usuário chegar à revisão ou
  // pedir para ir a um problema — marcar de vermelho um formulário recém-aberto é ruído.
  const errosIdent = useMemo(
    () => (tentou ? Object.fromEntries(problemas.filter(p => p.step === 'identity').map(p => [p.field, p.message])) : {}),
    [problemas, tentou]
  )

  // Erros do dia aberto, por exercício e campo.
  const errosPorEx = useMemo(() => {
    const m = {}
    for (const p of mostrados) {
      if (p.step !== 'days' || p.dayIndex !== st.day || p.exIndex == null) continue
      m[p.exIndex] = { ...(m[p.exIndex] || {}), [p.field]: p.message }
    }
    return m
  }, [mostrados, st.day])

  /* ---------------- navegação entre etapas ---------------- */

  const vaPara = n => {
    setDoServidor([])
    dx({ type: 'step', step: n })
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }
  // Só uma coisa impede de seguir: a ficha não pode existir sem aluno. Nome, objetivo,
  // dia vazio e erro de campo não travam o caminho — eles aparecem juntos na revisão,
  // que é a tela que mostra o todo e trava o envio. Travar cada etapa deixaria a lista
  // de pendências da revisão sem nada para mostrar.
  const trava = () => (step === 0 ? problemas.filter(p => p.field === 'student') : [])
  const avanca = () => {
    const t = trava()
    if (t.length) { notify(t[0].message, 'error'); return irProblema(t[0]) }
    if (step + 1 >= 2) setTentou(true)
    vaPara(Math.min(2, step + 1))
  }
  // Voltar é sempre livre; avançar, idem — menos sem aluno.
  const pular = n => {
    if (n === step) return
    if (n > step && problemas.some(p => p.field === 'student')) {
      const t = problemas.find(p => p.field === 'student')
      notify(t.message, 'error'); return irProblema(t)
    }
    vaPara(n)
  }
  // Leva à etapa, ao dia e ao campo culpado, e põe o foco nele.
  const irProblema = p => {
    if (p.step === 'identity') vaPara(0)
    else if (p.step === 'days') {
      vaPara(1)
      if (p.dayIndex != null) dx({ type: 'pickDay', day: p.dayIndex })
      if (p.exIndex != null) dx({ type: 'openEx', i: p.exIndex })
    }
    setTentou(true)
    if (!p.id) return
    setTimeout(() => {
      const el = document.getElementById(p.id)
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      el?.focus?.()
    }, 150)
  }

  /* ---------------- salvar ---------------- */

  const corpo = () => ({ title: w.title, specialty: w.specialty, goal: w.goal, description: w.description, days: cleanDays(w.days) })
  const falhou = e => {
    if (e?.problems?.length) {
      setDoServidor(anchorServerProblems(w, e.problems, { forPublish: true, student: meta.student, needStudent: true }))
      dx({ type: 'step', step: 2 })
      notify('O servidor recusou: ' + e.problems[0], 'error')
    } else notifyError(e)
  }

  const salvarModelo = async () => {
    const meuEscopo = isAdmin ? 'global' : 'pessoal'
    let id = meta.templateScope === meuEscopo ? meta.templateId || null : null
    // O servidor não tem índice único em título e insere sempre que falta o id: sem esta
    // pergunta, salvar duas vezes o mesmo modelo cria duas linhas na lista de todo mundo.
    if (!id) {
      const igual = templates.find(t => (t.scope === 'pessoal') === (meuEscopo === 'pessoal')
        && (t.title || '').trim().toLowerCase() === w.title.trim().toLowerCase())
      if (igual) {
        const atualizar = await ask(`Já existe um modelo chamado “${igual.title}”`, {
          text: 'Atualizar o que existe ou criar outro com o mesmo nome?',
          ok: 'Atualizar o existente', cancel: 'Criar outro',
        })
        if (atualizar) id = igual.id
      }
    }
    setBusy('tpl'); setDoServidor([])
    try {
      const r = isAdmin
        ? await P.saveTemplate({ id: id || undefined, ...corpo() })
        : await api('/api/pro/templates', { method: 'POST', body: JSON.stringify({ id: id || undefined, ...corpo() }) })
      dx({ type: 'meta', patch: { templateId: r.id, templateScope: meuEscopo } })
      dx({ type: 'saved' }); limpaRascunho(); carregaModelos()
      notify(isAdmin ? 'Modelo salvo: disponível para todos os profissionais.' : 'Modelo pessoal salvo.')
    } catch (e) { falhou(e) } finally { setBusy('') }
  }

  const enviar = async () => {
    if (problemas.length) { setTentou(true); return notify(problemas[0].message, 'error') }
    setBusy('send'); setDoServidor([])
    try {
      if (isAdmin) {
        const r = await C.admSavePlan({ id: meta.planId || undefined, student_id: meta.student, template_id: meta.templateId || undefined, status: 'ativo', ...corpo() })
        dx({ type: 'meta', patch: { planId: r.id } })
      } else {
        const r = await P.save({ id: meta.planId || undefined, student_id: meta.student, template_id: meta.templateId || undefined, ...corpo() })
        dx({ type: 'meta', patch: { planId: r.id } })
        if (r.status === 'rascunho') await P.publish(r.id)
      }
      const a = students.find(s => s.id === meta.student)
      dx({ type: 'saved' }); limpaRascunho()
      notify(`Treino enviado para ${a?.name || 'o aluno'}. Ele recebeu uma notificação no app.`)
    } catch (e) { falhou(e) } finally { setBusy('') }
  }

  /* ---------------- sair ---------------- */

  const sair = useUnsavedGuard(dirty)
  const voltar = () => {
    if (step > 0) return vaPara(step - 1)
    sair(() => nav(isAdmin ? '/admin/painel?tab=usuarios' : '/pro?tab=treinos'))
  }

  /* ---------------- rodapé por etapa ---------------- */

  const rodape = () => {
    if (step < 2) {
      const t = trava()
      return (
        <Btn onClick={avanca} data-testid={'wb-next-' + step}>
          {t.length ? rotuloBloqueio(t[0]) : step === 0 ? 'Dias e exercícios' : 'Revisar a ficha'}
        </Btn>
      )
    }
    const nome = students.find(s => s.id === meta.student)?.name?.split(' ')[0]
    return (
      <>
        <Btn onClick={enviar} loading={busy === 'send'} loadingLabel="Enviando…" disabled={!!busy || problemas.length > 0}
          variant={problemas.length ? 'secondary' : 'primary'} data-testid="wb-send">
          {problemas.length
            ? (problemas.length === 1 ? 'Resolva 1 pendência para enviar' : `Resolva ${problemas.length} pendências para enviar`)
            : meta.planId ? 'Salvar e enviar nova versão' : `Enviar para ${nome || 'o aluno'}`}
        </Btn>
        <Btn variant="secondary" onClick={salvarModelo} loading={busy === 'tpl'} loadingLabel="Salvando…" disabled={!!busy} data-testid="wb-save-tpl">
          Salvar como modelo
        </Btn>
      </>
    )
  }

  const eyebrow = [
    meta.planId ? 'Editando a ficha' : 'Nova ficha de treino',
    `${w.days.length} de ${MAX_DAYS} dia(s)`,
    `${total} exercício(s)`,
  ].join(' · ')

  return (
    <WizardShell eyebrow={eyebrow} title={TITULOS[step]} step={step} total={3}
      onBack={voltar} onJump={pular} labels={ETAPAS} footer={rodape()} testid="builder" className="wb">

      {rascunho && (
        <div className="wb-rascunho" role="status">
          <Icon name="history" />
          <span className="g-sp">Há um rascunho deste treino salvo neste aparelho ({quando(rascunho.at)}).</span>
          <button type="button" className="g-link" onClick={() => { dx({ type: 'applyDraft', w: rascunho.w, day: rascunho.day }); setRascunho(null) }}>Retomar</button>
          <button type="button" className="g-link" onClick={limpaRascunho}>Descartar</button>
        </div>
      )}

      {step === 0 && (
        <StepIdentity st={st} dx={dx} students={students} templates={templates} isAdmin={isAdmin} erros={errosIdent}
          onUseTemplate={async t => {
            if (!t) return
            if (total && !(await ask(`Usar o modelo “${t.title}”?`, { text: 'A ficha atual é substituída pela do modelo.', ok: 'Substituir', cancel: 'Manter o que tenho' }))) return
            dx({ type: 'useTemplate', t })
            notify(`Modelo “${t.title}” aplicado.`)
          }} />
      )}

      {step === 1 && (
        <StepDays st={st} dx={dx} day={day} groups={groups} clash={clash} errosPorEx={errosPorEx}
          onAviso={(m, tom) => notify(m, tom === 'ok' ? 'ok' : 'error')} />
      )}

      {step === 2 && (
        <StepReview st={st} students={students} problemas={mostrados}
          onIr={irProblema} onEditarDia={i => { vaPara(1); dx({ type: 'pickDay', day: i }) }} />
      )}
    </WizardShell>
  )
}

// O rótulo do botão diz o que falta, em vez de só ficar apagado — é o padrão da
// avaliação postural, e evita o beco sem saída do botão morto sem explicação.
function rotuloBloqueio(p) {
  return {
    student: 'Escolha o aluno para seguir',
    title: 'Dê um nome ao treino para seguir',
    goal: 'Escolha o objetivo para seguir',
    exercises: 'Adicione exercícios para seguir',
    days: 'Monte um dia para seguir',
  }[p.field] || 'Corrija o que está marcado para seguir'
}

function quando(at) {
  const min = Math.round((Date.now() - at) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return new Date(at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
