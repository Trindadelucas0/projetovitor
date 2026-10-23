// Personal: cadastrar conta do aluno (senha provisória, troca no 1º acesso) e lista das contas que ele criou.
// Fase 5: saiu de v3/V42.jsx (bundle inicial) para cá, onde pode usar Ant Design — só o Portal /pro (lazy) importa.
import { useState } from 'react'
import { Card, Typography } from 'antd'
import { api } from '../../lib/api.js'
import { useLoad, Btn, In, Field, Note, Row, Rows, Av, Empty, Load } from '../../ui/gkit.jsx'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })

export default function ProClients({ mode = 'all' }) {
  const [d, err, reload] = useLoad(() => api('/api/pro/clients'))
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [cred, setCred] = useState(null)
  const create = async e => {
    e.preventDefault(); setBusy(true); setMsg('')
    try { const r = await post('/api/pro/clients', { name, email }); setCred({ email: r.email, pw: r.temp_password, queued: r.email_queued }); setName(''); setEmail(''); reload() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const reset = async c => { try { const r = await post('/api/pro/clients/reset-password', { id: c.id }); setCred({ email: c.email, pw: r.temp_password, queued: r.email_queued }) } catch (e) { setMsg(e.message) } }
  return <section data-testid="pro-clients">
    {mode !== 'list' && <Card className="gk-card" title="Cadastrar aluno">
      <p className="g-xs g-mut" style={{ marginTop: 0 }}>A conta entra no seu plano. O aluno recebe por e-mail um link para definir a própria senha.</p>
      <form onSubmit={create}>
        <Field label="Nome"><In value={name} onChange={e => setName(e.target.value)} required minLength={2} autoComplete="off" data-testid="pc-name" /></Field>
        <Field label="E-mail"><In type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" inputMode="email" data-testid="pc-email" /></Field>
        <Note type="error">{msg}</Note>
        <Btn type="submit" loading={busy} loadingLabel="Criando…" data-testid="pc-create">Criar conta do aluno</Btn>
      </form>
    </Card>}
    {cred && <Card className="gk-card gk-card-hero v42-cred" data-testid="pc-cred" title="Senha provisória (aparece só agora)">
      <p className="g-sm" style={{ marginTop: 0 }}>{cred.email}</p>
      <Typography.Text code className="pp-temp" data-testid="pc-temp">{cred.pw}</Typography.Text>
      {cred.queued && <p className="g-xs g-mut">O aluno também recebe um link por e-mail para definir a senha.</p>}
      <div className="gk-actions">
        <Btn onClick={() => navigator.clipboard?.writeText(`E-mail: ${cred.email}\nSenha provisória: ${cred.pw}`)}>Copiar acesso</Btn>
        <Btn variant="secondary" onClick={() => setCred(null)}>Já enviei</Btn></div></Card>}
    {mode !== 'create' && <>
      {mode !== 'list' && <h3 className="gk-h">Alunos criados por você</h3>}
      {err && <Note>{err}</Note>}
      {!d && !err ? <Load rows={2} /> : d && !d.clients.length ? <Empty icon="users">Nenhum ainda.</Empty>
        : d && <Rows>{d.clients.map(c => <Row key={c.id} avatar={<Av name={c.name} size={40} />} title={c.name} sub={`${c.email} · ${c.pending_first_login ? 'aguardando 1º acesso' : 'ativo'}`}
          extra={<Btn variant="secondary" size="sm" onClick={() => reset(c)} data-testid="pc-reset">Reenviar link</Btn>} />)}</Rows>}
    </>}
  </section>
}
