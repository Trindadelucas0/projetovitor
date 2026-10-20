import { describe, it, expect } from 'vitest'
import { installTipKind } from './installTip.js'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
describe('dica de instalação por plataforma', () => {
  it('iOS Safari não instalado mostra a dica do Safari', () => expect(installTipKind({ userAgent: IPHONE }, false)).toBe('ios'))
  it('iOS já instalado (standalone) esconde', () => { expect(installTipKind({ userAgent: IPHONE, standalone: true }, false)).toBe(null); expect(installTipKind({ userAgent: IPHONE }, true)).toBe(null) })
  it('iPadOS (se identifica como Mac com toque) conta como iOS', () => expect(installTipKind({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605', platform: 'MacIntel', maxTouchPoints: 5 }, false)).toBe('ios'))
  it('Chrome no iOS orienta abrir no Safari', () => expect(installTipKind({ userAgent: IPHONE.replace('Version/17.5', 'CriOS/126.0') }, false)).toBe('ios-other'))
  it('Android mostra a instrução do Chrome', () => expect(installTipKind({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36' }, false)).toBe('android'))
  it('desktop Chrome/Edge mostra a instrução do ícone de instalar', () => expect(installTipKind({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36 Edg/126.0' }, false)).toBe('desktop'))
  it('Firefox/Safari no Mac (sem instalação de PWA) esconde', () => { expect(installTipKind({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0' }, false)).toBe(null); expect(installTipKind({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605', platform: 'MacIntel', maxTouchPoints: 0 }, false)).toBe(null) })
})
