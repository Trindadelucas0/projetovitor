// Um exercício dentro do dia. Fechado mostra só o resumo; aberto, os campos.
//
// Os números deixaram de ser <input type="number"> e passaram a usar os controles do app
// (Stepper e NumberField): no celular dá para ajustar séries e descanso sem abrir teclado,
// e a carga aceita vírgula — o teclado decimal de muitos aparelhos só oferece ela.
// Repetições e tempo viraram uma escolha (o servidor exige um dos dois, nunca os dois),
// em vez de dois campos sempre visíveis.
import { useEffect, useState } from 'react'
import { C } from '../../lib/care.js'
import { mediaOf } from '../../lib/guided.js'
import { SIDE_PT, TECH_PT } from '../../lib/workout.js'
import { parseVideo, videoProblem, VIDEO_LABEL } from '../../lib/video.js'
import { fieldId } from '../../lib/workout-validate.js'
import Icon from '../../components/Icon.jsx'
import GSelect from '../../components/GSelect.jsx'
import { NumberField, Stepper, Segmented } from '../../components/ui.jsx'
import { Btn } from '../app/kit.jsx'
import { exSummary } from './shape.js'

// Vídeo do personal no exercício. Dois caminhos: colar o link (YouTube é o que toca
// dentro do app, com velocidade) ou escolher um vídeo já enviado em Exercícios e vídeos.
// A tela diz o que cada tipo permite, em vez de prometer controle que o Instagram não dá.
function VideoField({ e, i, dayIndex, set, media, erro }) {
  const url = e.video_url || ''
  const v = parseVideo(url)
  const problema = erro || videoProblem(url)
  const daLib = (media || []).some(x => x.url === url)
  return (
    <div className="wb-video" data-testid={`wb-video-${i}`}>
      <span className="g-mut g-xs">Meu vídeo deste exercício (opcional)</span>
      <input id={fieldId(dayIndex, i, 'video_url')} className={'g-in' + (problema ? ' wb-in-erro' : '')} value={url}
        onChange={ev => set({ video_url: ev.target.value })}
        placeholder="Cole o link do YouTube (ex.: https://youtu.be/…)" data-testid={`wb-video-url-${i}`} />
      {problema && <small className="wb-erro" role="alert" data-testid={`wb-video-err-${i}`}>{problema}</small>}
      {!problema && v && <small className="g-mut g-xs" data-testid={`wb-video-ok-${i}`}>{VIDEO_LABEL[v.kind]}</small>}
      {!url && <small className="g-mut g-xs">Sem vídeo, o aluno vê a imagem padrão do exercício.</small>}
      {(media || []).length > 0 && (
        <label className="wb-campo">
          <span className="g-mut g-xs">Ou escolha um vídeo já enviado</span>
          <GSelect value={daLib ? url : ''} onChange={v2 => set({ video_url: v2 })} label="Vídeo já enviado"
            options={[{ value: '', label: 'Nenhum' }, ...media.map(x => ({ value: x.url, label: x.caption || 'Vídeo ' + x.id }))]}
            testid={`wb-video-lib-${i}`} />
        </label>
      )}
      {url && <button type="button" className="g-link" onClick={() => set({ video_url: '' })} data-testid={`wb-video-clear-${i}`}>Remover o vídeo deste exercício</button>}
    </div>
  )
}

export default function ExerciseCard({
  e, i, dayIndex, g, total, open, onOpen, set, move, onMenu, onUngroup,
  selecting, selected, onSelect, problems = {},
}) {
  const [media, setMedia] = useState(null)
  const m = mediaOf(e.media)
  useEffect(() => {
    if (open && !media) C.exMedia(e.exercise_id).then(r => setMedia(r.media.filter(x => x.kind === 'video'))).catch(() => setMedia([]))
  }, [open]) // eslint-disable-line

  const perOn = e.per_set.length > 0
  const sets = Math.max(1, Math.min(10, +e.sets || 1))
  const setPer = (k, patch) => set({ per_set: Array.from({ length: sets }, (_, j) => ({ reps: '', load_kg: '', ...(e.per_set[j] || {}), ...(j === k ? patch : {}) })) })

  // O servidor exige repetições OU tempo. Aqui isso é uma escolha, não dois campos soltos.
  const modo = !e.reps && (e.duration_sec !== '' && e.duration_sec != null) ? 'tempo' : 'reps'
  const trocaModo = v => set(v === 'tempo' ? { reps: '', duration_sec: e.duration_sec || 30 } : { duration_sec: '', reps: e.reps || '10-12' })

  // Um grupo (bi/tri-set) se move inteiro, então só o primeiro membro mostra as setas.
  const primeiro = g ? g.start : i
  const ultimo = g ? g.start + g.size - 1 : i
  const mostraMover = !g || g.pos === 0
  const id = f => fieldId(dayIndex, i, f)
  const erroDe = f => problems[f]

  const cls = ['wb-card', g ? 'grp' : '', g && g.pos === 0 ? 'gfirst' : '', g && g.pos === g.size - 1 ? 'glast' : '',
    selected ? 'sel' : '', Object.keys(problems).length ? 'ruim' : ''].filter(Boolean).join(' ')

  return (
    <li className={cls} data-testid="wb-card">
      {g && g.pos === 0 && (
        <div className="wb-gtag">
          <Icon name="link" />
          <span>{g.kind} · sem descanso entre eles, descanso após o último</span>
          <button type="button" className="g-link" onClick={onUngroup}>Desagrupar</button>
        </div>
      )}

      <div className="wb-cab">
        {selecting && (
          <input type="checkbox" className="wb-check" checked={!!selected} onChange={onSelect}
            aria-label={'Selecionar ' + e.name} data-testid={'wb-sel-' + i} />
        )}
        {m
          ? <img className="wb-thumb" src={m.img || m.gif} alt="" />
          : <span className="wb-thumb wb-semimg"><Icon name="dumbbell" /></span>}
        <button type="button" className="wb-cab-txt" onClick={onOpen} aria-expanded={open} aria-controls={open ? id('corpo') : undefined}>
          <b>{i + 1}. {e.name}</b>
          <span className="g-mut g-xs">{exSummary(e)}{e.technique !== 'normal' ? ' · ' + TECH_PT[e.technique] : ''}</span>
        </button>
        <div className="wb-cab-acoes">
          {mostraMover && <>
            <button type="button" className="g-icbtn" onClick={() => move(-1)} disabled={primeiro === 0} aria-label="Subir exercício"><Icon name="arrowUp" /></button>
            <button type="button" className="g-icbtn" onClick={() => move(1)} disabled={ultimo === total - 1} aria-label="Descer exercício"><Icon name="arrowDown" /></button>
          </>}
          <button type="button" className="g-icbtn" onClick={onMenu} aria-label={'Mais ações para ' + e.name}><Icon name="list" /></button>
        </div>
      </div>

      {!open && Object.keys(problems).length > 0 && (
        <p className="wb-erro wb-card-erro" role="alert">{Object.values(problems)[0]}</p>
      )}

      {open && (
        <div className="wb-corpo" id={id('corpo')}>
          <Segmented className="wb-modo" value={modo} onChange={trocaModo}
            options={[{ value: 'reps', label: 'Repetições' }, { value: 'tempo', label: 'Tempo' }]} />

          <div className="wb-campos">
            <label className="wb-campo">
              <span className="g-mut g-xs">Séries</span>
              <Stepper value={+e.sets || 0} step={1} decimal={false} onChange={v => set({ sets: Math.max(1, Math.min(10, v)) })} />
              <input id={id('sets')} type="hidden" value={e.sets ?? ''} data-testid={`wb-sets-${i}`} readOnly />
            </label>

            {modo === 'reps' ? (
              <label className="wb-campo">
                <span className="g-mut g-xs">Repetições (ex.: 10 ou 8-12)</span>
                <input id={id('reps')} className={'g-in' + (erroDe('reps') ? ' wb-in-erro' : '')} value={e.reps}
                  onChange={v => set({ reps: v.target.value })} inputMode="numeric" data-testid={`wb-reps-${i}`} />
              </label>
            ) : (
              <label className="wb-campo">
                <span className="g-mut g-xs">Tempo por série (s)</span>
                <Stepper value={+e.duration_sec || 0} step={5} decimal={false} unit="s" onChange={v => set({ duration_sec: v })} />
                <input id={id('duration_sec')} type="hidden" value={e.duration_sec ?? ''} readOnly />
              </label>
            )}

            <label className="wb-campo">
              <span className="g-mut g-xs">Carga (kg)</span>
              <NumberField id={id('load_kg')} className={erroDe('load_kg') ? 'wb-in-erro' : ''} nullable
                value={e.load_kg === '' ? null : e.load_kg} onChange={v => set({ load_kg: v == null ? '' : v })}
                data-testid={`wb-load-${i}`} />
            </label>

            <label className="wb-campo">
              <span className="g-mut g-xs">{g && g.pos < g.size - 1 ? 'Descanso (s) — 0 no bi-set' : 'Descanso entre séries (s)'}</span>
              <Stepper value={+e.rest_sec || 0} step={15} decimal={false} unit="s" onChange={v => set({ rest_sec: Math.min(600, v) })} />
              <input id={id('rest_sec')} type="hidden" value={e.rest_sec ?? ''} readOnly />
            </label>
          </div>

          {['sets', 'reps', 'duration_sec', 'rest_sec', 'load_kg'].map(f => erroDe(f)
            ? <p key={f} className="wb-erro" role="alert">{erroDe(f)}</p> : null)}

          <details className="org-details wb-avancado">
            <summary>Ajustes avançados</summary>
            <div className="wb-campos">
              <label className="wb-campo">
                <span className="g-mut g-xs">Cadência (ex.: 3-1-2)</span>
                <input id={id('tempo')} className={'g-in' + (erroDe('tempo') ? ' wb-in-erro' : '')} value={e.tempo ?? ''}
                  onChange={v => set({ tempo: v.target.value })} placeholder="3-1-2" data-testid={`wb-tempo-${i}`} />
              </label>
              <label className="wb-campo">
                <span className="g-mut g-xs">RPE (1–10)</span>
                <NumberField id={id('rpe')} nullable value={e.rpe === '' ? null : e.rpe} onChange={v => set({ rpe: v == null ? '' : v })} />
              </label>
              <label className="wb-campo">
                <span className="g-mut g-xs">RIR (reps em reserva)</span>
                <NumberField id={id('rir')} nullable decimal={false} value={e.rir === '' ? null : e.rir} onChange={v => set({ rir: v == null ? '' : v })} />
              </label>
              <label className="wb-campo">
                <span className="g-mut g-xs">Lado</span>
                <GSelect value={e.side} onChange={v => set({ side: v })} label="Lado"
                  options={Object.entries(SIDE_PT).map(([k, l]) => ({ value: k, label: l }))} />
              </label>
              <label className="wb-campo">
                <span className="g-mut g-xs">Técnica</span>
                <GSelect value={e.technique} onChange={v => set({ technique: v })} label="Técnica" testid={`wb-tech-${i}`}
                  options={Object.entries(TECH_PT).map(([k, l]) => ({ value: k, label: l }))} />
              </label>
            </div>
            {['tempo', 'rpe', 'rir'].map(f => erroDe(f) ? <p key={f} className="wb-erro" role="alert">{erroDe(f)}</p> : null)}
          </details>

          <VideoField e={e} i={i} dayIndex={dayIndex} set={set} media={media} erro={erroDe('video_url')} />

          <label className="wb-chk">
            <input type="checkbox" className="wb-check" checked={perOn} data-testid={`wb-per-${i}`}
              onChange={v => set({ per_set: v.target.checked ? Array.from({ length: sets }, () => ({ reps: e.reps, load_kg: e.load_kg })) : [] })} />
            <span>Variar repetições e carga por série (ex.: 12/10/8)</span>
          </label>

          {perOn && (
            <table className="wb-per" id={id('per_set')}>
              <thead><tr><th>Série</th><th>Repetições</th><th>Carga (kg)</th></tr></thead>
              <tbody>
                {Array.from({ length: sets }, (_, k) => (
                  <tr key={k}>
                    <td>{k + 1}</td>
                    <td><input className="g-in" value={e.per_set[k]?.reps ?? ''} onChange={v => setPer(k, { reps: v.target.value })}
                      aria-label={`Repetições da série ${k + 1}`} data-testid={`wb-per-reps-${i}-${k}`} /></td>
                    <td><input className="g-in" value={e.per_set[k]?.load_kg ?? ''} inputMode="decimal" onChange={v => setPer(k, { load_kg: v.target.value })}
                      aria-label={`Carga da série ${k + 1}`} data-testid={`wb-per-load-${i}-${k}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {erroDe('per_set') && <p className="wb-erro" role="alert">{erroDe('per_set')}</p>}

          <label className="wb-campo">
            <span className="g-mut g-xs">Como o aluno deve fazer</span>
            <textarea className="g-in" rows={2} value={e.instructions} onChange={v => set({ instructions: v.target.value })}
              placeholder="Postura, amplitude, respiração, cuidados" data-testid={`wb-instr-${i}`} />
          </label>
          <label className="wb-campo">
            <span className="g-mut g-xs">Observações</span>
            <input className="g-in" value={e.notes} onChange={v => set({ notes: v.target.value })} placeholder="ex.: pare se sentir dor no joelho" />
          </label>

          <Btn variant="tertiary" onClick={onOpen}>Fechar este exercício</Btn>
        </div>
      )}
    </li>
  )
}
