# PWA

- `public/sw.js`: cache de execução com nome que leva o id do build (`__BUILD_ID__` trocado no build); mídia cache-first, resto network-first; `skipWaiting` + `clients.claim`.
- `version.json` com o build; `src/lib/pwa-update.js` confere e recarrega quando há versão nova.
- Manifest com ícones; push via Web Push (VAPID) quando habilitado; notificações com título padrão "AVAGYM".
