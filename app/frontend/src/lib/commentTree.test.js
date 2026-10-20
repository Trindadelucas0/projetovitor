import { describe, it, expect } from 'vitest'
import { buildThreads, visibleCount } from './commentTree.js'
const C = [
  { id: 1, parent_id: null, author_name: 'Ana', status: 'visivel' },
  { id: 2, parent_id: 1, author_name: 'Bia', status: 'visivel' },
  { id: 3, parent_id: null, author_name: 'Caio', status: 'removido' },
  { id: 4, parent_id: 2, author_name: 'Davi', status: 'visivel' },
  { id: 5, parent_id: 3, author_name: 'Eva', status: 'visivel' },
  { id: 6, parent_id: 99, author_name: 'Órfão', status: 'visivel' },
]
describe('comentários encadeados', () => {
  it('agrupa respostas de qualquer nível sob o comentário raiz, em ordem', () => {
    const t = buildThreads(C)
    expect(t.map(x => x.root.id)).toEqual([1, 3, 6])
    expect(t[0].replies.map(r => r.id)).toEqual([2, 4])
  })
  it('indica a quem responde quando não é o comentário raiz', () => {
    const t = buildThreads(C); expect(t[0].replies[0].reply_to).toBe(null); expect(t[0].replies[1].reply_to).toBe('Bia')
  })
  it('pai ausente (oculto pela moderação) vira raiz; contagem só de visíveis', () => {
    expect(buildThreads(C)[2].replies).toEqual([]); expect(visibleCount(C)).toBe(5); expect(buildThreads([])).toEqual([])
  })
})