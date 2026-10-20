import { describe, it, expect } from 'vitest'
import { normOpts, nextIndex, typeahead } from './gselect.js'
const opts = normOpts([['', 'Todos os assuntos'], ['tr', 'Treinamento'], ['tec', 'Técnica de execução'], { value: 'x', label: 'Desativado', disabled: true }, ['edu', 'Educação e orientação geral'], ['mot', 'Motivação'], ['com', 'Comunicados']])
describe('GSelect - teclado', () => {
  it('aceita pares, objetos e valores simples', () => { expect(normOpts(['a'])).toEqual([{ value: 'a', label: 'a' }]); expect(opts[1]).toEqual({ value: 'tr', label: 'Treinamento' }) })
  it('setas pulam opção desativada e param nas pontas', () => {
    expect(nextIndex('ArrowDown', 2, opts)).toBe(4); expect(nextIndex('ArrowUp', 4, opts)).toBe(2)
    expect(nextIndex('ArrowDown', 6, opts)).toBe(6); expect(nextIndex('ArrowUp', 0, opts)).toBe(0)
  })
  it('Home/End e sem seleção', () => { expect(nextIndex('Home', 3, opts)).toBe(0); expect(nextIndex('End', 0, opts)).toBe(6); expect(nextIndex('ArrowDown', -1, opts)).toBe(0) })
  it('tecla irrelevante devolve null', () => { expect(nextIndex('a', 0, opts)).toBe(null); expect(nextIndex('ArrowDown', 0, [])).toBe(null) })
})
describe('GSelect - busca por digitação', () => {
  it('ignora acento e caixa, e circula a partir da atual', () => {
    expect(typeahead('te', 0, opts)).toBe(2); expect(typeahead('E', 0, opts)).toBe(4)
    expect(typeahead('t', 2, opts)).toBe(0); expect(typeahead('t', 0, opts)).toBe(1)
  })
  it('não seleciona opção desativada; texto vazio devolve null', () => { expect(typeahead('des', 0, opts)).toBe(null); expect(typeahead('', 0, opts)).toBe(null) })
})