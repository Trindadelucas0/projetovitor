// Cabeçalho padrão de TODA tela do admin: trilha (onde estou), título e 1–2 frases do que dá para fazer ali.
export default function PageHeader({ crumbs = [], title, description, actions, onCrumb }) {
  return <header className="adm-ph" data-testid="adm-page-header">
    {crumbs.length > 0 && <nav aria-label="Você está em" className="adm-crumbs" data-testid="adm-breadcrumb">
      {crumbs.map((c, i) => <span key={i}>{i > 0 && <span className="adm-crumb-sep" aria-hidden="true">›</span>}
        {c.to && onCrumb && i < crumbs.length - 1 ? <button className="adm-crumb-link" onClick={() => onCrumb(c.to)}>{c.label}</button> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}</span>)}
    </nav>}
    <div className="adm-ph-row"><h1 data-testid="adm-title">{title}</h1>{actions && <div className="adm-ph-actions">{actions}</div>}</div>
    {description && <p className="adm-ph-desc" data-testid="adm-desc">{description}</p>}
  </header>
}
