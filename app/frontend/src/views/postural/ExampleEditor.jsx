import { useState } from 'react'
import { Btn, Err, Load, useLoad } from '../app/kit.jsx'
import { EXAMPLES, uploadExample } from '../../lib/postural.js'
import { notifyError } from '../../lib/dialog.js'

export default function ExampleEditor({ stepId, scope = 'personal' }) {
  const [data, err, reload] = useLoad(() => EXAMPLES.list(stepId), [stepId])
  const [busy, setBusy] = useState(false)
  const items = (data?.examples || []).filter(x => scope === 'protocol' ? !x.professional_id : !!x.professional_id)
  if (err) return <Err msg={err} retry={reload} />
  if (!data) return <Load />
  const send = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true)
    try { await uploadExample(stepId, file, scope); await reload() }
    catch (error) { notifyError(error) } finally { setBusy(false) }
  }
  const move = async (index, direction) => {
    const ids = items.map(x => x.id), next = index + direction
    if (next < 0 || next >= ids.length) return
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    setBusy(true)
    try { await EXAMPLES.order(ids); await reload() }
    catch (error) { notifyError(error) } finally { setBusy(false) }
  }
  const remove = async id => {
    setBusy(true)
    try { await EXAMPLES.remove(id); await reload() }
    catch (error) { notifyError(error) } finally { setBusy(false) }
  }
  return <div className="ap-example-editor" data-testid="ap-example-editor">
    <p className="g-mut g-sm">As novas demonstrações aparecem nas próximas avaliações. A primeira da lista aparece primeiro.</p>
    {items.map((item, i) => <div className="ap-example-row" key={item.id}>
      <span className="g-sm">{i + 1}. {item.kind ? 'Vídeo' : 'Foto'}</span>
      <a className="g-link" href={EXAMPLES.editorUrl(item.id)} target="_blank" rel="noreferrer">Ver</a>
      <button type="button" className="g-icbtn" aria-label="Mover para cima" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" className="g-icbtn" aria-label="Mover para baixo" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
      <Btn variant="tertiary" size="sm" disabled={busy} onClick={() => remove(item.id)}>Remover</Btn>
    </div>)}
    <label className="g-btn g-ghost g-sm ap-example-add">Adicionar foto ou vídeo
      <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden disabled={busy} onChange={send} />
    </label>
    <p className="g-mut g-sm">Fotos até 8 MB; vídeos até 25 MB. Arquivos privados.</p>
  </div>
}
