# Relatório final — V5 (Grupos e Desafios) e V6 (Ranking premium)

Data: 14/10/2026. Commits locais apenas (sem push, sem deploy). Backups antes de cada migração 012–017.

## Implementado e testado
- Grupos (013): privacidade aberto / com aprovação / privado por convite, papéis, convites (7 dias padrão), suspensão.
- Desafios (014): assistente de 5 etapas com estado persistente; 4 tipos; 5 métricas; durações; **fim inclusivo 23:59:59 Brasília**; **limites por categoria editáveis pelo admin** (padrão 7–90); estados/transições validados; regras versionadas e congeladas; inscrições, convites, equipes; permissões aluno/profissional/admin.
- Feed do desafio e comprovantes (015): feed separado, fixar, estados de post, curtidas/comentários sem pontuar; comprovantes manuais ligados a sessão real, integridade (assinatura, tamanho, sha256, dono do arquivo), ninguém aprova o próprio, encaminhamento ao admin, substituição, recurso único, invalidação; revisores de oficiais; denúncias de post/comentário/usuário/grupo/desafio/comprovante com manter/corrigir/ocultar/remover/restringir auditados; silenciar notificações sociais.
- Ranking V6 (016): cálculo no backend, resultado final guardado com versão das regras e período, pódio premium, Geral/Minha posição, Entender pontuação, equipes proporcionais, coletivo, privacidade, desclassificados, 320 px.
- Troféus e prêmios (017): catálogo (7 de sistema + personalizados moderados), concessão pelo resultado final, vitrine no perfil; prêmios oficiais só admin, sem dinheiro/sorteio, homologação, empates sem sorteio, recálculo só antes de homologar, entregas registradas; painéis admin (KPIs, oficiais, prêmios, vencedores, entregas, comprovantes pendentes, revisores, troféus em moderação, limites) e visão geral do criador.

## Fechado nesta rodada
- Vídeo de comprovante/feed até 50 MB por rota dedicada em streaming (`POST /api/challenges/media/stream`), com validação de tipo (mp4/webm/png/jpeg/webp), tamanho, assinatura do arquivo e sha256; limite JSON global mantido (rota JSON segue com 3,5 MB).
- Notificação "meta atingida" (`desafio.meta`, link para o ranking), uma vez por pessoa por desafio.
- Botões "Denunciar" para usuário (ficha no ranking e membros do grupo) e para grupo.
- Assistente carrega os troféus já escolhidos ao editar um desafio.
- Conjunto manual de capturas (88 telas) com dados de demonstração temporários, já removidos.

## Implementado com lacunas
- Exclusão LGPD no painel admin ainda usa prompt() do navegador (a exclusão de conta usa o diálogo "digite EXCLUIR").
- Capa do desafio por link https (sem upload próprio de capa).
- Estados "enviando/falhou" de post existem na tela e no banco, mas não há fila offline persistente.
- Política de retenção documentada, sem rotina automática de expurgo de mídias.
- "Campanhas" do admin = desafios oficiais (sem entidade separada).
- Numeração dos 36 testes V5 e 25 V6 agrupada por cenário; sem a lista original numerada no repositório para conferência 1-a-1.

## Não iniciado
- Conjunto manual de capturas (manual-shots) com contas demo — próxima etapa.

## Bloqueado
- Nada.

## Decisões necessárias
- Limite de vídeo maior exigiria upload em partes ou aumentar o limite do corpo (hoje 5 MB).
- Critério do troféu "Consistência" fixado em ≥ 70% dos dias previstos — confirmar.
- Empate em prêmio: hoje o admin confirma "todos os empatados recebem" (ajusta a quantidade). Alternativa seria exigir mudança manual da quantidade.

## Arquivos principais
API: `challenge-rules.js`, `challenges.js`, `challenge-feed.js`, `challenge-score.js`, `prizes.js`, `groups.js`, `community.js` (denúncias), `pro.js` (silenciar), `server.js`; migrações 013–017 + `db/down/013–017`; testes `test/smoke-fase9…13.mjs`, `test/challenge-rules.test.mjs`, `test/challenge-score.test.mjs`.
Frontend: `lib/challenges.js`, `lib/groups.js`, `views/app/Desafios.jsx`, `DesafioFeed.jsx`, `DesafioRanking.jsx`, `Trofeus.jsx`, `Grupos.jsx`, `components/Podium.jsx` + `podium.css` + `Podium.test.jsx`, `views/admin/AdminApp.jsx`, `views/guided/Profile.jsx`, `guided.css`.

## Evidência de testes
- Smoke API: **441 ok, 0 falhas** (fases 2–13).
- `challenge-rules.test.mjs` 17/17 · `challenge-score.test.mjs` 18/18 · vitest **222/222** · build ok.
- Capturas: `/workspace/desafios/` (assistente 375 px), `/workspace/ranking/` (ranking oficial homologado, pessoa, minha posição, entender pontuação, feed, comprovantes em 375 e 320 px; admin 1440 px) — sem rolagem horizontal em 320/375.
