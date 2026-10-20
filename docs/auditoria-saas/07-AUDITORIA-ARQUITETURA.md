# Auditoria de arquitetura, desempenho e operação

## Arquitetura atual

Frontend React/PWA → API Node → PostgreSQL. Regras críticas ficam no servidor e há transações em operações sensíveis. E-mail, cobrança, notificações e tarefas recorrentes possuem módulos separados. As 56 migrations aplicaram em banco novo e os seeds produziram catálogo utilizável.

## Desempenho

- Build principal: JavaScript ~1,97 MB bruto / 431,79 kB gzip.
- Chunk Body3D: ~950 kB bruto / 256,14 kB gzip.
- CSS: ~146 kB bruto / 29,99 kB gzip.
- Vite alertou chunks acima de 500 kB e importação dinâmica ineficaz.

O produto compila, porém o custo inicial é alto para uma experiência mobile. Não foi obtida uma medição Lighthouse/Core Web Vitals comparável em produção; portanto não há nota de performance artificial neste relatório.

## Operação

| Tema | Estado |
|---|---|
| migrations em banco vazio | confirmado |
| build reproduzível | confirmado |
| health público | confirmado |
| backup e restauração completos | documentado, não executado |
| rollback de aplicação | documentado, não executado |
| observabilidade/alertas | parcial |
| concorrência crítica | não verificada sob carga |
| Capacitor | standalone local, sem backend; não equivale ao SaaS sincronizado |

Antes do lançamento: dividir carregamento do Body3D, estabelecer orçamento de bundle, ensaiar restore, monitorar fila/webhooks e testar idempotência/concorrência de assinatura, ranking, sessão única e última vaga.

