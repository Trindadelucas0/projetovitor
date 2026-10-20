import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

describe('sem modo visitante na web', () => {
  it('tela de login não oferece "Usar sem conta"', () => {
    expect(read('../views/Login.jsx')).not.toMatch(/Usar sem conta/)
  })
  it('isGuest/setGuest só valem nos builds offline (demo/app nativo)', () => {
    const s = read('./useStore.js')
    expect(s).toMatch(/isGuest: \(\) => \(DEMO \|\| MOBILE\) && /)
    expect(s).toMatch(/setGuest\(v\) \{ if \(v && !\(DEMO \|\| MOBILE\)\) return;/)
    expect(s).toMatch(/localStorage\.removeItem\('gym_guest'\)\s+\/\/ visitante antigo/)
  })
  it('sem login o app só renderiza a tela de Login', () => {
    const a = read('../App.jsx')
    expect(a).toMatch(/const authed = user \|\| isGuest/)
    expect(a).toMatch(/\{!authed \? <Login \/>/)
  })
})
