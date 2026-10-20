// BUG-045: nenhum arquivo de codigo com U+FFFD / fora de UTF-8 (o aviso LGPD aparecia como "endere\uFFFDo").
import { describe, it, expect } from 'vitest'
import { scan } from '../scripts/check-utf8.mjs'
describe('codificacao dos fontes', () => {
  it('nenhum arquivo com U+FFFD ou fora de UTF-8', () => { expect(scan()).toEqual([]) })
})
