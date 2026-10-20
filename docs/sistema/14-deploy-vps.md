# Deploy na VPS


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

