# Testes — Grupos e Desafios (V5)

Execução: `node test/setup-e2e.mjs && node test/smoke.mjs` (API), `node test/challenge-rules.test.mjs`, `node test/challenge-score.test.mjs`, `npx vitest run` (frontend).
Último resultado: **441 ok, 0 falhas** no smoke; regras 17/17; pontuação 18/18; vitest 222/222.

| # | Cenário V5 | Onde |
|---|---|---|
| 1 | Aluno não cria desafio oficial | fase10 |
| 2 | Rascunho editável sem justificativa | fase10 |
| 3 | Publicar → inscrições abertas | fase10 |
| 4 | Aparece em Explorar / Criados / Participando / Histórico | fase10 |
| 5 | Mudar regra publicada exige justificativa e cria versão | fase10 |
| 6 | Inscrição duplicada bloqueada | fase10 |
| 7 | Participante não altera estado; transição inválida recusada | fase10 |
| 8 | Só admin suspende; suspenso some; reativa ao estado anterior | fase10 |
| 9 | Início congela regras e ativa inscritos | fase10 |
| 10 | Regra congelada para o organizador; admin corrige com justificativa | fase10 |
| 11 | Sem entrada tardia quando desativada | fase10 |
| 12 | Fim → apuração → concluído | fase10 |
| 13 | Privado: não aparece, convite com código, revogação, validade | fase10 / fase9 |
| 14 | Pedido de aprovação, aprovar/recusar | fase10 |
| 15 | Profissional convida só alunos vinculados | fase10 |
| 16 | Equipe obrigatória e tamanho máximo | fase10 |
| 17 | Limites por categoria: só admin, valores válidos, salvos | fase10 |
| 18 | Fim inclusivo 23:59:59 de Brasília | challenge-rules.test |
| 19 | Não participante não publica no feed do desafio | fase11 |
| 20 | Reenvio com client_id não duplica (enviando/falhou) | fase11 |
| 21 | Rascunho de post invisível aos outros | fase11 |
| 22 | Post do desafio não vaza no feed geral | fase11 |
| 23 | Só organizador fixa | fase11 |
| 24 | Curtir/comentar não pontua | fase11 + challenge-score.test |
| 25 | Silenciar notificações sociais | fase11 |
| 26 | Arquivo falso recusado (assinatura) | fase11 |
| 27 | Sessão anulada / fora do período não pode ser comprovada | fase11 |
| 28 | Mesma sessão não gera 2 comprovantes; arquivo de outra pessoa recusado; hash duplicado recusado | fase11 |
| 29 | Ninguém aprova o próprio; organizador participante → admin | fase11 |
| 30 | Rejeição exige motivo; substituição; recurso único decidido pelo admin | fase11 |
| 31 | Admin invalida aprovado com justificativa | fase11 |
| 32 | Denúncias de post/comprovante/desafio; ocultar; manter; restringir bloqueia publicar | fase11 |
| 33 | Troféu personalizado moderado; nome ofensivo recusado | fase13 |
| 34 | Prêmio: só admin, só oficial, sem dinheiro, sem sorteio | fase13 |
| 35 | Homologação só após concluir; empate sem sorteio; entrega exige registro | fase13 |
| 36 | Auditoria de publicação, suspensão, desclassificação, edição, comprovantes, moderação, prêmios | fase10/11/13 |

Observação: a numeração acima agrupa os cenários pedidos na especificação V5; não foi possível conferir item a item contra a lista original numerada porque ela não está no repositório.
