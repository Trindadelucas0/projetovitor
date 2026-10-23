import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { benefitsOf, PlanCard, PlanGrid, SELLABLE } from './PlansShowcase.jsx'

describe('catálogo Básico e Completo', () => {
  it('expõe Básico e Completo no catálogo comercial', () => {
    expect(SELLABLE).toEqual(['individual', 'completo'])
  })

  it('não oferece plano de profissional', () => {
    expect(SELLABLE).not.toContain('pro')
    expect(SELLABLE).not.toContain('pro_ilimitado')
  })

  it('descreve o que o Básico entrega ao aluno', () => {
    const features = { receber_ficha_profissional: true, programas_guiados: true, execucao: true, progresso: true }
    const texts = benefitsOf({ id: 'individual', features }).map(([, text]) => text)
    expect(texts[0]).toBe('1 ficha de treino nova por mês, montada pelo seu personal')
    expect(texts).toContain('1 call de 15 min por mês no Zoom')
    expect(texts).toContain('Comunidade no WhatsApp: grupo geral e avisos')
    expect(texts).toContain('7 dias de Close Friends no Instagram por mês')
    expect(texts).not.toContain('Avaliação postural')
    expect(texts).not.toContain('Grupo exclusivo no WhatsApp')
  })

  it('inclui avaliação postural no Completo', () => {
    const features = { receber_ficha_profissional: true, avaliacao_postural: true, progresso: true }
    const texts = benefitsOf({ id: 'completo', features }).map(([, text]) => text)
    expect(texts).toContain('Avaliação postural')
    for (const t of ['Ficha de treino nova a cada 15 dias', 'Call de 15 min no Zoom a cada 15 dias', 'Close Friends no Instagram durante os 3 meses',
      'Grupo exclusivo no WhatsApp', 'Live semanal com prioridade nas suas perguntas', 'Participação nos sorteios']) expect(texts).toContain(t)
  })

  it('não promete dieta em nenhum plano', () => {
    for (const id of SELLABLE) {
      const texts = benefitsOf({ id, features: {} }).map(([, text]) => text).join(' ')
      expect(texts).not.toMatch(/dieta/i)
    }
  })

  it('omite o benefício quando o recurso está desligado no plano', () => {
    const texts = benefitsOf({ id: 'individual', features: { receber_ficha_profissional: false } }).map(([, text]) => text)
    expect(texts).not.toContain('1 ficha de treino nova por mês, montada pelo seu personal')
  })

  it('mostra uma acao explicita e o estado do plano selecionado', () => {
    const p = { id: 'individual', name: 'Básico', price_cents: 4990, features: {} }
    const available = renderToStaticMarkup(<PlanCard p={p} compact onSelect={() => {}} selected={false} />)
    const selected = renderToStaticMarkup(<PlanCard p={p} compact onSelect={() => {}} selected />)
    expect(available).toContain('aria-pressed="false"')
    expect(available).toContain('aria-label="Selecionar plano: Básico"')
    expect(available).toContain('Selecionar plano')
    expect(selected).toContain('aria-pressed="true"')
    expect(selected).toContain('aria-label="Plano selecionado: Básico"')
    expect(selected).toContain('Plano selecionado')
  })

  it('mostra o preço mensal do Básico e o pagamento único do Completo', () => {
    const basico = renderToStaticMarkup(<PlanCard p={{ id: 'individual', name: 'Básico', price_cents: 4990, renews: true, features: {} }} />)
    expect(basico).toContain('49')
    expect(basico).toContain(',90')
    expect(basico).toContain('/mês')
    const completo = renderToStaticMarkup(<PlanCard p={{ id: 'completo', name: 'Completo', price_cents: 49900, renews: false, features: {} }} />)
    expect(completo).toContain('499')
    expect(completo).toContain('pagamento único')
    expect(completo).toContain('3 meses')
    expect(completo).toContain('ou em até 4x no cartão')
    expect(basico).not.toContain('4x')
  })

  it('mostra os dois cartões na grade, sem seletor de perfil', () => {
    const html = renderToStaticMarkup(<PlanGrid plans={[
      { id: 'individual', name: 'Básico', price_cents: 4990, features: {} },
      { id: 'completo', name: 'Completo', price_cents: 49900, renews: false, features: {} }
    ]} />)
    expect(html).toContain('plan-card-individual')
    expect(html).toContain('plan-card-completo')
    expect(html).not.toContain('Sou personal')
    expect(html).not.toContain('pl-one')
  })
})
