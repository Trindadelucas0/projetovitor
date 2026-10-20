# Fluxo do app — Desafios

1. **Descobrir**: Comunidade › Desafios › Explorar (nunca lista privados, suspensos ou rascunhos) → página do desafio.
2. **Criar**: Desafios › Criar → 5 etapas (Identidade · Tipo e duração · Público · Comprovação e troféus · Revisão) → Salvar rascunho ou Publicar. Estado guardado em `sessionStorage` (sobrevive a recarregar).
3. **Publicar**: validações do servidor (`wizardProblems`); vira *Inscrições abertas* (ou *Em andamento* se imediato).
4. **Entrar**: aberto → inscrito; com aprovação → pedido → organizador aprova/recusa; privado → só com convite (link/código, validade, usos, revogação) ou convite direto (profissional → alunos vinculados).
5. **Durante**: feed do desafio; comprovantes (escolhe o treino elegível + foto/vídeo → revisão humana); ranking/progresso provisório.
6. **Fim**: relógio → *Em apuração* (comprovantes ainda podem ser revisados) → organizador/admin **Conclui** → resultado final guardado (versão das regras + período) → troféus concedidos → notificações.
7. **Oficial**: admin **homologa** → vencedores dos prêmios → entrega pendente → entregue (com registro).
8. **Moderação**: qualquer pessoa denuncia post, comentário, comprovante, desafio, grupo ou usuário → Admin › Moderação decide manter/corrigir/ocultar/remover/restringir (auditado).
Deep links das notificações: `/desafio/:id?aba=feed|comprovantes|ranking`.
