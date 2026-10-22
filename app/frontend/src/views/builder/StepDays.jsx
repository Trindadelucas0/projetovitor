// Etapa 2 — os dias e os exercícios de cada um.
//
// A trilha de dias continua em `flex-wrap` de propósito: o teste de layout
// (e2e/navigation-layout.spec.js) mede `.wb-days` em 320 px com 7 dias e exige que nada
// role na horizontal.
//
// As ações do dia (renomear, duplicar, copiar de outro dia, remover) saíram de botões
// soltos no fim da trilha — onde não ficava claro sobre qual dia agiam — e foram para um
// menu no cabeçalho do dia aberto. Duplicar e copiar são novos: é o que faltava para
// montar um A/B/C sem repetir o trabalho.
import { useState } from 'react'
import { ask, askText } from '../../lib/dialog.js'
import Icon from '../../components/Icon.jsx'
import GSelect from '../../components/GSelect.jsx'
import { Sheet } from '../app/kit.jsx'
import { Btn } from '../app/kit.jsx'
import { WEEKDAYS, WD_SHORT } from './shape.js'
import { MAX_DAYS, MAX_EX_PER_DAY } from './useBuilderState.js'
import ExerciseLibrary from './ExerciseLibrary.jsx'
import ExerciseCard from './ExerciseCard.jsx'

export default function StepDays({ st, dx, day, groups, clash, errosPorEx, onAviso }) {
  const [libOpen, setLibOpen] = useState(false)
  const [menu, setMenu] = useState(null)        // 'dia' | { ex: number }
  const [selecting, setSelecting] = useState(false)
  const { w, sel } = st
  const noDia = new Set(day.exercises.map(e => e.exercise_id))
  const vagas = MAX_EX_PER_DAY - day.exercises.length

  const renomear = async () => {
    const n = await askText('Renomear dia', { def: day.name, ok: 'Renomear', label: 'Novo nome do dia' })
    if (n && n.trim()) dx({ type: 'dayField', k: 'name', v: n.trim().slice(0, 60) })
  }
  const remover = async () => {
    if (w.days.length === 1) return onAviso('O treino precisa de pelo menos um dia.')
    if (await ask(`Remover ${day.name}?`, { text: `${day.exercises.length} exercício(s) serão perdidos.`, ok: 'Remover dia', danger: true })) dx({ type: 'removeDay' })
  }
  const limpar = async () => {
    if (!day.exercises.length) return
    if (await ask(`Limpar ${day.name}?`, { text: 'Os exercícios saem; o dia continua.', ok: 'Limpar', danger: true })) dx({ type: 'clearDay' })
  }
  const duplicar = () => {
    if (w.days.length >= MAX_DAYS) return onAviso(`O treino aceita no máximo ${MAX_DAYS} dias.`)
    dx({ type: 'dupDay' })
  }
  const adicionar = list => {
    if (vagas <= 0) return onAviso(`${day.name} já tem o máximo de ${MAX_EX_PER_DAY} exercícios.`)
    dx({ type: 'addExercises', list })
  }
  const agrupar = () => {
    if (sel.size < 2 || sel.size > 3) return onAviso('Selecione 2 (bi-set) ou 3 (tri-set) exercícios.')
    dx({ type: 'group' })
    setSelecting(false)
    onAviso(sel.size === 2 ? 'Bi-set criado: sem descanso entre eles, descanso após o grupo.' : 'Tri-set criado.', 'ok')
  }
  const removerEx = async i => {
    const e = day.exercises[i]
    if (await ask(`Remover ${e.name}?`, { text: `Sai de ${day.name}.`, ok: 'Remover', danger: true })) dx({ type: 'removeExercise', i })
  }

  const outrosDias = w.days.map((d, i) => ({ d, i })).filter(x => x.i !== st.day)

  return (
    <section className="wb-etapa wb-step2" aria-label="Dias e exercícios">
      <div className="wb-step2-main">
        <nav className="wb-days" role="tablist" aria-label="Dias do treino">
          {w.days.map((d, i) => (
            <button key={i} role="tab" aria-selected={i === st.day} className={'wb-day' + (i === st.day ? ' on' : '')}
              onClick={() => dx({ type: 'pickDay', day: i })} data-testid={'wb-day-' + i}>
              {d.name}{d.weekday != null && d.weekday !== '' ? ' · ' + WD_SHORT[+d.weekday] : ''}
              <small>{d.exercises.length}</small>
            </button>
          ))}
          {w.days.length < MAX_DAYS && (
            <button className="wb-day add" onClick={() => dx({ type: 'addDay' })} data-testid="wb-day-add">+ Dia</button>
          )}
        </nav>

        <div className="g-card wb-dia">
          <div className="g-row">
            <b className="g-sp">{day.name}</b>
            <button type="button" className="g-icbtn" onClick={() => setMenu('dia')} aria-label={'Ações de ' + day.name} data-testid="wb-day-menu">
              <Icon name="list" />
            </button>
          </div>

          <label className="wb-campo">
            <span className="g-mut g-xs">Dia da semana</span>
            <GSelect value={day.weekday ?? ''} onChange={v => dx({ type: 'dayField', k: 'weekday', v: v === '' ? null : +v })}
              label={'Dia da semana de ' + day.name} sheetTitle="Dia da semana" testid="wb-weekday"
              options={[{ value: '', label: 'Livre — o aluno escolhe o dia' }, ...WEEKDAYS.map((l, i) => ({ value: i, label: l }))]} />
            <span className="g-mut g-xs">Marcando o dia, o app abre este treino no Início do aluno nesse dia da semana.</span>
          </label>

          {/* Recolhido: é opcional, e aberto empurrava a lista de exercícios para fora da tela. */}
          <details className="org-details wb-detalhe" open={!!day.description}>
            <summary>Orientação do {day.name} {day.description ? '' : '(opcional)'}</summary>
            <textarea className="g-in" rows={2} value={day.description || ''} data-testid="wb-day-desc"
              onChange={e => dx({ type: 'dayField', k: 'description', v: e.target.value })}
              placeholder="ex.: foco em membros inferiores; 5 min de bicicleta antes" />
          </details>
        </div>

        {clash && <p className="wb-erro wb-alerta" role="alert" data-testid="wb-weekday-clash">{clash}</p>}

        <div className="wb-acoes-dia">
          <Btn size="sm" onClick={() => setLibOpen(true)} data-testid="wb-open-lib" disabled={vagas <= 0}>
            <Icon name="plus" /> Adicionar exercícios
          </Btn>
          {day.exercises.length > 1 && (
            <Btn variant="secondary" size="sm" onClick={() => { setSelecting(s => !s); dx({ type: 'clearSel' }) }}>
              {selecting ? 'Cancelar seleção' : 'Montar bi-set'}
            </Btn>
          )}
          {selecting && (
            <Btn size="sm" onClick={agrupar} disabled={sel.size < 2 || sel.size > 3} data-testid="wb-group">
              {sel.size === 3 ? 'Agrupar tri-set' : `Agrupar bi-set${sel.size ? ` (${sel.size})` : ''}`}
            </Btn>
          )}
        </div>
        {selecting && <p className="g-mut g-xs">Marque 2 exercícios para bi-set ou 3 para tri-set. Eles ficam em sequência, sem descanso entre si.</p>}

        {!day.exercises.length
          ? <div className="wb-vazio">
              <Icon name="dumbbell" />
              <p>Nenhum exercício em {day.name}.</p>
              <Btn size="sm" onClick={() => setLibOpen(true)}>Abrir a biblioteca</Btn>
            </div>
          : <ol className="wb-lista">
              {day.exercises.map((e, i) => (
                <ExerciseCard key={i + e.exercise_id} e={e} i={i} dayIndex={st.day} g={groups[i]} total={day.exercises.length}
                  open={st.openEx === i} onOpen={() => dx({ type: 'openEx', i })}
                  set={patch => dx({ type: 'exField', i, patch })}
                  move={dir => dx({ type: 'moveExercise', i, dir })}
                  onMenu={() => setMenu({ ex: i })}
                  onUngroup={() => dx({ type: 'ungroup', i })}
                  selecting={selecting} selected={sel.has(i)} onSelect={() => dx({ type: 'toggleSel', i })}
                  problems={errosPorEx[i] || {}} />
              ))}
            </ol>}

        {day.exercises.length >= MAX_EX_PER_DAY && (
          <p className="wb-erro">{day.name} chegou ao máximo de {MAX_EX_PER_DAY} exercícios — o servidor não guarda além disso.</p>
        )}
      </div>

      <ExerciseLibrary open={libOpen} onClose={() => setLibOpen(false)} onAdd={adicionar}
        dayName={day.name} inDay={noDia} room={vagas} />

      {menu === 'dia' && (
        <Sheet title={day.name} onClose={() => setMenu(null)}>
          <div className="g-card g-list">
            <button className="g-li" onClick={() => { setMenu(null); renomear() }}><span className="g-ico"><Icon name="pencil" /></span><span className="wb-picker-txt"><b>Renomear dia</b></span></button>
            <button className="g-li" onClick={() => { setMenu(null); duplicar() }}><span className="g-ico"><Icon name="clipboard" /></span><span className="wb-picker-txt"><b>Duplicar dia</b><span className="g-mut g-xs">Copia os exercícios para um dia novo</span></span></button>
            {outrosDias.map(({ d, i }) => (
              <button key={i} className="g-li" onClick={() => { setMenu(null); dx({ type: 'copyFrom', from: i }) }}>
                <span className="g-ico"><Icon name="shuffle" /></span>
                <span className="wb-picker-txt"><b>Copiar exercícios de {d.name}</b><span className="g-mut g-xs">{d.exercises.length} exercício(s) entram no fim de {day.name}</span></span>
              </button>
            ))}
            <button className="g-li" onClick={() => { setMenu(null); limpar() }} disabled={!day.exercises.length}><span className="g-ico"><Icon name="reset" /></span><span className="wb-picker-txt"><b>Limpar exercícios</b></span></button>
            <button className="g-li wb-li-ruim" onClick={() => { setMenu(null); remover() }}><span className="g-ico"><Icon name="trash" /></span><span className="wb-picker-txt"><b>Remover dia</b></span></button>
          </div>
        </Sheet>
      )}

      {menu && menu.ex != null && day.exercises[menu.ex] && (
        <Sheet title={day.exercises[menu.ex].name} onClose={() => setMenu(null)}>
          <div className="g-card g-list">
            <button className="g-li" onClick={() => { const i = menu.ex; setMenu(null); dx({ type: 'dupExercise', i }) }}>
              <span className="g-ico"><Icon name="clipboard" /></span><span className="wb-picker-txt"><b>Duplicar exercício</b></span>
            </button>
            {outrosDias.map(({ d, i }) => (
              <button key={i} className="g-li" onClick={() => { const k = menu.ex; setMenu(null); dx({ type: 'moveToDay', i: k, to: i }) }}>
                <span className="g-ico"><Icon name="chevronRight" /></span>
                <span className="wb-picker-txt"><b>Mover para {d.name}</b></span>
              </button>
            ))}
            {day.exercises[menu.ex].group != null && (
              <button className="g-li" onClick={() => { const i = menu.ex; setMenu(null); dx({ type: 'ungroup', i }) }}>
                <span className="g-ico"><Icon name="link" /></span><span className="wb-picker-txt"><b>Desagrupar</b></span>
              </button>
            )}
            <button className="g-li wb-li-ruim" onClick={() => { const i = menu.ex; setMenu(null); removerEx(i) }}>
              <span className="g-ico"><Icon name="trash" /></span><span className="wb-picker-txt"><b>Remover do {day.name}</b></span>
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
