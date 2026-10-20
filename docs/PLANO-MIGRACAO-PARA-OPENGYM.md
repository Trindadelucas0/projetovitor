# Plano de migração: AVAGYM → OpenGym (AVADESK)

> Análise feita sem alterar nada (somente leitura) em 14/10/2026. Nenhum arquivo dos dois projetos foi modificado.
> Origem: `F:\academia\acade\app` (raiz real; `F:\academia\acade` só tem `app/`, `docs/`, `runtime/`, `logs/`, `work/`).
> Destino: `D:\academia2\app` (repositório git; este plano fica em `D:\academia2\docs`, fora do repositório).
> **Atenção:** `F:\academia\acade\docs\ESPECIFICACAO-AVAGYM.md` **não existe**. Em `docs/` há apenas `MANUAL-WIREFRAMES.md` e `wireframes/`. A spec usada aqui foi o próprio código e `MANUAL-WIREFRAMES.md`.

## 0. Pré-requisitos: estado atual do OpenGym, com mudanças não commitadas

`git status` em `D:\academia2\app`:

| Item | Estado | Ação antes de migrar |
|---|---|---|
| `LICENSE` (AGPL, 661 linhas), `NOTICE.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` | **apagados** | Restaurar com `git restore` (pelo menos LICENSE e NOTICE.md são obrigatórios pela AGPL e pelo próprio `docs/ORIGEM.md`) |
| `frontend/src/views/Settings.jsx` | **erro de sintaxe**: o bloco "About & license" e os fechamentos `</div>`, `</div>`, `}` do componente `Settings()` foram apagados (perto da linha 194), e o build quebra | Restaurar os fechamentos **e** o link "Código-fonte" (o AGPL §13 exige oferecer o código aos usuários da rede); o rebrand "openGym→avadesk" nos textos pode ficar |
| `Settings.jsx` linha 45 | mensagem trocada por `t('consulte o suporte ')`, que não é uma chave de i18n | Revisar |
| `locales/pt.js`, `capacitor.config.json`, `package-lock.json`, `docs/INVENTARIO-FUNCIONAL.md` | modificados | Revisar e commitar separadamente |
| `frontend/vite.local5180.config.js` | não rastreado | Decidir se fica no repositório |

Recomendação: fazer um commit "baseline" limpo (licença restaurada, build verde) **antes** da fase 1, e trabalhar numa branch `feat/avagym-guided`.

## 1. Inventário da origem (AVAGYM)

AVAGYM é um **fork do mesmo openGym 1.2.4** (mesmos `App.jsx`, `useStore`, `BodyMap`, `muscles.js`, `body-paths.js`). Por isso grande parte do código entra por cópia direta. A grande diferença está no **backend**: a origem adicionou Postgres com multi-tenant.

### 1.1 Dependências
- Frontend: as mesmas do destino **mais** `three ^0.169.0`, `@react-three/fiber ^9.8.1`, `@react-three/drei ^10.7.9` (todas MIT).
- API: `pg ^8.23`, `bcryptjs ^3`, `jsonwebtoken ^9` (o destino tem só `@simplewebauthn/server` e `web-push`).
- Infra: Postgres (via `docker-compose.yml`), `api/env.js`, `api/db/pool.js`, `api/auth.js` (JWT + cookie, convivendo com o cookie `gymsid` do openGym).

### 1.2 Funcionalidade 1: programa de treino guiado
**Frontend** (`frontend/src/views/guided/`):
| Arquivo | Tamanho | Rota | Papel |
|---|---|---|---|
| `Onboarding.jsx` | 4,7 KB | `/onboarding` | objetivo, nível, local, frequência (2–6 dias), tempo (20/30/45/60 min), restrições |
| `Programs.jsx` | 8,9 KB | `/recomendados`, `/programas`, `/programa/:id` | recomendações (top 3 com "porquê"), biblioteca, detalhe; exporta `Spin`, `Cover` |
| `MyProgram.jsx` | 3,2 KB | `/meu-programa` | "Meu Programa" |
| `Today.jsx` | 5,4 KB | `/hoje` (rota padrão) | "Hoje", `WeekStrip`, botão "Começar treino", fila offline |
| `Train.jsx` | 9,5 KB | `/treinar` | execução do treino |
| `Done.jsx` | 6,5 KB | `/concluido` | resumo e sincronização |
| `Progress.jsx` | 3,5 KB | `/progresso` | progresso (usa `MuscleStatus`) |
| `Profile.jsx` | 3,6 KB | `/perfil` | perfil guiado |
| `AdminPrograms.jsx` | 1,7 KB | `/admin/programas` | status editorial dos programas |
| `TabBar.jsx` | 1,4 KB | — | barra inferior nova (substitui a antiga) |
| `guided.css` | 15 KB | — | tema escuro do fluxo guiado |
| `lib/guided.js` | 5,5 KB | — | cliente `G`, rótulos PT (`GOAL_PT`, `LEVEL_PT`, `LOC_PT`, `RESTR_PT`), sessão local, fila (`enqueue`/`flushQueue`), `mediaOf` |
| `App.jsx` | 5,7 KB | — | registro das rotas; `*`→`/hoje` |

**API** (`api/guided.js`, 24 KB, `guidedRoutes({json, readBody})` montado em `server.js`):
`GET /api/guided/state`, `POST /api/guided/onboarding`, `GET /api/guided/recommendations`, `GET /api/guided/programs`, `GET /api/guided/program`, `POST /api/guided/start`, `POST /api/guided/abandon`, `GET /api/guided/today`, `POST /api/guided/sessions` (idempotente por `client_id`), `GET /api/guided/progress`, `GET /api/guided/muscle-load`, `GET /api/guided/admin/programs`, `POST /api/guided/admin/program-status`.
A recomendação é **determinística**: `scorePrograms()` e `rank()` (linhas 24–76) aplicam um filtro estrito e depois um relaxado (−40 pontos), com desempate por `id`. `suggestNext()` cuida da progressão.

**Banco** (`api/db/`):
- `migrations/001_init.sql` (8,7 KB): `tenants, roles, users, user_roles, webauthn_credentials, coach_students, invites, user_profiles, health_restrictions, muscle_groups, muscles, equipment, exercises, exercise_muscles, exercise_groups, exercise_contraindications, programs, program_workouts, program_workout_exercises, user_programs, workouts, workout_exercises, schedule_overrides, sessions, session_sets, session_pain_reports, body_weights, body_goals, push_subscriptions`.
- `migrations/002_guided_training.sql` (3 KB): status e versão de `programs` e equipamentos/músculos/contraindicações dos programas; `user_onboarding` (PK `user_id`, `tenant_id`, checks dos enums); colunas novas de `user_programs`, `sessions` (`client_id` único, volume, duração) e `session_sets`.
- Seeds: `seed-data.js` (17 KB, catálogo e PROGRAMS), `seed-programs.js` (18 KB, biblioteca v2 com `MEDIA` para ids do exercises-dataset e 2 fotos locais da Wikimedia), `muscles-pt.js` (13 KB), `migrate.js`.
- Mídias locais: `frontend/public/media/exercicios/` (perdigueiro CC BY 2.0, pêndulo de Codman CC0, com `CREDITS.md`).

### 1.3 Funcionalidade 2: músculos trabalhados
- `views/guided/MuscleStatus.jsx` (6,4 KB): `useMuscleRows`, `muscleStats`, `SLUG_PT`, `GROUP_SLUG` (14 grupos do banco → slugs do mapa), `SLUG_GROUP`. Junta as sessões guiadas (`/api/guided/muscle-load`) com o histórico local `S.workouts`.
- Reaproveita `components/BodyMap.jsx`, `lib/muscles.js` e `lib/body-paths.js` (MuscleMap, MIT), **que já existem no destino**.
- É usado em `Today.jsx` e `Progress.jsx`.

### 1.4 Funcionalidade 3: corpo anatômico 3D
- `components/Body3D.jsx` (3,5 KB): Canvas R3F, `useGLTF`, OrbitControls, modo `hero` com rotação, `selected`, `heat` em 5 níveis, `onPick` e `onHover` por `userData.label`.
- `views/MuscleMap.jsx` (7,1 KB), rota `/muscles`, carregada com lazy: integra o 3D com `MuscleStatus`.
- Asset: `frontend/public/models/corpo.glb` com **4.359.036 bytes (~4,2 MB)**, compactado com meshopt (gltf-transform). Licença **CC BY-SA 4.0** (Z-Anatomy, Lluís Vinent Juanico, baseado em BodyParts3D/DBCLS). Créditos em `public/models/CREDITS.md` (838 B) e em uma seção do `NOTICE.md`. O GLB derivado continua CC BY-SA (ShareAlike), separado da AGPL do código.

### 1.5 Ruído a NÃO copiar
`*.bak`, `*.bak-guided`, `api/.env`, `CREDENCIAIS-LOCAL.txt`, `export.tar`, `.npm-cache`, `work/*.mjs`.

## 2. Arquitetura-alvo no OpenGym

### 2.1 Diferenças de stack
| Aspecto | AVAGYM | OpenGym (destino) |
|---|---|---|
| Frontend | React 19 + Vite 8 + router 7 + zustand 5 + R3F/three | igual, **sem** three/R3F/drei |
| API | `server.js` + `guided.js` + `auth.js` + Postgres (`pg`) | `api/server.js` de 554 linhas; **armazenamento em arquivos JSON** (`DATA_DIR`, `db.users`, estado por usuário em `stateFile(uid)`), sem SQL |
| Edge | `worker/` | `worker/` Cloudflare D1 (`schema.sql`: users, creds, subs, invites, challenges, user_state, app_secrets) |
| Auth | WebAuthn + JWT + tenants/roles | WebAuthn (passkey) + cookie; admin booleano; **sem tenant** |
| Mobile | — | Capacitor (android/ios), modo `MOBILE` só offline |

### 2.2 Decisão central: modelo de dados
O destino **não tem Postgres nem tenants**. Opções:
- **A (recomendada): catálogo estático + estado no blob do usuário.** Os programas e o catálogo de exercícios viram um módulo JS (`frontend/src/lib/programs-data.js`, gerado a partir de `seed-programs.js` e `seed-data.js`). `scorePrograms`/`rank`/`suggestNext` passam a ser **funções puras no frontend** (`lib/recommend.js`), o que mantém o determinismo e funciona offline, no Capacitor e no worker. Onboarding, programa ativo e sessões guiadas ficam em `S.guided = { onboarding, active: {programId, version, startedAt}, sessions: [...] }`, sincronizados pelo `GET/PUT /api/data` que já existe. Nenhum endpoint novo é necessário.
- **B: portar `/api/guided/*`** para `api/server.js` (JSON) **e** para `worker/index.js` (D1). Isso duplica o backend e exige tabelas novas no D1, então só vale se houver necessidade real de admin editorial e multi-tenant.
- **C: adotar Postgres** como na origem. Seria uma reescrita da autenticação e dos dados, fora do escopo.

Mapeamento (opção A):
| Origem (SQL) | Destino |
|---|---|
| `programs` + `program_workouts` + `program_workout_exercises` (status `publicado`) | `lib/programs-data.js` (somente publicados; o `version` vai no objeto) |
| `exercises`, `exercise_muscles`, `exercise_groups`, `exercise_contraindications`, `muscles-pt.js` | mapear para ids de `lib/exercises-data.js` com `MEDIA` (já são ids do exercises-dataset) e restrições em tabela JS |
| `user_onboarding` (objetivo, nivel, local, dias, minutos, restricoes) | `S.guided.onboarding` com os mesmos enums validados no cliente |
| `user_programs` (status, started/ended, end_reason) | `S.guided.active` + `S.guided.history[]` |
| `sessions`/`session_sets` (client_id, volume, duração, target_reps) | `S.guided.sessions[]` com `clientId`; **convertida também em `S.workouts`** para alimentar Stats, History e o mapa |
| `session_pain_reports` | `S.guided.sessions[].pain` |
| `tenants`, `roles`, `coach_students` | **sem equivalente**; não migrar (registrar como trabalho futuro) |
| `/api/guided/admin/*` | omitir; para editar programas, editar `programs-data.js` via PR |

### 2.3 Encaixe de auth/tenant
Com a opção A não há impacto: o dado guiado é do usuário e passa pela mesma sessão de passkey. Funciona também para convidado/demo (localStorage) e mobile. A rota `/admin/programas` some.

### 2.4 Onde cada peça entra
- `frontend/src/views/guided/*` (copiar e trocar `G.*`, que fazia fetch, por chamadas a `lib/guided.js` local).
- `frontend/src/lib/guided.js` (reescrito, local), `lib/recommend.js` (portado de `api/guided.js`), `lib/programs-data.js` (gerado), `lib/recommend.test.js` (novo).
- `store/useStore.js`: chave `guided` em `DEF`, sem quebrar backups antigos (`Settings.jsx` import/export).
- `components/Body3D.jsx`, `views/MuscleMap.jsx`, `views/guided/MuscleStatus.jsx` (copiar).
- `public/models/corpo.glb` + `CREDITS.md`; `public/media/exercicios/*` + `CREDITS.md`.
- `App.jsx`: rotas novas. **Conflito:** na origem `*`→`/hoje` e a TabBar antiga foi substituída. No destino, sugiro manter `/home` como padrão e adicionar uma aba "Programa", ou tornar isso configurável.
- `locales/pt.js` (+ en): as strings da origem estão em PT fixo no código; convém passar por `t()`.
- `NOTICE.md`: acrescentar as seções "Modelo anatômico 3D" (Z-Anatomy CC BY-SA 4.0) e "Mídias locais", **mantendo** as seções AGPL, MuscleMap MIT e exercises-dataset.

## 3. Fases

| # | Fase | Copiar / adaptar | Esforço | Riscos |
|---|---|---|---|---|
| 0 | Baseline: restaurar LICENSE/NOTICE/README etc., corrigir `Settings.jsx`, build e testes verdes, commit, branch | — | 0,5 d | Perder edições locais de rebrand; revisar o diff antes |
| 1 | Corpo 3D: deps three/R3F/drei, `Body3D.jsx`, `corpo.glb`, CREDITS, NOTICE, `/muscles` lazy | copiar quase 1:1 | 1–1,5 d | +~4,2 MB de asset e ~600 KB de JS (precisa de lazy); o GLB meshopt exige `MeshoptDecoder` (o drei faz isso por padrão, verificar offline/Capacitor); o cache do service worker/PWA pode não aceitar 4 MB; WebGL fraco no mobile pede um fallback para `BodyMap` 2D; ShareAlike do GLB |
| 2 | Músculos trabalhados: `MuscleStatus.jsx` + integração em Home/Stats | adaptar: trocar `/api/guided/muscle-load` por agregação local de `S.workouts` + `S.guided.sessions` | 1 d | Os labels do GLB (`userData.label`), os slugs do BodyMap e os 14 grupos precisam bater (tabela `GROUP_SLUG`); risco de contagem dupla se as sessões guiadas também forem gravadas em `S.workouts` |
| 3 | Dados e recomendação: gerar `programs-data.js` a partir dos seeds; portar `scorePrograms`/`rank`/`suggestNext` como funções puras + testes | adaptar | 2–3 d | Os seeds dependem de ids SQL e de `muscles-pt`; os ids de exercício precisam existir em `exercises-data.js`; o tamanho do bundle |
| 4 | Fluxo guiado UI: Onboarding → Recomendados → Programa → Meu Programa → Hoje → Treinar → Concluído → Progresso | copiar views + `guided.css`; reescrever `lib/guided.js` (sem fila HTTP, usar o store) | 3–4 d | Conflito de navegação (TabBar e rota padrão); CSS escuro global brigando com os temas e acentos do destino; `Train.jsx` concorrendo com o `Workout.jsx` atual (o wake lock e o RestTimer valem para os dois) |
| 5 | Persistência e sync: `S.guided` no `DEF`, migração de estado, export/import de backup, worker D1 sem mudança | adaptar | 1 d | Conflito "último a gravar vence" do `PUT /api/data` entre dispositivos; tamanho do blob |
| 6 | i18n, licença/créditos, docs (`INVENTARIO-FUNCIONAL.md`, `ORIGEM.md`) | adaptar | 1 d | Faltar atribuição CC BY-SA visível na UI |
| 7 | QA (web, PWA, Android) | — | 1–2 d | — |

**Total estimado: 10–14 dias de desenvolvimento** (opção A). A opção B soma de 4 a 6 dias (dois backends + D1).

## 4. Checklist de testes
- [ ] `npm run build` e `npm test` (vitest) verdes após a fase 0; `Settings.jsx` mostra "Sobre & licença" e o link do código-fonte.
- [ ] LICENSE e NOTICE.md presentes; NOTICE com AGPL, MuscleMap (MIT), exercises-dataset, Z-Anatomy (CC BY-SA 4.0) e Wikimedia.
- [ ] Recomendação: os mesmos inputs dão a mesma saída (teste de snapshot); desempate por id; o fallback relaxado só aparece quando o estrito tem menos de 3 resultados; as restrições excluem os programas contraindicados.
- [ ] Onboarding valida os enums (2–6 dias; 20/30/45/60 min; gym/home/home_noequip; 7 objetivos; 3 níveis).
- [ ] Começar → Hoje mostra o treino certo do dia e da semana; Treinar → Concluído grava a sessão uma só vez (idempotência por `clientId`); Abandonar encerra o programa.
- [ ] Sessão guiada aparece em History/Stats e no mapa sem contagem dupla.
- [ ] Mapa 2D e 3D: os mesmos músculos ficam destacados; clique/hover no 3D mostra o nome PT; o heatmap tem 5 níveis.
- [ ] O 3D carrega com lazy (não entra no bundle inicial); funciona offline depois da 1ª carga; há fallback 2D sem WebGL.
- [ ] Convidado/demo/mobile (Capacitor) funcionam sem API.
- [ ] Logado: sync entre dois navegadores; logout/login preserva `S.guided`.
- [ ] Export → import de backup antigo (sem `guided`) e novo.
- [ ] Temas claro/escuro e acentos não quebram as telas guiadas.
- [ ] Lighthouse/perf no mobile com o GLB de 4,2 MB.
