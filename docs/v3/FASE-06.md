# Fase 6 — Onboarding, aluno gratuito e ativar perfil profissional

Base: PRD SaaS §3 (A3 Onboarding, A5 Início, A6 Treinos, A8 Concluído) e §4, Manual v2 (6.x), trecho do App Flow V3
colado pelo Lucas (Fluxos 01, 02 e 03) e decisões de 15/10/2026. O texto literal do App Flow V3 continua indisponível.

## Fluxo 01 — cadastro
- Tela de criar conta com a escolha **Quero treinar** / **Sou profissional** (já existia na F2; mantida).
- Conta nasce ativa (F5). "Quero treinar" → onboarding de treino com saudação "Bem-vindo(a), Nome!" no 1º passo e a
  opção **"Agora não — quero conhecer o app primeiro"** (não força o questionário; o Início mostra os caminhos).
- "Sou profissional" → mesma identidade com aluno + profissional, abre na área profissional com verificação pendente.

## Fluxo 02 — aluno gratuito
- **Início** sem programa ativo: barra **Retomar treino** (treino guiado, ficha ou treino livre em andamento; se
  concluído e não salvo, leva ao resumo para salvar) + destaque da **ficha do profissional** (quando houver) ou
  "Como você quer treinar?" com caminhos: recomendação/programas para mim, Minhas rotinas ou Criar meu treino, Treino rápido.
  Com programa ativo, o Início segue como antes (Treino de hoje + COMEÇAR/CONTINUAR TREINO).
- **Meus treinos** (`/treinos`) dividido em abas **Minhas rotinas · Programas guiados · Dos meus profissionais**
  (contadores; aba inicial = o que o aluno tem pronto: fichas → programa ativo → rotinas → programas; `?aba=` na URL).
  - Minhas rotinas: lista com Iniciar e editar; vazio com caminhos; "Semana e agenda".
  - Programas guiados: programa ativo com começar/continuar; Meu programa, Recomendados, Todos, Refazer perguntas.
  - Dos meus profissionais: fichas ativas (botão por dia); sem profissional → código de aluno + campo "Tenho um código de convite".
- **Criar meu treino** (sheet): Montar do zero · Receber uma recomendação · Seguir um programa guiado ·
  Começar com um plano pronto (só sem rotinas) · Treino rápido. **Sem opção de duplicar.**
- **Concluir treino**: resumo existente mantido (tempo total/ativo/pausado, séries, volume, por exercício,
  "Como você se sentiu?", "Sentiu dor?", próxima vez, SALVAR TREINO).

## Fluxo 03 — ativar perfil profissional
- Perfil → "Usar a conta como" → **Ativar perfil profissional**: sheet com os 3 passos (conselho CREF/CREFITO…, número
  e UF → documento → análise: Em análise → Verificado). Ao ativar, abre a Verificação; o aluno continua treinando.
- Status do cadastro profissional com link "Acompanhar verificação" / "Ver registro".

## Removido — pedido de vínculo via administração
- `POST /api/pro/requests` com `type=vinculo` → **410 FLOW_REMOVED** ("use AVADESK PRO › Convites").
- `POST /api/adm/requests/decide` em pedido de vínculo → 410. Código de aprovação de vínculo removido.
- Portal PRO: "Solicitar novo vínculo" virou **Convidar aluno** (abre Convites); formulário só de vagas.
- Admin › Central de solicitações: filtro "Vínculos" removido; pedidos antigos aparecem como "Vínculo (fluxo antigo)", sem ações.
- Migração `022_fim_pedido_vinculo_admin.sql`: cancela pedidos de vínculo abertos com nota no histórico e auditoria. Nada é apagado.

## Arquivos
- Novos: `frontend/src/lib/start.js` (+ `start.test.js`), `views/v3/StartHub.jsx`, `api/test/v3-fase6.mjs`,
  `api/db/migrations/022_fim_pedido_vinculo_admin.sql`, `api/db/down/022_down.sql`
- Alterados: `views/app/Treinos.jsx` (reescrito), `views/guided/Today.jsx`, `views/guided/Onboarding.jsx`,
  `views/v3/ContextSwitch.jsx`, `views/pro/Portal.jsx`, `views/admin/AdminApp.jsx`, `views/guided/guided.css`,
  `api/portal.js`, `api/test/smoke-fase4.mjs`

## Testes
- `v3-fase6` 23/23 (cadastro por intenção, onboarding pendente, ativar profissional + CREFITO + documento + aprovação
  do admin, autoaprovação negada, aluno aceita convite e vê fichas, fluxo de vínculo removido 410, vagas segue, histórico).
- vitest 226/226 (4 novos: aba inicial, aba válida, tempo decorrido, destino do retomar).
- Regressão: v3-fase5 35/35, v3-fase4 36/36, v3-fase3 27/27, v3-fase2 34/34, smoke 448 ok + 1 falha pré-existente
  (ranking "pontos por dia"); `vite build` ok. Módulos das telas novas servidos pelo Vite em execução (200).

## Rollback
`022_down.sql` → `git revert`. Backup: `backups/avagym_20261015_111307_antes_v3_fase06.dump`.

## Não definido / decisão pendente
- Texto literal do App Flow V3 (Fluxos 01–03) não está no repositório; telas seguem PRD/Manual + trecho colado.
- "Agora não" no onboarding guarda a escolha no aparelho (localStorage); PRD não define se deve ser por conta.
- Minhas rotinas usam o armazenamento do treino livre (sincronizado pelo app existente), não uma tabela nova.
- Encerrar vínculo pelo próprio aluno, convite por e-mail/WhatsApp: continuam pendentes.
