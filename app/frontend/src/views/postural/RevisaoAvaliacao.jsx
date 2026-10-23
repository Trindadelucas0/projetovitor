// Análise de uma avaliação, etapa a etapa (P05 e P07 da especificação).
// O parecer fica em rascunho: só a publicação torna a devolutiva visível ao aluno, e o servidor recusa
// publicar com etapa sem parecer ou sem resumo escrito — aqui a tela apenas reflete isso.
// Comparação com o ciclo anterior usa a MESMA etapa (pelo código), não a posição, porque protocolos
// diferentes podem ter ordens diferentes.
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import MediaLightbox from '../../components/MediaLightbox.jsx'
import { Btn, Err, Load, Field, useLoad } from '../app/kit.jsx'
import { ask, askText, notify, notifyError } from '../../lib/dialog.js'
import { APV, DECISION_PT, KIND_PT, STATUS_PT, fmtBytes } from '../../lib/postural.js'
import './postural.css'

const dt = s => s ? new Date(s).toLocaleString('pt-BR') : ''
const DECISOES = [['adequada', 'Adequada'], ['recapturar', 'Solicitar recaptura'], ['nao_avaliavel', 'Não avaliável']]

export default function RevisaoAvaliacao({ id, onClose }) {
  const [d, err, reload] = useLoad(() => APV.item(id), [id])
  const [i, setI] = useState(0)
  const [lb, setLb] = useState(null)
  const [nota, setNota] = useState('')
  const [motivo, setMotivo] = useState('')
  const [dev, setDev] = useState(null)
  const [busy, setBusy] = useState(false)
  const [aba, setAba] = useState('etapas')

  if (err) return <div><Err msg={err} retry={reload} /></div>
  if (!d) return <Load />

  const { assessment: a, steps = [], captures = [], previous = [], student, questions = [] } = d
  const comMidia = steps.filter(s => captures.some(c => c.step_id === s.id && ['enviada', 'dispensada'].includes(c.status)))
  const step = comMidia[Math.min(i, comMidia.length - 1)] || steps[0]
  const cap = step ? captures.find(c => c.step_id === step.id && ['enviada', 'dispensada'].includes(c.status)) : null
  const pendentes = captures.filter(c => c.status === 'enviada' && !c.review_status).length
  const dvv = dev || { summary: a.devolutiva_summary || '', recommendations: a.devolutiva_recommendations || '', followup: a.devolutiva_followup || '', next_assessment_on: a.next_assessment_on || '' }
  const encerrada = a.status === 'publicada' || a.status === 'cancelada'

  // mesma etapa no ciclo anterior, pelo código da etapa
  const anterior = previous
    .map(p => ({ p, m: (p.captures || []).find(x => x.step_code === step?.code) }))
    .find(x => x.m)

  const decidir = async decision => {
    if (!cap || cap.status !== 'enviada') return
    if (decision === 'recapturar' && motivo.trim().length < 3) return notify('Explique ao aluno o que refazer.', 'error')
    setBusy(true)
    try {
      await APV.etapa({ capture_id: cap.id, decision, note: nota || undefined, correction_reason: decision === 'recapturar' ? motivo : undefined })
      setNota(''); setMotivo('')
      await reload()
      if (i < comMidia.length - 1) setI(i + 1)
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const salvarDevolutiva = async () => {
    setBusy(true)
    try { await APV.devolutiva({ id, ...dvv }); setDev(null); await reload(); notify('Rascunho salvo. O aluno ainda não vê.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const publicar = async () => {
    if (!(await ask('Publicar devolutiva?', { text: 'Depois de publicar, o aluno passa a ver o resumo, as recomendações e o parecer de cada etapa.', ok: 'Publicar' }))) return
    setBusy(true)
    try { await APV.publicar(id); await reload(); notify('Devolutiva publicada. O aluno foi avisado.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const pedirRecaptura = async () => {
    if (!(await ask('Devolver para o aluno?', { text: 'As etapas marcadas como "solicitar recaptura" voltam para ele refazer. As aprovadas ficam como estão.', ok: 'Devolver' }))) return
    setBusy(true)
    try { const r = await APV.recaptura(id); await reload(); notify(`${r.redo} etapa(s) devolvida(s) ao aluno.`) }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const cancelar = async () => {
    const reason = await askText('Cancelar avaliação', { label: 'Motivo (o aluno vê este texto)', required: true, multiline: true, ok: 'Cancelar avaliação', danger: true })
    if (!reason) return
    setBusy(true)
    try { await APV.cancelar(id, reason); await reload(); notify('Avaliação cancelada.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  const itens = cap?.has_media ? [{ kind: step.capture_kind === 'video' ? 'video' : 'foto', url: APV.mediaUrl(cap.id), label: step.title }] : []
  if (anterior?.m) itens.push({ kind: 'foto', url: APV.mediaUrl(anterior.m.capture_id), label: 'Ciclo anterior · ' + step.title })

  return (
    <div className="ap-rev" data-testid="ap-revisao">
      <div className="g-row">
        <div>
          <span className="ap-vers-label">{a.protocol_name}</span>
          <h2 style={{ margin: '2px 0' }}>{student?.name}</h2>
          <p className="g-mut g-xs">
            {STATUS_PT[a.status]} · enviada em {dt(a.submitted_at)}
            {pendentes > 0 ? ` · ${pendentes} etapa(s) sem parecer` : ' · todas avaliadas'}
          </p>
        </div>
        <span className="g-sp" />
        {onClose && <button className="g-icbtn" onClick={onClose} aria-label="Fechar"><Icon name="xmark" /></button>}
      </div>

      <div className="mg-subtabs" role="tablist">
        {[['etapas', 'Etapas'], ['dados', 'Dados do aluno'], ['duvidas', `Dúvidas${questions.length ? ' (' + questions.length + ')' : ''}`], ['devolutiva', 'Devolutiva']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={'adm-btn ' + (aba === k ? '' : 'ghost')} onClick={() => setAba(k)} data-testid={'ap-rev-tab-' + k}>{l}</button>
        ))}
      </div>

      {aba === 'etapas' && (comMidia.length === 0
        ? <p className="g-mut">O aluno ainda não enviou nenhuma etapa.</p>
        : <>
          <div className="g-row ap-rev-nav">
            <Btn variant="secondary" size="sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>Anterior</Btn>
            <span className="g-mut g-sm">Etapa {step.position} de {steps.length} · {i + 1}/{comMidia.length} com registro</span>
            <span className="g-sp" />
            <Btn variant="secondary" size="sm" onClick={() => setI(Math.min(comMidia.length - 1, i + 1))} disabled={i >= comMidia.length - 1}>Próxima</Btn>
          </div>

          <h3 className="ap-h2">{step.position}. {step.title} <span className="g-mut g-xs">({KIND_PT[step.capture_kind]})</span></h3>

          {cap?.status === 'dispensada'
            ? <div className="g-note g-sm" data-testid="ap-rev-skipped"><strong>Etapa dispensada pelo aluno</strong><p>{cap.skip_reason}</p></div>
            : <div className="ap-rev-media">
              <button className="ap-cap-prev" onClick={() => setLb(0)} aria-label="Ampliar" data-testid="ap-rev-media">
                {step.capture_kind === 'video'
                  ? <video src={APV.mediaUrl(cap.id)} controls playsInline preload="metadata" />
                  : <img src={APV.mediaUrl(cap.id)} alt={step.title} />}
              </button>
              <p className="g-mut g-xs">{fmtBytes(cap.media_bytes)} · recebido em {dt(cap.uploaded_at)} · tentativa {cap.attempt}</p>
              {anterior && <Btn variant="secondary" size="sm" onClick={() => setLb(1)} data-testid="ap-rev-compare">
                <Icon name="history" /> Comparar com o ciclo anterior
              </Btn>}
            </div>}

          {Array.isArray(step.instructions) && <details className="org-details"><summary>O que foi pedido ao aluno</summary>
            <ol className="ap-step-list g-sm">{step.instructions.map((t, k) => <li key={k}>{t}</li>)}</ol></details>}

          {cap?.status === 'enviada' && !encerrada && <>
            <Field label="Qualidade do registro">
              <div className="g-opts">
                {DECISOES.map(([k, l]) => (
                  <button key={k} type="button" className={'g-opt' + (cap.review_status === k ? ' g-on' : '')} onClick={() => decidir(k)}
                    disabled={busy} data-testid={'ap-rev-dec-' + k}>{l}</button>
                ))}
              </div>
            </Field>
            {cap.review_status === 'recapturar' && <p className="g-note g-sm">Motivo enviado ao aluno: {cap.correction_reason}</p>}
            <Field label="Motivo da recaptura (o aluno lê este texto)">
              <textarea className="g-in" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500}
                placeholder="Ex.: a câmera ficou na diagonal; centralize na altura do umbigo." data-testid="ap-rev-reason" />
            </Field>
            <Field label="Observação interna (o aluno só vê depois de publicada)">
              <textarea className="g-in" rows={2} value={nota} onChange={e => setNota(e.target.value)} maxLength={2000} data-testid="ap-rev-note" />
            </Field>
          </>}

          {cap?.review_status && <p className="g-mut g-xs">
            Parecer atual: <b>{DECISION_PT[cap.review_status]}</b>{cap.reviewed_at ? ' · ' + dt(cap.reviewed_at) : ''}
          </p>}
        </>)}

      {aba === 'dados' && <div className="g-card">
        {Object.keys(a.complementary || {}).length === 0
          ? <p className="g-mut">O aluno não preencheu os dados complementares.</p>
          : <dl className="ap-dl">
            {a.complementary.height_cm ? <><dt>Altura</dt><dd>{a.complementary.height_cm} cm</dd></> : null}
            {a.complementary.weight_kg ? <><dt>Peso</dt><dd>{a.complementary.weight_kg} kg</dd></> : null}
            {a.complementary.pain_now != null ? <><dt>Dor atual</dt><dd>{a.complementary.pain_now ? 'Sim' : 'Não'}</dd></> : null}
            {(a.complementary.pain || []).length ? <><dt>Onde dói</dt><dd>{a.complementary.pain.join('; ')}</dd></> : null}
            {(a.complementary.objectives || []).length ? <><dt>Objetivos</dt><dd>{a.complementary.objectives.join('; ')}</dd></> : null}
            {a.complementary.injuries ? <><dt>Lesões e cirurgias</dt><dd className="ap-pre">{a.complementary.injuries}</dd></> : null}
          </dl>}
        {a.student_notes && <><h4 className="ap-h2">Observações do aluno no envio</h4><p className="g-sm ap-pre">{a.student_notes}</p></>}
        <p className="g-mut g-xs">Consentimento registrado em {dt(a.consent_at)} (versão {a.terms_version || '—'}).
          {' '}Divulgação em redes: <b>{a.consent_share_granted ? 'autorizada' : 'não autorizada'}</b>.</p>
      </div>}

      {aba === 'duvidas' && (questions.length === 0
        ? <p className="g-mut">Nenhuma dúvida nesta avaliação.</p>
        : <div className="g-card g-list">{questions.map(t => (
          <a key={t.id} className="g-li" href={'#/conversa/' + t.id} data-testid={'ap-rev-duvida-' + t.id}>
            <span className="g-ico"><Icon name="chat" /></span>
            <span><b className="g-sm">{steps.find(s => s.id === t.step_id)?.title || 'Geral'}</b><br />
              <span className="g-mut g-xs">{t.first_message?.slice(0, 90)} · {t.status === 'aguardando' ? 'aguardando sua resposta' : 'respondida'}</span></span>
            <Icon name="chevronRight" />
          </a>
        ))}</div>)}

      {aba === 'devolutiva' && <div className="ap-rev-dev">
        <Field label="Resumo geral (obrigatório para publicar)">
          <textarea className="g-in" rows={5} value={dvv.summary} onChange={e => setDev({ ...dvv, summary: e.target.value })} maxLength={8000} disabled={encerrada} data-testid="ap-dev-summary" />
        </Field>
        <Field label="Recomendações individualizadas">
          <textarea className="g-in" rows={4} value={dvv.recommendations} onChange={e => setDev({ ...dvv, recommendations: e.target.value })} maxLength={8000} disabled={encerrada} data-testid="ap-dev-reco" />
        </Field>
        <Field label="Pontos de acompanhamento e encaminhamentos">
          <textarea className="g-in" rows={3} value={dvv.followup} onChange={e => setDev({ ...dvv, followup: e.target.value })} maxLength={4000} disabled={encerrada} />
        </Field>
        <Field label="Próxima avaliação sugerida">
          <input className="g-in" type="date" value={(dvv.next_assessment_on || '').slice(0, 10)} onChange={e => setDev({ ...dvv, next_assessment_on: e.target.value })} disabled={encerrada} />
        </Field>
        <p className="g-mut g-xs">O ORNY não gera diagnóstico: este texto é seu, e é o que o aluno vai ler.</p>
        {!encerrada && <div className="g-row ap-cap-actions">
          <Btn variant="secondary" onClick={salvarDevolutiva} loading={busy} data-testid="ap-dev-save">Salvar rascunho</Btn>
          <Btn onClick={publicar} loading={busy} disabled={pendentes > 0 || !dvv.summary.trim()} data-testid="ap-dev-publish">
            {pendentes > 0 ? `Avalie as ${pendentes} etapa(s) restantes` : 'Publicar devolutiva'}
          </Btn>
        </div>}
        {a.published_at && <p className="g-sm"><Icon name="checkCircle" /> Publicada em {dt(a.published_at)}.</p>}
      </div>}

      {!encerrada && <div className="g-row ap-rev-foot">
        <Btn variant="secondary" size="sm" onClick={pedirRecaptura} loading={busy} data-testid="ap-rev-redo">Devolver para recaptura</Btn>
        <Btn variant="tertiary" onClick={cancelar} data-testid="ap-rev-cancel">Cancelar avaliação</Btn>
      </div>}

      {lb !== null && itens.length > 0 && <MediaLightbox items={itens} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
    </div>
  )
}
