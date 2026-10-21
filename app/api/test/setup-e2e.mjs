// SOMENTE DESENVOLVIMENTO LOCAL: cria/atualiza usuários fixos de teste (admin, 2 profissionais) para os smoke tests.
// Senha obrigatória via E2E_PASSWORD. Não rode em produção.
import '../env.js'
import bcrypt from 'bcryptjs'
import { q, pool } from '../db/pool.js'
if (process.env.NODE_ENV === 'production') { console.error('não rode em produção'); process.exit(1) }
const pass = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const t = (await q(`select id from tenants where slug=$1`, [process.env.DEFAULT_TENANT || 'avadesk'])).rows[0].id
const hash = await bcrypt.hash(pass, 10)
for (const [email, name, roles] of [['admin.e2e\u0040avadesk.local', 'Admin E2E', ['admin']], ['pro1.e2e\u0040avadesk.local', 'Profa. Ana E2E', ['profissional']], ['pro2.e2e\u0040avadesk.local', 'Prof. Bruno E2E', ['profissional']]]) {
  const u = (await q(`insert into users(tenant_id,name,email,password_hash,status) values($1,$2,$3,$4,'ativo') on conflict (lower(email)) do update set password_hash=excluded.password_hash, status='ativo' returning id`, [t, name, email, hash])).rows[0]
  for (const r of roles) await q('insert into user_roles values($1,$2,$3) on conflict do nothing', [u.id, t, r])
  // contas fixas liberadas (banco de teste novo nasce com tudo travado)
  await q('update users set access_unlocked_at=coalesce(access_unlocked_at, now()) where id=$1', [u.id])
  // contas de teste já aceitaram a versão vigente dos termos
  await q(`insert into term_acceptances(user_id,version) select $1, version from terms_versions on conflict do nothing`, [u.id])
  // O gate atual usa legal_acceptances; a fixture deve nascer em estado válido e independente do histórico do banco.
  const legalVersion = (await q(`select coalesce(value->>'doc_version','1.0') version from app_settings where tenant_id=$1 and key='empresa_legal'`, [t])).rows[0]?.version || '1.0'
  for (const document of ['termos_uso', 'privacidade', ...(roles.includes('profissional') ? ['profissional'] : [])])
    await q(`insert into legal_acceptances(tenant_id,user_id,document,version,granted,ip,user_agent)
      select $1,$2,$3,$4,true,'127.0.0.1','fixture-e2e' where not exists
      (select 1 from legal_acceptances where user_id=$2 and document=$3 and version=$4 and granted)`, [t, u.id, document, legalVersion])
  // zera a janela de 24h do limite diário de publicações (repetições do smoke no mesmo dia); não apaga nada
  if (roles.includes('profissional')) await q(`update posts set created_at = created_at - interval '25 hours' where author_id=$1 and created_at > now() - interval '24 hours'`, [u.id])
  // V3: os profissionais fixos do smoke acumulam alunos de várias execuções → concessão de teste (+1000 alunos ativos, 1 ano)
  if (roles.includes('profissional') && !(await q(`select 1 from entitlement_grants where user_id=$1 and key='alunos_ativos' and revoked_at is null and expires_at > now() + interval '30 days'`, [u.id]).catch(() => ({ rowCount: 1 }))).rowCount)
    await q(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,expires_at) values($1,$2,'profissional','limit','alunos_ativos','1000','fixture e2e (somente local)',now()+interval '365 days')`, [t, u.id]).catch(() => {})
  if (roles.includes('profissional')) await q(`insert into professional_profiles(user_id,tenant_id,display_name,specialties) values($1,$2,$3,$4) on conflict (user_id) do nothing`, [u.id, t, name, ['Musculação']])
}
// banco de TESTE novo: mesmo nome de comunidade do ambiente real (smoke confere 'AVAGYM')
if (/_test$/.test(process.env.DB_NAME || '')) await q(`update tenants set name='AVAGYM' where id=$1`, [t])
console.log('usuários e2e prontos'); await pool.end()
