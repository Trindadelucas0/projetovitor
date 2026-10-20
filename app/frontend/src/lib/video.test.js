import { describe, it, expect } from 'vitest'
import { parseVideo, youtubeId, videoProblem, isUploadedFile } from './video.js'

describe('vídeo do personal — leitura do endereço', () => {
  it('lê o id do YouTube nas formas que o personal copia do celular e do computador', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('recusa endereço que não é vídeo do YouTube', () => {
    expect(youtubeId('https://www.youtube.com/channel/UCabc')).toBe(null)
    expect(youtubeId('https://youtube.com/watch?v=curto')).toBe(null)
    expect(youtubeId('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(null)   // sem https
    expect(youtubeId('https://naoyoutube.com/watch?v=dQw4w9WgXcQ')).toBe(null)
    expect(youtubeId('')).toBe(null)
  })
  it('YouTube toca dentro do app, com controle de velocidade', () => {
    const v = parseVideo('https://youtu.be/dQw4w9WgXcQ')
    expect(v.kind).toBe('youtube')
    expect(v.canControl).toBe(true)
    expect(v.embedUrl).toContain('enablejsapi=1')
    expect(v.embedUrl).toContain('dQw4w9WgXcQ')
  })
  it('vídeo enviado pelo personal também toca dentro do app', () => {
    expect(isUploadedFile('/api/media?f=abc123.mp4')).toBe(true)
    const v = parseVideo('/api/media?f=abc123.mp4')
    expect(v.kind).toBe('arquivo')
    expect(v.canControl).toBe(true)
  })
  it('Instagram e outros endereços abrem fora do app, sem velocidade', () => {
    const v = parseVideo('https://www.instagram.com/reel/Cabc123/')
    expect(v.kind).toBe('externo')
    expect(v.canControl).toBe(false)
  })
  it('sem vídeo não inventa player', () => {
    expect(parseVideo('')).toBe(null)
    expect(parseVideo(null)).toBe(null)
    expect(parseVideo('   ')).toBe(null)
  })
})

describe('vídeo do personal — mensagem do construtor', () => {
  it('campo vazio não é erro: o vídeo é opcional', () => {
    expect(videoProblem('')).toBe(null)
  })
  it('aceita YouTube, arquivo enviado e endereço https', () => {
    expect(videoProblem('https://youtu.be/dQw4w9WgXcQ')).toBe(null)
    expect(videoProblem('/api/media?f=abc.mp4')).toBe(null)
    expect(videoProblem('https://www.instagram.com/reel/Cabc123/')).toBe(null)
  })
  it('explica o que fazer quando o endereço não serve', () => {
    expect(videoProblem('http://youtu.be/dQw4w9WgXcQ')).toContain('https')
    expect(videoProblem('isso não é um link')).toContain('YouTube')
  })
  it('link de canal ou playlist do YouTube é recusado: não é um vídeo', () => {
    expect(parseVideo('https://www.youtube.com/channel/UCabc')).toBe(null)
    expect(parseVideo('https://www.youtube.com/playlist?list=PLabc')).toBe(null)
    expect(videoProblem('https://www.youtube.com/channel/UCabc')).toContain('link direto')
  })
})
