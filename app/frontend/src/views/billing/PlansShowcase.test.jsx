import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { benefitsOf, PlanCard, PlanGrid, SELLABLE } from './PlansShowcase.jsx'

describe('catálogo de plano único', () => {
  it('expõe somente o plano de aluno no catálogo comercial', () => {
    expect(SELLABLE).toEqual(['individual'])
  })

  it('não oferece mais plano de profissional', () => {
    expect(SELLABLE).not.toContain('pro')
    expect(SELLABLE).not.toContain('pro_ilimitado')
  })

  it('descreve o que a assinatura entrega ao aluno', () => {
    const features = { receber_ficha_profissional: true, programas_guiados: true, execucao: true, progresso: true }
    const texts = benefitsOf({ id: 'individual', features }).map(([, text]) => text)
    expect(texts[0]).toBe('Fichas montadas pelo seu personal')
    expect(texts).toContain('Comunidade, desafios e ranking')
  })

  it('omite o benefício quando o recurso está desligado no plano', () => {
    const texts = benefitsOf({ id: 'individual', features: { receber_ficha_profissional: false } }).map(([, text]) => text)
    expect(texts).not.toContain('Fichas montadas pelo seu personal')
  })

  it('mostra uma acao explicita e o estado do plano selecionado', () => {
    const p = { id: 'individual', name: 'ORNY', price_cents: 3990, features: {} }
    const available = renderToStaticMarkup(<PlanCard p={p} compact onSelect={() => {}} selected={false} />)
    const selected = renderToStaticMarkup(<PlanCard p={p} compact onSelect={() => {}} selected />)
    expect(available).toContain('aria-pressed="false"')
    expect(available).toContain('aria-label="Selecionar plano: ORNY"')
    expect(available).toContain('Selecionar plano')
    expect(selected).toContain('aria-pressed="true"')
    expect(selected).toContain('aria-label="Plano selecionado: ORNY"')
    expect(selected).toContain('Plano selecionado')
  })

  it('mostra o preço mensal definido pelo servidor', () => {
    const html = renderToStaticMarkup(<PlanCard p={{ id: 'individual', name: 'ORNY', price_cents: 3990, features: {} }} />)
    expect(html).toContain('39')
    expect(html).toContain(',90')
    expect(html).toContain('/mês')
  })

  it('não mostra seletor de perfil na grade, só o cartão do plano', () => {
    const html = renderToStaticMarkup(<PlanGrid plans={[{ id: 'individual', name: 'ORNY', price_cents: 3990, features: {} }]} />)
    expect(html).toContain('plan-card-individual')
    expect(html).not.toContain('Sou personal')
    expect(html).toContain('pl-one')
  })
})
