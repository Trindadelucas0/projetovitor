// AVAGYM V5 - lógica pura do seletor GSelect (navegação por teclado e busca por digitação), testável no vitest.
export const normOpts = options => (options || []).map(o => Array.isArray(o) ? { value: o[0], label: o[1] } : typeof o === 'object' ? o : { value: o, label: String(o) })
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const enabled = (opts, i) => i >= 0 && i < opts.length && !opts[i].disabled
function step(opts, from, dir) {
  for (let k = 1; k <= opts.length; k++) { const i = from + dir * k; if (i < 0 || i >= opts.length) return from; if (enabled(opts, i)) return i }
  return from
}
// devolve o novo índice ativo para a tecla; null quando a tecla não muda a seleção
export function nextIndex(key, idx, opts) {
  if (!opts.length) return null
  const first = step(opts, -1, 1), last = step(opts, opts.length, -1)
  if (key === 'ArrowDown') return idx < 0 ? first : step(opts, idx, 1)
  if (key === 'ArrowUp') return idx < 0 ? last : step(opts, idx, -1)
  if (key === 'Home') return first
  if (key === 'End') return last
  if (key === 'PageDown') { let i = idx < 0 ? first : idx; for (let k = 0; k < 5; k++) i = step(opts, i, 1); return i }
  if (key === 'PageUp') { let i = idx < 0 ? last : idx; for (let k = 0; k < 5; k++) i = step(opts, i, -1); return i }
  return null
}
// busca por digitação: procura o próximo rótulo que começa com o texto digitado (sem acento, sem caixa)
export function typeahead(text, idx, opts) {
  const t = fold(text); if (!t) return null
  for (let k = 1; k <= opts.length; k++) { const i = (Math.max(idx, -1) + k) % opts.length; if (enabled(opts, i) && fold(opts[i].label).startsWith(t)) return i }
  return null
}