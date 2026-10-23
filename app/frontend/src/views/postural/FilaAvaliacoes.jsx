// Operação: a fila de avaliações do profissional (P01) e a solicitação (P04).
// Separada da governança de propósito: aqui é o dia a dia com o aluno; protocolos e indicadores ficam na
// outra área. As rotas também são separadas (/api/pro/* aqui, /api/adm/* lá), então quando o app reabrir
// para vários personais estas telas saem do painel administrativo sem mexer no servidor.
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import RevisaoAvaliacao from './RevisaoAvaliacao.jsx'
import { Empty, Err, Load, useLoad, useAutoRefresh } from '../app/kit.jsx'
import { Badge, Checkbox, Input, Segmented, Statistic } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { Btn as KBtn, TextIn, NumIn, Area, Sel, Card, Field, Warn } from '../../ui/kit.jsx'
import SubTabs from '../../ui/SubTabs.jsx'
// usada pelo admin e pelo /pro (ambos dentro de AntProvider); Btn legado (variant/loading) mapeado para antd
const Btn = ({ variant, ...p }) => <KBtn v={variant === 'tertiary' ? 'ghost' : 'primary'} {...p} />
import { notify, notifyError } from '../../lib/dialog.js'
import { APV, STATUS_PT, EXAMPLES } from '../../lib/postural.js'
import ExampleEditor from './ExampleEditor.jsx'
import { P } from '../../lib/care.js'
import './postural.css'

const dt = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''

function PersonalExamples() {
  const [protocols, error] = useLoad(() => APV.protocolos())
  const [protocolId, setProtocolId] = useState('')
  const [steps, stepsError] = useLoad(() => protocolId ? EXAMPLES.steps(protocolId) : Promise.resolve({ steps: [] }), [protocolId])
  const [stepId, setStepId] = useState('')
  if (error || stepsError) return <Err msg={error || stepsError} />
  return <Card className="ap-solicitar">
    <p className="g-sm">Adicione exemplos seus para os alunos das próximas avaliações que você solicitar.</p>
    <Field label="Protocolo"><Sel style={{ width: '100%' }} value={protocolId} onChange={e => { setProtocolId(e.target.value); setStepId('') }}>
      <option value="">Selecione…</option>
      {(protocols?.protocols || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Sel></Field>
    {protocolId && <Field label="Etapa"><Sel style={{ width: '100%' }} value={stepId} onChange={e => setStepId(e.target.value)}>
      <option value="">Selecione…</option>
      {(steps?.steps || []).map(s => <option key={s.id} value={s.id}>{s.position}. {s.title}</option>)}
    </Sel></Field>}
    {stepId && <ExampleEditor stepId={stepId} />}
  </Card>
}

function Solicitar({ onDone }) {
  const [alunos] = useLoad(() => P.students('ativos', ''))
  const [protos] = useLoad(() => APV.protocolos())
  const [f, setF] = useState({ student_id: '', protocol_id: '', due_days: 7, message: '', recorrente: false, period_months: 1, day_of_month: 1 })
  const [busy, setBusy] = useState(false)

  const lista = alunos?.students || alunos?.rows || []
  // só protocolo com versão publicada pode ser solicitado (o servidor confere de novo)
  const disponiveis = protos?.protocols || []

  const enviar = async () => {
    if (!f.student_id || !f.protocol_id) return notify('Escolha o aluno e o protocolo.', 'error')
    setBusy(true)
    try {
      await APV.solicitar({
        student_id: f.student_id, protocol_id: f.protocol_id, due_days: +f.due_days, message: f.message || undefined,
        recurrence: f.recorrente ? { period_months: +f.period_months, day_of_month: +f.day_of_month } : undefined
      })
      notify('Avaliação solicitada. O aluno foi avisado.')
      setF({ ...f, student_id: '', message: '' })
      onDone?.()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  return <Card className="ap-solicitar">
    <Field label="Aluno">
      {lista.length > 0
        ? <Sel style={{ width: '100%' }} showSearch optionFilterProp="label" value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })} data-testid="ap-sol-aluno">
          <option value="">Selecione…</option>
          {lista.map(s => <option key={s.id || s.student_id} value={s.id || s.student_id}>{s.name || s.student}</option>)}
        </Sel>
        : <TextIn placeholder="Identificador do aluno" value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })} data-testid="ap-sol-aluno" />}
    </Field>
    <Field label="Protocolo">
      <Sel style={{ width: '100%' }} value={f.protocol_id} onChange={e => setF({ ...f, protocol_id: e.target.value })} data-testid="ap-sol-protocolo">
        <option value="">Selecione…</option>
        {disponiveis.map(p => <option key={p.id} value={p.id}>{p.name}{p.oficial ? ' (oficial)' : ''}</option>)}
      </Sel>
    </Field>
    {disponiveis.length === 0 && <Warn type="info">Nenhum protocolo publicado disponível. A administração pode publicar um protocolo.</Warn>}
    <Field label="Prazo (dias)">
      <NumIn min={1} max={90} value={f.due_days} onChange={e => setF({ ...f, due_days: e.target.value })} data-testid="ap-sol-prazo" />
    </Field>
    <Field label="Recado para o aluno (opcional)">
      <Area rows={2} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} maxLength={1000} />
    </Field>
    <Checkbox className="ap-sol-rec" checked={f.recorrente} onChange={e => setF({ ...f, recorrente: e.target.checked })} data-testid="ap-sol-recorrente">Repetir automaticamente</Checkbox>
    {f.recorrente && <div className="g-grid2">
      <Field label="A cada quantos meses"><NumIn min={1} max={12} value={f.period_months} onChange={e => setF({ ...f, period_months: e.target.value })} /></Field>
      <Field label="Dia do mês (1 a 28)"><NumIn min={1} max={28} value={f.day_of_month} onChange={e => setF({ ...f, day_of_month: e.target.value })} /></Field>
    </div>}
    <p className="g-mut g-xs">Cada repetição gera uma avaliação própria; nada é sobrescrito. Se o ciclo anterior ainda estiver aberto, a geração é adiada.</p>
    <Btn onClick={enviar} loading={busy} data-testid="ap-sol-enviar">Enviar solicitação</Btn>
  </Card>
}

function Recorrencias() {
  const [d, err, reload] = useLoad(() => APV.recorrencias())
  const [busy, setBusy] = useState(false)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  if (!d.recurrences.length) return <Empty icon="calendar">Nenhuma repetição programada.</Empty>
  const pausar = async r => {
    setBusy(true)
    try { await APV.recorrencia({ student_id: r.student_id, protocol_id: r.protocol_id, active: false }); await reload(); notify('Repetição pausada.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const retomar = async r => {
    setBusy(true)
    try { await APV.recorrencia({ student_id: r.student_id, protocol_id: r.protocol_id, period_months: r.period_months, day_of_month: r.day_of_month, due_days: r.due_days }); await reload(); notify('Repetição retomada.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return <Card className="ap-list">{d.recurrences.map(r => (
    <div key={r.id} className="g-li" data-testid={'ap-rec-' + r.id}>
      <span className="g-ico"><Icon name="calendar" /></span>
      <span><b className="g-sm">{r.student_name}</b><br />
        <span className="g-mut g-xs">{r.protocol_name} · a cada {r.period_months} mês(es), dia {r.day_of_month}
          {r.active ? ` · próxima em ${dt(r.next_due_on)}` : ' · pausada'}</span></span>
      <span className="g-sp" />
      {r.active
        ? <Btn variant="tertiary" onClick={() => pausar(r)} disabled={busy}>Pausar</Btn>
        : <Btn variant="tertiary" onClick={() => retomar(r)} disabled={busy}>Retomar</Btn>}
    </div>
  ))}</Card>
}

export default function FilaAvaliacoes() {
  const [filtro, setFiltro] = useState('abertas')
  const [termo, setTermo] = useState('')
  const [aberta, setAberta] = useState(null)
  const [aba, setAba] = useState('fila')
  const [d, err, reload] = useLoad(() => APV.fila({ status: filtro === 'todas' ? '' : filtro, q: termo }), [filtro, termo])
  useAutoRefresh(reload, 60000)

  if (aberta) return <RevisaoAvaliacao id={aberta} onClose={() => { setAberta(null); reload() }} />
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />

  const c = d.counts || {}
  return (
    <div data-testid="ap-fila">
      <p className="orny-muted">
        Solicite a avaliação, acompanhe o preenchimento e publique a devolutiva. As fotos e vídeos do aluno
        ficam em área privada: saem só por aqui, e todo acesso é registrado.
      </p>

      <SubTabs current={aba} onChange={setAba} items={[['fila', <>Fila <Badge count={c.aguardando_analise || 0} size="small" /></>], ['solicitar', 'Nova solicitação'], ['exemplos', 'Meus exemplos'], ['recorrencias', 'Repetições'], ['duvidas', <>Dúvidas <Badge count={c.duvidas || 0} size="small" /></>]]} />

      {aba === 'solicitar' && <Solicitar onDone={() => { setAba('fila'); reload() }} />}
      {aba === 'exemplos' && <PersonalExamples />}
      {aba === 'recorrencias' && <Recorrencias />}
      {aba === 'duvidas' && <p className="g-mut g-sm">
        As dúvidas abrem na conversa do atendimento, junto com o resto. <a className="g-link" href="#/pro?tab=atendimentos">Ir para Dúvidas e atendimentos</a>.
      </p>}

      {aba === 'fila' && <>
        <div className="ap-kpis">
          {[['Solicitadas', c.solicitadas], ['Em andamento', c.em_andamento], ['Aguardando análise', c.aguardando_analise], ['Em revisão', c.em_revisao], ['Recaptura', c.recaptura], ['Concluídas', c.concluidas]].map(([l, v]) => (
            <Card key={l} className="orny-kpi ap-kpi"><Statistic value={v || 0} title={l} /></Card>
          ))}
        </div>

        <div className="g-row ap-filtros">
          <Input allowClear prefix={<SearchOutlined />} placeholder="Buscar aluno…" value={termo} onChange={e => setTermo(e.target.value)} data-testid="ap-fila-busca" aria-label="Buscar aluno" />
          <div className="ap-seg-scroll"><Segmented value={filtro} onChange={setFiltro}
            options={[['abertas', 'Abertas'], ['enviada', 'Aguardando análise'], ['publicada', 'Concluídas'], ['todas', 'Todas']].map(([k, l]) => ({ value: k, label: <span data-testid={'ap-fila-f-' + k}>{l}</span> }))} /></div>
        </div>

        {d.assessments.length === 0
          ? <Empty icon="clipboard">Nenhuma avaliação com esse filtro.</Empty>
          : <Card className="ap-list">{d.assessments.map(x => (
            <button key={x.id} className="g-li" onClick={() => setAberta(x.id)} data-testid={'ap-fila-' + x.id}>
              <span className="g-ico"><Icon name={x.status === 'publicada' ? 'checkCircle' : x.a_revisar ? 'flag' : 'clipboard'} /></span>
              <span>
                <b className="g-sm">{x.student_name}</b><br />
                <span className="g-mut g-xs">
                  {STATUS_PT[x.status] || x.status} · {x.done}/{x.total} etapas
                  {x.a_revisar ? ` · ${x.a_revisar} sem parecer` : ''}
                  {x.duvidas ? ` · ${x.duvidas} dúvida(s)` : ''}
                  {x.due_at && !x.submitted_at ? ` · prazo ${dt(x.due_at)}` : ''}
                </span>
              </span>
              <span className="g-sp" />
              <Icon name="chevronRight" />
            </button>
          ))}</Card>}
      </>}
    </div>
  )
}
