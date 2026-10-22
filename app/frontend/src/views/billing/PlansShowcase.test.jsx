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
    expect(texts[0]).toBe('Fichas montadas pelo seu personal')
    expect(texts).toContain('Comunidade com publicações')
    expect(texts).not.toContain('Avaliação postural')
  })

  it('inclui avaliação postural no Completo', () => {
    const features = { receber_ficha_profissional: true, avaliacao_postural: true, progresso: true }
    const texts = benefitsOf({ id: 'completo', features }).map(([, text]) => text)
    expect(texts).toContain('Avaliação postural')
  })

  it('omite o benefício quando o recurso está desligado no plano', () => {
    const texts = benefitsOf({ id: 'individual', features: { receber_ficha_profissional: false } }).map(([, text]) => text)
    expect(texts).not.toContain('Fichas montadas pelo seu personal')
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
