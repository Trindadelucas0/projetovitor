# Regras de negócio — Desafios

Fonte de verdade no código: `app/api/challenge-rules.js` (testado em `api/test/challenge-rules.test.mjs`).

## Datas e fuso
- Fuso único: **America/Sao_Paulo (UTC-3)**. Início às 00:00 do dia escolhido (ou "imediato" ao publicar).
- **Fim inclusivo**: o desafio vai até **23:59:59,999 do dia final** (`spEndOfDay`). Um desafio de 30 dias que começa em 15/10 termina em 13/11 às 23:59.
- Duração = dias corridos entre início e fim; precisa respeitar o mínimo/máximo da categoria (padrão 7–90, editável em Admin › Desafios › Limites por categoria; valores de 1 a 365, mínimo ≤ máximo). Alterar limites vale para novos desafios e edições; publicados mantêm as regras congeladas.
- O início não pode estar no passado (tolerância de 5 min).

## Tipos × métricas
| Tipo | Métricas permitidas | Classificação |
|---|---|---|
| Meta individual | sessões, dias distintos, consistência %, semanas com meta | progresso individual (sem pódio) |
| Meta coletiva | soma coletiva (obrigatória) | painel de progresso do grupo |
| Competição individual | sessões, dias distintos, consistência, semanas | pódio + lista |
| Competição por equipes | idem | pódio de equipes (média proporcional) |

Meta semanal entre 1 e 7 (sem incentivar excesso). Consistência exige "sessões previstas".

## Estados do desafio
`rascunho → publicado → inscricoes_abertas → agendado → em_andamento → apurando → concluido`, além de `cancelado` e `suspenso`.
- Relógio: no início vai para **em_andamento** (congela as regras e ativa os aprovados); no fim vai para **apurando**.
- Manual (organizador): encerrar inscrições (agendado), concluir (só a partir de apurando), cancelar (motivo ≥ 5).
- Admin: suspender e reativar (volta ao estado anterior), sempre com motivo.

## Estados de inscrição
`convidado, solicitado, aprovado, rejeitado, ativo, saiu, removido, desclassificado` — transições em `MEM_FLOW`. Remover/desclassificar exige motivo e é auditado.

## Regras versionadas
Publicar grava a versão 1. Alterar regra publicada exige justificativa e cria nova versão (participantes avisados). Depois do início, campos de pontuação só mudam pelo admin, com justificativa.

## Contagem (ver REGRAS-CLASSIFICACAO.md)
Só sessões concluídas, não anuladas, não invalidadas, dentro do período; 1 contagem por dia (Brasília); com comprovante obrigatório, só treinos com comprovante **aprovado**; pendente nunca conta; uma sessão conta uma vez por desafio (pode contar em vários desafios).

## Comprovantes (ver AUDITORIA-COMPROVANTES.md)
Manual, sem IA; ninguém revisa o próprio; sem auto-aprovação; arquivo verificado (assinatura, tamanho, hash duplicado).

## Prêmios (ver PREMIACOES-DESAFIOS.md)
Só admin, só desafios oficiais, sem dinheiro, sem sorteio; entrega só com resultado homologado.
