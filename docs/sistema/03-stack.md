# Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20 (VPS) / 24 (PC de desenvolvimento) |
| API | HTTP nativo do Node, ES modules; dependências: bcryptjs, jsonwebtoken, pg, web-push |
| Banco | PostgreSQL 16 (driver pg), migrations SQL próprias |
| Frontend | React ^19.2.7, Vite ^8.1.5, react-router, zustand, three/@react-three (mapa 3D) |
| Testes | node:test (API) e Playwright (e2e) |
| E-mail | Resend (API HTTPS); SMTP/nodemailer como alternativa |
| Infra | VPS Linux, PM2, Docker (Postgres), Cloudflare Tunnel |

Dependências do frontend: @capacitor/core, @capacitor/filesystem, @capacitor/local-notifications, @capacitor/share, @fontsource-variable/inter, @fontsource-variable/plus-jakarta-sans, @react-three/drei, @react-three/fiber, react, react-dom, react-router-dom, three, zustand.
