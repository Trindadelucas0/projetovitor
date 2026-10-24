import { Btn } from '../../ui/gkit.jsx'

const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const ACTIVITY = { bicicleta: 'Bicicleta', esteira: 'Esteira', eliptico: 'Elíptico', mobilidade: 'Mobilidade', personalizado: 'Outra atividade' }

const patchAt = (list, index, patch) => list.map((x, i) => i === index ? { ...x, ...patch } : x)

export function DayWarmups({ items = [], onChange, id }) {
  const add = () => onChange([...items, { id: uid('warmup'), activity: 'bicicleta', title: '', duration_sec: 300, instructions: '' }])
  return <section className="wb-warmups" id={id} aria-labelledby="day-warmup-title">
    <div className="g-row"><div className="g-sp"><b id="day-warmup-title">Aquecimento antes do treino</b><p className="g-mut g-xs">Atividade e tempo mostrados antes do primeiro exercício.</p></div>
      <Btn type="button" size="sm" variant="secondary" onClick={add} disabled={items.length >= 10}>+ Atividade</Btn></div>
    {items.map((x, i) => <div className="wb-warmup-row" key={x.id || i} data-testid={`wb-day-warmup-${i}`}>
      <label><span className="g-mut g-xs">Atividade</span><select className="g-in" value={x.activity || 'personalizado'} onChange={e => onChange(patchAt(items, i, { activity: e.target.value }))}>
        {Object.entries(ACTIVITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {x.activity === 'personalizado' && <label><span className="g-mut g-xs">Nome da atividade</span><input className="g-in" maxLength={120} value={x.title || ''} onChange={e => onChange(patchAt(items, i, { title: e.target.value }))} /></label>}
      <label><span className="g-mut g-xs">Duração (segundos)</span><input className="g-in" type="number" inputMode="numeric" min="30" max="1800" step="30" value={x.duration_sec ?? ''} onChange={e => onChange(patchAt(items, i, { duration_sec: e.target.value }))} /></label>
      <label className="wb-warmup-wide"><span className="g-mut g-xs">Orientação (opcional)</span><input className="g-in" maxLength={1000} value={x.instructions || ''} onChange={e => onChange(patchAt(items, i, { instructions: e.target.value }))} placeholder="Ex.: ritmo leve, conseguindo conversar" /></label>
      <button type="button" className="g-link wb-warmup-remove" onClick={() => onChange(items.filter((_, k) => k !== i))}>Remover</button>
    </div>)}
    {!items.length && <p className="g-mut g-xs wb-warmup-empty">Sem aquecimento geral. O aluno começará pelo primeiro exercício.</p>}
  </section>
}

export function ExerciseWarmups({ items = [], onChange, id }) {
  const add = () => onChange([...items, { id: uid('warmup-set'), reps: '10', duration_sec: '', load_mode: 'percent', load_value: 50, rest_sec: 45, instructions: '' }])
  return <section className="wb-warmups" id={id} aria-labelledby="exercise-warmup-title">
    <div className="g-row"><div className="g-sp"><b id="exercise-warmup-title">Séries de aquecimento</b><p className="g-mut g-xs">Aparecem antes das séries válidas e não entram nas métricas.</p></div>
      <Btn type="button" size="sm" variant="secondary" onClick={add} disabled={items.length >= 10}>+ Série</Btn></div>
    {items.map((x, i) => {
      const timed = x.duration_sec !== '' && x.duration_sec != null && !x.reps
      return <div className="wb-warmup-row" key={x.id || i} data-testid={`wb-ex-warmup-${i}`}>
        <label><span className="g-mut g-xs">Meta</span><select className="g-in" value={timed ? 'tempo' : 'reps'} onChange={e => onChange(patchAt(items, i, e.target.value === 'tempo' ? { reps: '', duration_sec: 30 } : { reps: '10', duration_sec: '' }))}><option value="reps">Repetições</option><option value="tempo">Tempo</option></select></label>
        {timed
          ? <label><span className="g-mut g-xs">Segundos</span><input className="g-in" type="number" min="1" max="3600" value={x.duration_sec ?? ''} onChange={e => onChange(patchAt(items, i, { duration_sec: e.target.value }))} /></label>
          : <label><span className="g-mut g-xs">Repetições</span><input className="g-in" inputMode="numeric" value={x.reps || ''} onChange={e => onChange(patchAt(items, i, { reps: e.target.value }))} /></label>}
        <label><span className="g-mut g-xs">Carga</span><select className="g-in" value={x.load_mode || 'none'} onChange={e => onChange(patchAt(items, i, { load_mode: e.target.value, load_value: e.target.value === 'none' ? '' : (e.target.value === 'percent' ? 50 : 0) }))}><option value="percent">% da carga de trabalho</option><option value="kg">Carga fixa (kg)</option><option value="none">Sem carga</option></select></label>
        {x.load_mode !== 'none' && <label><span className="g-mut g-xs">{x.load_mode === 'percent' ? 'Percentual' : 'Quilos'}</span><input className="g-in" type="number" inputMode="decimal" min="0" max={x.load_mode === 'percent' ? 100 : 1000} step={x.load_mode === 'percent' ? 1 : .5} value={x.load_value ?? ''} onChange={e => onChange(patchAt(items, i, { load_value: e.target.value }))} /></label>}
        <label><span className="g-mut g-xs">Descanso (s)</span><input className="g-in" type="number" inputMode="numeric" min="0" max="600" step="15" value={x.rest_sec ?? 45} onChange={e => onChange(patchAt(items, i, { rest_sec: e.target.value }))} /></label>
        <label className="wb-warmup-wide"><span className="g-mut g-xs">Orientação (opcional)</span><input className="g-in" maxLength={1000} value={x.instructions || ''} onChange={e => onChange(patchAt(items, i, { instructions: e.target.value }))} /></label>
        <button type="button" className="g-link wb-warmup-remove" onClick={() => onChange(items.filter((_, k) => k !== i))}>Remover</button>
      </div>
    })}
    {!items.length && <p className="g-mut g-xs wb-warmup-empty">Sem série de aquecimento para este exercício.</p>}
  </section>
}
