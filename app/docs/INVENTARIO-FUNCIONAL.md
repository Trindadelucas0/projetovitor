# Inventário funcional (esqueleto) — base upstream ca399da

Legenda: **confirmado** (testado rodando) · **parcial** · **ausente** · **não testado** (existe no código, sem teste E2E).
Testes via HTTP (curl) e `npm test` (196 testes unitários OK). Navegador real ainda não usado.

| Funcionalidade | Status | Onde no código |
|---|---|---|
| Autenticação (passkeys/WebAuthn, sessão por cookie) | parcial — endpoints respondem (`/api/login/options`, `/api/register/options` 200; `/api/me` 401 sem sessão); cerimônia de passkey exige navegador | `api/server.js` (rotas `/api/register/*`, `/api/login/*`, `/api/logout*`), `frontend/src/views/Login.jsx`, `frontend/src/lib/api.js` |
| Modo convidado / demo (dados locais) | não testado | `frontend/src/lib/demo.js`, `demoSeed.js`, `store/useStore.js` |
| Dashboard / Home | não testado (rota `/home` serve SPA) | `frontend/src/views/Home.jsx` |
| Biblioteca de exercícios | parcial — mídia local servida em dev (`/img`, `/gif` → 200, 1324 imagens + 1324 GIFs); nomes e instruções em pt-BR já vêm do dataset (MIT) | `views/Library.jsx`, `lib/exercises*.js`, `components/Media.jsx` |
| Plano semanal / rotinas | não testado | `views/Plan.jsx`, `views/RoutineEdit.jsx`, `lib/starter.js`, `lib/plan-share.js` |
| Registro de séries/reps/carga (+RIR/RPE) | não testado (lógica com testes unitários) | `views/Workout.jsx`, `lib/effort.js`, `lib/progression.js` |
| Timer de descanso | não testado | `components/RestTimer.jsx`, `store/useUI.js`, `/api/push/rest-timer` |
| Histórico | não testado | `views/History.jsx`, `lib/history.js` |
| PRs / 1RM estimado | não testado (unit OK) | `lib/onerm.js`, `views/Stats.jsx` |
| Peso corporal | não testado | `views/Home.jsx`, `views/Stats.jsx`, `sheets.jsx` |
| Estatísticas/gráficos/heatmap | não testado | `views/Stats.jsx`, `components/LineChart.jsx`, `Heatmap.jsx` |
| Mapa muscular | não testado | `components/BodyMap.jsx`, `lib/body-paths.js`, `lib/muscles.js` |
| Notificações push (VAPID gerado no 1º run) | parcial — `/api/push/public-key` 200, `vapid.json` criado | `api/server.js`, `lib/push.js`, `public/sw.js` |
| Offline / PWA | parcial — manifest AVADESK 200, sw.js 200; SW só registra em **HTTPS** (`main.jsx`), então não instala/offline em http://localhost | `public/sw.js`, `public/manifest.json`, `main.jsx`, `useStore.js` |
| Importação/Exportação (JSON; FitNotes/Strong/Hevy/Apple Health) | não testado | `views/Settings.jsx`, `lib/import-csv.js` |
| Configurações (tema, idioma, 12 locales) | parcial — padrão pt-BR, kg, tema claro, destaque AVADESK; seção “Sobre e licença” (AGPL) | `views/Settings.jsx`, `lib/i18n.js`, `locales/` |
| Admin (usuários, convites, desativar) | não testado; exige `ADMIN_UIDS` | `views/Admin.jsx`, `api/server.js` `/api/admin/*` |
| Sincronização de dados por usuário | parcial — `/api/data` 401 sem sessão | `api/server.js` `GET/PUT /api/data` |
| Armazenamento | confirmado — JSON em `DATA_DIR` (`secret`, `vapid.json` criados) | `api/server.js` |
| Worker Cloudflare (D1) alternativo | não testado (deploy alternativo) | `worker/`, `docs/DEPLOYMENT_CLOUDFLARE.md` |
| App mobile Capacitor | não testado | `frontend/android`, `frontend/ios`, `docs/MOBILE.md` |

## Atualização 2026-10-13 (Etapas 5/6 + marca)
- i18n: infraestrutura própria (`lib/i18n.js`, chaves = inglês). `locales/pt.js` reescrito em pt-BR (tratamento “você”), sem duplicatas; 0 chaves faltando para strings `t()` do código. Admin, aria-labels e erros de push passaram a usar `t()`.
- `node scripts/check-locales.mjs` vai acusar ~60 chaves novas só em `pt.js` (outros idiomas caem no inglês). Não afeta `npm test`.
- Marca: AVADESK em título, manifest, meta tags, login, home, impressão de plano, notificações. Identificadores internos (`opengym_plan`, `appId` Capacitor, nomes de pacote, cookies) mantidos.
- Testes: `npm run build` OK, `npm test` 196/196.