// Leitura e reencode de imagem no aparelho, antes de qualquer envio.
// O reencode em canvas REMOVE os metadados do arquivo original (EXIF: GPS, modelo do aparelho, data) —
// o que importa quando a foto é do corpo da pessoa. Também reduz o tamanho: uma foto de celular de 4 MB
// vira 300–800 KB em 1600 px, o que economiza armazenamento e tempo de envio em rede ruim.
// `readImage` saiu de components/AvatarEditor.jsx (era idêntico) para não existir em dois lugares.

// Lê o arquivo respeitando a orientação da câmera (createImageBitmap) e cai para <img> onde não existir.
export async function readImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* tenta pelo <img> */ }
  }
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), i = new Image()
    i.onload = () => { URL.revokeObjectURL(url); ok(i) }
    i.onerror = () => { URL.revokeObjectURL(url); fail(new Error('img')) }
    i.src = url
  })
}

// Cabe em maxEdge mantendo a proporção; nunca aumenta uma imagem pequena.
export function fitWithin(w, h, maxEdge) {
  const factor = Math.min(1, maxEdge / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * factor)), height: Math.max(1, Math.round(h * factor)) }
}

const toBlob = (canvas, type, quality) => new Promise((ok, fail) => {
  if (canvas.toBlob) return canvas.toBlob(b => b ? ok(b) : fail(new Error('toBlob')), type, quality)
  fail(new Error('canvas sem toBlob'))
})

// Reencoda para JPEG dentro de maxEdge. Devolve o Blob e as dimensões finais.
export async function downscaleToJpeg(file, maxEdge = 1600, quality = 0.82) {
  const img = await readImage(file)
  const { width, height } = fitWithin(img.width, img.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)   // JPEG não tem transparência
  ctx.drawImage(img, 0, 0, width, height)
  img.close?.()
  const blob = await toBlob(canvas, 'image/jpeg', quality)
  canvas.width = canvas.height = 0   // libera memória no celular
  return { blob, width, height, mime: 'image/jpeg' }
}

// sha256 em hexadecimal, para o servidor conferir que chegou o mesmo arquivo que saiu.
// crypto.subtle exige contexto seguro (https ou localhost). Sem ele, devolve null e o servidor
// simplesmente não faz essa conferência — em vez de impedir o envio.
export async function sha256Hex(blob) {
  try {
    if (!globalThis.crypto?.subtle) return null
    const buf = await blob.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}
