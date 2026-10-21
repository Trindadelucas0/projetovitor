// Checagem local sem alterar a senha provisória. Exige API em 127.0.0.1.
import '../env.js'
import assert from 'node:assert/strict'
import { pool } from '../db/pool.js'

const password = process.env.PERSONAL_TEST_PASSWORD
if (!password) throw new Error('Defina PERSONAL_TEST_PASSWORD somente na sessão de teste.')
const email = 'personal.principal@orny.local'
const base = 'http://127.0.0.1:' + (process.env.PORT || 8787)
const user = (await pool.query('select id, must_change_password from users where email=$1', [email])).rows[0]
assert.ok(user?.must_change_password, 'Conta provisória não encontrada')
try {
  await pool.query('update users set must_change_password=false where id=$1', [user.id])
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: process.env.ORIGIN || 'http://localhost:5551' },
    body: JSON.stringify({ email, password }) })
  assert.equal(login.status, 200, 'Login do personal')
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie, 'Cookie de sessão ausente')
  const checks = [
    ['/api/pro/home', 200], ['/api/pro/students', 200], ['/api/pro/prescriptions', 200],
    ['/api/pro/templates', 200], ['/api/pro/library', 200], ['/api/pro/clients', 200],
    ['/api/pro/avaliacao/protocolos', 200], ['/api/pro/avaliacoes', 200],
    ['/api/adm/avaliacao/protocolos', 403], ['/api/adm/users', 403]
  ]
  for (const [path, expected] of checks) {
    const res = await fetch(base + path, { headers: { Cookie: cookie } })
    const body = await res.text()
    assert.equal(res.status, expected, path + ': ' + body)
    if (path === '/api/pro/avaliacao/protocolos') assert.ok(JSON.parse(body).protocols.length > 0, 'Sem protocolo publicado')
    console.log(path, res.status)
  }
} finally {
  await pool.query('update users set must_change_password=true where id=$1', [user.id])
  await pool.end()
}
