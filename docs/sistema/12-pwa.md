# PWA

- `public/sw.js`: cache de execução com nome que leva o id do build (`__BUILD_ID__` trocado no build); mídia cache-first, resto network-first; `skipWaiting` + `clients.claim`.
- `version.json` com o build; `src/lib/pwa-update.js` confere e recarrega quando há versão nova.
- Manifest com ícones; push via Web Push (VAPID) quando habilitado; notificações com título padrão "AVAGYM".

## Avaliação Postural

- O service worker já ignora `/api/` por completo, então foto e vídeo corporais **nunca** entram em cache.
- `notificationclick` passou a respeitar o destino: `showNotification` leva `data.url` e o clique navega
  para `#<caminho>` (o app usa HashRouter). Antes o clique só focava a janela, então um aviso de devolutiva
  publicada não levava à tela.
- Não há upload em segundo plano no iOS: o envio é de um arquivo por vez, com a fila em IndexedDB
  (`lib/outbox.js`) guardando o arquivo escolhido, e a tela avisa para manter o app aberto.
- A foto é reencodada em canvas no aparelho (1600 px, JPEG): remove EXIF/GPS antes de sair e reduz o
  tamanho. Vídeo não é reencodado.
