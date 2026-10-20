import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { benefitsOf, PlanCard, SELLABLE } from './PlansShowcase.jsx'

describe('catálogo dos planos Personal', () => {
  it('expõe Personal 15 e Personal Ilimitado no catálogo comercial', () => {
    expect(SELLABLE).toEqual(['individual', 'pro', 'pro_ilimitado'])
  })

  it('descreve capacidade finita e ilimitada sem converter ilimitado em zero', () => {
    const features = { construtor_treino: true, prescrever: true, fichas_publicas: true }
    const finite = benefitsOf({ id: 'pro', limits: { alunos_ativos: 15 }, features }).map(([, text]) => text)
    const unlimited = benefitsOf({ id: 'pro_ilimitado', limits: { alunos_ativos: null }, features }).map(([, text]) => text)
    expect(finite).toContain('Até 15 alunos ativos')
    expect(unlimited).toContain('Alunos ativos ilimitados')
    expect(unlimited.join(' ')).not.toContain('0 alunos')
  })

  it('mostra uma acao explicita e o estado do plano selecionado', () => {
    const p = { id: 'individual', name: 'Individual', price_cents: 1290, features: {} }
    const available = renderToStaticMarkup(<PlanCard p={p} compact onSelect={() => {}} selected={false} />)
    const selected = renderToStaticMarkup(<PlanCard p={p} compact onSelect={() => {}} selected />)
    expect(available).toContain('aria-pressed="false"')
    expect(available).toContain('aria-label="Selecionar plano: Individual"')
    expect(available).toContain('Selecionar plano')
    expect(selected).toContain('aria-pressed="true"')
    expect(selected).toContain('aria-label="Plano selecionado: Individual"')
    expect(selected).toContain('Plano selecionado')
  })
})
