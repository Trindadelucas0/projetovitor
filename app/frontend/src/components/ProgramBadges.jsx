// Selos do programa (doc §2.4): verificado é do profissional, aprovado é da revisão, oficial/destaque são decisões editoriais.
// Patrocinado é identificação comercial, não selo de qualidade.
export default function ProgramBadges({ p, compact }) {
  const list = []
  if (p.author_verified) list.push(['Profissional verificado', 'v'])
  if (p.approved) list.push(['Programa aprovado', 'a'])
  if ((p.badges || []).includes('oficial')) list.push(['Oficial ORNY', 'o'])
  if ((p.badges || []).includes('destaque')) list.push(['Destaque', 'd'])
  if (!list.length && !p.sponsored) return null
  return <div className="g-chips" style={{ marginTop: compact ? 6 : 10 }} data-testid="program-badges">
    {list.map(([l, k]) => <span key={k} className={'g-chip' + (k === 'o' ? ' g-on' : '')}>✓ {l}</span>)}
    {p.sponsored && <span className="g-chip">Patrocinado · {p.sponsored}</span>}
  </div>
}
