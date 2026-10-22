// Biblioteca de exercícios do construtor.
//
// O que mudou em relação à versão anterior: era uma grade de quadradinhos em duas colunas
// numa coluna de 380 px, com três <select> nativos espremidos lado a lado, e para pôr um
// exercício no dia era preciso marcar a caixinha e descer até "Adicionar selecionados".
// Agora é uma lista: um toque na linha adiciona. O que já está no dia aparece marcado,
// em vez de o professor descobrir a duplicata depois.
//
// A lista é desenhada em janelas de 30 porque a chamada traz até 400 itens de uma vez
// (GET /api/pro/library não tem offset) — o custo era montar 400 linhas com imagem.
import { useEffect, useMemo, useState } from 'react'
import { P } from '../../lib/care.js'
import { mediaOf } from '../../lib/guided.js'
import Icon from '../../components/Icon.jsx'
import GSelect from '../../components/GSelect.jsx'
import { SearchField } from '../../components/ui.jsx'
import { Btn, Empty } from '../app/kit.jsx'
import { LEVEL_PT } from './shape.js'

const PAGINA = 30
const vazio = { q: '', group: '', equipment: '', level: '' }

export default function ExerciseLibrary({ open, onClose, onAdd, dayName, inDay, room }) {
  const [f, setF] = useState(vazio)
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  const [mostrar, setMostrar] = useState(PAGINA)

  // Debounce de 250 ms: digitar "agach" não dispara cinco buscas.
  useEffect(() => {
    const t = setTimeout(() => {
      setErro('')
      P.library({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: 400 })
        .then(r => { setD(r); setMostrar(PAGINA) })
        .catch(e => setErro(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [f])

  const lista = d?.exercises || []
  const janela = useMemo(() => lista.slice(0, mostrar), [lista, mostrar])
  const filtrando = !!(f.q || f.group || f.equipment || f.level)
  const semVaga = room <= 0

  const opt = (itens, rotulo) => [{ value: '', label: rotulo }, ...itens.map(x => ({ value: x.id, label: x.name_pt }))]

  return (
    <aside className={'wb-lib' + (open ? ' open' : '')} aria-label="Biblioteca de exercícios" data-testid="wb-lib">
      <div className="wb-lib-top">
        <b>Biblioteca</b>
        <span className="g-sp" />
        <button className="g-icbtn wb-only-mob" onClick={onClose} aria-label="Fechar biblioteca"><Icon name="xmark" /></button>
      </div>

      <div className="wb-lib-filtros">
        <SearchField value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onClear={() => setF({ ...f, q: '' })}
          placeholder="Buscar exercício" aria-label="Buscar exercício" data-testid="wb-lib-q" />
        <div className="wb-chips">
          <GSelect className="wb-chip-sel" value={f.group} onChange={v => setF({ ...f, group: v })}
            options={opt(d?.groups || [], 'Músculo')} label="Músculo ou região" sheetTitle="Músculo ou região" placeholder="Músculo" />
          <GSelect className="wb-chip-sel" value={f.level} onChange={v => setF({ ...f, level: v })}
            options={[{ value: '', label: 'Nível' }, ...Object.entries(LEVEL_PT).map(([k, l]) => ({ value: k, label: l }))]}
            label="Nível" sheetTitle="Nível" placeholder="Nível" />
          <GSelect className="wb-chip-sel wb-chip-equip" value={f.equipment} onChange={v => setF({ ...f, equipment: v })}
            options={opt(d?.equipment || [], 'Equipamento')} label="Equipamento" sheetTitle="Equipamento" placeholder="Equipamento" />
          {filtrando && <button className="g-chipbtn" onClick={() => setF(vazio)}>Limpar filtros</button>}
        </div>
      </div>

      {erro && <p className="wb-erro" role="alert">{erro}</p>}

      {/* Contagem honesta: quantos estão desenhados de quantos a busca achou. */}
      {d && <p className="wb-lib-conta g-mut g-xs">
        {lista.length ? `${janela.length} de ${lista.length} exercício(s)` : 'Nenhum exercício com esses filtros.'}
        {semVaga && <span className="wb-erro"> · {dayName} já tem o máximo de 40 exercícios</span>}
      </p>}

      <div className="wb-lib-lista">
        {!d && <p className="g-mut g-sm">Carregando…</p>}
        {d && !lista.length && <Empty icon="magnifier">Tente outro nome ou limpe os filtros.</Empty>}
        {janela.map(x => {
          const m = mediaOf(x.media)
          const posto = inDay.has(x.id)
          return (
            <button key={x.id} type="button" className={'wb-exrow' + (posto ? ' posto' : '')} data-testid="wb-tile"
              disabled={semVaga} onClick={() => onAdd([x])}
              aria-label={`Adicionar ${x.name} a ${dayName}`}>
              {m
                ? <img className="wb-exthumb" src={m.gif || m.img} alt="" loading="lazy" onError={ev => {
                    // O gif pode faltar; cai para a imagem estática e, se nem ela existe, esconde.
                    if (m.img && ev.currentTarget.src !== new URL(m.img, location.href).href) ev.currentTarget.src = m.img
                    else ev.currentTarget.style.visibility = 'hidden'
                  }} />
                : <span className="wb-exthumb wb-semimg"><Icon name="dumbbell" /></span>}
              <span className="wb-exinfo">
                <span className="wb-exnome">{x.name}</span>
                <span className="g-mut g-xs">{[x.equipment, ...(x.groups || []).slice(0, 2), LEVEL_PT[x.level]].filter(Boolean).join(' · ')}</span>
              </span>
              {posto
                ? <span className="wb-pill-ok">no dia</span>
                : <span className="wb-exmais" aria-hidden="true"><Icon name="plus" /></span>}
            </button>
          )
        })}
        {lista.length > janela.length && (
          <Btn variant="secondary" size="sm" onClick={() => setMostrar(n => n + PAGINA)} data-testid="wb-lib-mais">
            Carregar mais ({lista.length - janela.length})
          </Btn>
        )}
      </div>

      <div className="wb-lib-foot wb-only-mob">
        <Btn onClick={onClose} data-testid="wb-add-sel">
          {inDay.size ? `Concluir · ${inDay.size} em ${dayName}` : 'Fechar a biblioteca'}
        </Btn>
      </div>
    </aside>
  )
}
