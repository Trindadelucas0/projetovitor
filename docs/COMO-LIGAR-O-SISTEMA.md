# Projeto Vitor — como ligar o sistema

Este documento ensina a ligar a cópia local em `F:\projetovitor\projetovitor`, do zero até a tela abrindo no navegador, e a desligar depois. Ele cobre **somente o ambiente local**: nada aqui publica na VPS nem aplica migrations. Para o uso das telas, consulte o [guia de uso](como-usar-o-sistema.md); para o comportamento confirmado desta cópia, a [documentação oficial](../app/DOCUMENTACAO-SISTEMA.md).

Ligar o sistema significa subir **dois processos**:

| Processo | O que é | Endereço |
|---|---|---|
| API | `node server.js` em `app/api`, lê o PostgreSQL e o `.env` | `http://127.0.0.1:8787` |
| Frontend | Vite servindo o React de `app/frontend` | `http://127.0.0.1:5551` |

O navegador conversa só com o frontend. As chamadas `/api/...` são encaminhadas pelo proxy do Vite para a porta 8787, então **não** se abre a porta 8787 no navegador para usar o sistema — ela serve para conferência.

## 1. Pré-requisitos

Confira uma vez, antes do primeiro `start`:

1. **Node.js e npm.** Esta cópia foi ligada com Node 24.16.0 e npm 11.17.0. Confira com `node -v` e `npm -v`.
2. **Dependências instaladas.** Precisa existir `node_modules` em `app/api` e em `app/frontend`. Se faltar, rode `npm ci` dentro de cada uma das duas pastas.
3. **PostgreSQL de pé.** O `.env` aponta para `localhost:5432`, banco `avagym`, usuário `postgres`. Sem o PostgreSQL rodando, a API sobe mas as telas que dependem de dados falham.
4. **Arquivo `app/api/.env`.** É de onde vêm banco, sessão, cobrança, e-mail e armazenamento. Ele fica **fora do Git**: se estiver faltando, copie os nomes de `app/api/.env.example` e preencha os valores neste computador. Não copie segredos para dentro de documentação.

> Os endereços das contas de administrador e de personal principal ficam só no `.env` e nunca na documentação. O `.env` atual desta cópia define `ADMIN_EMAIL`; `PERSONAL_PRINCIPAL_EMAIL` e `PERSONAL_PRINCIPAL_NAME` estão documentados em `.env.example` e precisam ser preenchidos antes de rodar `api/scripts/ativar-personal-principal-local.mjs`, que falha sem eles. A senha provisória exige troca no primeiro acesso. A seção [Com qual conta entrar](#8-com-qual-conta-entrar) explica como descobrir as contas que existem no banco.

## 2. Ligar (caminho recomendado)

Abra o PowerShell na pasta `app` e rode o script oficial:

```powershell
cd F:\projetovitor\projetovitor\app
powershell -ExecutionPolicy Bypass -File scripts/dev-start.ps1 -Root F:\projetovitor\projetovitor
```

O parâmetro **`-Root` é obrigatório nesta cópia**: o valor padrão do script ainda aponta para a pasta antiga (`F:\academia\acade`). Sem ele, dados e logs iriam para o lugar errado.

O script faz quatro coisas por você: cria `runtime\data` e `logs` fora do repositório, define as variáveis da sessão local (porta 8787, `ORIGIN`, origens de CSRF, pasta de mídia), sobe os dois processos em janela oculta com os logs redirecionados, e grava os PIDs em `runtime\pids.txt` para o script de parada encontrar depois.

A saída esperada é uma linha como:

```
API pid 32672 http://localhost:8787 | Web pid 7332 http://localhost:5551
```

Espere alguns segundos: a API responde quase imediatamente, o Vite leva por volta de meio segundo depois de iniciado.

## 3. Conferir se subiu de verdade

Três checagens, da mais barata para a mais útil:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8787,5551 | Select-Object LocalPort, OwningProcess
Invoke-WebRequest http://127.0.0.1:8787/api/health -UseBasicParsing | Select-Object -ExpandProperty Content
Invoke-WebRequest http://127.0.0.1:8787/api/legal/company -UseBasicParsing | Select-Object -ExpandProperty Content
```

A primeira mostra as duas portas escutando. A segunda deve devolver `{"ok":true}` — isso prova que o processo da API está no ar, **e nada além disso**. A terceira é a que prova banco: ela só responde com os dados da empresa se a conexão com o PostgreSQL estiver funcionando.

Depois abra `http://127.0.0.1:5551` no navegador. A página inicial deve carregar com os blocos de treino e o plano com o valor vindo do catálogo. Mensagens `401` no console do navegador nessa tela são normais: são as chamadas de sessão feitas antes de você entrar.

Os logs ficam em `F:\projetovitor\projetovitor\logs`:

```powershell
Get-Content F:\projetovitor\projetovitor\logs\api.out.log -Tail 20
Get-Content F:\projetovitor\projetovitor\logs\api.err.log -Tail 20
Get-Content F:\projetovitor\projetovitor\logs\vite.out.log -Tail 20
```

Em um start limpo, `api.out.log` traz `gym-api on 127.0.0.1:8787 (origin=http://localhost:5551)`, `vite.out.log` traz a versão do Vite e o endereço local, e os dois arquivos `.err` ficam vazios.

Entrar com conta, cobrança e avaliação postural dependem de banco e integrações configurados e **não** são provados por nenhuma das checagens acima. Health 200 não é homologação de jornada.

## 4. Desligar

```powershell
cd F:\projetovitor\projetovitor\app
powershell -ExecutionPolicy Bypass -File scripts/dev-stop.ps1 -Root F:\projetovitor\projetovitor
```

O script mata apenas os PIDs salvos em `runtime\pids.txt` e a árvore de processos deles, e nada mais. Se responder `sem pids`, o arquivo não existe — ou nada foi iniciado pelo script, ou os processos no ar subiram por outro caminho. Nesse caso identifique e encerre manualmente:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8787,5551 | Select-Object LocalPort, OwningProcess
```

e encerre o `OwningProcess` correspondente com `taskkill /PID <pid> /T /F`.

## 5. Caminho manual (dois terminais)

Útil quando você quer ver o log na tela ou recarregar um lado só.

Terminal 1 — API:

```powershell
cd F:\projetovitor\projetovitor\app\api
npm start
```

Terminal 2 — frontend:

```powershell
cd F:\projetovitor\projetovitor\app\frontend
npm run dev
```

A porta 5551 e o proxy de `/api` para `127.0.0.1:8787` já estão no `vite.config`, então não é preciso passar parâmetro. A diferença em relação ao script é que aqui valem as variáveis do `.env` e do seu terminal: as que o `dev-start.ps1` define (pasta de mídia em `runtime\media`, `RP_ID`, `VITE_IMG_BASE`, `VITE_GIF_BASE`) não serão aplicadas. Para fechar, `Ctrl+C` em cada terminal.

## 6. Quando não liga

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `EADDRINUSE` ou porta já escutando | Sobrou um processo de uma execução anterior | Rode `dev-stop.ps1`; se der `sem pids`, encerre pelo `OwningProcess` da porta |
| Vite não sobe, erro de `--strictPort` | A 5551 está ocupada por outro programa | Libere a porta; não troque a porta sem ajustar `ORIGIN` e as origens de CSRF |
| Health responde, mas telas com dados ficam vazias ou com erro | PostgreSQL parado ou credenciais erradas no `.env` | Suba o serviço do PostgreSQL e confira `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| `403` com `CSRF_ORIGIN` ao salvar algo | A página foi aberta em um endereço fora da lista permitida | Use `http://127.0.0.1:5551` ou `http://localhost:5551`; qualquer outro host ou porta é recusado nas requisições de escrita |
| `Cannot find module` ao iniciar | `node_modules` ausente ou incompleto | `npm ci` na pasta correspondente |
| Dados e logs aparecendo em `F:\academia\acade` | `-Root` não foi passado | Repita o comando com `-Root F:\projetovitor\projetovitor` |

## 7. O que não fazer ao ligar

- **Não rode `node db/migrate.js`** (nem `npm run migrate`) no banco local de uso sem reconciliar as migrations pendentes e fazer backup antes. O estado das migrations deste banco está registrado na [documentação oficial](../app/DOCUMENTACAO-SISTEMA.md).
- **Não aponte rotinas de reset ou de teste de integração para o banco de uso.** Elas escrevem; use um banco isolado.
- **Não coloque segredos em documentação, script ou commit.** Antes de enviar alterações ao Git, rode `npm run check:sensitive` em `app/api`.
- Ligar o ambiente local **não** altera a VPS, e a existência desta cópia rodando não é prova de publicação.

## 8. Com qual conta entrar

O sistema não tem senha padrão, e **nenhuma senha pode ser lida** de arquivo ou banco: o `users.password_hash` guarda apenas o hash bcrypt. Não procure a senha; descubra as contas e, se não souber a senha de uma delas, defina outra.

Para listar as contas que existem no banco local, com o papel de cada uma:

```powershell
cd F:\projetovitor\projetovitor\app\api
node -e "import('./env.js').then(async()=>{const{pool}=await import('./db/pool.js');const r=await pool.query(`select u.email,u.name,u.status,u.must_change_password,ur.role_id from users u left join user_roles ur on ur.user_id=u.id order by u.created_at`);console.table(r.rows);await pool.end()})"
```

O papel decide a tela de entrada: `admin` abre `/admin/painel`, `profissional` abre `/pro`, `aluno` abre a área do aluno. `must_change_password` em `true` significa que a conta pedirá troca de senha no primeiro acesso.

Para criar um **novo** administrador com senha forte gerada e mostrada uma única vez:

```powershell
cd F:\projetovitor\projetovitor\app\api
$adminEmail = Read-Host 'E-mail do novo administrador'
npm run create-admin -- --email $adminEmail --name "Nome" --generate
```

O script recusa um e-mail que já exista — ele cria conta, não troca senha.

Para trocar a senha de uma conta **que já existe**, a recuperação pela tela (`Esqueci minha senha`) envia o link por e-mail através do provedor configurado em `.env`. No ambiente local isso só funciona se o endereço da conta for uma caixa real que você receba: as contas de domínio `.local` ou de domínio sem caixa ativa não recebem nada, e a tela responde a mesma mensagem genérica de sucesso em todos os casos. Nesses casos, grave um novo hash bcrypt direto no banco local:

```powershell
cd F:\projetovitor\projetovitor\app\api
$env:NOVA_SENHA = (Read-Host 'Nova senha (10+ caracteres)')
$env:CONTA_EMAIL = (Read-Host 'E-mail da conta local')
node -e "import('./env.js').then(async()=>{const b=(await import('bcryptjs')).default;const{pool}=await import('./db/pool.js');const email=process.env.CONTA_EMAIL||'';const senha=process.env.NOVA_SENHA||'';if(senha.length<10)throw new Error('defina NOVA_SENHA com 10+ caracteres');const r=await pool.query('update users set password_hash=$2, token_version=coalesce(token_version,0)+1, must_change_password=false where lower(email)=lower($1) returning email,token_version',[email,await b.hash(senha,12)]);console.log(r.rowCount?('senha trocada: '+r.rows[0].email+' (token_version '+r.rows[0].token_version+')'):'conta nao encontrada');await pool.end()})"
Remove-Item Env:NOVA_SENHA
Remove-Item Env:CONTA_EMAIL
```

Passe a senha pela variável `NOVA_SENHA` do terminal em vez de escrevê-la no comando, para não deixá-la no histórico. Em qualquer caminho, a senha nova não deve ser escrita em documentação, script versionado ou commit.

Duas armadilhas ao mexer nessas rotinas pelo banco: a troca de senha precisa somar `token_version+1` para derrubar as sessões antigas, como faz `POST /api/auth/reset`; e, no Postgres, **um comando que falha dentro de uma transação aborta a transação inteira** — um `insert` acessório que dê erro faz o `commit` seguinte virar rollback e a senha não muda, sem nenhum aviso. Isole o que é acessório em `savepoint` e confira o `rowCount` do `update` antes de confiar no resultado.

O lugar desta cópia para guardar credencial local é `CREDENCIAIS-LOCAL.txt` na raiz do repositório, já coberto pelo `.gitignore` (linha 24). Ele nunca deve ser versionado nem copiado para a VPS.

**Divergência conhecida nesta cópia:** o `ADMIN_EMAIL` do `.env` não é o e-mail da conta `admin` que está no banco. Isso não impede o login pela tela, mas as rotinas que leem `ADMIN_EMAIL` — `api/scripts/iniciar-base-local.mjs`, por exemplo — não encontram a conta e param. Alinhe o `.env` ao banco antes de usar essas rotinas.

## 9. Aluno de teste pedindo pagamento

Conta de aluno recém-criada **não** tem assinatura nenhuma, e o `monetizationGate` em `api/access.js` nega por padrão: as áreas internas respondem `402` com `code: ACCESS_REQUIRED` e a tela manda para Planos e pagamento. Isso é regra de produto, não defeito — `monetizationOn()` devolve `true` fixo, e `ownSources()` só considera acesso vigente quando existe assinatura não gratuita, dentro do período, **com uma cobrança `paga`, de valor maior que zero, com `paid_at` preenchido e `provider <> 'simulado'`**. O simulador nunca vale como pagamento, de propósito.

Então, para usar um aluno de teste localmente sem passar por checkout, o caminho não é mexer na regra: é criar o mesmo dado de teste que os testes de integração do projeto já criam. A fixture oficial é a função `paidAccess` em `api/test/postural.integration.mjs`, que insere a assinatura ativa e a cobrança paga com `provider = 'fixture'`:

```sql
-- assinatura ativa para o publico 'aluno' no plano individual
insert into subscriptions(tenant_id, user_id, audience, plan_id, plan_version_id, status, payment_type,
                          started_at, current_period_start, current_period_end)
values ($tenant, $user, 'aluno', 'individual', $plan_version, 'ativa', 'card',
        now(), now(), now() + interval '365 days')
on conflict (user_id, audience) where status <> 'cancelada'
do update set status='ativa', current_period_end = now() + interval '365 days';

-- cobranca paga: provider <> 'simulado' e paid_at preenchido, que e o que ownSources() exige
insert into billing_charges(tenant_id, subscription_id, user_id, provider, kind, payment_type,
                            amount_cents, status, paid_at, period_start, period_end, idempotency_key)
values ($tenant, $subscription, $user, 'fixture', 'primeira', 'card',
        3990, 'paga', now(), now(), now() + interval '365 days', $chave_unica);
```

Confira o resultado pela própria API, que é onde a regra mora:

```powershell
# depois de logar como o aluno e guardar o cookie
# GET /api/access/me deve trazer has: true e commercial_status: "ativa"
```

Antes da fixture, `GET /api/access/me` responde `has: false` e `commercial_status: "sem_assinatura"`, e `GET /api/guided/today` responde `402`. Depois, `has: true`, `commercial_status: "ativa"` e `200` nas rotas internas.

Três limites que valem registrar:

- Isto é **dado de teste do banco local**, com `provider = 'fixture'` justamente para não se confundir com pagamento real. Não reproduza em produção e não use `provider` de gateway de verdade para simular pagamento.
- A regra de produto continua intacta: cada aluno paga a própria assinatura, e isenção de personal não libera o aluno. A fixture não altera código nem configuração — só cria a linha de assinatura e de cobrança daquela conta.
- O **personal interno** é caso diferente: ele já tem acesso sem pagar, por `isInternalPersonal` (origem `personal_interno` em `accessOf`), e por isso a conta do personal principal não cai no `402`. Isso não se estende aos alunos dele.

## Verificações locais (opcional, depois de ligar)

Em `app/frontend`, `npm test` roda os testes unitários e `npm run build` confirma que a compilação passa. Em `app/api`, há testes por módulo nos scripts do `package.json`; os de integração exigem banco isolado e as variáveis de teste (`E2E_PASSWORD` e, quando aplicável, `SIM_WEBHOOK_TOKEN`, `E2E_EMAIL_DOMAIN` e os destinatários). A ausência dessas variáveis interrompe o teste em vez de usar senha ou token padrão.

---

**Última ligação verificada:** 21/10/2026 nesta cópia — portas 8787 e 5551 escutando, `/api/health` em `{"ok":true}`, `/api/legal/company` respondendo com dados do PostgreSQL e a página inicial carregando em `http://127.0.0.1:5551`. Login, cobrança e avaliação postural não foram exercitados nessa conferência.
