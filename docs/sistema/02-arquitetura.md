# Arquitetura

```
Navegador/PWA ──HTTPS──> Cloudflare (borda) ──Tunnel──> cloudflared (VPS)
   └─> gateway Node (app/web/gateway.mjs, :4460)
         ├─ arquivos estáticos do frontend (frontend/dist) + mídia (/img, /gif)
         ├─ cabeçalhos de segurança (CSP, XFO, HSTS...) e 301 HTTP->HTTPS
         └─ proxy /api ──> API Node (app/api/server.js, :8797)
                               ├─ PostgreSQL 16 (docker avagym-postgres, 127.0.0.1:5441)
                               ├─ DATA_DIR (arquivos de usuários, anexos)
                               └─ Resend (e-mail, via fila email_outbox)
```

- **API**: servidor HTTP próprio (sem framework), rotas declaradas como `'MÉTODO /caminho': handler` em módulos (44 módulos em app/api) e combinadas em `server.js`. Um middleware central faz CSRF, rate limit, roteamento, autenticação/permissão e auditoria.
- **Frontend**: React + Vite (SPA com HashRouter), estado em Zustand, PWA com service worker próprio.
- **Processos** (PM2): `avagym-api` e `avagym-web`.
