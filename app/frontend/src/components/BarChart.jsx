// Lote 7: grafico de barras em SVG proprio (sem biblioteca). data: [{ label, value, title? }]
export default function BarChart({ data, h = 150, fmt = v => String(v), color = 'var(--st-bar, #20f51b)', goal = null, label = 'Gráfico de barras', testid }) {
  if (!data?.length) return <p className="g-mut g-sm st-empty">Sem treinos no período.</p>
  const W = 340, H = h, P = { t: 18, b: 22, l: 4, r: 4 }
  const max = Math.max(goal || 0, ...data.map(d => d.value), 1)
  const bw = (W - P.l - P.r) / data.length, gap = Math.min(8, bw * 0.28)
  const y = v => P.t + (1 - v / max) * (H - P.t - P.b)
  const every = Math.ceil(data.length / 8), showVal = data.length <= 12
  return <figure className="st-chart" data-testid={testid} style={{ margin: 0 }}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label + ': ' + data.map(d => `${d.label} ${fmt(d.value)}`).join(', ')} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--ag-line, #ffffff22)" />
      {goal ? <><line x1={P.l} x2={W - P.r} y1={y(goal)} y2={y(goal)} stroke="var(--ag-mut, #93a7bb)" strokeDasharray="4 4" /><text x={W - P.r} y={y(goal) - 4} textAnchor="end" fontSize="10" fill="var(--ag-mut, #93a7bb)">meta {fmt(goal)}</text></> : null}
      {data.map((d, i) => { const x = P.l + i * bw + gap / 2, top = y(d.value), hh = Math.max(d.value ? 2 : 0, H - P.b - top)
        return <g key={i}><title>{d.title || `${d.label}: ${fmt(d.value)}`}</title>
          <rect x={x} y={H - P.b - hh} width={Math.max(1, bw - gap)} height={hh} rx={Math.min(5, (bw - gap) / 2)} fill={d.value ? color : 'var(--ag-card-2, #16212d)'} />
          {showVal && d.value > 0 && <text x={x + (bw - gap) / 2} y={H - P.b - hh - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ag-txt, #eef4f9)">{fmt(d.value)}</text>}
          {i % every === 0 && <text x={x + (bw - gap) / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ag-mut, #93a7bb)">{d.label}</text>}
        </g> })}
    </svg>
  </figure>
}
