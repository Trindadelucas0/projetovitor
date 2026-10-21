// Governança: indicadores operacionais, termo do módulo e política de retenção (ADM02, ADM03, ADM04).
// O painel de armazenamento existe por um motivo prático: o plano gratuito do Cloudflare R2 dá 10 GB-mês,
// e três vídeos por avaliação mensal consomem isso rápido. É melhor ver a conta chegando do que descobrir
// pela fatura.
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Btn, Empty, Err, Load, Field, Tabs, useLoad } from '../app/kit.jsx'
import { notify, notifyError } from '../../lib/dialog.js'
import { APA } from '../../lib/postural.js'
import './postural.css'

const gb = n => (n / 1024 ** 3).toFixed(2).replace('.', ',') + ' GB'
const mb = n => n >= 1024 ** 3 ? gb(n) : Math.round(n / 1048576) + ' MB'
const hhmm = s => {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

function Metricas() {
  const [d, err, reload] = useLoad(() => APA.metricas())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const a = d.assessments, s = d.armazenamento
  const pct = Math.min(100, s.percentual_gratuito || 0)

  return <div data-testid="ap-metricas">
    <div className="ap-kpis">
      {[['Solicitadas', a.solicitadas], ['Em andamento', a.em_andamento], ['Aguardando análise', a.enviadas],
        ['Em revisão', a.em_revisao], ['Recaptura', a.recaptura], ['Concluídas', a.publicadas],
        ['Canceladas', a.canceladas], ['Total', a.total]].map(([l, v]) => (
        <div key={l} className="av-kpi"><b>{v || 0}</b><span>{l}</span></div>
      ))}
    </div>

    <h3 className="ap-h2">Operação</h3>
    <div className="g-card">
      <p className="g-sm">Tempo médio de conclusão: <b>{hhmm(d.tempo_medio_conclusao_segundos)}</b>
        {d.concluidas_consideradas ? <span className="g-mut g-xs"> (em {d.concluidas_consideradas} avaliação(ões) concluída(s))</span> : null}</p>
      <p className="g-sm">Dúvidas abertas: <b>{d.pendencias.duvidas_abertas}</b> de {d.pendencias.duvidas_total}</p>
      <p className="g-sm">Recapturas solicitadas: <b>{d.pendencias.recapturas}</b></p>
      <p className="g-sm">Envios recusados pelo servidor: <b>{d.pendencias.erros_upload}</b>
        <span className="g-mut g-xs"> (arquivo corrompido, tipo diferente do informado ou acima do limite)</span></p>
    </div>

    <h3 className="ap-h2">Armazenamento</h3>
    <div className="g-card" data-testid="ap-storage">
      <p className="g-sm"><b>{s.arquivos}</b> arquivo(s) · <b>{mb(s.bytes)}</b> · {s.videos} vídeo(s) ocupando {mb(s.bytes_video)}</p>
      <p className="g-mut g-xs">Driver: {s.driver === 'r2' ? `Cloudflare R2 (bucket ${s.bucket || '—'})` : 'disco local no servidor'}</p>
      <div className="g-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
        aria-label="Consumo do plano gratuito do R2"><i style={{ width: pct + '%' }} /></div>
      <p className="g-mut g-xs">{String(s.percentual_gratuito).replace('.', ',')}% dos {gb(s.limite_gratuito_bytes)} do plano gratuito do R2</p>
      {pct >= 80 && <p className="g-note g-sm" data-testid="ap-storage-alerta">
        <Icon name="flag" /> O plano gratuito está perto do limite. Acima dele o R2 cobra por GB-mês: reduza
        a retenção, ou considere limitar vídeos nos protocolos.
      </p>}
      <p className="g-mut g-xs">Retenção atual: {d.retencao_dias} dias.</p>
    </div>

    {d.por_mes?.length > 0 && <>
      <h3 className="ap-h2">Por mês</h3>
      <div className="g-card g-list">
        {d.por_mes.slice().reverse().map(m => (
          <div key={m.ym} className="g-li">
            <span className="g-ico"><Icon name="calendar" /></span>
            <span><b className="g-sm">{m.ym}</b><br />
              <span className="g-mut g-xs">{m.solicitadas} solicitada(s) · {m.enviadas} enviada(s) · {m.publicadas} concluída(s)</span></span>
          </div>
        ))}
      </div>
    </>}
    <Btn variant="tertiary" onClick={reload}>Atualizar</Btn>
  </div>
}

function Termo() {
  const [d, err, reload] = useLoad(() => APA.termos())
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const v = f || { version: d.termo?.version || '', body: d.termo?.body || '' }

  const salvar = async () => {
    setBusy(true)
    try { await APA.salvarTermo(v); setF(null); await reload(); notify('Termo publicado. Os próximos aceites usam esta versão.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  return <div data-testid="ap-termo-adm">
    <p className="adm-sub">
      Este é o texto que o aluno lê e aceita antes de enviar fotos e vídeos. Mudou o conteúdo? Publique com
      uma versão nova — o servidor recusa reescrever um texto já aceito mantendo o mesmo número de versão.
    </p>
    <Field label="Versão (ex.: ap-1.0)">
      <input className="g-in" value={v.version} onChange={e => setF({ ...v, version: e.target.value })} maxLength={40} data-testid="ap-termo-versao" />
    </Field>
    <Field label="Texto do termo">
      <textarea className="g-in" rows={12} value={v.body} onChange={e => setF({ ...v, body: e.target.value })} maxLength={40000} data-testid="ap-termo-body" />
    </Field>
    <p className="g-mut g-xs">A redação jurídica final deve passar por revisão. O aceite fica registrado por aluno, com data, versão e evidência.</p>
    <Btn onClick={salvar} loading={busy} disabled={!f || v.body.trim().length < 30} data-testid="ap-termo-save">Publicar termo</Btn>

    <h3 className="ap-h2">Aceites registrados</h3>
    {d.aceites.length === 0
      ? <Empty icon="shield">Nenhum aceite registrado ainda.</Empty>
      : <div className="g-card g-list">{d.aceites.map((x, k) => (
        <div key={k} className="g-li">
          <span className="g-ico"><Icon name={x.granted ? 'checkCircle' : 'xmark'} /></span>
          <span><b className="g-sm">{x.document === 'avaliacao_postural' ? 'Termo da avaliação' : 'Autorização de divulgação'}</b><br />
            <span className="g-mut g-xs">versão {x.version} · {x.granted ? 'autorizado' : 'recusado'} · {x.n} aluno(s)</span></span>
        </div>
      ))}</div>}
  </div>
}

function Retencao() {
  const [d, err, reload] = useLoad(() => APA.retencao())
  const [dias, setDias] = useState(null)
  const [busy, setBusy] = useState(false)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const v = dias ?? d.retencao_dias

  const salvar = async () => {
    setBusy(true)
    try { await APA.salvarRetencao(+v); setDias(null); await reload(); notify('Política de retenção atualizada.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  return <div data-testid="ap-retencao">
    <p className="adm-sub">
      Depois desse prazo, a varredura automática apaga a foto ou o vídeo do armazenamento e zera a
      referência. A avaliação, o parecer e a trilha de auditoria permanecem — só a imagem sai.
    </p>
    <Field label="Manter a mídia corporal por (dias)">
      <input className="g-in" type="number" min={30} max={3650} value={v} onChange={e => setDias(e.target.value)} data-testid="ap-ret-dias" />
    </Field>
    <p className="g-mut g-xs">Entre 30 e 3650 dias. O padrão é 730 (dois anos).</p>
    <div className="g-card">
      <p className="g-sm">Com o prazo atual de <b>{d.retencao_dias} dias</b>, a próxima varredura apagaria
        <b> {d.a_apagar.arquivos}</b> arquivo(s), liberando {mb(d.a_apagar.bytes)}.</p>
      <p className="g-mut g-xs">A varredura roda junto com o job da recorrência, algumas vezes ao dia.</p>
    </div>
    <Btn onClick={salvar} loading={busy} disabled={dias === null} data-testid="ap-ret-save">Salvar política</Btn>
  </div>
}

export default function IndicadoresAvaliacao() {
  const [aba, setAba] = useState('metricas')
  return <div data-testid="ap-indicadores">
    <Tabs tabs={[['metricas', 'Indicadores'], ['termo', 'Termo e consentimentos'], ['retencao', 'Retenção']]} cur={aba} set={setAba} />
    {aba === 'metricas' && <Metricas />}
    {aba === 'termo' && <Termo />}
    {aba === 'retencao' && <Retencao />}
  </div>
}
