import { describe, expect, it } from 'vitest'
import { youtubeThumbnail } from './communityNotices.js'

describe('miniatura automática de avisos do YouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=AbCdEf12345', 'AbCdEf12345'],
    ['https://youtu.be/AbCdEf12345', 'AbCdEf12345'],
    ['https://youtube.com/shorts/AbCdEf12345', 'AbCdEf12345'],
    ['https://youtube.com/live/AbCdEf12345', 'AbCdEf12345']
  ])('reconhece %s', (url, id) => expect(youtubeThumbnail(url)).toBe(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`))

  it('não cria miniatura para outro domínio ou protocolo inseguro', () => {
    expect(youtubeThumbnail('https://instagram.com/p/abc')).toBe('')
    expect(youtubeThumbnail('javascript:alert(1)')).toBe('')
    expect(youtubeThumbnail('https://youtube.com.evil.test/watch?v=AbCdEf12345')).toBe('')
  })
})
