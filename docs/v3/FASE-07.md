# Fase 7 — dados do usuário no PostgreSQL (fim do armazenamento no navegador/arquivo)

## Inventário
| Onde | Chave / arquivo | O que é | Classificação | Destino |
|---|---|---|---|---|
| API `server.js` | `DATA_DIR/state-<uuid>.json` (`GET/PUT /api/data`) | treino livre: rotinas, semana, treinos livres, pesos, metas, preferências, lembrete | dado do usuário | **Postgres `user_app_state.state`** |
| API `PUT /api/data` | `state.active` (descartado antes) | treino livre em andamento | dado do usuário | **`user_app_state.active_workout`** |
| front `lib/guided.js` | `avagym_guided_session_v1` | treino guiado/ficha em andamento (retomar) | dado do usuário | **`guided_live_sessions`** (localStorage = cache offline) |
| front `Onboarding/Today` | `ag_onb_skip` | "Agora não" do onboarding | preferência da conta | **`users.onboarding_skipped_at`** |
| front `store/useStore.js` | `gym_state_v1` | cópia local do treino livre | cache | fica como cache offline; fonte = banco |
| front `useStore.js` | `gym_dirty` | marcador "falta sincronizar" | técnico/offline | fica |
| front `useStore.js` | `gym_user` | cache do usuário logado para abrir rápido | cache de UI | fica (o login real é o cookie/JWT) |
| front `useStore.js` | `gym_guest` | modo visitante ("Usar sem conta") | modo visitante | fica (ver decisão) |
| front `lib/guided.js` | `avagym_guided_queue_v1` | fila de treinos salvos sem internet | offline | fica (precisa existir sem rede) |
| front `lib/guided.js` | `avagym_guided_last_v1` | último resumo para reabrir "Concluído" | cache de UI | fica (o treino salvo já está em `sessions`) |
| front `views/app/Desafios.jsx` | sessionStorage `DRAFT_KEY` | rascunho do assistente de desafio na aba | efêmero de UI | fica |
| front `lib/demo.js`, `lib/mobile.js` | build demo / app nativo | sem servidor | fora do escopo web | fica |
| API `db.json` | `users` (ponte do cookie `gymsid`), `subs` (push), `invites` legados | legado openGym | técnico | **pendente** (próxima fase: push_subscriptions e fim do gymsid) |
| Auth | cookie httpOnly `avagym_token` (JWT) | sessão | já correto | — |
IndexedDB: não usado.

## Implementado
- Migração `023_estado_app_postgres.sql` (+ `down/023_down.sql`): `user_app_state` (user_id PK, tenant_id, state jsonb,
  active_workout jsonb, client_ts, timestamps, índices tenant e lembrete, RLS por tenant), `guided_live_sessions`
  (idem), `users.onboarding_skipped_at`. Grants para `avagym_app`.
- `app/api/appstate.js`: `GET/PUT /api/data` (agora Postgres; aceita JWT e o cookie legado), `GET/PUT /api/me/live-session`,
  `POST /api/me/live-session/clear`, `POST /api/me/onboarding/skip`. Validação de formato e tamanho; 401 sem login.
  Leitura com importação preguiçosa do arquivo legado se a conta ainda não tem linha.
- `server.js`: lembretes push, admin "treinos do aluno" e LGPD (exportar/apagar) leem/apagam no banco.
- `guided.js` (API): `GET /api/guided/state` devolve `onboarding_skipped`.
- `scripts/importar-estado-legado.mjs`: importação única dos `state-*.json` (idempotente, não sobrescreve estado mais
  novo, preserva os arquivos). Rodado localmente: **3 contas importadas**.
- Front: `pullState` recupera também o treino livre em andamento do banco; treino guiado em andamento sobe para o banco
  (debounce) e é recuperado em outro aparelho; "Agora não" grava na conta.
- **Importação única no cliente** (`lib/localImport.js`, chamada após o login no `pullState`): se o banco não tem estado
  e o navegador tem, o treino livre local sobe (`PUT /api/data`); `ag_onb_skip` antigo vira `onboarding_skipped_at` e a
  chave é apagada; treino guiado em andamento do banco é restaurado no aparelho.

## Visitante ("Usar sem conta") — decisão
Visitante continua só no aparelho (sem conta não há onde gravar no banco). Ao criar conta/entrar, o `pullState` envia
os dados locais para o banco se a conta ainda estiver vazia (migração no cadastro). Registrado como decisão.

## Removido da interface — "Sobre e licença" e créditos
**Decisão explícita do Lucas, mesmo com o aviso de que AGPL-3.0 (openGym) e CC BY-SA 4.0 (Z-Anatomy) exigem
atribuição/oferta do código-fonte aos usuários.** Removido de: `views/guided/Profile.jsx` (bloco "Sobre e licença" +
link Código-fonte), `views/Login.jsx` (linha de crédito Z-Anatomy/openGym), `views/Settings.jsx` ("About & license"),
`views/MuscleMap.jsx` (crédito do modelo 3D na tela Corpo 3D). `app/LICENSE`, `app/NOTICE.md`, `app/frontend/public/models/CREDITS.md` e `app/frontend/public/media/exercicios/CREDITS.md`
continuam no repositório, intocados. Risco jurídico: ver `docs/v3/03-MATRIZ-RASTREABILIDADE.md` (bloqueio AGPL).

## Testes
- `v3-fase7` 25/25 (401 sem login, salvar/ler estado, treino livre em andamento, linha com tenant/carimbo, isolamento
  entre contas, estado inválido, admin lê do banco, aluno sem acesso à rota admin, sessão guiada salvar/recuperar/limpar/
  isolada, "Agora não" por conta, importador: só usuários existentes, não sobrescreve mais novo, preserva arquivo, idempotente).
- Regressão: v3-fase6 23/23, v3-fase5 35/35, v3-fase4 36/36, v3-fase3 27/27, v3-fase2 34/34, **smoke 451/451**,
  vitest 226/226, `vite build` ok. API local reiniciada com o código novo (4449/8787 no ar).

## Rollback
`023_down.sql` (apaga as tabelas novas — exportar antes) → `git revert`. Backup: `backups/avagym_20261015_115103_antes_v3_fase07.dump`.
Os `state-*.json` originais não foram alterados.

## Pendências / não definido
- `db.json` ainda guarda a ponte do cookie `gymsid`, inscrições de push e convites legados → mover para Postgres (próxima fase).
- Cache local (`gym_state_v1`, `gym_user`, fila offline) mantido por funcionar sem internet; decidir se o app deve exigir conexão.
- Conflito entre aparelhos: vence o carimbo mais novo (`_ts`), como antes; sem mesclagem campo a campo.
- Deploy: checklist em `docs/v3/DEPLOY-V3.md` (não executado).
