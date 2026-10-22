// Escolher um item de uma lista que pode ser longa: busca no topo, abas opcionais e
// linhas com título e detalhe. É a peça que substitui os dois <select> nativos do
// construtor — um deles chegou a ter 90 opções sem busca nenhuma.
//
// Não é um GSelect: ali a opção é só um rótulo, e aqui cada linha precisa mostrar
// situação do aluno ou o tamanho do modelo para a escolha fazer sentido.
import { useMemo, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { SearchField } from '../../components/ui.jsx'
import { Sheet, Tabs, Empty } from '../app/kit.jsx'

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
      <div className="g-card g-list wb-picker" data-testid={testid}>
        {filtrados.length
          ? filtrados.map(x => (
            <button key={x.value} type="button" className="g-li" onClick={() => { onPick(x.value); onClose() }}
              data-value={x.value} data-testid={testid ? testid + '-item' : undefined}>
              {x.icon && <span className="g-ico"><Icon name={x.icon} /></span>}
              {x.avatar}
              <span className="wb-picker-txt">
                <b>{x.label}</b>
                {x.hint && <span className="g-mut g-xs">{x.hint}</span>}
              </span>
              {x.selected ? <Icon name="check" className="g-chev" /> : <Icon name="chevronRight" className="g-chev" />}
            </button>
          ))
          : <Empty icon="magnifier">{q ? 'Nada com esse nome.' : empty}</Empty>}
      </div>
    </Sheet>
  )
}
