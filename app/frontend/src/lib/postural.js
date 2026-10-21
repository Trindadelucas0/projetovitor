// Avaliação Postural — chamadas do aluno e as regras puras do wizard.
// As funções de regra (progressOf, missingRequired, nextPending, stateOf, cardState) são puras de
// propósito: a suíte do frontend roda sem DOM, então a lógica precisa ser testável sem renderizar.
// O número de etapas NUNCA sai daqui: vem sempre de `steps`, que a API devolve a partir da versão do
// protocolo pinada na avaliação.
import { api } from './api.js'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })

export const AP = {
  mine: () => api('/api/avaliacao-postural'),
  item: id => api('/api/avaliacao-postural/item?id=' + encodeURIComponent(id)),
  start: id => post('/api/avaliacao-postural/start', { id }),
  consent: (id, granted, share_granted) => post('/api/avaliacao-postural/consent', { id, granted, share_granted }),
  dados: b => post('/api/avaliacao-postural/dados', b),
  initCapture: b => post('/api/avaliacao-postural/captura/init', b),
  confirmCapture: capture_id => post('/api/avaliacao-postural/captura/confirm', { capture_id }),
  skip: (id, step_id, reason) => post('/api/avaliacao-postural/captura/skip', { id, step_id, reason }),
  removeCapture: capture_id => post('/api/avaliacao-postural/captura/remove', { capture_id }),
  submit: (id, student_notes) => post('/api/avaliacao-postural/submit', { id, student_notes }),
  duvida: (id, step_id, body) => post('/api/avaliacao-postural/duvida', { id, step_id, body }),
  devolutiva: id => api('/api/avaliacao-postural/devolutiva?id=' + encodeURIComponent(id)),
  // a chave do arquivo nunca vem no JSON: a mídia sai por rota autorizada, pelo id da captura
  mediaUrl: captureId => API_BASE + '/api/avaliacao-postural/media?id=' + encodeURIComponent(captureId),
  stepMediaUrl: (stepId, kind) => API_BASE + '/api/avaliacao-postural/etapa-midia?step_id=' + encodeURIComponent(stepId) + '&kind=' + kind
}

// Operação do profissional. Namespace separado do administrativo de propósito: são duas áreas, com
// permissões próprias no servidor. Quando o app reabrir para vários personais, estas telas saem do
// painel administrativo sem que nada aqui mude.
export const APV = {
  protocolos: () => api('/api/pro/avaliacao/protocolos'),
  fila: (p = {}) => api('/api/pro/avaliacoes?' + new URLSearchParams({ ...(p.status ? { status: p.status } : {}), ...(p.q ? { q: p.q } : {}), page: p.page || 0 })),
  item: id => api('/api/pro/avaliacao?id=' + encodeURIComponent(id)),
  solicitar: b => post('/api/pro/avaliacoes/solicitar', b),
  etapa: b => post('/api/pro/avaliacao/etapa', b),
  devolutiva: b => post('/api/pro/avaliacao/devolutiva', b),
  publicar: id => post('/api/pro/avaliacao/publicar', { id }),
  recaptura: id => post('/api/pro/avaliacao/recaptura', { id }),
  cancelar: (id, reason) => post('/api/pro/avaliacao/cancelar', { id, reason }),
  recorrencia: b => post('/api/pro/avaliacao/recorrencia', b),
  recorrencias: () => api('/api/pro/avaliacao/recorrencias'),
  mediaUrl: captureId => API_BASE + '/api/pro/avaliacao/media?id=' + encodeURIComponent(captureId)
}

// Governança: catálogo, versões, etapas, termo, indicadores, auditoria e retenção.
export const APA = {
  protocolos: () => api('/api/adm/avaliacao/protocolos'),
  salvarProtocolo: b => post('/api/adm/avaliacao/protocolos', b),
  duplicar: b => post('/api/adm/avaliacao/protocolos/duplicar', b),
  novaVersao: protocol_id => post('/api/adm/avaliacao/versoes', { protocol_id }),
  publicarVersao: (id, confirm_review) => post('/api/adm/avaliacao/versoes/publicar', { id, confirm_review }),
  orientacoes: b => post('/api/adm/avaliacao/versoes/orientacoes', b),
  etapas: versionId => api('/api/adm/avaliacao/etapas?version_id=' + encodeURIComponent(versionId)),
  salvarEtapa: b => post('/api/adm/avaliacao/etapas', b),
  ordenar: (version_id, order) => post('/api/adm/avaliacao/etapas/ordem', { version_id, order }),
  removerEtapa: id => post('/api/adm/avaliacao/etapas/remover', { id }),
  removerMidia: (id, kind) => post('/api/adm/avaliacao/etapas/midia/remover', { id, kind }),
  stepMediaUrl: (stepId, kind) => API_BASE + '/api/adm/avaliacao/etapas/midia?step_id=' + encodeURIComponent(stepId) + '&kind=' + kind,
  termos: () => api('/api/adm/avaliacao/termos'),
  salvarTermo: b => post('/api/adm/avaliacao/termos', b),
  metricas: () => api('/api/adm/avaliacao/metricas'),
  auditoria: id => api('/api/adm/avaliacao/auditoria?id=' + encodeURIComponent(id)),
  retencao: () => api('/api/adm/avaliacao/retencao'),
  salvarRetencao: retencao_dias => post('/api/adm/avaliacao/retencao', { retencao_dias })
}

// envio da mídia demonstrativa do protocolo (corpo bruto, como uploadExMedia em lib/care.js)
export async function uploadStepMedia(stepId, kind, file) {
  const r = await fetch(API_BASE + '/api/adm/avaliacao/etapas/midia?step_id=' + encodeURIComponent(stepId) + '&kind=' + kind,
    { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'Falha no envio'), { status: r.status, code: d.code })
  return d
}

export const LIMITS = { foto: 8 * 1024 * 1024, video: 25 * 1024 * 1024 }
export const ACCEPT = { foto: 'image/jpeg,image/png,image/webp', video: 'video/mp4,video/webm' }

export const STATUS_PT = {
  solicitada: 'Pendente', em_andamento: 'Em andamento', enviada: 'Em análise', em_revisao: 'Em análise',
  recaptura_solicitada: 'Correção solicitada', publicada: 'Concluída', cancelada: 'Cancelada', expirada: 'Expirada'
}
export const DECISION_PT = { adequada: 'Adequada', recapturar: 'Refazer', nao_avaliavel: 'Não avaliável' }
export const KIND_PT = { foto: 'Fotografia', video: 'Vídeo' }

export const fmtBytes = n => !n ? '' : n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1024) + ' KB'

// ---- regras puras ----

// a captura viva da etapa (uma por etapa; as substituídas ficam no histórico)
export const captureOf = (captures, stepId) =>
  (captures || []).find(c => c.step_id === stepId && ['reservada', 'enviada', 'dispensada'].includes(c.status)) || null

// O estado que o aluno lê na tela. Os três estados que a especificação exige — salvo no aparelho,
// enviando, confirmado pelo servidor — mais dispensada e refazer.
export function stateOf(capture, pending) {
  if (pending?.error) return 'recusada'
  if (pending?.sending) return 'enviando'
  if (pending && !capture) return 'local'
  if (!capture) return 'vazio'
  if (capture.status === 'dispensada') return 'dispensada'
  if (capture.status === 'enviada') return capture.review_status === 'recapturar' ? 'refazer' : 'confirmada'
  if (capture.status === 'reservada') return pending ? 'enviando' : 'local'
  return 'vazio'
}
export const STATE_PT = {
  vazio: 'Não enviada', local: 'Salvo no aparelho', enviando: 'Enviando', confirmada: 'Confirmado pelo servidor',
  dispensada: 'Dispensada', refazer: 'Refazer', recusada: 'Recusado'
}
const DONE = ['enviada', 'dispensada']

export function progressOf(steps, captures) {
  const total = (steps || []).length
  const done = (steps || []).filter(s => DONE.includes(captureOf(captures, s.id)?.status)).length
  return { total, done, pending: total - done, percent: total ? Math.round(done / total * 100) : 0 }
}
// o que o servidor vai recusar no envio final — a mesma regra, para avisar antes
export const missingRequired = (steps, captures) =>
  (steps || []).filter(s => s.required && !DONE.includes(captureOf(captures, s.id)?.status))

// primeira etapa pendente: é onde o wizard retoma
export function nextPending(steps, captures) {
  const i = (steps || []).findIndex(s => !DONE.includes(captureOf(captures, s.id)?.status))
  return i === -1 ? null : i
}
// etapas devolvidas para refazer (depois de uma recaptura solicitada)
export const toRedo = (steps, captures) =>
  (steps || []).filter(s => {
    const c = captureOf(captures, s.id)
    return !c || (c.status === 'reservada' && !!c.correction_reason)
  })

// Estado do cartão no Início, conforme a especificação (A01). 'ausente' = o cartão não aparece.
export function cardState(open) {
  if (!open) return 'ausente'
  if (open.status === 'solicitada') return 'iniciar'
  if (open.status === 'em_andamento') return 'continuar'
  if (open.status === 'recaptura_solicitada') return 'corrigir'
  if (['enviada', 'em_revisao'].includes(open.status)) return 'analise'
  if (open.status === 'publicada') return 'devolutiva'
  return 'ausente'
}
export const CARD_CTA = {
  iniciar: 'Iniciar avaliação', continuar: 'Continuar avaliação', corrigir: 'Corrigir avaliação',
  analise: 'Acompanhar', devolutiva: 'Ver devolutiva'
}

// ---- envio ----

// `fetch` não expõe progresso de upload no navegador, e a especificação pede percentual real.
// Por isso o envio sai do api.js e usa XMLHttpRequest. Precedente na casa: uploadExMedia em lib/care.js.
function xhrSend({ url, method, blob, mime, withCredentials, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)
    xhr.withCredentials = !!withCredentials
    if (mime) xhr.setRequestHeader('Content-Type', mime)
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText || '{}') } catch { /* o R2 responde sem corpo */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data)
      const e = new Error(data.error || 'Falha no envio (' + xhr.status + ')')
      e.status = xhr.status; e.code = data.code
      reject(e)
    }
    xhr.onerror = () => reject(new Error('Sem conexão durante o envio.'))
    xhr.onabort = () => reject(Object.assign(new Error('Envio cancelado.'), { aborted: true }))
    xhr.send(blob)
  })
}

// Um arquivo, do aparelho até a confirmação do servidor.
// Foto: corpo bruto para a API. Vídeo com R2 configurado: PUT pré-assinado direto no bucket e depois
// /captura/confirm, que confere tamanho e tipo reais do objeto. Em qualquer caso, só é "enviado" quando
// o servidor diz que é — o retorno desta função é sempre a captura confirmada por ele.
export async function uploadCapture({ capture, putUrl, blob, mime, onProgress }) {
  if (putUrl) {
    await xhrSend({ url: putUrl, method: 'PUT', blob, mime, withCredentials: false, onProgress })
    const r = await AP.confirmCapture(capture.id)
    return r.capture
  }
  const url = API_BASE + '/api/avaliacao-postural/captura/upload?id=' + encodeURIComponent(capture.id) + '&token=' + encodeURIComponent(capture.upload_token)
  const r = await xhrSend({ url, method: 'POST', blob, mime, withCredentials: true, onProgress })
  return r.capture
}
