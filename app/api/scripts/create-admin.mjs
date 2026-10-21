// Cria o primeiro administrador (ou outro admin). Uso: npm run create-admin
// Pergunta e-mail, nome e senha (mín. 10 caracteres). Não interativo: npm run create-admin -- --email x@y --name "Nome" --generate
// (--generate cria uma senha forte de 14 caracteres e a mostra UMA vez; nada é gravado em arquivo). A conta nasce ativa, só com o papel admin
// (contas separadas: admin não é aluno nem profissional) e com o aceite da versão vigente dos termos.
import '../env.js'
import readline from 'node:readline'
import bcrypt from 'bcryptjs'
import { q, pool } from '../db/pool.js'
import crypto from 'node:crypto'
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined }
const gen = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let p; do { p = Array.from({ length: 14 }, () => A[crypto.randomInt(A.length)]).join('') } while (!/\d/.test(p) || !/[a-z]/.test(p) || !/[A-Z]/.test(p)); return p }
const auto = process.argv.includes('--generate')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (s, hide) => new Promise(r => {
  if (!hide) return rl.question(s, a => r(a.trim()))
  process.stdout.write(s); const w = rl._writeToOutput; rl._writeToOutput = () => {}
  rl.question('', a => { rl._writeToOutput = w; process.stdout.write('\n'); r(a) })
})
try {
  const t = (await q(`select id, name from tenants where slug=$1`, [process.env.DEFAULT_TENANT || 'avadesk'])).rows[0]
  if (!t) throw new Error('tenant não encontrado: rode node db/migrate.js primeiro')
  const admins = +(await q(`select count(*) from user_roles where role_id='admin'`)).rows[0].count
  console.log(`Tenant ${t.name}. Administradores existentes: ${admins}.`)
  const email = (arg('email') || await ask('E-mail do administrador: ')).trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('e-mail inválido')
  if ((await q(`select 1 from users where lower(email)=$1`, [email])).rowCount) throw new Error('já existe uma conta com esse e-mail')
  const name = arg('name') || (auto ? 'Administrador' : await ask('Nome: ')) || 'Administrador'
  const p1 = auto ? gen() : await ask('Senha (mín. 10): ', true); const p2 = auto ? p1 : await ask('Repita a senha: ', true)
  if (p1.length < 10) throw new Error('senha curta'); if (p1 !== p2) throw new Error('as senhas não conferem')
  const u = (await q(`insert into users(tenant_id,name,email,password_hash,status) values($1,$2,$3,$4,'ativo') returning id`, [t.id, name, email, await bcrypt.hash(p1, 12)])).rows[0]
  await q(`insert into user_roles values($1,$2,'admin') on conflict do nothing`, [u.id, t.id])
  await q(`insert into term_acceptances(user_id,version) select $1, version from terms_versions on conflict do nothing`, [u.id])
  const legalVersion = (await q(`select coalesce(value->>'doc_version','1.0') version from app_settings where tenant_id=$1 and key='empresa_legal'`, [t.id])).rows[0]?.version || '1.0'
  for (const document of ['termos_uso', 'privacidade']) await q(`insert into legal_acceptances(tenant_id,user_id,document,version,granted,ip,user_agent) values($1,$2,$3,$4,true,'127.0.0.1','create-admin')`, [t.id, u.id, document, legalVersion])
  await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,'admin.criado_cli','user',$2,'{}')`, [t.id, u.id]).catch(() => {})
  if (auto) console.log(`SENHA (mostrada só agora): ${p1}`)
  console.log(`Administrador criado: ${email}. Entre em http://localhost:5551 com esse e-mail e senha.`)
} catch (e) { console.error('erro:', e.message); process.exitCode = 1 }
finally { rl.close(); await pool.end() }
