# Testes — Ranking (V6)

| # | Cenário V6 | Onde |
|---|---|---|
| 1 | 1 contagem por dia | challenge-score.test, fase12 |
| 2 | Dia de Brasília (virada às 03:00 UTC) | challenge-score.test |
| 3 | Anulada/invalidada não conta | challenge-score.test, fase12 |
| 4 | Fora do período não conta; fim inclusivo | challenge-score.test |
| 5 | Mesma sessão não conta duas vezes | challenge-score.test |
| 6 | Comprovante obrigatório: só aprovado | challenge-score.test |
| 7 | Consistência proporcional limitada a 100% | challenge-score.test |
| 8 | Semanas com meta | challenge-score.test |
| 9 | Ordenação e desempate "quem atingiu primeiro" | challenge-score.test |
| 10 | Empate exato divide a posição | challenge-score.test, fase13 |
| 11 | Pódio com menos de 3 / sem zero | challenge-score.test, fase12, Podium.test |
| 12 | Desclassificado sai | challenge-score.test, fase12 |
| 13 | Quem saiu não aparece | challenge-score.test |
| 14 | Privacidade (Participante, sem foto e id) | challenge-score.test, fase12 |
| 15 | Equipes proporcionais, mínimo, contribuições | challenge-score.test |
| 16 | Coletivo com painel, sem pódio | challenge-score.test, fase12 |
| 17 | Fórmula real (sem 100 pts fixos) | challenge-score.test, fase12 |
| 18 | Versão das regras e período guardados | challenge-score.test, fase12 |
| 19 | Minha posição com comprovantes pendentes | fase12 |
| 20 | Entender pontuação explica cada treino | fase12 |
| 21 | Resultado final não muda depois de concluído | fase12 |
| 22 | Ranking sem cargas/peso/saúde | fase12 |
| 23 | Pódio: ordem visual, iniciais, empate, medalhas, acessibilidade | Podium.test (8) |
| 24 | Estados provisório / apuração / final / homologado | fase12, fase13 |
| 25 | 320 px sem rolagem horizontal; reduced-motion | captura `rk.mjs` (overflow=false em 320 e 375); CSS `@media (prefers-reduced-motion)` |

Observação: mesma ressalva de TESTES-DESAFIOS.md sobre a numeração original.
