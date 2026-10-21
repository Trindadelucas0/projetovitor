// Protocolos oficiais de avaliação postural (semente idempotente, 20/10/2026).
// Fonte historica: PDF de protocolo removido da copia documental por solicitacao do responsavel.
// O documento original estava redigido no feminino e prescrevia biquini; aqui
// ele virou DOIS protocolos — masculino (concordância e vestimenta adaptadas) e feminino (redação original).
// Nenhuma adaptação muda o significado de um movimento: só concordância verbal e peça de roupa.
// Divergências entre o PDF e o briefing ficam marcadas em needs_review/review_note para o profissional
// validar; o módulo nunca "corrige" biomecânica em silêncio.
// Fica fora da migration de propósito: migration roda uma vez, e o texto das etapas ainda vai ser revisado.
// Mudar qualquer texto daqui gera uma NOVA versão publicada (content_hash); as avaliações em andamento
// continuam presas à versão em que começaram.
import crypto from 'node:crypto'

const PREPARATION = [
  { key: 'luz', label: 'Local bem iluminado', help: 'Luz de frente ou difusa. Evite sombra forte e contraluz.' },
  { key: 'camera', label: 'Celular firme e centralizado', help: 'Apoie o celular em um suporte ou peça para alguém segurar sem inclinar.' },
  { key: 'enquadramento', label: 'Corpo inteiro enquadrado', help: 'Nenhuma parte do corpo pode ficar cortada na imagem.' },
  { key: 'descalco', label: 'Pés descalços', help: 'Sem meias, tênis ou chinelo.' },
  { key: 'roupa', label: 'Roupa adequada', help: 'Precisa deixar visíveis os ossos do quadril e as escápulas.' },
  { key: 'cabelo', label: 'Cabelos presos', help: 'De preferência em coque acima da cabeça, sem cobrir o corpo.' },
  { key: 'postura', label: 'Postura natural', help: 'Não force nenhuma posição para parecer melhor na foto.' }
]

const GENERAL = [
  'Siga as instruções com atenção: a qualidade das imagens é o que permite a avaliação.',
  'Mantenha o local bem iluminado.',
  'Deixe a câmera exatamente centralizada de frente, nunca na diagonal.',
  'Nas fotos em pé, a câmera fica na altura do umbigo. Nas fotos deitadas, um pouco mais baixa.',
  'Cuidado para a câmera não ficar inclinada para frente nem para o lado.',
  'Enquadre o corpo inteiro, sem cortar nenhuma parte.',
  'Fique com os pés descalços.',
  'Nivele a frente do short ou da sunga passando exatamente por cima das cristas ilíacas ântero-superiores, os dois ossinhos pontudos na frente da pelve, para que nem a frente nem as costas fiquem tortas.',
  'Prenda os cabelos para não cobrir nenhuma parte do corpo que precisa aparecer.',
  'Não force nenhum tipo de postura.'
]

const CAMERA_NOTE = 'Câmera centralizada de frente, na altura do umbigo nas fotos em pé e um pouco mais baixa nas fotos deitadas. Nunca na diagonal e nunca inclinada.'

const CLOTHING = {
  masculino: 'Use sunga ou um short bem justo, de preferência preto ou na cor mais escura que tiver. A peça precisa deixar visíveis as estruturas ósseas do quadril, e nada deve bloquear a visão das escápulas.',
  feminino: 'O biquíni permite visualizar todas as estruturas ósseas necessárias para a avaliação biomecânica e facilita a comparação posterior de composição corporal. Se não se sentir confortável, troque a parte de baixo por um short bem justo. Em qualquer caso a parte de cima deve ser biquíni, com alça fina amarrada em volta do pescoço, que não bloqueie a visão das escápulas. A cor deve ser preferencialmente preta ou a mais escura disponível.'
}

const NOTES = 'Transcrito do PDF de referência do cliente, sem a marca de terceiros. O não cumprimento das orientações compromete a análise e, por consequência, o planejamento. A avaliação depende da qualidade das imagens.'

// pacotes de concordância: a única diferença de redação entre os dois protocolos
const WORDS = {
  masculino: { deitado: 'Deitado', continueDeitado: 'deitado', sentado: 'Sentado', preparado: 'preparado' },
  feminino: { deitado: 'Deitada', continueDeitado: 'deitada', sentado: 'Sentada', preparado: 'preparada' }
}

// 18 etapas: 15 fotografias e 3 vídeos. A ordem é a do PDF e não deve ser reordenada sem validação.
const steps = w => [
  {
    code: 'frontal', title: 'Frontal', capture_kind: 'foto', camera_position: 'frontal',
    description: 'Primeira foto, de frente para a câmera.',
    instructions: [
      'Fique de frente para a câmera, com o tronco ereto.',
      'Deixe os braços relaxados ao lado do corpo.',
      'Olhe para a linha do horizonte.',
      'Mantenha os pés paralelos, na distância do quadril.'
    ],
    cautions: ['O corpo inteiro precisa aparecer, sem cortar nenhuma parte.']
  },
  {
    code: 'perfil_direito', title: 'Perfil direito', capture_kind: 'foto', camera_position: 'lateral_direita',
    instructions: [
      'Partindo da posição frontal, gire o corpo exatamente 90 graus para a esquerda.',
      'Mantenha a mesma postura da foto anterior.',
      'Mantenha os pés paralelos e na distância do quadril.',
      'Não coloque um pé à frente do outro.'
    ],
    cautions: []
  },
  {
    code: 'perfil_direito_flexao_ombro', title: 'Perfil direito com flexão máxima do ombro', capture_kind: 'foto', camera_position: 'lateral_direita',
    instructions: [
      'Sem alterar em nada o posicionamento do corpo, eleve o braço direito o máximo que puder.'
    ],
    cautions: ['Não compense inclinando nem girando o tronco.', 'Pare antes de qualquer dor.']
  },
  {
    code: 'perfil_esquerdo', title: 'Perfil esquerdo', capture_kind: 'foto', camera_position: 'lateral_esquerda',
    instructions: [
      'Volte à posição frontal inicial.',
      'Gire o corpo exatamente 90 graus para a direita.',
      'Mantenha a mesma postura padrão.',
      'Mantenha os pés paralelos e na distância do quadril, sem colocar um à frente do outro.'
    ],
    cautions: []
  },
  {
    code: 'perfil_esquerdo_flexao_ombro', title: 'Perfil esquerdo com flexão máxima do ombro', capture_kind: 'foto', camera_position: 'lateral_esquerda',
    instructions: [
      'Sem alterar em nada o posicionamento do corpo, eleve o braço esquerdo o máximo que puder.'
    ],
    cautions: ['Não compense inclinando nem girando o tronco.', 'Pare antes de qualquer dor.']
  },
  {
    code: 'costas', title: 'Costas', capture_kind: 'foto', camera_position: 'posterior',
    instructions: [
      'Volte à posição frontal inicial.',
      'Gire 180 graus em torno do próprio eixo, ficando de costas para a câmera.',
      'Mantenha o tronco ereto e os braços relaxados ao lado do corpo.',
      'Olhe para a linha do horizonte.',
      'Mantenha os pés paralelos, na distância do quadril.'
    ],
    cautions: []
  },
  {
    code: 'costas_elevacao_bracos', title: 'Costas com elevação dos braços', capture_kind: 'video', camera_position: 'posterior', repetitions: 3,
    description: 'Vídeo de costas para a câmera.',
    instructions: [
      'De costas para a câmera, mantenha o posicionamento do corpo.',
      'Eleve os braços até a linha das orelhas.',
      'Faça o movimento 3 vezes, de forma lenta.'
    ],
    cautions: ['Grave o movimento completo, sem cortar o início nem o fim.']
  },
  {
    code: 'agachamento_perfil', title: 'Agachamento de perfil', capture_kind: 'video', camera_position: 'livre', repetitions: 3,
    description: 'Vídeo de perfil, para qualquer um dos lados.',
    instructions: [
      'Volte à posição inicial e gire para um dos lados, de perfil para a câmera.',
      'Afaste um pouco os pés.',
      'Cruze os braços à frente do corpo.',
      'Agache descendo o máximo que conseguir.',
      'Faça o movimento 3 vezes, de forma lenta.'
    ],
    cautions: ['Respeite o seu limite de amplitude.', 'Pare se sentir dor.']
  },
  {
    code: 'apoio_unipodal_direito', title: 'Apoio unipodal direito', capture_kind: 'foto', camera_position: 'frontal',
    instructions: [
      'Volte à posição frontal inicial.',
      'Apoie-se sobre a perna direita.',
      'Flexione o joelho esquerdo a 90 graus.',
      'Não flexione o quadril.',
      'Não encoste na parede nem use nenhum apoio.'
    ],
    cautions: ['Se perder o equilíbrio, recomece sem pressa.']
  },
  {
    code: 'apoio_unipodal_esquerdo', title: 'Apoio unipodal esquerdo', capture_kind: 'foto', camera_position: 'frontal',
    instructions: [
      'Volte à posição frontal inicial.',
      'Apoie-se sobre a perna esquerda.',
      'Flexione o joelho direito a 90 graus.',
      'Não flexione o quadril.',
      'Não encoste na parede nem use nenhum apoio.'
    ],
    cautions: ['Se perder o equilíbrio, recomece sem pressa.']
  },
  {
    code: 'decubito_dorsal_flexao_quadril_direito', title: 'Decúbito dorsal com flexão do quadril direito', capture_kind: 'foto', camera_position: 'lateral_direita',
    camera_note: 'Nas fotos deitadas, posicione a câmera um pouco mais baixa.',
    instructions: [
      `${w.deitado} no chão, com o perfil direito para a câmera.`,
      'Deixe os braços abertos, afastados do corpo.',
      'Faça a elevação máxima da perna direita.',
      'Mantenha os joelhos totalmente estendidos.',
      'Mantenha os pés apontados totalmente para cima e para trás.'
    ],
    cautions: ['Eleve só até onde conseguir manter o joelho estendido.']
  },
  {
    code: 'decubito_dorsal_coxa_esquerda', title: 'Decúbito dorsal puxando a coxa esquerda', capture_kind: 'foto', camera_position: 'lateral_direita',
    camera_note: 'Nas fotos deitadas, posicione a câmera um pouco mais baixa.',
    instructions: [
      `Continue ${w.continueDeitado} no chão, com o perfil direito para a câmera.`,
      'Puxe a coxa esquerda levando o joelho em direção ao tronco, o máximo que conseguir.',
      'Achate a lombar no solo.'
    ],
    cautions: ['Evite movimentos dolorosos.']
  },
  {
    code: 'decubito_dorsal_flexao_quadril_esquerdo', title: 'Decúbito dorsal com flexão do quadril esquerdo', capture_kind: 'foto', camera_position: 'lateral_esquerda',
    camera_note: 'Nas fotos deitadas, posicione a câmera um pouco mais baixa.',
    instructions: [
      `${w.deitado} no chão, agora com o perfil esquerdo para a câmera.`,
      'Deixe os braços abertos, afastados do corpo.',
      'Faça a elevação máxima da perna esquerda.',
      'Mantenha os joelhos totalmente estendidos.',
      'Mantenha os pés apontados totalmente para cima e para trás.'
    ],
    cautions: ['Eleve só até onde conseguir manter o joelho estendido.']
  },
  {
    code: 'decubito_dorsal_coxa_direita', title: 'Decúbito dorsal puxando a coxa direita', capture_kind: 'foto', camera_position: 'lateral_esquerda',
    camera_note: 'Nas fotos deitadas, posicione a câmera um pouco mais baixa.',
    instructions: [
      `Continue ${w.continueDeitado} no chão, com o perfil esquerdo para a câmera.`,
      'Puxe a coxa direita levando o joelho em direção ao tronco, o máximo que conseguir.',
      'Achate a lombar no solo.'
    ],
    cautions: ['Evite movimentos dolorosos.']
  },
  {
    code: 'decubito_ventral_flexao_joelhos', title: 'Decúbito ventral flexionando os joelhos', capture_kind: 'video', camera_position: 'livre', repetitions: 3,
    description: 'Vídeo de bruços, de lado para a câmera.',
    instructions: [
      `${w.deitado} no chão de bruços, de lado para a câmera.`,
      'Dobre as pernas o máximo que puder.',
      'Faça o movimento 3 vezes, de forma lenta.'
    ],
    cautions: ['Mantenha o movimento dentro da amplitude tolerada.']
  },
  {
    code: 'sentado_alcancar_pes', title: `${w.sentado} buscando alcançar os pés`, capture_kind: 'foto', camera_position: 'livre',
    instructions: [
      `${w.sentado} de lado para a câmera, com as pernas unidas e os joelhos estendidos.`,
      'Incline o tronco ao máximo para frente, tentando alcançar a ponta dos pés.',
      'Mantenha a cabeça alinhada ao tronco.'
    ],
    cautions: ['Não force movimento doloroso.']
  },
  {
    code: 'sentado_abertura_pernas', title: `${w.sentado} com máxima abertura das pernas`, capture_kind: 'foto', camera_position: 'livre',
    instructions: [
      `${w.sentado} de lado para a câmera, com as pernas em máxima abertura.`,
      'Mantenha os pés apontados totalmente para cima.',
      'Mantenha a coluna ereta.',
      'Se possível, incline para frente sem curvar a coluna.'
    ],
    cautions: ['Abra as pernas só até onde for confortável.']
  },
  {
    code: 'sentado_borboletinha', title: `${w.sentado} em borboletinha`, capture_kind: 'foto', camera_position: 'frontal',
    instructions: [
      `${w.sentado} de frente para a câmera, com as plantas dos pés unidas em posição de borboletinha.`,
      'Force a máxima abertura das pernas com a contração dos glúteos.'
    ],
    cautions: ['Não force a abertura dos quadris além do confortável.', 'Interrompa em caso de dor.'],
    needs_review: true,
    review_note: 'Divergência a validar: o PDF de referência pede "force a máxima abertura das pernas com a contração dos glúteos", enquanto o briefing pede "não forçar a abertura dos quadris". As duas versões estão registradas — a instrução segue o PDF, o cuidado segue o briefing. Confirmar com o profissional responsável antes de usar com alunos.'
  }
]

export const POSTURAL_PROTOCOLS = [
  {
    slug: 'postural-masculino',
    name: 'Avaliação postural — masculino',
    audience: 'masculino',
    description: 'Protocolo de 18 capturas (15 fotografias e 3 vídeos) para análise postural e de mobilidade. Redação adaptada do protocolo de referência, que foi escrito no feminino.',
    clothing_note: CLOTHING.masculino,
    steps: steps(WORDS.masculino)
  },
  {
    slug: 'postural-feminino',
    name: 'Avaliação postural — feminino',
    audience: 'feminino',
    description: 'Protocolo de 18 capturas (15 fotografias e 3 vídeos) para análise postural e de mobilidade, na redação original do protocolo de referência.',
    clothing_note: CLOTHING.feminino,
    steps: steps(WORDS.feminino)
  }
]

// conteúdo normalizado que entra no hash: mudar qualquer campo daqui publica uma versão nova
const contentOf = p => ({
  slug: p.slug,
  name: p.name,
  audience: p.audience,
  description: p.description,
  general_instructions: GENERAL,
  preparation: PREPARATION,
  clothing_note: p.clothing_note,
  camera_note: CAMERA_NOTE,
  notes: NOTES,
  steps: p.steps.map((s, i) => ({
    position: i + 1,
    code: s.code,
    title: s.title,
    description: s.description || null,
    capture_kind: s.capture_kind,
    camera_position: s.camera_position || null,
    camera_note: s.camera_note || null,
    instructions: s.instructions,
    cautions: s.cautions || [],
    repetitions: s.repetitions || null,
    required: s.required !== false,
    allow_skip: s.allow_skip !== false,
    allow_question: s.allow_question !== false,
    needs_review: !!s.needs_review,
    review_note: s.review_note || null
  }))
})

export const hashOf = content => crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex')

export function validatePosturalProtocols() {
  const problems = []
  for (const p of POSTURAL_PROTOCOLS) {
    const c = contentOf(p)
    if (c.steps.length !== 18) problems.push(`${p.slug}: esperado 18 etapas, tem ${c.steps.length}`)
    const codes = new Set()
    for (const s of c.steps) {
      if (codes.has(s.code)) problems.push(`${p.slug}: código repetido ${s.code}`)
      codes.add(s.code)
      if (!s.title || !s.instructions.length) problems.push(`${p.slug}/${s.code}: título ou instruções vazios`)
      if (!['foto', 'video'].includes(s.capture_kind)) problems.push(`${p.slug}/${s.code}: tipo inválido`)
      if (s.capture_kind === 'video' && !s.repetitions) problems.push(`${p.slug}/${s.code}: vídeo sem número de repetições`)
    }
    const fotos = c.steps.filter(s => s.capture_kind === 'foto').length
    const videos = c.steps.filter(s => s.capture_kind === 'video').length
    if (fotos !== 15 || videos !== 3) problems.push(`${p.slug}: esperado 15 fotos e 3 vídeos, tem ${fotos} e ${videos}`)
  }
  return problems
}

// Idempotente: roda em todo migrate. Se o conteúdo não mudou (content_hash igual), não faz nada.
// Se mudou, publica uma versão NOVA — as avaliações em andamento seguem na versão antiga.
export async function syncPosturalProtocol(c) {
  const problems = validatePosturalProtocols()
  if (problems.length) throw new Error(`Protocolo postural inválido: ${problems.join('; ')}`)
  const out = { protocols: 0, versions: 0, steps: 0, review: 0 }
  for (const p of POSTURAL_PROTOCOLS) {
    const content = contentOf(p), hash = hashOf(content)
    const protocol = (await c.query(
      `insert into posture_protocols(tenant_id, slug, name, audience, description, official, active)
       values(null, $1, $2, $3, $4, true, true)
       on conflict (slug) where tenant_id is null
       do update set name = excluded.name, audience = excluded.audience, description = excluded.description, updated_at = now()
       returning id`,
      [content.slug, content.name, content.audience, content.description])).rows[0]
    out.protocols++
    const known = await c.query(`select 1 from posture_protocol_versions where protocol_id = $1 and content_hash = $2`, [protocol.id, hash])
    if (known.rowCount) continue
    const next = +(await c.query(`select coalesce(max(version), 0) + 1 v from posture_protocol_versions where protocol_id = $1`, [protocol.id])).rows[0].v
    const version = (await c.query(
      `insert into posture_protocol_versions(tenant_id, protocol_id, version, status, notes, general_instructions, preparation, clothing_note, camera_note, content_hash, published_at, locked_at)
       values(null, $1, $2, 'publicada', $3, $4, $5, $6, $7, $8, now(), now()) returning id`,
      [protocol.id, next, content.notes, JSON.stringify(content.general_instructions), JSON.stringify(content.preparation),
        content.clothing_note, content.camera_note, hash])).rows[0]
    out.versions++
    for (const s of content.steps) {
      await c.query(
        `insert into posture_steps(tenant_id, version_id, position, code, title, description, capture_kind, camera_position, camera_note,
           instructions, cautions, repetitions, required, allow_skip, allow_question, needs_review, review_note)
         values(null, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [version.id, s.position, s.code, s.title, s.description, s.capture_kind, s.camera_position, s.camera_note,
          JSON.stringify(s.instructions), JSON.stringify(s.cautions), s.repetitions, s.required, s.allow_skip,
          s.allow_question, s.needs_review, s.review_note])
      out.steps++
      if (s.needs_review) out.review++
    }
  }
  return out
}
