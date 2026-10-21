# Execução local (Windows, sem Docker)

Pré-requisitos: Node 24 / npm 11 (já instalados). Docker Desktop está parado ("unable to start").

Instalação (lockfiles, uma vez): `cd api; npm ci` e `cd frontend; npm ci` (cache npm em `D:\open-gyn-saas\.npm-cache`).

- Iniciar: `powershell -ExecutionPolicy Bypass -File scripts\dev-start.ps1`
- Parar: `powershell -ExecutionPolicy Bypass -File scripts\dev-stop.ps1` (mata só os PIDs salvos em `D:\open-gyn-saas\runtime\pids.txt`)
- URLs: app http://localhost:5551 (Vite, proxy `/api` → API) · API http://localhost:8787
- Dados: `D:\open-gyn-saas\runtime\data` (fora do repo; contém `secret` e `vapid.json` — não versionar). Logs: `D:\open-gyn-saas\logs`.
- Env usadas: `PORT=8787 DATA_DIR=... RP_ID=localhost ORIGIN=http://localhost:5551`.

## Resultados (2026-10-13)
- `npm ci` api/frontend OK; `npm run build` OK (aviso de chunk >500 kB); `npm test` 196/196 OK.
- API: `/api/health` 200, `/api/config` 200, `/api/login/options` 200, `/api/register/options` 200, `/api/me` e `/api/data` 401 sem sessão (esperado), `/api/push/public-key` 200.
- SPA: `/`, `/home`, `/library`, `/plan`, `/history`, `/stats`, `/settings`, `/admin` → 200.
- Login completo não testado (WebAuthn precisa de navegador no PC).

## Divergências do upstream
- README cita `.env.example` e `web/Dockerfile`/`web/nginx.conf`, mas **não existem** no repo → `docker compose up --build` falharia no serviço `web`.
- Mídia de exercícios (~140 MB, baixada pelo serviço `media` do compose) não existe no modo dev.

## Mídia de exercícios
Baixada pelo mesmo mecanismo do serviço `media` do compose (git clone --depth 1 de hasaneyldrm/exercises-dataset, commit 7455efa — o mesmo fixado no CDN do código) em `D:\open-gyn-saas\runtime\exercises-dataset`, com cópia de `images/*.jpg` → `runtime\media\img` e `videos/*.gif` → `runtime\media\gif`. O `dev-start.ps1` define `OPENGYM_MEDIA_DIR`, `VITE_IMG_BASE=/img/` e `VITE_GIF_BASE=/gif/`; um plugin dev no `vite.config.js` serve os arquivos. Licença: código/dados/instruções MIT; mídia © Gym visual (redistribuída com permissão; manter atribuição; reuso sujeito aos termos da Gym visual).

## Docker (não executado)
`web/Dockerfile`, `web/nginx.conf` e `.env.example` foram recriados. Para usar: `copy .env.example .env` e `docker compose up -d --build`.
