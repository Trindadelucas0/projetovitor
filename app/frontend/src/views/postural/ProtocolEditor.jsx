// Governança: catálogo de protocolos, versões e editor de etapas (P02, P03 e ADM01).
// Regras que a tela só reflete, porque quem decide é o servidor:
//  • o protocolo oficial é somente leitura (o próximo migrate o re-sincroniza) — o caminho é duplicar;
//  • versão publicada não se edita: cria-se uma versão nova, que já nasce com as etapas copiadas;
//  • etapa marcada para validação do profissional exige confirmação explícita antes de publicar.
// A reordenação é por botões (mover acima/abaixo), que funcionam com teclado e leitor de tela. Arrastar
// com o mouse não foi implementado: seria um atalho a mais para o mesmo resultado, não um requisito.
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import MediaLightbox from '../../components/MediaLightbox.jsx'
import { Btn, Empty, Err, Load, Field, useLoad } from '../app/kit.jsx'
import { ask, askText, notify, notifyError } from '../../lib/dialog.js'
import { APA, KIND_PT, uploadStepMedia } from '../../lib/postural.js'
import ExampleEditor from './ExampleEditor.jsx'
import './postural.css'

const CAMERAS = [['', 'Não definida'], ['frontal', 'De frente'], ['posterior', 'De costas'], ['lateral_direita', 'Lado direito'], ['lateral_esquerda', 'Lado esquerdo'], ['livre', 'Livre']]
const linhas = v => (Array.isArray(v) ? v : []).join('\n')
const lista = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)

function EditorEtapa({ step, editable, onSaved, onRemoved }) {
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lb, setLb] = useState(null)
  const v = f || {
    title: step.title, description: step.description || '', capture_kind: step.capture_kind,
    camera_position: step.camera_position || '', camera_note: step.camera_note || '',
    instructions: linhas(step.instructions), cautions: linhas(step.cautions),
    repetitions: step.repetitions || '', required: step.required, allow_skip: step.allow_skip, allow_question: step.allow_question
  }
  const set = (k, val) => setF({ ...v, [k]: val })

  const salvar = async () => {
    setBusy(true)
    try {
      const r = await APA.salvarEtapa({
        id: step.id, title: v.title, description: v.description, capture_kind: v.capture_kind,
        camera_position: v.camera_position || null, camera_note: v.camera_note,
        instructions: lista(v.instructions), cautions: lista(v.cautions),
        repetitions: v.capture_kind === 'video' ? +v.repetitions || null : null,
        required: v.required, allow_skip: v.allow_skip, allow_question: v.allow_question
      })
      setF(null); onSaved?.(r.step); notify('Etapa salva.')
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const enviarMidia = async (e, kind) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true)
    try { const r = await uploadStepMedia(step.id, kind, file); onSaved?.(r.step); notify('Mídia enviada.') }
    catch (err) { notifyError(err) } finally { setBusy(false) }
  }
  const tirarMidia = async kind => {
    setBusy(true)
    try { const r = await APA.removerMidia(step.id, kind); onSaved?.(r.step) } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const remover = async () => {
    if (!(await ask('Remover esta etapa?', { text: 'Ela sai desta versão em rascunho. As versões publicadas não mudam.', ok: 'Remover', danger: true }))) return
    setBusy(true)
    try { await APA.removerEtapa(step.id); onRemoved?.() } catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  const midias = [
    step.has_reference && { kind: 'foto', url: APA.stepMediaUrl(step.id, 'referencia'), label: 'Foto de referência' },
    step.has_demo && { kind: 'video', url: APA.stepMediaUrl(step.id, 'demo'), label: 'Vídeo demonstrativo' }
  ].filter(Boolean)

  return <div className="ap-editor" data-testid={'ap-ed-' + step.code}>
    {step.needs_review && <div className="g-note g-sm" data-testid={'ap-ed-review-' + step.code}>
      <strong><Icon name="flag" /> Aguardando validação do profissional</strong>
      <p>{step.review_note}</p>
      {editable && <Btn variant="secondary" size="sm" onClick={async () => {
        try { const r = await APA.salvarEtapa({ id: step.id, needs_review: false }); onSaved?.(r.step); notify('Etapa validada.') } catch (e) { notifyError(e) }
      }} data-testid={'ap-ed-validate-' + step.code}>Validei esta etapa</Btn>}
    </div>}

    <Field label="Nome da etapa">
      <input className="g-in" value={v.title} onChange={e => set('title', e.target.value)} disabled={!editable} maxLength={160} data-testid={'ap-ed-title-' + step.code} />
    </Field>
    <Field label="Tipo">
      <div className="g-opts">
        {['foto', 'video'].map(k => <button key={k} type="button" className={v.capture_kind === k ? 'g-on' : ''} onClick={() => editable && set('capture_kind', k)} disabled={!editable}>{KIND_PT[k]}</button>)}
      </div>
    </Field>
    {v.capture_kind === 'video' && <Field label="Repetições que o vídeo deve mostrar">
      <input className="g-in" type="number" min={1} max={50} value={v.repetitions} onChange={e => set('repetitions', e.target.value)} disabled={!editable} />
    </Field>}
    <Field label="Descrição (opcional)">
      <textarea className="g-in" rows={2} value={v.description} onChange={e => set('description', e.target.value)} disabled={!editable} maxLength={2000} />
    </Field>
    <Field label="Instruções numeradas (uma por linha)">
      <textarea className="g-in" rows={5} value={v.instructions} onChange={e => set('instructions', e.target.value)} disabled={!editable} data-testid={'ap-ed-instr-' + step.code} />
    </Field>
    <Field label="Cuidados importantes (uma por linha)">
      <textarea className="g-in" rows={3} value={v.cautions} onChange={e => set('cautions', e.target.value)} disabled={!editable} />
    </Field>
    <Field label="Posição da câmera">
      <select className="g-in" value={v.camera_position} onChange={e => set('camera_position', e.target.value)} disabled={!editable}>
        {CAMERAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </Field>
    <Field label="Observação de câmera (opcional)">
      <input className="g-in" value={v.camera_note} onChange={e => set('camera_note', e.target.value)} disabled={!editable} maxLength={600} />
    </Field>

    <div className="ap-ed-flags">
      {[['required', 'Exigir registro'], ['allow_skip', 'Permitir dispensa justificada'], ['allow_question', 'Permitir dúvidas']].map(([k, l]) => (
        <label key={k} className="g-chk"><input type="checkbox" checked={!!v[k]} onChange={e => set(k, e.target.checked)} disabled={!editable} /><span>{l}</span></label>
      ))}
    </div>

    <h4 className="ap-h2">Demonstrações para novas avaliações</h4>
    <ExampleEditor stepId={step.id} scope="protocol" />
    <details className="ap-step-details"><summary>Mídia antiga da versão</summary>
    {midias.length > 0 && <div className="g-row">
      {midias.map((m, k) => <Btn key={m.kind} variant="secondary" size="sm" onClick={() => setLb(k)}>Ver {m.label.toLowerCase()}</Btn>)}
    </div>}
    {editable && <div className="g-row ap-cap-actions">
      <label className="g-btn g-ghost g-sm">Foto de referência<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => enviarMidia(e, 'referencia')} data-testid={'ap-ed-ref-' + step.code} /></label>
      <label className="g-btn g-ghost g-sm">Vídeo demonstrativo<input type="file" accept="video/mp4,video/webm" hidden onChange={e => enviarMidia(e, 'demo')} /></label>
      {step.has_reference && <Btn variant="tertiary" onClick={() => tirarMidia('referencia')}>Remover foto</Btn>}
      {step.has_demo && <Btn variant="tertiary" onClick={() => tirarMidia('demo')}>Remover vídeo</Btn>}
    </div>}
    <p className="g-mut g-sm">Compatibilidade com avaliações anteriores. Para novos exemplos, use a seção acima.</p>
    </details>

    {editable && <div className="g-row ap-cap-actions">
      <Btn onClick={salvar} loading={busy} disabled={!f} data-testid={'ap-ed-save-' + step.code}>Salvar etapa</Btn>
      <Btn variant="tertiary" onClick={remover} data-testid={'ap-ed-del-' + step.code}>Remover etapa</Btn>
    </div>}

    {lb !== null && <MediaLightbox items={midias} index={lb} onIndex={setLb} onClose={() => setLb(null)} title={step.title} />}
  </div>
}

function Versao({ versionId, onChanged }) {
  const [d, err, reload] = useLoad(() => APA.etapas(versionId), [versionId])
  const [aberta, setAberta] = useState(null)
  const [busy, setBusy] = useState(false)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const { version: v, steps } = d

  const mover = async (idx, dir) => {
    const ordem = steps.map(s => s.id)
    const alvo = idx + dir
    if (alvo < 0 || alvo >= ordem.length) return
    ;[ordem[idx], ordem[alvo]] = [ordem[alvo], ordem[idx]]
    setBusy(true)
    try { await APA.ordenar(versionId, ordem); await reload() } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const nova = async () => {
    const title = await askText('Nova etapa', { label: 'Nome da etapa', required: true, ok: 'Criar' })
    if (!title) return
    setBusy(true)
    try { await APA.salvarEtapa({ version_id: versionId, title, instructions: ['Descreva o que o aluno deve fazer.'] }); await reload(); notify('Etapa criada no fim da lista.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const publicar = async () => {
    const aValidar = steps.filter(s => s.needs_review).length
    const txt = aValidar
      ? `Há ${aValidar} etapa(s) aguardando validação do profissional responsável. Publique só depois de conferir o conteúdo.`
      : 'Depois de publicar, esta versão não pode mais ser editada. As avaliações em andamento continuam na versão em que começaram.'
    if (!(await ask('Publicar esta versão?', { text: txt, ok: 'Publicar' }))) return
    setBusy(true)
    try { await APA.publicarVersao(versionId, true); await reload(); onChanged?.(); notify('Versão publicada.') }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  return <div data-testid="ap-versao">
    <div className="g-row">
      <span className="g-eyebrow">{v.protocol_name} · versão {v.version}</span>
      <span className="g-sp" />
      <span className="g-pill">{v.status}{v.official ? ' · oficial' : ''}</span>
    </div>
    {v.official && <p className="g-note g-sm">
      Protocolo oficial do sistema: somente leitura. Duplique para a sua organização para poder editar.
    </p>}
    {!v.editable && !v.official && <p className="g-note g-sm">
      Versão publicada: para alterar as etapas, crie uma versão nova no catálogo. As avaliações em andamento não mudam.
    </p>}

    <div className="g-card g-list">
      {steps.map((s, idx) => (
        <div key={s.id} className="g-li ap-ed-row" data-testid={'ap-step-row-' + s.code}>
          <span className="g-ico">{s.position}</span>
          <button className="ap-ed-name" onClick={() => setAberta(aberta === s.id ? null : s.id)} aria-expanded={aberta === s.id}>
            <b className="g-sm">{s.title}</b><br />
            <span className="g-mut g-xs">{KIND_PT[s.capture_kind]}{s.required ? ' · obrigatória' : ' · opcional'}{s.needs_review ? ' · a validar' : ''}</span>
          </button>
          <span className="g-sp" />
          {v.editable && <>
            <button className="g-icbtn" onClick={() => mover(idx, -1)} disabled={busy || idx === 0} aria-label={'Mover ' + s.title + ' para cima'}><Icon name="arrowUp" /></button>
            <button className="g-icbtn" onClick={() => mover(idx, 1)} disabled={busy || idx === steps.length - 1} aria-label={'Mover ' + s.title + ' para baixo'}><Icon name="arrowDown" /></button>
          </>}
        </div>
      ))}
      {steps.length === 0 && <p className="g-mut g-sm" style={{ padding: 12 }}>Nenhuma etapa nesta versão.</p>}
    </div>

    {aberta && <EditorEtapa step={steps.find(s => s.id === aberta)} editable={v.editable}
      onSaved={() => reload()} onRemoved={() => { setAberta(null); reload() }} />}

    {v.editable && <div className="g-row ap-cap-actions">
      <Btn variant="secondary" onClick={nova} loading={busy} data-testid="ap-step-new">Adicionar etapa</Btn>
      <Btn onClick={publicar} loading={busy} disabled={!steps.length} data-testid="ap-publish">Publicar versão</Btn>
    </div>}
  </div>
}

export default function ProtocolEditor() {
  const [d, err, reload] = useLoad(() => APA.protocolos())
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)

  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  if (sel) return <>
    <Btn variant="tertiary" onClick={() => { setSel(null); reload() }}>← Voltar ao catálogo</Btn>
    <Versao versionId={sel} onChanged={reload} />
  </>

  const duplicar = async p => {
    const name = await askText('Duplicar protocolo', { label: 'Nome da cópia', required: true, ok: 'Duplicar' })
    if (!name) return
    setBusy(true)
    try { const r = await APA.duplicar({ id: p.id, name }); await reload(); notify(`Cópia criada com ${r.steps} etapas em rascunho.`); setSel(r.version.id) }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const criar = async () => {
    const name = await askText('Novo protocolo', { label: 'Nome', required: true, ok: 'Criar' })
    if (!name) return
    setBusy(true)
    try { const r = await APA.salvarProtocolo({ name }); await reload(); setSel(r.version.id) }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const novaVersao = async p => {
    setBusy(true)
    try { const r = await APA.novaVersao(p.id); await reload(); notify(`Versão ${r.version.version} criada com ${r.steps} etapas copiadas.`); setSel(r.version.id) }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  return <div data-testid="ap-protocolos">
    <p className="adm-sub">
      Os protocolos oficiais vêm com o sistema e são somente leitura. Duplique para a sua organização e
      edite a cópia: versão publicada nunca muda, e avaliação em andamento continua na versão em que começou.
    </p>
    <Btn variant="secondary" onClick={criar} loading={busy} data-testid="ap-proto-new">Criar protocolo do zero</Btn>

    {d.protocols.length === 0 && <Empty icon="clipboard">Nenhum protocolo cadastrado.</Empty>}

    {d.protocols.map(p => (
      <div key={p.id} className="g-card ap-proto" data-testid={'ap-proto-' + p.slug}>
        <div className="g-row">
          <div>
            <b>{p.name}</b>
            <span className="g-mut g-xs"> · {p.audience}{p.oficial ? ' · oficial' : ''}{p.usos ? ` · ${p.usos} uso(s)` : ''}</span>
            {p.description && <p className="g-mut g-xs">{p.description}</p>}
          </div>
          <span className="g-sp" />
          <Btn variant="secondary" size="sm" onClick={() => duplicar(p)} disabled={busy} data-testid={'ap-proto-dup-' + p.slug}>Duplicar</Btn>
          {!p.oficial && <Btn variant="tertiary" onClick={() => novaVersao(p)} disabled={busy}>Nova versão</Btn>}
        </div>
        <div className="g-row ap-proto-vers">
          {(p.versions || []).map(v => (
            <button key={v.id} className={'g-chipbtn' + (v.status === 'publicada' ? ' g-on' : '')} onClick={() => setSel(v.id)} data-testid={'ap-ver-' + v.id}>
              v{v.version} · {v.status} · {v.steps} etapas{v.a_validar ? ` · ${v.a_validar} a validar` : ''}
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
}
