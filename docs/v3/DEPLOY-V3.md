# Deploy da V3 na VPS — checklist (PREPARADO, NÃO EXECUTADO)

Base: `ATUALIZAR-VPS.txt` (VPS em `/opt/acade`, PM2 com `/opt/acade-runtime/ecosystem.config.cjs`, processos
**`acade-api`** e **`acade`**, site `https://avagym.avadesk.com.br`). Branch a publicar: `v3/saas` (commits fase 2 → 7).
Nada disto foi rodado. Executar só com o Lucas acompanhando.

## 0. Antes (janela de manutenção)
1. Avisar usuários; escolher horário de baixo uso.
2. Conferir na VPS quais migrations já existem:
   `sudo -u postgres psql -d <DB_NAME> -c "select name from schema_migrations order by name"`
   Esperado: até `017_trofeus_premiacoes.sql`. A V3 aplica **018 → 023**.
3. Conferir que o `.env` da VPS (`/opt/acade/app/api/.env`) tem `DB_*`, `JWT_SECRET` (≥ 32 caracteres), `ORIGIN=https://avagym.avadesk.com.br`, `DEFAULT_TENANT`, `DATA_DIR` (pasta dos arquivos legados `db.json`, `state-*.json`, `secret`, `vapid.json`).

## 1. Backup (obrigatório)
```
TS=$(date +%Y%m%d_%H%M%S); mkdir -p /opt/acade-backups
sudo -u postgres pg_dump -Fc -d <DB_NAME> -f /opt/acade-backups/avagym_${TS}_antes_v3.dump
tar czf /opt/acade-backups/data_${TS}.tgz -C "$(dirname $DATA_DIR)" "$(basename $DATA_DIR)"   # db.json, state-*.json, secret, vapid
tar czf /opt/acade-backups/private_${TS}.tgz -C /opt/acade/app/api private uploads 2>/dev/null
cd /opt/acade && git rev-parse HEAD > /opt/acade-backups/commit_antes_${TS}.txt
```

## 2. Código
```
cd /opt/acade && git fetch && git checkout v3/saas && git pull     # (ou merge em main, conforme decisão)
cd app/api && npm ci && cd ../..
cd app/frontend && npm ci && npm run build && cd ../..
```

## 3. Migrations 018 → 023 (com o usuário dono do banco)
```
cd /opt/acade/app/api && node db/migrate.js --no-seed
```
| Migration | O que faz |
|---|---|
| 018_identidade_global | capacidades/contexto, memberships, verificação profissional, papel `avagym_app` + RLS base |
| 019_motor_planos | catálogo de planos, versões, assinaturas, entitlements, uso, concessões (preços "a definir") |
| 020_planos_gratuitos | convites `pro_invites` (Aluno Free / Profissional Free) |
| 021_saas_aberto_codigo_aluno | cadastro sem aprovação (libera `pendente`), código público único do aluno (`gen_share_code`) |
| 022_fim_pedido_vinculo_admin | cancela pedidos de vínculo abertos (fluxo removido), histórico preservado |
| 023_estado_app_postgres | `user_app_state`, `guided_live_sessions`, `users.onboarding_skipped_at` |

Depois da 023, **uma vez**: importar o estado legado dos arquivos para o banco (não apaga os arquivos):
```
node scripts/importar-estado-legado.mjs --dir "$DATA_DIR"
```
Rollback de cada uma: `app/api/db/down/0NN_down.sql` (ordem inversa) + restore do dump.

## 4. Reiniciar
```
pm2 restart /opt/acade-runtime/ecosystem.config.cjs --update-env && pm2 save
pm2 logs acade-api --lines 30 --nostream
pm2 logs acade --lines 20 --nostream
```
(Atalho existente: `/opt/acade-deploy.sh` — NÃO roda migrations; rodar o passo 3 antes.)

## 5. Verificar
```
curl -I https://avagym.avadesk.com.br/
curl https://avagym.avadesk.com.br/api/health
```
- Login do admin; Admin › Usuários › Visão 360°; Verificação profissional; Planos SaaS.
- Criar conta "Quero treinar" (entra sem aprovação), Início/Meus treinos, criar rotina, recarregar em outro navegador (rotina vem do banco).
- Conta "Sou profissional" → Convites; aluno aceita por código.
- Testes de API contra produção: NÃO (criam contas). Rodar só local.

## Mudanças de ambiente
- Nenhuma variável nova obrigatória. `DATA_DIR` continua necessário (sessão legada `gymsid`, push/VAPID, `db.json`).
- Opcional/pendente: API conectando com papel sem superusuário (`avagym_app`) para RLS efetivo — ver FASE-02/03.
- Se `VITE_SOURCE_URL` era usado para o link de código-fonte: a UI não mostra mais créditos/licença (decisão do Lucas, ver FASE-07).

## Rollback rápido
`pm2 stop acade-api acade` → `pg_restore --clean -d <DB_NAME> /opt/acade-backups/avagym_<TS>_antes_v3.dump` →
`git checkout $(cat /opt/acade-backups/commit_antes_<TS>.txt)` → `npm ci`/build → `pm2 restart ... --update-env`.
