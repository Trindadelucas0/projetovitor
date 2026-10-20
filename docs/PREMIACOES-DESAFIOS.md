# Premiações oficiais

- **Só admin, só em desafios oficiais.** Campos: nome, descrição, imagem, quantidade, critério (1º, 2º, 3º, top 3, meta atingida, equipe vencedora), elegibilidade, disponibilidade, responsável, prazo de entrega, logística, regras, status.
- **Proibido**: dinheiro/Pix/"R$" e sorteio/rifa/aposta (validação `prizeProblems`).
- Fluxo (`PRIZE_FLOW`): `configurado → publicado → aguardando_resultado (início) → aguardando_homologacao (fim) → vencedor_homologado → entrega_pendente → entregue`; `cancelado` com justificativa em qualquer passo antes de entregue. Cancelar o desafio cancela os prêmios.
- **Homologação** (`POST /api/adm/challenges/homologate`): só com o desafio concluído e resultado final guardado; avisa se há comprovantes pendentes; aplica os critérios sobre o resultado final.
- **Empates sem sorteio**: se há mais empatados que unidades, a homologação para e o admin precisa confirmar que **todos os empatados recebem** (a quantidade é ajustada e auditada) ou mudar a quantidade antes.
- **Correção**: antes de homologar, o admin pode recalcular o resultado com justificativa (novo resultado final, auditado). Depois de homologado, **não pode ser alterado**.
- **Entrega**: só com prêmio em `entrega_pendente`; cada vencedor exige registro de como foi entregue; quando todos recebem, o prêmio vira `entregue`. Vencedores são notificados na homologação e na entrega.
- Visão pública (`GET /api/challenges/prizes`): só prêmios publicados em diante, com estado público Provisório / Em apuração / Homologado / Prêmio pendente / Entregue.
