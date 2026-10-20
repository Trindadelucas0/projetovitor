// Entrada da landing: le o perfil e a atribuicao da URL e monta o link do cadastro.
//
// A landing fica em "/", entao um anuncio chega como
//   https://ornygym.avadesk.com.br/?perfil=aluno&utm_source=meta&...
// e os parametros ficam em window.location.search. O app usa HashRouter, entao o
// useLocation() do react-router devolve a query do HASH, nao essa. Por isso lemos as
// duas e deixamos o hash ganhar (ex.: #/conheca?perfil=profissional).
//
// signupHref monta "#/cadastro?..." no formato que Login.jsx ja sabe ler
// (new URLSearchParams(location.hash.split('?')[1])).

// Plano unico: o cadastro publico e so de aluno. Um anuncio antigo com
// ?perfil=profissional continua funcionando, mas cai no cadastro de aluno.
const PERFIS = ['aluno']
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']
const PLAN_RE = /^[a-z0-9_]{2,32}$/   // o plano real e validado no servidor (api/auth.js)
const KEY = 'orny_entry'

const pick = (a, b, k) => b.get(k) ?? a.get(k)

export function parseEntry(search = '', hash = '') {
  const s = new URLSearchParams(search.replace(/^\?/, ''))
  const h = new URLSearchParams((hash.split('?')[1] || ''))
  const perfil = pick(s, h, 'perfil')
  const plano = pick(s, h, 'plano')
  const utm = {}
  for (const k of UTM) {
    const v = pick(s, h, k)
    if (v) utm[k] = String(v).slice(0, 120)
  }
  return {
    perfil: PERFIS.includes(perfil) ? perfil : 'aluno',
    plano: plano && PLAN_RE.test(plano) ? plano : '',
    utm,
  }
}

// perfil: o da entrada pode ser trocado pelo seletor da pagina, entao vem por fora.
export function signupHref(entry, { perfil, plano, authed } = {}) {
  const e = entry || { perfil: 'aluno', plano: '', utm: {} }
  const aud = PERFIS.includes(perfil) ? perfil : e.perfil
  const id = plano || e.plano
  if (authed) return id ? `#/assinatura?plano=${encodeURIComponent(id)}` : '#/assinatura'
  const q = [`perfil=${aud}`]
  if (id) q.push(`plano=${encodeURIComponent(id)}`)
  for (const [k, v] of Object.entries(e.utm || {})) q.push(`${k}=${encodeURIComponent(v)}`)
  return `#/cadastro?${q.join('&')}`
}

// A atribuicao precisa sobreviver as 6 etapas do cadastro; sessionStorage pode lancar
// (modo privado, cookies bloqueados), entao nunca deixamos isso derrubar a pagina.
export function rememberEntry(entry) {
  try { sessionStorage.setItem(KEY, JSON.stringify(entry)) } catch { /* sem storage: segue sem atribuicao */ }
}

export function readEntry() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null }
}
