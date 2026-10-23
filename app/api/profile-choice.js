export const PROFILE_KINDS = ['menino', 'menina', 'outro']
export const ACCENT_PALETTES = ['verde', 'rosa', 'roxo', 'azul', 'laranja']

const defaults = { menino: 'verde', menina: 'rosa' }

export function normalizeProfileChoice(body = {}, { optional = false } = {}) {
  let profile_kind = String(body.profile_kind || '').trim().toLowerCase()
  if (!profile_kind && body.perfil === 'masculino') profile_kind = 'menino'
  if (!profile_kind && body.perfil === 'feminino') profile_kind = 'menina'
  if (!profile_kind && optional) return null
  if (!PROFILE_KINDS.includes(profile_kind)) throw Object.assign(new Error('Escolha Menino, Menina ou Outro'), { code: 'INVALID_PROFILE' })

  const accent_palette = defaults[profile_kind] || String(body.accent_palette || '').trim().toLowerCase()
  if (!ACCENT_PALETTES.includes(accent_palette)) throw Object.assign(new Error('Escolha uma cor para o perfil Outro'), { code: 'INVALID_PALETTE' })
  if (profile_kind === 'menino' && accent_palette !== 'verde') throw Object.assign(new Error('O perfil Menino usa a cor verde'), { code: 'INVALID_PALETTE' })
  if (profile_kind === 'menina' && accent_palette !== 'rosa') throw Object.assign(new Error('O perfil Menina usa a cor rosa'), { code: 'INVALID_PALETTE' })
  if (profile_kind === 'outro' && !['roxo', 'azul', 'laranja'].includes(accent_palette)) throw Object.assign(new Error('Escolha Roxo, Azul ou Laranja'), { code: 'INVALID_PALETTE' })

  const prefers_female_coach = profile_kind === 'menina' && body.prefers_female_coach === true
  return {
    profile_kind,
    accent_palette,
    prefers_female_coach,
    sex: profile_kind === 'menino' ? 'masculino' : profile_kind === 'menina' ? 'feminino' : null
  }
}

export const legacyPerfil = choice => choice?.profile_kind === 'menina' ? 'feminino' : choice?.profile_kind === 'menino' ? 'masculino' : null
