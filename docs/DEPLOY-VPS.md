# Deploy na VPS (setup real, 2026-10-16)

Produção: **https://ornygym.avadesk.com.br** (único domínio; academ.avadesk.com.br foi abandonado em 16/10/2026).

## Visão geral
| Peça | Onde |
|---|---|
| Servidor | VPS `srv1967939` (187.127.3.250), acesso `ssh avagym-vps` (chave `~/.ssh/id_ed25519_avagym` no PC do Lucas; senha root não é usada) |
| Código | `/opt/avagym` (git, branch principal) |
| Runtime fora do git | `/opt/avagym-runtime`: `ecosystem.config.cjs` (PM2), `data/` (DATA_DIR), `media/` (/img, /gif) |
| Backups | `/opt/avagym-backups` (dump, data, mídia, .env, ecosystem, commit, SHA256SUMS) |
| Segredos | `/opt/avagym/app/api/.env` (nunca no git; nunca imprimir valores) |
| Banco | Postgres 16 no docker `avagym-postgres` (127.0.0.1:5441); `psql`/`pg_dump` só via `docker exec` |
| Processos PM2 | `avagym-api` (/opt/avagym/app/api/server.js, porta 8797) e `avagym-web` (gateway, porta 4460) |
| Gateway | `/opt/avagym/app/web/gateway.mjs` (no repo): serve `frontend/dist` e mídia, proxy /api, cabeçalhos de segurança (CSP frame-ancestors 'none', nosniff, XFO DENY, Referrer-Policy, Permissions-Policy, COOP, HSTS) e 301 HTTP->HTTPS via X-Forwarded-Proto |
| Borda | Cloudflare Tunnel (`cloudflared` como serviço, token em `/etc/cloudflared/token`, configurado no painel Zero Trust). Sem nginx no caminho |
| E-mail | Resend (domínio verificado: avadesk.com.br; ornygym.avadesk.com.br criado no Resend aguardando DNS): `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM=AVAGYM <nao-responda@avadesk.com.br>` |

## Deploy (sempre nesta ordem)
```bash
ssh avagym-vps
TS=$(date +%Y%m%d_%H%M%S); B=/opt/avagym-backups
docker exec avagym-postgres pg_dump -U avagym -Fc avagym > $B/avagym_$TS.dump      # 1. backup do banco
cp /opt/avagym/app/api/.env $B/env_$TS; cp /opt/avagym-runtime/ecosystem.config.cjs $B/ecosystem_$TS.cjs
git -C /opt/avagym rev-parse HEAD > $B/commit_$TS.txt
cd /opt/avagym && git pull --ff-only                                                 # 2. código
cd app/api && npm ci --omit=dev && node db/migrate.js --no-seed                     # 3. migrations
cd ../frontend && npm ci && npx vite build                                          # 4. build
pm2 restart avagym-api avagym-web --update-env && pm2 save                          # 5. restart
```
Rollback: `git -C /opt/avagym checkout $(cat $B/commit_$TS.txt)`, `node db/migrate.js --down <n>` ou `pg_restore` do dump, rebuild, `pm2 restart`.

## Smoke test
```bash
U=https://ornygym.avadesk.com.br
curl -s $U/api/health                       # {"ok":true}
curl -sI $U/api/health | head -1            # 200
curl -sI $U/ | grep -iE 'content-security|x-frame|nosniff|referrer|permissions|strict-transport'
curl -sI http://ornygym.avadesk.com.br/ | head -3   # 301 -> https
curl -s -o /dev/null -w '%{http_code}\n' -X POST $U/api/auth/login -H 'Content-Type: application/json' -d '{}'   # 403 (CSRF)
curl -s $U/sw.js | grep -c AVADESK          # 0
```
E-mail: admin logado -> `POST /api/adm/email-test {"to":"..."}` devolve `provider_id` (id do Resend).

## Passos que dependem do painel Cloudflare (Lucas)
1. **Always Use HTTPS:** Cloudflare > avadesk.com.br > SSL/TLS > Edge Certificates > Always Use HTTPS = On. (O gateway já redireciona; isto só adianta na borda.)
2. **Hostname do túnel:** Zero Trust > Networks > Tunnels > (túnel da VPS) > Public Hostname: `ornygym.avadesk.com.br` -> `http://localhost:4460` (já existe).
3. **DNS do Resend** para `ornygym.avadesk.com.br`: registros SPF/DKIM/MX informados pelo Resend (Domains), proxy desligado (nuvem cinza).

## Variáveis do .env (sem valores)
`ORIGIN=https://ornygym.avadesk.com.br`, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM`, `DB_*`, `DATA_DIR=/opt/avagym-runtime/data`, `RP_NAME=AVAGYM`. Passkeys ficam presas ao domínio (ornygym).

## Cobrança (planos e pagamento)

A configuração segura mantém a cobrança em modo teste até a troca explícita abaixo. O código pode ser publicado antes; publicar ou aplicar a migration não gera cobrança real. Procedimento detalhado: `docs/sistema/21-asaas-ambientes.md`.

```
BILLING_PROVIDER=asaas
ASAAS_ENV=producao
ASAAS_API_KEY=<chave $aact_prod_ do Asaas>
ASAAS_WEBHOOK_TOKEN=<token igual ao do webhook no painel Asaas>
```

O checkout atual aceita somente cartão de crédito; Pix foi aposentado. Antes de habilitar cobranças, confirmar a conta Asaas aprovada, tokenização de cartão, preços, monetização e carência; cadastrar o webhook `https://ornygym.avadesk.com.br/api/billing/webhook/asaas` com envio sequencial e token exclusivo. Depois de preencher o `.env`: `pm2 restart avagym-api --update-env` e conferir no admin (Cobrança, preços e cupons > Visão geral) **Asaas (produção)**. Configuração incompleta ou com prefixo de chave incompatível impede a API de iniciar; não cai no simulador. O acesso ao plano depende do evento de pagamento confirmado recebido por esse webhook.

### InfinitePay (provedor ativo desde 20/10/2026)

```dotenv
BILLING_PROVIDER=infinitepay
INFINITEPAY_API_KEY=<chave privada inchk_...>
INFINITEPAY_HANDLE=<InfiniteTag sem $>
ORIGIN=https://ornygym.avadesk.com.br
```

O AVAGYM cria um checkout individual por contratação ou renovação e envia automaticamente o webhook `https://ornygym.avadesk.com.br/api/billing/webhook/infinitepay`. Não cadastrar nem documentar segredo de webhook fictício: o backend confirma `order_nsu`, transação, slug e valor pela API `payment_check` antes de liberar acesso. O Asaas permanece configurado apenas para conciliação do legado. Rollback lógico: restaurar `BILLING_PROVIDER=asaas`, reiniciar `avagym-api --update-env` e preservar as cobranças InfinitePay para auditoria.

## Publicação 2.0.0 — plano único e painel do personal (21/10/2026)

Esta entrega muda **catálogo de planos, cadastro, papéis e menu do painel**. Duas migrations
aditivas (`068_plano_unico.sql`, `069_personal_do_tenant.sql`) e nenhuma remoção de dados.
Voltas em `app/api/db/down/068_down.sql` e `069_down.sql`.

### Antes de publicar
- [ ] Rodar as duas migrations **num banco isolado primeiro**, duas vezes (idempotência), e conferir:
      `DB_NAME=orny_plano_unico node db/migrate.js && DB_NAME=orny_plano_unico npm run verificar:plano-unico`
- [ ] Confirmar **quem é o personal**: a 069 elege o administrador mais antigo e ativo do ambiente.
      Se não for o Vitor, corrigir a chave depois de aplicar (comando abaixo) — a isenção de
      limite e o vínculo automático dependem dela.
- [ ] Confirmar que o preço 3990 é o desejado: ele sai da migration, não de tela.

### Aplicar (depois do backup do roteiro padrão acima)
```bash
cd /opt/avagym/app/api && node db/migrate.js --no-seed
DB_NAME=avagym npm run verificar:plano-unico      # somente leitura; precisa fechar sem falha
cd ../frontend && npm ci && npx vite build
pm2 restart avagym-api avagym-web --update-env && pm2 save
```

Trocar o personal do ambiente, se a eleição automática pegou a conta errada:
```bash
docker exec -i avagym-postgres psql -U avagym -d avagym -c \
  "update app_settings set value = to_jsonb('<uuid-do-personal>'::text), updated_at=now() where key='personal_user_id'"
```
Depois, garantir o perfil profissional ativo dele (a 069 faz isso só para quem ela elegeu):
reaplicar a 069 não resolve, pois ela é idempotente pela chave — criar/ativar o perfil pelo
painel em **Sistema → Meu perfil de personal**, que grava `professional_profiles`.

### Smoke test desta entrega
```bash
U=https://ornygym.avadesk.com.br
curl -s $U/api/public/plans | grep -o '"id":"[^"]*"'          # só individual
curl -s $U/api/public/plans | grep -o '"price_cents":[0-9]*'  # 3990
curl -s -o /dev/null -w '%{http_code}\n' $U/api/billing/pro-summary   # 401 sem login; 410 logado
```
Na interface, conferindo em 390 px e no desktop:
- [ ] `/precos` mostra **um** cartão, R$ 39,90, sem seletor aluno/personal
- [ ] Cadastro em **4 etapas**, sem a pergunta "Quero treinar / Sou profissional"
- [ ] Conta nova **sem pagar**: Treinos, Comunidade e Progresso continuam bloqueados *(tem de falhar)*
- [ ] Conta nova aparece sozinha em **Meus alunos → Alunos**, com vínculo "Sim"
- [ ] Painel sem Profissionais e verificação, Limites de acompanhamento e Solicitações de vagas;
      `?tab=profissionais` redireciona para Alunos
- [ ] **Sistema → Meu perfil de personal** salva; publicação na Comunidade sai com nome e foto do personal
- [ ] Ficha com um dia marcado em **Segunda**: no Início do aluno, na segunda, abre esse treino
- [ ] Dois dias no mesmo dia da semana: **recusado** com os dois nomes na mensagem *(tem de falhar)*
- [ ] Exercício com vídeo do YouTube: toca no app, 0,5× funciona, −10 s/+10 s funcionam
- [ ] **Tenho uma dúvida neste vídeo**: chega em Dúvidas e atendimentos com o exercício e o trecho,
      e o exercício **não** fica pausado

### Riscos conhecidos
| Risco | O que acontece | O que fazer |
|---|---|---|
| `aluno_free` apagado por engano | criar conta para de funcionar (`ensureSubscription`) | a 068 preserva; nunca remover esse registro |
| 069 elege o admin errado | vínculo automático liga alunos à conta errada | corrigir a chave e conferir `verificar:plano-unico` |
| Nenhum admin ativo no ambiente | sem `personal_user_id`: cadastro funciona, mas sem vínculo automático | criar o admin e reaplicar a 069 |
| Conta legada com papel `profissional` | entra como aluno; `/pro` leva ao treino | esperado; nada a fazer |
| Vídeo do YouTube removido/privado | aluno vê "indisponível" + imagem do exercício | trocar o link na ficha |
| Cupom apontava para plano de personal | a 068 reaponta para `individual` | revisar Cobrança → cupons depois de publicar |
