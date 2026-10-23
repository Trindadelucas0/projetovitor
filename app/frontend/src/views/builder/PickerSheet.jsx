// Escolher um item de uma lista que pode ser longa: busca no topo, abas opcionais e
// linhas com título e detalhe. É a peça que substitui os dois <select> nativos do
// construtor — um deles chegou a ter 90 opções sem busca nenhuma.
//
// Não é um GSelect: ali a opção é só um rótulo, e aqui cada linha precisa mostrar
// situação do aluno ou o tamanho do modelo para a escolha fazer sentido.
import { useMemo, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { SearchField } from '../../components/ui.jsx'
import { Sheet, Tabs, Empty } from '../../ui/gkit.jsx'

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function PickerSheet({
  title, items, onPick, onClose, tabs, tab, onTab, placeholder = 'Buscar', empty = 'Nada encontrado.',
  testid,
}) {
  const [q, setQ] = useState('')
  const filtrados = useMemo(() => {
    const t = semAcento(q.trim())
    if (!t) return items
    return items.filter(x => semAcento(x.label).includes(t) || semAcento(x.hint).includes(t))
  }, [items, q])

  return (
    <Sheet title={title} onClose={onClose}>
      {items.length > 6 && (
        <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')}
          placeholder={placeholder} aria-label={placeholder} data-testid={testid ? testid + '-q' : undefined} />
      )}
      {tabs && tabs.length > 1 && <Tabs tabs={tabs} cur={tab} set={onTab} />}
      <div className="gk-rows wb-picker" data-testid={testid}>
        {filtrados.length
          ? filtrados.map(x => (
            <button key={x.value} type="button" className="gk-row gk-row-click" onClick={() => { onPick(x.value); onClose() }}
              data-value={x.value} data-testid={testid ? testid + '-item' : undefined}>
              {x.icon && <span className="gk-row-ic"><Icon name={x.icon} /></span>}
              {x.avatar}
              <span className="gk-row-t">
                <b>{x.label}</b>
                {x.hint && <span className="gk-row-s">{x.hint}</span>}
              </span>
              {x.selected ? <span className="gk-row-chev"><Icon name="check" /></span> : <span className="gk-row-chev" aria-hidden="true"><Icon name="chevronRight" /></span>}
            </button>
          ))
          : <Empty icon="magnifier">{q ? 'Nada com esse nome.' : empty}</Empty>}
      </div>
    </Sheet>
  )
}
