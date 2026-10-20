// Só enumera atalhos que o plano e o contexto podem oferecer. Não autoriza APIs.
export function welcomeResources(audience, features, scoped = false, verified = false) {
  if (audience === 'profissional') return [
    '/pro', '/pro?tab=atendimentos', '/pro/assinatura',
    ...(features.convidar_alunos ? ['/pro?tab=alunos'] : []),
    ...(features.construtor_treino && verified ? ['/pro/treino'] : []),
    ...(features.fichas_publicas && verified ? ['/pro/programas'] : [])
  ]
  return ['/hoje', '/comunidade',
    ...(features.programas_guiados && !scoped ? ['/programas'] : []),
    ...(features.progresso ? ['/estatisticas', ...(!scoped ? ['/progresso'] : [])] : []),
    ...(features.ranking && !scoped ? ['/ranking'] : [])]
}
