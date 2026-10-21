// Regras do wizard de avaliação postural. São funções puras de propósito: a suíte do frontend roda sem
// DOM, então o que decide progresso, etapa pendente e estado de envio tem de ser testável sem renderizar.
// A regra que mais importa aqui: nada é "enviado" sem confirmação do servidor.
import { describe, expect, it } from 'vitest'
import { captureOf, stateOf, progressOf, missingRequired, nextPending, cardState, CARD_CTA, toRedo, fmtBytes } from './postural.js'

const step = (id, extra = {}) => ({ id, code: 'e' + id, title: 'Etapa ' + id, position: +id, capture_kind: 'foto', required: true, allow_skip: true, ...extra })
const cap = (step_id, status, extra = {}) => ({ id: 'c' + step_id, step_id, status, ...extra })

describe('progresso e etapas pendentes', () => {
  const steps = [step('1'), step('2'), step('3')]

  it('conta como feita a etapa enviada e a dispensada com justificativa', () => {
    const caps = [cap('1', 'enviada'), cap('2', 'dispensada')]
    expect(progressOf(steps, caps)).toEqual({ total: 3, done: 2, pending: 1, percent: 67 })
  })

  it('não conta como feita a etapa apenas reservada: o arquivo ainda não chegou ao servidor', () => {
    expect(progressOf(steps, [cap('1', 'reservada')]).done).toBe(0)
  })

  it('ignora captura substituída: a recaptura reabre a etapa', () => {
    expect(captureOf([cap('1', 'substituida')], '1')).toBe(null)
    expect(progressOf(steps, [cap('1', 'substituida')]).done).toBe(0)
  })

  it('o número de etapas vem da lista recebida, nunca de constante', () => {
    expect(progressOf([step('1')], []).total).toBe(1)
    expect(progressOf(Array.from({ length: 18 }, (_, i) => step(String(i + 1))), []).total).toBe(18)
    expect(progressOf([], []).total).toBe(0)
    expect(progressOf([], []).percent).toBe(0)
  })

  it('retoma na primeira etapa pendente', () => {
    expect(nextPending(steps, [cap('1', 'enviada')])).toBe(1)
    expect(nextPending(steps, [cap('1', 'enviada'), cap('2', 'dispensada'), cap('3', 'enviada')])).toBe(null)
    expect(nextPending(steps, [])).toBe(0)
  })

  it('só barra o envio por etapa obrigatória', () => {
    const mistas = [step('1'), step('2', { required: false })]
    expect(missingRequired(mistas, []).map(s => s.id)).toEqual(['1'])
    expect(missingRequired(mistas, [cap('1', 'enviada')])).toEqual([])
  })

  it('lista as etapas que o profissional mandou refazer', () => {
    const caps = [cap('1', 'enviada'), cap('2', 'reservada', { correction_reason: 'foto na diagonal' })]
    expect(toRedo([step('1'), step('2')], caps).map(s => s.id)).toEqual(['2'])
  })
})

describe('estado de uma captura na tela', () => {
  it('distingue salvo no aparelho, enviando e confirmado pelo servidor', () => {
    expect(stateOf(null, null)).toBe('vazio')
    expect(stateOf(null, { sending: false })).toBe('local')
    expect(stateOf(cap('1', 'reservada'), { sending: true })).toBe('enviando')
    expect(stateOf(cap('1', 'enviada'), null)).toBe('confirmada')
  })

  it('reservada sem envio em curso ainda é local: o servidor não confirmou nada', () => {
    expect(stateOf(cap('1', 'reservada'), null)).toBe('local')
  })

  it('arquivo recusado aparece como recusado, não desaparece', () => {
    expect(stateOf(null, { error: 'Arquivo corrompido' })).toBe('recusada')
    expect(stateOf(cap('1', 'reservada'), { error: 'Sem conexão' })).toBe('recusada')
  })

  it('mostra refazer quando o profissional pediu recaptura', () => {
    expect(stateOf(cap('1', 'enviada', { review_status: 'recapturar' }), null)).toBe('refazer')
    expect(stateOf(cap('1', 'enviada', { review_status: 'adequada' }), null)).toBe('confirmada')
  })

  it('dispensada é um estado próprio', () => {
    expect(stateOf(cap('1', 'dispensada'), null)).toBe('dispensada')
  })
})

describe('cartão do Início', () => {
  it('não aparece quando não há avaliação aberta', () => {
    expect(cardState(null)).toBe('ausente')
    expect(cardState(undefined)).toBe('ausente')
  })

  it('tem uma ação própria para cada estado da avaliação', () => {
    expect(cardState({ status: 'solicitada' })).toBe('iniciar')
    expect(cardState({ status: 'em_andamento' })).toBe('continuar')
    expect(cardState({ status: 'recaptura_solicitada' })).toBe('corrigir')
    expect(cardState({ status: 'enviada' })).toBe('analise')
    expect(cardState({ status: 'em_revisao' })).toBe('analise')
    expect(cardState({ status: 'publicada' })).toBe('devolutiva')
  })

  it('avaliação encerrada não gera cartão', () => {
    expect(cardState({ status: 'cancelada' })).toBe('ausente')
    expect(cardState({ status: 'expirada' })).toBe('ausente')
  })

  it('todo estado visível tem texto de ação', () => {
    for (const s of ['iniciar', 'continuar', 'corrigir', 'analise', 'devolutiva']) expect(CARD_CTA[s]).toBeTruthy()
  })
})

describe('tamanho de arquivo em português', () => {
  it('usa KB abaixo de 1 MB e vírgula decimal acima', () => {
    expect(fmtBytes(512 * 1024)).toBe('512 KB')
    expect(fmtBytes(2.5 * 1048576)).toBe('2,5 MB')
    expect(fmtBytes(0)).toBe('')
    expect(fmtBytes(undefined)).toBe('')
  })
})
