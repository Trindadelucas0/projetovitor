import { describe, it, expect } from 'vitest'
import { parseEntry, signupHref } from './landingParams.js'

describe('landing — leitura da URL do anúncio', () => {
  it('lê perfil e UTMs do search (visita de anúncio em "/")', () => {
    const e = parseEntry('?perfil=profissional&utm_source=meta&utm_campaign=orny_personal&fbclid=ABC', '')
    expect(e.perfil).toBe('profissional')
    expect(e.utm).toEqual({ utm_source: 'meta', utm_campaign: 'orny_personal', fbclid: 'ABC' })
  })
  it('lê também do hash, que vence o search (#/conheca?perfil=…)', () => {
    expect(parseEntry('?perfil=aluno', '#/conheca?perfil=profissional').perfil).toBe('profissional')
    expect(parseEntry('', '#/conheca?perfil=profissional').perfil).toBe('profissional')
  })
  it('perfil desconhecido ou ausente cai em aluno', () => {
    expect(parseEntry('?perfil=admin', '').perfil).toBe('aluno')
    expect(parseEntry('', '').perfil).toBe('aluno')
  })
  it('ignora parâmetro que não é de atribuição e corta valor gigante', () => {
    const e = parseEntry('?ref=x&utm_source=' + 'a'.repeat(300), '')
    expect(e.utm.ref).toBeUndefined()
    expect(e.utm.utm_source).toHaveLength(120)
  })
  it('só aceita id de plano com formato de id', () => {
    expect(parseEntry('?plano=pro', '').plano).toBe('pro')
    expect(parseEntry('?plano=<script>', '').plano).toBe('')
  })
})

describe('landing — link do cadastro', () => {
  const entry = parseEntry('?perfil=aluno&utm_source=meta&utm_content=ad_a', '')

  it('monta #/cadastro no formato que o Login lê, com a atribuição', () => {
    const href = signupHref(entry)
    expect(href).toBe('#/cadastro?perfil=aluno&utm_source=meta&utm_content=ad_a')
    // é exatamente assim que views/Login.jsx faz a leitura
    const q = new URLSearchParams(href.split('?')[1])
    expect(q.get('perfil')).toBe('aluno')
    expect(q.get('utm_source')).toBe('meta')
  })
  it('o seletor da página troca o perfil sem perder a atribuição', () => {
    expect(signupHref(entry, { perfil: 'profissional' })).toContain('perfil=profissional')
    expect(signupHref(entry, { perfil: 'profissional' })).toContain('utm_source=meta')
  })
  it('o CTA de um plano leva o plano escolhido', () => {
    expect(signupHref(entry, { plano: 'pro' })).toContain('plano=pro')
  })
  it('quem já está logado vai para a assinatura, não para o cadastro', () => {
    expect(signupHref(entry, { authed: true, plano: 'pro' })).toBe('#/assinatura?plano=pro')
    expect(signupHref(entry, { authed: true })).toBe('#/assinatura')
  })
  it('nunca gera nada fora de "grátis": o cadastro exige plano pago', () => {
    expect(signupHref(entry)).not.toContain('gratis')
  })
})
