// Calendario editorial oficial da Comunidade ORNY. Nao cria pessoas, curtidas ou comentarios artificiais.
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'

const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const qs = req => new URL(req.url, 'http://x').searchParams
const CATEGORIES = new Set(['treinamento', 'tecnica', 'educacao', 'motivacao', 'comunicados'])
const admin = async (req, res, json) => {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (!u.roles.includes('admin')) { json(res, 403, { error: 'Sem permissão' }); return null }
  return u
}
const when = value => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
const stateSql = `case
  when p.status='removido' or p.canceled_at is not null then 'cancelado'
  when p.publish_at is not null and p.publish_at > now() then 'agendado'
  else 'publicado' end`

export const INITIAL_EDITORIAL_POSTS = [
  ['editorial-v1-01', 'Comece a semana com um objetivo possível', 'Escolha uma meta simples para os próximos dias: cumprir seus treinos planejados, melhorar a execução de um movimento ou respeitar melhor os intervalos. Qual será o seu foco nesta semana?', 'motivacao', -2],
  ['editorial-v1-02', 'Qual exercício você quer executar melhor?', 'Conte para a comunidade qual exercício ainda gera dúvida. Use os comentários para compartilhar a pergunta; orientações individuais sobre dor ou limitação devem seguir pelo acompanhamento com seu profissional.', 'tecnica', -1],
  ['editorial-v1-03', 'Consistência também inclui recuperação', 'Sono, alimentação adequada e pausas entre estímulos fazem parte da rotina de treino. Hoje, observe como seu corpo respondeu à última sessão e ajuste a intensidade com responsabilidade.', 'educacao', 0],
  ['editorial-v1-04', 'Prepare o treino antes de começar', 'Confira a ficha, separe o equipamento e registre as cargas antes da primeira série. Essa preparação reduz interrupções e ajuda a manter o histórico de evolução mais confiável.', 'treinamento', 7],
  ['editorial-v1-05', 'O que ajuda você a manter a rotina?', 'Horário fixo, companhia, metas curtas ou acompanhar a evolução? Compartilhe uma estratégia que funciona para você e pode inspirar outras pessoas da comunidade.', 'motivacao', 9],
  ['editorial-v1-06', 'Movimento bem executado vem antes da carga', 'Aumentar peso só faz sentido quando a execução permanece controlada. Se a técnica mudar para completar a série, registre a carga real e converse com seu profissional antes de progredir.', 'tecnica', 11],
  ['editorial-v1-07', 'Revise sua evolução, não apenas o resultado final', 'Abra Progresso e observe frequência, cargas e regularidade. Pequenas melhorias repetidas ao longo das semanas ajudam a enxergar avanços que nem sempre aparecem de um dia para o outro.', 'educacao', 14],
  ['editorial-v1-08', 'Qual conquista recente merece destaque?', 'Pode ser completar uma semana, aprender um movimento, retomar a rotina ou respeitar um limite. Compartilhe uma conquista real nos comentários.', 'motivacao', 16],
  ['editorial-v1-09', 'Intervalo também faz parte da série', 'Respeitar o descanso proposto ajuda a manter a qualidade das repetições. Use o cronômetro do treino e evite encurtar o intervalo apenas para terminar mais rápido.', 'treinamento', 18],
  ['editorial-v1-10', 'Treino registrado é evolução que pode ser acompanhada', 'Confirme cargas e repetições com atenção. Um histórico fiel permite comparar sessões e dá informações melhores para os próximos ajustes do seu profissional.', 'treinamento', 21],
  ['editorial-v1-11', 'Que tema você quer ver na Comunidade?', 'Execução, organização da rotina, recuperação ou uso do aplicativo? Escreva nos comentários. A Equipe ORNY usará as respostas para planejar novos conteúdos oficiais.', 'comunicados', 23],
  ['editorial-v1-12', 'Fechamento do ciclo: o que funcionou?', 'Revise as últimas semanas e escolha um hábito para manter no próximo ciclo. Evolução sustentável começa quando você identifica o que realmente cabe na sua rotina.', 'motivacao', 25]
]

export function communityEditorialRoutes({ json, readBody }) {
  return {
    'GET /api/adm/community/editorial': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const state = qs(req).get('state')
      const r = await q(`select p.id,p.title,p.body,p.category,p.status,p.publish_at,p.created_at,p.edited_at,p.canceled_at,
          ${stateSql} state,
          (select count(*) from post_comments c where c.post_id=p.id and c.status='visivel')::int comments,
          (select count(*) from post_likes l where l.post_id=p.id)::int likes
        from posts p
        where p.tenant_id=$1 and p.official and ($2::text is null or (${stateSql})=$2)
        order by coalesce(p.publish_at,p.created_at) desc limit 200`, [u.tenant_id, ['publicado', 'agendado', 'cancelado'].includes(state) ? state : null])
      json(res, 200, { posts: r.rows })
    },
    'POST /api/adm/community/editorial/seed': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const base = Date.now(), ids = []
      for (const [key, title, body, category, days] of INITIAL_EDITORIAL_POSTS) {
        const publishAt = new Date(base + days * 86400000)
        const r = await q(`insert into posts(tenant_id,author_id,title,body,category,status,scope_pro_id,official,publish_at,official_key)
          values($1,$2,$3,$4,$5,'publicado',null,true,$6,$7)
          on conflict (tenant_id,official_key) where official_key is not null do nothing returning id`,
        [u.tenant_id, u.id, title, body, category, publishAt, key])
        if (r.rowCount) ids.push(r.rows[0].id)
      }
      await audit(u.tenant_id, u.id, 'comunidade.editorial_inicial_carregado', 'community_editorial', null, { created: ids.length, ids })
      json(res, 200, { ok: true, created: ids.length, existing: INITIAL_EDITORIAL_POSTS.length - ids.length })
    },
    'POST /api/adm/community/editorial/save': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), title = txt(b.title, 140), body = txt(b.body, 5000)
      const category = CATEGORIES.has(b.category) ? b.category : null, publishAt = when(b.publish_at)
      const errors = {}
      if (title.length < 3) errors.title = 'Informe um título com pelo menos 3 caracteres.'
      if (body.length < 3) errors.body = 'Informe o conteúdo da publicação.'
      if (!category) errors.category = 'Escolha um assunto válido.'
      if (!publishAt) errors.publish_at = 'Informe uma data e hora válidas.'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      if (b.id) {
        if (!isUuid(b.id)) return json(res, 400, { error: 'Publicação inválida.' })
        const r = await q(`update posts set title=$3,body=$4,category=$5,publish_at=$6,status='publicado',canceled_at=null,
            moderation_reason=null,edited_at=now(),updated_at=now()
          where id=$1 and tenant_id=$2 and official and status<>'removido' returning id`,
        [b.id, u.tenant_id, title, body, category, publishAt])
        if (!r.rowCount) return json(res, 404, { error: 'Conteúdo oficial não encontrado.' })
        await audit(u.tenant_id, u.id, publishAt > new Date() ? 'comunidade.oficial_agendado' : 'comunidade.oficial_editado', 'post', b.id, { publish_at: publishAt })
        return json(res, 200, { ok: true, id: b.id })
      }
      const r = await q(`insert into posts(tenant_id,author_id,title,body,category,status,scope_pro_id,official,publish_at)
        values($1,$2,$3,$4,$5,'publicado',null,true,$6) returning id`, [u.tenant_id, u.id, title, body, category, publishAt])
      await audit(u.tenant_id, u.id, publishAt > new Date() ? 'comunidade.oficial_agendado' : 'comunidade.oficial_publicado', 'post', r.rows[0].id, { publish_at: publishAt })
      json(res, 201, { ok: true, id: r.rows[0].id })
    },
    'POST /api/adm/community/editorial/publish': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id)) return json(res, 400, { error: 'Publicação inválida.' })
      const r = await q(`update posts set status='publicado',publish_at=now(),canceled_at=null,moderation_reason=null,updated_at=now()
        where id=$1 and tenant_id=$2 and official and status<>'removido' returning id`, [b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Conteúdo oficial não encontrado.' })
      await audit(u.tenant_id, u.id, 'comunidade.oficial_publicado', 'post', b.id, {}); json(res, 200, { ok: true })
    },
    'POST /api/adm/community/editorial/cancel': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id)) return json(res, 400, { error: 'Publicação inválida.' })
      const r = await q(`update posts set status='removido',canceled_at=now(),moderation_reason='cancelado pela administração',updated_at=now()
        where id=$1 and tenant_id=$2 and official and status<>'removido' returning id`, [b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Conteúdo oficial não encontrado.' })
      await audit(u.tenant_id, u.id, 'comunidade.oficial_cancelado', 'post', b.id, {}); json(res, 200, { ok: true })
    }
  }
}
