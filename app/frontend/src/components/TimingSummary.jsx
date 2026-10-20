// Resumo de tempo do treino (duração, tempo ativo, média por série, descanso real x previsto, tempo por exercício)
import { clock } from '../lib/timing.js'
export default function TimingSummary({ t, compact }) {
  if (!t) return compact ? null : <p className="g-mut g-xs">Sem cronometragem (treino registrado antes desta função).</p>
  const rest = t.avg_rest_real_sec != null ? `${clock(t.avg_rest_real_sec)}${t.avg_rest_target_sec != null ? ' (previsto ' + clock(t.avg_rest_target_sec) + ')' : ''}` : '—'
  if (compact) return <span className="g-mut g-xs" data-testid="timing-compact">Total {clock(t.total_sec)} · ativo {clock(t.active_sec)} · {clock(t.avg_set_sec)}/série · descanso {rest}{t.paused_sec ? ' · pausado ' + clock(t.paused_sec) : ''}</span>
  return <div className="g-card" data-testid="timing-summary" style={{ marginTop: 12 }}>
    <b className="g-sm">Tempo do treino</b>
    <div className="g-stat" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginTop: 8 }}>
      <div><b>{clock(t.total_sec)}</b><span>Duração total</span></div><div><b>{clock(t.active_sec)}</b><span>Tempo ativo (em série)</span></div>
      <div><b>{clock(t.avg_set_sec)}</b><span>Média por série</span></div><div><b>{t.avg_rest_real_sec != null ? clock(t.avg_rest_real_sec) : '—'}</b><span>Descanso real médio{t.avg_rest_target_sec != null ? ` · previsto ${clock(t.avg_rest_target_sec)}` : ''}</span></div>
    </div>
    {t.paused_sec > 0 && <p className="g-mut g-xs" style={{ marginTop: 6 }}>Pausado por {clock(t.paused_sec)} (não conta na duração).</p>}
    {t.per_exercise?.length > 0 && <table className="g-sets" style={{ marginTop: 8 }}><thead><tr><th>Exercício</th><th>Séries</th><th>Tempo ativo</th></tr></thead>
      <tbody>{t.per_exercise.map(e => <tr key={e.exercise_id}><td>{e.name}</td><td>{e.sets}</td><td>{clock(e.active_sec)}</td></tr>)}</tbody></table>}
  </div>
}
