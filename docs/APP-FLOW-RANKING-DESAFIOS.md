# Fluxo — Ranking do desafio

1. Página do desafio → aba **Ranking** (competições) ou **Progresso** (metas e coletivo). Deep link `?aba=ranking`.
2. O app chama `GET /api/challenges/ranking?id=&page=`; **o servidor calcula** (ou lê o resultado final guardado) e devolve estado, modo, fórmula, versão das regras, período, pódio, página da lista, equipes, coletivo e "eu".
3. Estados exibidos: Ainda não começou · Provisório (em andamento) · Em apuração · Resultado final · Homologado · Cancelado.
4. Tocar numa pessoa/equipe abre uma folha só com dados públicos do desafio (posição, pontos, dias válidos, meta atingida; contribuições da equipe).
5. **Minha posição** → **Entender pontuação** (`GET /api/challenges/score`), que só mostra os treinos do próprio usuário.
6. Ao concluir: resultado final guardado → troféus → notificação "Resultado disponível". Oficial: homologação → prêmios.
