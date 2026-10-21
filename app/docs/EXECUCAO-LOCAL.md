# Projeto Vitor — execução local

Esta cópia trabalha no Windows em `F:\projetovitor\projetovitor`. Os comandos abaixo iniciam apenas o ambiente local; não publicam na VPS nem executam migrations.

## Requisitos

Node.js e npm compatíveis com `app/api/package.json` e `app/frontend/package.json`, PostgreSQL configurado para a API e dependências instaladas com `npm ci` nas duas pastas. Guarde credenciais somente em `app/api/.env`; não copie segredos para a documentação.

## Iniciar e parar

Na pasta `app`, execute `powershell -ExecutionPolicy Bypass -File scripts/dev-start.ps1 -Root F:\projetovitor\projetovitor`. O script configura API na porta 8787 e Vite em `http://127.0.0.1:5551`; `/api` é encaminhado pelo proxy local. Para parar os processos do script, execute `powershell -ExecutionPolicy Bypass -File scripts/dev-stop.ps1 -Root F:\projetovitor\projetovitor`. O parâmetro `-Root` é obrigatório nesta cópia porque o valor padrão dos scripts ainda aponta para a pasta antiga.

Confira `http://127.0.0.1:5551` e `http://127.0.0.1:8787/api/health`. O login, a cobrança e a avaliação postural dependem de banco e integrações configurados; HTTP 200 sozinho não prova essas jornadas.

## Verificações locais

Em `app/frontend`, `npm test` executa testes unitários e `npm run build` verifica a compilação. Em `app/api`, há testes por módulo nos scripts do `package.json`. Testes de integração que escrevem no banco exigem um banco isolado; nunca aponte rotinas de reset para o banco de uso.

Não execute `node db/migrate.js` no banco local de uso sem reconciliar as migrations pendentes e fazer backup. Em 21/10/2026, apenas a migration 073 foi aplicada pontualmente nesse banco após dump validado; 069–072 continuaram pendentes. A documentação oficial registra esse estado.

## Limites do app móvel

O frontend tem PWA e projetos Capacitor. A existência do shell Android/iOS não comprova que login, sincronização, pagamento e notificações tenham sido testados em aparelho. Faça validação específica antes de distribuir.
