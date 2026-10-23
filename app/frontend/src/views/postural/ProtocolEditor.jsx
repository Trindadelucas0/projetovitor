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
import { Empty, Err, Load, useLoad } from '../app/kit.jsx'
import { Button, Checkbox, Collapse, Segmented, Upload } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import StatusTag from '../../ui/StatusTag.jsx'
import { Btn as KBtn, TextIn, NumIn, Area, Sel, Card, Field, Warn } from '../../ui/kit.jsx'
// Btn legado (variant primary/secondary/tertiary, size sm) mapeado para o Button antd
const Btn = ({ variant, size, ...p }) => <KBtn v={variant === 'secondary' || variant === 'tertiary' ? 'ghost' : 'primary'} small={size === 'sm'} {...p} />
const pick = (accept, onFile, testid, label) => <Upload accept={accept} showUploadList={false} beforeUpload={file => { onFile({ target: { files: [file], value: '' } }); return false }}>
  <KBtn v="ghost" small data-testid={testid}>{label}</KBtn></Upload>
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

  return <Card className="ap-editor" data-testid={'ap-ed-' + step.code}>
    {step.needs_review && <div className="g-note g-sm" data-testid={'ap-ed-review-' + step.code}>
      <strong><Icon name="flag" /> Aguardando validação do profissional</strong>
      <p>{step.review_note}</p>
      {editable && <Btn variant="secondary" size="sm" onClick={async () => {
        try { const r = await APA.salvarEtapa({ id: step.id, needs_review: false }); onSaved?.(r.step); notify('Etapa validada.') } catch (e) { notifyError(e) }
      }} data-testid={'ap-ed-validate-' + step.code}>Validei esta etapa</Btn>}
    </div>}

    <Field label="Nome da etapa">
      <TextIn value={v.title} onChange={e => set('title', e.target.value)} disabled={!editable} maxLength={160} data-testid={'ap-ed-title-' + step.code} />
    </Field>
    <Field label="Tipo">
      <Segmented value={v.capture_kind} disabled={!editable} onChange={k => editable && set('capture_kind', k)} options={['foto', 'video'].map(k => ({ value: k, label: KIND_PT[k] }))} />
    </Field>
    {v.capture_kind === 'video' && <Field label="Repetições que o vídeo deve mostrar">
      <NumIn min={1} max={50} value={v.repetitions} onChange={e => set('repetitions', e.target.value)} disabled={!editable} />
    </Field>}
    <Field label="Descrição (opcional)">
      <Area rows={2} value={v.description} onChange={e => set('description', e.target.value)} disabled={!editable} maxLength={2000} />
    </Field>
    <Field label="Instruções numeradas (uma por linha)">
      <Area rows={5} value={v.instructions} onChange={e => set('instructions', e.target.value)} disabled={!editable} data-testid={'ap-ed-instr-' + step.code} />
    </Field>
    <Field label="Cuidados importantes (uma por linha)">
      <Area rows={3} value={v.cautions} onChange={e => set('cautions', e.target.value)} disabled={!editable} />
    </Field>
    <Field label="Posição da câmera">
      <Sel style={{ width: '100%' }} value={v.camera_position} onChange={e => set('camera_position', e.target.value)} disabled={!editable}>
        {CAMERAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Sel>
    </Field>
    <Field label="Observação de câmera (opcional)">
      <TextIn value={v.camera_note} onChange={e => set('camera_note', e.target.value)} disabled={!editable} maxLength={600} />
    </Field>

    <div className="ap-ed-flags">
      {[['required', 'Exigir registro'], ['allow_skip', 'Permitir dispensa justificada'], ['allow_question', 'Permitir dúvidas']].map(([k, l]) => (
        <Checkbox key={k} checked={!!v[k]} onChange={e => set(k, e.target.checked)} disabled={!editable}>{l}</Checkbox>
      ))}
    </div>

    <h4 className="ap-h2">Demonstrações para novas avaliações</h4>
    <ExampleEditor stepId={step.id} scope="protocol" />
    <Collapse ghost size="small" className="ap-step-details" items={[{ key: 'm', label: 'Mídia antiga da versão', children: <>
    {midias.length > 0 && <div className="g-row">
      {midias.map((m, k) => <Btn key={m.kind} variant="secondary" size="sm" onClick={() => setLb(k)}>Ver {m.label.toLowerCase()}</Btn>)}
    </div>}
    {editable && <div className="g-row ap-cap-actions">
      {pick('image/jpeg,image/png,image/webp', e => enviarMidia(e, 'referencia'), 'ap-ed-ref-' + step.code, 'Foto de referência')}
      {pick('video/mp4,video/webm', e => enviarMidia(e, 'demo'), undefined, 'Vídeo demonstrativo')}
      {step.has_reference && <Btn variant="tertiary" onClick={() => tirarMidia('referencia')}>Remover foto</Btn>}
      {step.has_demo && <Btn variant="tertiary" onClick={() => tirarMidia('demo')}>Remover vídeo</Btn>}
    </div>}
    <p className="g-mut g-sm">Compatibilidade com avaliações anteriores. Para novos exemplos, use a seção acima.</p>
    </> }]} />

    {editable && <div className="g-row ap-cap-actions">
      <Btn onClick={salvar} loading={busy} disabled={!f} data-testid={'ap-ed-save-' + step.code}>Salvar etapa</Btn>
      <Btn variant="tertiary" onClick={remover} data-testid={'ap-ed-del-' + step.code}>Remover etapa</Btn>
    </div>}

    {lb !== null && <MediaLightbox items={midias} index={lb} onIndex={setLb} onClose={() => setLb(null)} title={step.title} />}
  </Card>
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
      <span className="ap-vers-label">{v.protocol_name} · versão {v.version}</span>
      <span className="g-sp" />
      <StatusTag v={v.status} label={v.status + (v.official ? ' · oficial' : '')} />
    </div>
    {v.official && <Warn type="info">Protocolo oficial do sistema: somente leitura. Duplique para a sua organização para poder editar.</Warn>}
    {!v.editable && !v.official && <Warn type="info">Versão publicada: para alterar as etapas, crie uma versão nova no catálogo. As avaliações em andamento não mudam.</Warn>}

    <Card className="ap-list">
      {steps.map((s, idx) => (
        <div key={s.id} className="g-li ap-ed-row" data-testid={'ap-step-row-' + s.code}>
          <span className="g-ico">{s.position}</span>
          <button className="ap-ed-name" onClick={() => setAberta(aberta === s.id ? null : s.id)} aria-expanded={aberta === s.id}>
            <b className="g-sm">{s.title}</b><br />
            <span className="g-mut g-xs">{KIND_PT[s.capture_kind]}{s.required ? ' · obrigatória' : ' · opcional'}{s.needs_review ? ' · a validar' : ''}</span>
          </button>
          <span className="g-sp" />
          {v.editable && <>
            <Button type="text" icon={<ArrowUpOutlined />} onClick={() => mover(idx, -1)} disabled={busy || idx === 0} aria-label={'Mover ' + s.title + ' para cima'} />
            <Button type="text" icon={<ArrowDownOutlined />} onClick={() => mover(idx, 1)} disabled={busy || idx === steps.length - 1} aria-label={'Mover ' + s.title + ' para baixo'} />
          </>}
        </div>
      ))}
      {steps.length === 0 && <p className="g-mut g-sm" style={{ padding: 12 }}>Nenhuma etapa nesta versão.</p>}
    </Card>

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
    <p className="orny-muted">
      Os protocolos oficiais vêm com o sistema e são somente leitura. Duplique para a sua organização e
      edite a cópia: versão publicada nunca muda, e avaliação em andamento continua na versão em que começou.
    </p>
    <Btn variant="secondary" onClick={criar} loading={busy} data-testid="ap-proto-new">Criar protocolo do zero</Btn>

    {d.protocols.length === 0 && <Empty icon="clipboard">Nenhum protocolo cadastrado.</Empty>}

    {d.protocols.map(p => (
      <Card key={p.id} className="ap-proto" data-testid={'ap-proto-' + p.slug}>
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
            <KBtn key={v.id} v={v.status === 'publicada' ? 'primary' : 'ghost'} small onClick={() => setSel(v.id)} data-testid={'ap-ver-' + v.id}>
              v{v.version} · {v.status} · {v.steps} etapas{v.a_validar ? ` · ${v.a_validar} a validar` : ''}
            </KBtn>
          ))}
        </div>
      </Card>
    ))}
  </div>
}
