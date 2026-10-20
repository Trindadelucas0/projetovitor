# Regras de classificação (V6)

Implementação: `app/api/challenge-score.js` (`compute`, função pura) — testes em `api/test/challenge-score.test.mjs`. **O frontend nunca calcula a classificação oficial.**

## Elegibilidade de uma sessão
`status='done'`, terminada, **não anulada** (`voided_at`), **não invalidada** (`ranking_invalid_at`), iniciada dentro de `[início, fim]` (fim inclusivo 23:59:59 de Brasília). Com comprovante obrigatório: precisa de comprovante **aprovado** naquele desafio. A mesma sessão nunca conta duas vezes no mesmo desafio; pode contar em desafios diferentes.

## Pontuação por métrica (sem "100 pontos por sessão")
| Métrica | Pontos |
|---|---|
| Sessões válidas | dias (Brasília) com ≥1 sessão elegível — no máximo 1 por dia |
| Dias distintos | idem |
| Consistência % | min(100, dias ÷ sessões previstas × 100), 1 casa decimal |
| Semanas com meta | semanas (blocos de 7 dias desde o início) com ≥ meta semanal |
| Soma coletiva | soma dos dias válidos de todos os membros ativos |

## Ordem e desempate
1. Pontos (maior primeiro).
2. Desempate escolhido no assistente e congelado: **quem atingiu primeiro** (momento em que chegou à meta ou à pontuação final) ou **mais dias distintos**.
3. Se ainda empatar: **mesma posição** (1, 1, 3) e o rótulo "empate". Ordem alfabética só para exibir.

## Quem aparece
Membros **ativos**. Desclassificados saem da classificação (contados à parte). Quem saiu/foi removido não aparece. Privacidade: quem marcou "não mostrar" aparece como **Participante**, sem foto e sem id (a própria pessoa ainda se vê).

## Pódio
Até 3 posições com pontos > 0; empates incluídos; com menos de 3, os lugares ficam vazios.

## Resultado guardado
Ao concluir: `challenge_results` (kind `final`) com `rules_version`, `period_start`, `period_end` e o cálculo completo. Depois de concluído, o ranking vem desse resultado (não muda se sessões forem alteradas). Homologação marca `homologated_at`.
