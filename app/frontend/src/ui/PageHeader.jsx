// Cabeçalho padrão de TODA tela do admin: trilha (Breadcrumb), título e 1–2 frases do que dá para fazer ali.
// Mantém os data-testid adm-page-header / adm-breadcrumb / adm-title / adm-desc.
import { Breadcrumb, Typography } from 'antd'
export default function PageHeader({ crumbs = [], title, description, actions, onCrumb }) {
  const items = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1
    return { key: i, title: c.to && onCrumb && !last ? <button type="button" className="adm-crumb-link" onClick={() => onCrumb(c.to)}>{c.label}</button>
      : <span aria-current={last ? 'page' : undefined}>{c.label}</span> }
  })
  return <header className="adm-ph" data-testid="adm-page-header">
    {crumbs.length > 0 && <Breadcrumb items={items} separator="›" aria-label="Você está em" data-testid="adm-breadcrumb" />}
    <div className="adm-ph-row"><Typography.Title level={1} data-testid="adm-title">{title}</Typography.Title>{actions && <div className="adm-ph-actions">{actions}</div>}</div>
    {description && <Typography.Paragraph type="secondary" className="adm-ph-desc" data-testid="adm-desc">{description}</Typography.Paragraph>}
  </header>
}
