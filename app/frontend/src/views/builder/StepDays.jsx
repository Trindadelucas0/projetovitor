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
import { Tabs } from 'antd'
import { Sheet, Btn, Row, Rows } from '../../ui/gkit.jsx'
import { WEEKDAYS, WD_SHORT } from './shape.js'
import { MAX_DAYS, MAX_EX_PER_DAY } from './useBuilderState.js'
import ExerciseLibrary from './ExerciseLibrary.jsx'
import ExerciseCard from './ExerciseCard.jsx'
import { DayWarmups } from './WarmupEditor.jsx'

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
        {/* abas editáveis (antd): toque abre o dia, "+ Dia" cria, o × remove (com confirmação) */}
        <div className="wb-days">
          <Tabs type="editable-card" size="small" activeKey={String(st.day)} aria-label="Dias do treino"
            onChange={k => dx({ type: 'pickDay', day: +k })}
            hideAdd
            tabBarExtraContent={w.days.length < MAX_DAYS ? { right: <button type="button" className="wb-day-addb" onClick={() => dx({ type: 'addDay' })} data-testid="wb-day-add">+ Dia</button> } : null}
            onEdit={async (k, action) => {
              if (w.days.length === 1) return onAviso('O treino precisa de pelo menos um dia.')
              const i = +k, d = w.days[i]
              if (await ask(`Remover ${d.name}?`, { text: `${d.exercises.length} exercício(s) serão perdidos.`, ok: 'Remover dia', danger: true })) { dx({ type: 'pickDay', day: i }); dx({ type: 'removeDay' }) }
            }}
            items={w.days.map((d, i) => ({
              key: String(i), closable: w.days.length > 1,
              closeIcon: <span aria-label={'Remover ' + d.name}><Icon name="xmark" /></span>,
              label: <span className="wb-day-l" data-testid={'wb-day-' + i}>{d.name}{d.weekday != null && d.weekday !== '' ? ' · ' + WD_SHORT[+d.weekday] : ''}<small>{d.exercises.length}</small></span>,
            }))} />
        </div>

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
          <label className="wb-campo">
            <span className="g-mut g-xs">Para a próxima vez (opcional)</span>
            <textarea className="g-in" rows={3} maxLength={1500} value={day.next_time_guidance || ''} data-testid="wb-next-time-guidance"
              onChange={e => dx({ type: 'dayField', k: 'next_time_guidance', v: e.target.value })}
              placeholder="Orientação que o aluno verá ao concluir este treino" />
          </label>
          <DayWarmups id={`wb-f-${st.day}-d-warmup_items`} items={day.warmup_items || []} onChange={v => dx({ type: 'dayField', k: 'warmup_items', v })} />
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
          <Rows>
            <Row icon="pencil" title="Renomear dia" chevron={false} onClick={() => { setMenu(null); renomear() }} />
            <Row icon="clipboard" title="Duplicar dia" sub="Copia os exercícios para um dia novo" chevron={false} onClick={() => { setMenu(null); duplicar() }} />
            {outrosDias.map(({ d, i }) => (
              <Row key={i} icon="shuffle" title={'Copiar exercícios de ' + d.name} chevron={false}
                sub={`${d.exercises.length} exercício(s) entram no fim de ${day.name}`}
                onClick={() => { setMenu(null); dx({ type: 'copyFrom', from: i }) }} />
            ))}
            <Row icon="reset" title="Limpar exercícios" chevron={false} disabled={!day.exercises.length} onClick={() => { setMenu(null); limpar() }} />
            <Row icon="trash" title="Remover dia" chevron={false} danger onClick={() => { setMenu(null); remover() }} />
          </Rows>
        </Sheet>
      )}

      {menu && menu.ex != null && day.exercises[menu.ex] && (
        <Sheet title={day.exercises[menu.ex].name} onClose={() => setMenu(null)}>
          <Rows>
            <Row icon="clipboard" title="Duplicar exercício" chevron={false} onClick={() => { const i = menu.ex; setMenu(null); dx({ type: 'dupExercise', i }) }} />
            {outrosDias.map(({ d, i }) => (
              <Row key={i} icon="chevronRight" title={'Mover para ' + d.name} chevron={false}
                onClick={() => { const k = menu.ex; setMenu(null); dx({ type: 'moveToDay', i: k, to: i }) }} />
            ))}
            {day.exercises[menu.ex].group != null && (
              <Row icon="link" title="Desagrupar" chevron={false} onClick={() => { const i = menu.ex; setMenu(null); dx({ type: 'ungroup', i }) }} />
            )}
            <Row icon="trash" title={'Remover do ' + day.name} chevron={false} danger onClick={() => { const i = menu.ex; setMenu(null); removerEx(i) }} />
          </Rows>
        </Sheet>
      )}
    </section>
  )
}
