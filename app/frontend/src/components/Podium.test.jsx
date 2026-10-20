import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Podium, initials } from './Podium.jsx'
const P = (position, name, extra = {}) => ({ position, name, score: 10 - position, ...extra })
describe('Podium (V6)', () => {
  it('ordem visual: 2º à esquerda, 1º no centro, 3º à direita', () => {
    const h = renderToStaticMarkup(<Podium items={[P(3, 'Cara'), P(1, 'Ana'), P(2, 'Bia')]} />)
    expect(h.indexOf('Bia')).toBeLessThan(h.indexOf('Ana')); expect(h.indexOf('Ana')).toBeLessThan(h.indexOf('Cara'))
    expect(h).toMatch(/pd-c[^>]*>.*Ana/)
  })
  it('sem foto: iniciais', () => { expect(initials('Maria Souza')).toBe('MS'); expect(renderToStaticMarkup(<Podium items={[P(1, 'Maria Souza')]} />)).toContain('>MS<') })
  it('menos de 3 participantes: lugares vazios', () => { const h = renderToStaticMarkup(<Podium items={[P(1, 'Ana')]} />); expect((h.match(/pd-empty/g) || []).length).toBe(2) })
  it('sem ninguém: mensagem', () => expect(renderToStaticMarkup(<Podium items={[]} />)).toContain('Ninguém pontuou'))
  it('empate: mostra a mesma medalha e o rótulo', () => { const h = renderToStaticMarkup(<Podium items={[P(1, 'Ana', { tied: true }), P(1, 'Bia', { tied: true })]} />); expect((h.match(/empate/g) || []).length).toBe(2); expect((h.match(/pd-medal pd-ouro/g) || []).length).toBe(2) })
  it('troféu só no 1º e medalhas ouro/prata/bronze', () => { const h = renderToStaticMarkup(<Podium items={[P(1, 'A'), P(2, 'B'), P(3, 'C')]} />); expect((h.match(/🏆/g) || []).length).toBe(1); ['ouro', 'prata', 'bronze'].forEach(m => expect(h).toContain('pd-medal pd-' + m)) })
  it('acessível: rótulo da seção e itens descritos', () => { const h = renderToStaticMarkup(<Podium items={[P(1, 'Ana')]} onPick={() => {}} />); expect(h).toContain('aria-label="Pódio"'); expect(h).toContain('aria-label="1º lugar: Ana, 9') })
  it('marca você', () => expect(renderToStaticMarkup(<Podium items={[P(1, 'Ana', { me: true })]} />)).toContain('(você)'))
})
