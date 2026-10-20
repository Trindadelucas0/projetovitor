// Vídeo do personal no exercício. Uma regra só, usada pelo construtor da ficha e pela
// tela de treino, para não divergir do que a API aceita (api/workout-schema.js · videoKind).
//
// Três tipos, com capacidades diferentes — e isso é dito na tela, não escondido:
//   youtube  player dentro do app (pausa, posição e velocidade), por iframe do YouTube
//   arquivo  vídeo enviado para o próprio servidor (/api/media?f=…): controle total
//   externo  qualquer outro https (ex.: Instagram): abre fora do app, sem velocidade
//
// Vídeo "não listado" do YouTube é o caminho recomendado: não aparece na busca, mas
// toca normalmente aqui.

const YT_HOST = /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/
const YT_ID = /^[\w-]{11}$/

// Devolve o id de 11 caracteres de um endereço do YouTube, ou null.
export function youtubeId(url) {
  let u
  try { u = new URL(String(url || '').trim()) } catch { return null }
  if (u.protocol !== 'https:' || !YT_HOST.test(u.hostname)) return null
  if (u.hostname.replace(/^(www\.|m\.)/, '') === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return YT_ID.test(id) ? id : null
  }
  const v = u.searchParams.get('v')
  if (v && YT_ID.test(v)) return v
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
  return m ? m[1] : null
}

export const isUploadedFile = url => /^\/api\/media\?f=[\w.-]+$/.test(String(url || '').trim())

// É um endereço do YouTube (mesmo que não aponte para um vídeo específico)?
export function isYoutubeHost(url) {
  try { const u = new URL(String(url || '').trim()); return YT_HOST.test(u.hostname) } catch { return false }
}

// Interpreta o endereço gravado na ficha. Retorna null quando não há vídeo.
export function parseVideo(url) {
  const u = String(url || '').trim()
  if (!u) return null
  if (isUploadedFile(u)) return { kind: 'arquivo', url: u, id: null, embedUrl: null, canControl: true }
  // Endereço do YouTube sem vídeo reconhecível (canal, playlist, resultado de busca)
  // não vira "externo": seria aceito e depois não tocaria nada. Vale como erro, para a
  // tela pedir o link direto do vídeo.
  const id = youtubeId(u)
  if (!id && isYoutubeHost(u)) return null
  if (id) return {
    kind: 'youtube', url: u, id,
    // enablejsapi: deixa a página controlar pausa, posição e velocidade.
    // rel=0 e modestbranding reduzem sugestão de outros canais depois do vídeo.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`,
    canControl: true,
  }
  if (/^https:\/\/[^\s]{4,500}$/.test(u)) return { kind: 'externo', url: u, id: null, embedUrl: null, canControl: false }
  return null
}

// Mensagem de erro para o campo do construtor; null quando está aceitável.
export function videoProblem(url) {
  const u = String(url || '').trim()
  if (!u) return null
  if (parseVideo(u)) return null
  if (/^http:\/\//i.test(u)) return 'O endereço precisa começar com https.'
  if (/youtu/i.test(u)) return 'Não reconheci o vídeo nesse endereço do YouTube. Copie o link direto do vídeo.'
  return 'Cole o endereço de um vídeo do YouTube (ou escolha um vídeo já enviado).'
}

export const VIDEO_LABEL = {
  youtube: 'Vídeo do YouTube — toca aqui dentro, com velocidade e avanço',
  arquivo: 'Vídeo enviado por você — toca aqui dentro, com velocidade e avanço',
  externo: 'Endereço externo — abre fora do app, sem controle de velocidade',
}

export const SPEEDS = [0.5, 0.75, 1]
export const SKIP_SEC = 10
