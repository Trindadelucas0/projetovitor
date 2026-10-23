// Admin > Personais: lista os personais do ambiente com o público (Homem/Mulher) que atendem e permite
// cadastrar/editar. O aluno novo vai sozinho para o personal PRINCIPAL do público dele; quando há mais de um
// personal do mesmo público, o admin reatribui pela transferência (POST /api/adm/links/transfer).
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { tenantPersonalIds } from './pro.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const SEX = ['masculino', 'feminino']
const admin = async (req, res, json) => {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (!u.roles.includes('admin')) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
  return u
}

export async function listPersonais(tid) {
  const ids = await tenantPersonalIds(tid)
  const r = await q(`select pp.user_id, coalesce(pp.display_name,u.name) name, u.email, pp.state, pp.internal_managed, pp.audience_sex, pp.zoom_url,
      (select count(*) from coach_students cs where cs.coach_id=pp.user_id and cs.status='ativo')::int alunos,
      (select count(*) from coach_students cs join user_profiles up on up.user_id=cs.student_id where cs.coach_id=pp.user_id and cs.status='ativo' and up.sex is null)::int alunos_sem_perfil,
      (select count(*) from personal_availability a where a.personal_id=pp.user_id)::int horarios
    from professional_profiles pp join users u on u.id=pp.user_id
    where pp.tenant_id=$1 and u.disabled_at is null order by u.name`, [tid])
  return r.rows.map(p => {
    const principal = String(p.user_id) === String(ids.masculino) ? 'masculino' : String(p.user_id) === String(ids.feminino) ? 'feminino' : null
    return { ...p, principal, audience_sex: p.audience_sex || principal }
  })
}

export function personaisRoutes({ json, readBody }) {
  return {
    'GET /api/adm/personais': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const ids = await tenantPersonalIds(u.tenant_id)
      json(res, 200, { personais: await listPersonais(u.tenant_id), principais: ids })
    },
    // edita o público (e o nome de exibição) de um personal já cadastrado
    'POST /api/adm/personais/save': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.user_id)) return json(res, 400, { error: 'Personal inválido', code: 'INVALID_INPUT' })
      const p = (await q('select * from professional_profiles where user_id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Personal não encontrado', code: 'NOT_FOUND' })
      const ids = await tenantPersonalIds(u.tenant_id)
      let audience = b.audience_sex === null || b.audience_sex === '' ? null : SEX.includes(b.audience_sex) ? b.audience_sex : undefined
      if (audience === undefined) return json(res, 400, { error: 'Escolha Homens ou Mulheres', code: 'INVALID_INPUT' })
      // o principal de um público não pode atender o outro (o cadastro automático depende disso)
      const principal = String(p.user_id) === String(ids.masculino) ? 'masculino' : String(p.user_id) === String(ids.feminino) ? 'feminino' : null
      if (principal && audience !== principal) return json(res, 409, { error: `Este é o personal principal de ${principal === 'feminino' ? 'mulheres' : 'homens'}. Troque o principal em Configurações antes de mudar o público.`, code: 'PRINCIPAL_LOCKED' })
      const name = b.display_name !== undefined ? txt(b.display_name, 80) : p.display_name
      if (b.display_name !== undefined && name.length < 2) return json(res, 400, { error: 'Nome muito curto', code: 'INVALID_INPUT' })
      await q('update professional_profiles set audience_sex=$2, display_name=$3, updated_at=now() where user_id=$1', [p.user_id, audience, name])
      await audit(u.tenant_id, u.id, 'personal.publico', 'user', p.user_id, { audience_sex: audience })
      json(res, 200, { ok: true, personais: await listPersonais(u.tenant_id) })
    }
  }
}
