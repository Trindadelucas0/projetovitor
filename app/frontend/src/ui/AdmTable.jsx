// Tabela do admin (antd Table) com a MESMA API do DataTable antigo:
// cols [{ k, l, r?(row), csv?(row), sv?(row) }], rows, onRow, name, filters, pageSize, empty.
// Busca (dt-search), contagem, Exportar CSV (dt-csv, respeita busca e ordenação), ordenação por coluna,
// paginação e linhas dt-row. No celular (<= 600 px) vira lista de cartões (3 campos + "Ver mais campos").
import { useMemo, useState } from 'react'
import { Button, Input, Pagination, Select, Table } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useMedia } from './useMedia.js'

const csvEsc = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
export function downloadCSV(name, cols, rows) {
  const out = [cols.map(c => csvEsc(c.l)).join(';'), ...rows.map(r => cols.map(c => csvEsc(c.csv ? c.csv(r) : r[c.k])).join(';'))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + out], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click()
}
// filtro + ordenação puros (testáveis)
export function filterSort(rows, cols, q, sort) {
  let l = rows || []
  if (q) { const t = q.toLowerCase(); l = l.filter(r => cols.some(c => String(c.csv ? c.csv(r) : r[c.k] ?? '').toLowerCase().includes(t))) }
  if (sort?.k && sort.d) { const c = cols.find(x => x.k === sort.k); if (c) l = [...l].sort((a, b) => { const va = c.sv ? c.sv(a) : a[c.k], vb = c.sv ? c.sv(b) : b[c.k]; return (va > vb ? 1 : va < vb ? -1 : 0) * sort.d }) }
  return l
}
const cell = (c, r) => (c.r ? c.r(r) : String(r[c.k] ?? '—'))
const keyOf = (r, i) => r.id ?? r.user_id ?? i

function Cards({ cols, rows, onRow, empty }) {
  const [open, setOpen] = useState(null)
  if (!rows.length) return <p className="orny-muted">{empty}</p>
  return <div className="adm-cards">{rows.map((r, i) => { const k = keyOf(r, i), exp = open === k, shown = exp ? cols : cols.slice(0, 3)
    return <div key={k} className={'adm-card-row' + (onRow ? ' adm-row-click' : '') + (exp ? ' org-expanded' : '')} data-testid="dt-row" tabIndex={onRow ? 0 : undefined} role={onRow ? 'button' : undefined}
      onClick={() => onRow && onRow(r)} onKeyDown={e => { if (onRow && e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onRow(r) } }}>
      <dl>{shown.map(c => <div key={c.k} style={{ display: 'contents' }}><dt>{c.l}</dt><dd>{cell(c, r)}</dd></div>)}</dl>
      {cols.length > 3 && <div className="adm-card-more org-mobile-more"><Button size="small" aria-expanded={exp} onClick={e => { e.stopPropagation(); setOpen(v => v === k ? null : k) }}>{exp ? 'Ver menos' : 'Ver mais campos'}</Button></div>}
    </div> })}</div>
}

export default function AdmTable({ cols, rows, onRow, name, filters, pageSize = 15, empty = 'Nada encontrado.', loading }) {
  const [q, setQ] = useState(''), [sort, setSort] = useState(null), [page, setPage] = useState(1)
  const mobile = useMedia('(max-width: 600px)')
  const list = useMemo(() => filterSort(rows, cols, q, sort), [rows, q, sort, cols])
  const pages = Math.max(1, Math.ceil(list.length / pageSize)), pg = Math.min(page, pages)
  const slice = list.slice((pg - 1) * pageSize, pg * pageSize)
  const columns = cols.map(c => ({ key: c.k, dataIndex: c.k, title: c.l, render: (_, r) => cell(c, r), sorter: c.sort !== false, showSorterTooltip: false,
    sortOrder: sort?.k === c.k && sort.d ? (sort.d > 0 ? 'ascend' : 'descend') : null, ellipsis: false }))
  const tools = <div className="adm-table-tools adm-tools">
    <Input className="adm-table-search" placeholder="Buscar…" value={q} allowClear prefix={<SearchOutlined aria-hidden="true" />} aria-label="Buscar"
      onChange={e => { setQ(e.target.value); setPage(1) }} data-testid="dt-search" />
    {filters}
    <span style={{ flex: 1 }} /><span className="adm-table-count">{list.length} registro(s)</span>
    <Button icon={<DownloadOutlined />} onClick={() => downloadCSV(name || 'export', cols, list)} data-testid="dt-csv">Exportar CSV</Button>
  </div>
  const pager = pages > 1 && <Pagination className="adm-pager" align="end" size="small" current={pg} total={list.length} pageSize={pageSize} showSizeChanger={false} onChange={setPage}
    showTotal={() => `Página ${pg} de ${pages}`} />
  if (mobile) return <div className="adm-table adm-table-m">
    {tools}
    <div className="org-mobile-sort orny-row" style={{ margin: '4px 0 12px' }}><span className="orny-muted">Ordenar por</span>
      <Select size="middle" style={{ minWidth: 160, flex: 1 }} value={sort?.k || ''} onChange={k => setSort(k ? { k, d: 1 } : null)} aria-label="Ordenar por"
        options={[{ value: '', label: 'Ordem original' }, ...cols.map(c => ({ value: c.k, label: c.l }))]} />
      <Button disabled={!sort} onClick={() => setSort(s => ({ ...s, d: -s.d }))}>{sort?.d === -1 ? 'Decrescente' : 'Crescente'}</Button></div>
    <Cards cols={cols} rows={slice} onRow={onRow} empty={empty} />
    {pager}
  </div>
  return <div className="adm-table">
    {tools}
    <Table size="middle" columns={columns} dataSource={slice} rowKey={r => keyOf(r, slice.indexOf(r))} pagination={false} loading={loading} scroll={{ x: 'max-content' }}
      locale={{ emptyText: empty, triggerAsc: 'Ordenar crescente', triggerDesc: 'Ordenar decrescente', cancelSort: 'Remover ordenação' }}
      onChange={(_, __, s) => { const one = Array.isArray(s) ? s[0] : s; setSort(one?.order ? { k: one.columnKey, d: one.order === 'ascend' ? 1 : -1 } : null) }}
      rowClassName={() => (onRow ? 'adm-row-click' : '')}
      onRow={r => ({ 'data-testid': 'dt-row', tabIndex: onRow ? 0 : undefined, onClick: () => onRow && onRow(r),
        onKeyDown: e => { if (onRow && e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onRow(r) } } })} />
    {pager}
  </div>
}
