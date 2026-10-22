// Etapa 1 — para quem é a ficha e o que ela é.
//
// A ordem está invertida em relação à versão antiga, onde o aluno era um <select> no
// rodapé, depois de tudo: dava para montar um treino inteiro e só então descobrir que não
// havia aluno vinculado. Aqui o aluno é a primeira linha da primeira tela.
//
// O objetivo virou chips porque são sete valores fixos e é obrigatório para publicar
// (a API recusa sem ele) — num <select> isso não aparecia em lugar nenhum.
import { useState } from 'react'
import { GOALS } from '../../lib/care.js'
import { fieldId } from '../../lib/workout-validate.js'
import Icon from '../../components/Icon.jsx'
import { Av } from '../app/kit.jsx'
import PickerSheet from './PickerSheet.jsx'

const alunoHint = s => ('plan' in s
  ? (s.plan ? 'Já tem uma ficha ativa — a nova substitui' : 'Sem ficha ativa')
  : (s.email || ''))

export default function StepIdentity({ st, dx, students, templates, isAdmin, onUseTemplate, erros }) {
  const [abre, setAbre] = useState(null)   // 'aluno' | 'modelo'
  const [escopo, setEscopo] = useState('todos')
  const { w, meta } = st
  const aluno = students.find(s => s.id === meta.student)
  const travado = !!meta.planId && !!meta.student   // ficha já enviada: o aluno não muda
  const erro = f => erros[f]

  const itensAluno = students.map(s => ({
    value: s.id, label: s.name, hint: alunoHint(s), selected: s.id === meta.student,
    avatar: <Av name={s.name} size={38} />,
  }))

  const porEscopo = templates.filter(t => escopo === 'todos' || (escopo === 'meus' ? t.scope === 'pessoal' : t.scope !== 'pessoal'))
  const itensModelo = porEscopo.map(t => {
    const dias = t.days?.length || 0
    const exs = (t.days || []).reduce((a, d) => a + (d.exercises?.length || 0), 0)
    return {
      value: t.id, label: t.title, selected: t.id === meta.templateId, icon: t.scope === 'pessoal' ? 'person' : 'users',
      hint: [`${dias} dia(s)`, `${exs} exercício(s)`, GOALS[t.goal], t.scope === 'pessoal' ? 'meu modelo' : 'compartilhado'].filter(Boolean).join(' · '),
    }
  })
  const abasModelo = [['todos', 'Todos', templates.length], ['meus', 'Meus', templates.filter(t => t.scope === 'pessoal').length], ['compartilhados', 'Compartilhados', templates.filter(t => t.scope !== 'pessoal').length]]

  return (
    <section className="wb-etapa" aria-label="Dados da ficha">
      <div className="g-card g-list">
        <button type="button" id={fieldId(null, null, 'student')} className="g-li" data-testid="wb-student"
          onClick={() => !travado && setAbre('aluno')} disabled={travado} aria-label="Escolher o aluno">
          {aluno ? <Av name={aluno.name} size={38} /> : <span className="g-ico"><Icon name="person" /></span>}
          <span className="wb-picker-txt">
            <b>{aluno ? aluno.name : (students.length ? 'Escolha o aluno' : isAdmin ? 'Nenhum aluno ativo' : 'Nenhum aluno vinculado')}</b>
            <span className="g-mut g-xs">{aluno ? alunoHint(aluno) : 'Quem vai receber esta ficha'}</span>
          </span>
          {!travado && <Icon name="chevronRight" className="g-chev" />}
        </button>

        {!meta.planId && (
          <button type="button" className="g-li" data-testid="wb-template" onClick={() => setAbre('modelo')} aria-label="Começar de um modelo">
            <span className="g-ico"><Icon name="clipboard" /></span>
            <span className="wb-picker-txt">
              <b>{meta.templateId ? (templates.find(t => t.id === meta.templateId)?.title || 'Modelo aplicado') : 'Começar de um modelo'}</b>
              <span className="g-mut g-xs">{templates.length ? `Opcional · ${templates.length} disponível(is)` : 'Nenhum modelo salvo ainda'}</span>
            </span>
            <Icon name="chevronRight" className="g-chev" />
          </button>
        )}
      </div>
      {erro('student') && <p className="wb-erro" role="alert">{erro('student')}</p>}

      <label className="wb-campo">
        <span className="g-mut g-xs">Nome do treino</span>
        <input id={fieldId(null, null, 'title')} className={'g-in' + (erro('title') ? ' wb-in-erro' : '')} value={w.title}
          onChange={e => dx({ type: 'field', k: 'title', v: e.target.value })}
          placeholder="ex.: Hipertrofia A/B" data-testid="wb-title" />
      </label>
      {erro('title') && <p className="wb-erro" role="alert">{erro('title')}</p>}

      <fieldset className="wb-campo wb-fieldset" id={fieldId(null, null, 'goal')}>
        <legend className="g-mut g-xs">Objetivo <span className="wb-obrig">· obrigatório</span></legend>
        <div className="wb-chips" data-testid="wb-goal">
          {Object.entries(GOALS).map(([k, l]) => (
            <button key={k} type="button" className={'g-chipbtn' + (w.goal === k ? ' g-on' : '')} aria-pressed={w.goal === k}
              onClick={() => dx({ type: 'field', k: 'goal', v: w.goal === k ? '' : k })} data-testid={'wb-goal-' + k}>{l}</button>
          ))}
        </div>
      </fieldset>
      {erro('goal') && <p className="wb-erro" role="alert">{erro('goal')}</p>}

      <label className="wb-campo">
        <span className="g-mut g-xs">Especialidade</span>
        <input className="g-in" value={w.specialty} onChange={e => dx({ type: 'field', k: 'specialty', v: e.target.value })}
          placeholder="Musculação" data-testid="wb-specialty" />
      </label>

      <label className="wb-campo">
        <span className="g-mut g-xs">Como fazer o treino (orientação geral para o aluno)</span>
        <textarea className="g-in" rows={3} value={w.description} onChange={e => dx({ type: 'field', k: 'description', v: e.target.value })}
          placeholder="Aquecimento, ordem, intervalo, cuidados…" data-testid="wb-desc" />
      </label>

      {abre === 'aluno' && (
        <PickerSheet title="Escolher o aluno" items={itensAluno} testid="wb-student-pick"
          placeholder="Buscar aluno" empty={isAdmin ? 'Nenhum aluno ativo.' : 'Nenhum aluno vinculado a você.'}
          onPick={v => dx({ type: 'meta', patch: { student: v } })} onClose={() => setAbre(null)} />
      )}
      {abre === 'modelo' && (
        <PickerSheet title="Começar de um modelo" items={itensModelo} testid="wb-template-pick"
          placeholder="Buscar modelo" empty="Nenhum modelo salvo ainda."
          tabs={abasModelo} tab={escopo} onTab={setEscopo}
          onPick={v => onUseTemplate(templates.find(t => t.id === v))} onClose={() => setAbre(null)} />
      )}
    </section>
  )
}
