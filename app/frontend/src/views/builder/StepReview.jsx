// Etapa 3 — conferir e enviar.
//
// Antes, os erros do servidor chegavam como uma linha única no rodapé
// (`problems.join(' · ')`): com 40 exercícios era ilegível e não dizia qual campo estava
// errado. Aqui cada pendência é um botão que troca de etapa, seleciona o dia, abre o
// exercício e põe o foco no campo culpado.
//
// A prévia mostra a ficha como o aluno vai ver, que é a pergunta real desta tela —
// "é isso que ele vai receber?".
import { GOALS } from '../../lib/care.js'
import { groupsOf } from '../../lib/workout.js'
import Icon from '../../components/Icon.jsx'
import { WEEKDAYS, exSummary } from './shape.js'

export default function StepReview({ st, students, problemas, onIr, onEditarDia }) {
  const { w, meta } = st
  const aluno = students.find(s => s.id === meta.student)
  const total = w.days.reduce((a, d) => a + d.exercises.length, 0)

  return (
    <section className="wb-etapa wb-review" aria-label="Revisar e enviar">
      {problemas.length > 0 && (
        <div className="g-card wb-pend" data-testid="wb-pendencias">
          <div className="g-row">
            <Icon name="info" />
            <b className="g-sp">{problemas.length === 1 ? '1 coisa para resolver' : `${problemas.length} coisas para resolver`}</b>
          </div>
          <ul className="wb-pend-lista">
            {problemas.map((p, i) => (
              <li key={i}>
                {p.id
                  ? <button type="button" className="wb-pend-ir" onClick={() => onIr(p)} data-testid="wb-pend-item">
                      <Icon name="chevronRight" /><span>{p.message}</span>
                    </button>
                  : <span className="wb-pend-txt">{p.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="g-mut g-xs">Como o aluno vai ver</p>
      <div className="g-card wb-previa">
        <b className="wb-previa-ttl">{w.title || 'Sem nome'}</b>
        <span className="g-mut g-xs">
          {[GOALS[w.goal], w.specialty, `${w.days.length} dia(s)`, `${total} exercício(s)`].filter(Boolean).join(' · ')}
        </span>
        <span className="g-mut g-xs">Para {aluno ? aluno.name : 'nenhum aluno escolhido'}</span>
        {w.description && <p className="wb-previa-desc">{w.description}</p>}

        {w.days.map((d, i) => {
          const gs = groupsOf(d.exercises)
          return (
            <div className="wb-previa-dia" key={i}>
              <div className="g-row">
                <span className={'wb-pill' + (d.weekday == null ? ' livre' : '')}>{d.weekday == null ? 'livre' : WEEKDAYS[d.weekday].slice(0, 3).toLowerCase()}</span>
                <b className="g-sp">{d.name}</b>
                <span className="g-mut g-xs">{d.exercises.length} exercício(s)</span>
                <button type="button" className="g-link" onClick={() => onEditarDia(i)}>Editar</button>
              </div>
              {d.description && <p className="g-mut g-xs wb-previa-desc">{d.description}</p>}
              {d.next_time_guidance && <p className="g-mut g-xs wb-previa-desc"><b>Para a próxima vez:</b> {d.next_time_guidance}</p>}
              {d.exercises.length
                ? <ol className="wb-previa-exs">
                    {d.exercises.map((e, j) => (
                      <li key={j}>
                        <span className="wb-previa-nome">{e.name}</span>
                        <span className="g-mut g-xs">{exSummary(e)}</span>
                        {gs[j] && gs[j].pos === 0 && <span className="wb-tag-grp">{gs[j].kind}</span>}
                      </li>
                    ))}
                  </ol>
                : <p className="wb-erro">Sem exercícios — o servidor recusa enviar assim.</p>}
            </div>
          )
        })}
      </div>

      {!problemas.length && (
        <p className="g-mut g-xs">
          <Icon name="check" /> Tudo certo. {meta.planId
            ? 'Ao enviar, a versão anterior fica no histórico do aluno.'
            : 'Ao enviar, qualquer ficha ativa anterior do aluno é arquivada e ele recebe uma notificação.'}
        </p>
      )}
    </section>
  )
}
