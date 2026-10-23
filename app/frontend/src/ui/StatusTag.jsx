// Etiqueta de situação (substitui Pill + mapa ST do admin). Mesmas cores do .adm-pill.
// <StatusTag v="ativo" />  ·  <StatusTag v={r.status} map={{ x: 'ok' }} />  ·  <StatusTag tone="warn" label="Pendente" />
import { Tag } from 'antd'
import { toneOf } from './antTheme.js'
export default function StatusTag({ v, map, tone, label, className = '', ...rest }) {
  const t = tone ?? toneOf(v, map)
  return <Tag variant="filled" className={('orny-tag' + (t ? ' orny-tag-' + t : '') + ' ' + className).trim()} data-tone={t || 'neutral'} {...rest}>{label ?? v}</Tag>
}
