# PRD — Grupos e Desafios (V5)

## Objetivo
Dar aos alunos e profissionais uma forma saudável de treinar junto: **grupos** permanentes e **desafios** com começo e fim, regras congeladas, validação manual de comprovantes e premiação oficial controlada pelo admin. Nada disso expõe peso, cargas, dados clínicos, relatos de dor, conversas privadas ou prescrições.

## Público e permissões (resumo — detalhes em MATRIZ-PERMISSOES-DESAFIOS.md)
- **Aluno**: cria grupos e desafios amadores; participa; envia comprovantes; publica no feed do desafio.
- **Profissional**: cria desafios públicos ou para alunos **vinculados** (convite direto só a vinculados); não acessa saúde/prescrição por desafios.
- **Admin**: desafios oficiais, limites por categoria, revisores, suspensão, homologação, prêmios e entregas, correções com justificativa.

## Navegação
Comunidade: **Feed | Desafios | Grupos | Profissionais | Ranking**. Desafios: Explorar, Participando, Criados por mim, Convites, Histórico, Criar.

## Escopo entregue
| Área | Entregue |
|---|---|
| Grupos (fase A) | aberto / com aprovação ("moderado") / privado por convite; papéis dono/moderador/membro; convites com validade (padrão 7 dias), usos máximos e revogação; suspensão pelo admin |
| Desafios (fase B) | assistente de 5 etapas que mantém o estado; 4 tipos; 5 métricas; 7/15/30/90 dias ou personalizado; **fim inclusivo (23:59:59 de Brasília)**; limites por categoria editáveis pelo admin (padrão 7–90); estados e transições validados; regras versionadas e congeladas no início |
| Feed e comprovantes (fase C) | feed separado do geral; fixar (até 3); rascunho/enviando/publicado/oculto/removido/falhou; comprovantes manuais ligados a uma sessão real; recurso único; fila do admin; denúncias de post, comentário, usuário, grupo, desafio e comprovante; silenciar notificações sociais |
| Ranking (V6, fase D) | cálculo só no backend; pódio premium; Geral / Minha posição; Entender pontuação; equipes proporcionais; coletivo com painel; resultado final guardado com versão das regras e período |
| Troféus e prêmios (fase E) | catálogo com 7 troféus de sistema + personalizados moderados; concedidos pelo resultado final; prêmios oficiais (só admin, sem dinheiro, sem sorteio), homologação, empates, entregas |

## Fora do escopo / lacunas
Ver RELATORIO-FINAL-DESAFIOS.md (seção "Implementado com lacunas").
