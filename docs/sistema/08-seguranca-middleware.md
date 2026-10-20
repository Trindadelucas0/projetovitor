# Segurança e middleware

Ordem no `server.js`: (1) checagem de Origem/CSRF para métodos de escrita — sem Origin/Referer ou de origem fora de `ORIGIN`/`CSRF_ALLOWED_ORIGINS` = 403 `CSRF_ORIGIN` (exceções: webhook de cobrança e Bearer); (2) rate limit (login, cadastro, denúncias etc.; não confia em X-Forwarded-For forjado); (3) roteamento; (4) autenticação/autorização; (5) auditoria.

- Cabeçalhos da API e do gateway: CSP (`frame-ancestors 'none'`, `script-src 'self' 'wasm-unsafe-eval'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP, HSTS.
- HTTP -> HTTPS: 301 no gateway (X-Forwarded-Proto).
- Uploads: tipo real verificado, SVG/HTML recusados, limite de tamanho; nomes de mídia sem path traversal.
- URLs com caracteres de controle = 400. `/api/health` público só `{ok:true}`.
