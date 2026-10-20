// Só enumera atalhos que o plano e o contexto podem oferecer. Não autoriza APIs.
export function welcomeResources(audience, features, scoped = false, verified = false) {
  // Plano único: não existe mais assinatura de profissional para dar boas-vindas. O
  // personal é o administrador e entra direto no painel. Mantido por compatibilidade
  // com registros antigos de boas-vindas que gravaram a audiência 'profissional'.
  if (audience === 'profissional') return ['/admin/painel?tab=usuarios', '/admin/painel?tab=filas', '/pro/treino']
  return ['/hoje', '/comunidade',
    ...(features.programas_guiados && !scoped ? ['/programas'] : []),
    ...(features.progresso ? ['/estatisticas', ...(!scoped ? ['/progresso'] : [])] : []),
    ...(features.ranking && !scoped ? ['/ranking'] : [])]
}
