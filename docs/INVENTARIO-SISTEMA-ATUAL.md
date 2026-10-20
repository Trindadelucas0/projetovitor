# Inventário do sistema atual: AVADESK Fitness

Data: 14/10/2026 · Branch feat/avadesk-fitness · Só local.

| Funcionalidade atual | Mudança | Impacto | Teste de regressão |
|---|---|---|---|
| Login com passkey (WebAuthn) + blob `/api/data` | Removido (rotas, dependência @simplewebauthn e telas) | Usuários antigos de passkey precisam ser recadastrados | smoke.mjs (404) |
| Login com e-mail e senha (JWT) | Contas pendentes, carga de perfil e permissões, recuperação de senha | Novos usuários ficam bloqueados até a liberação | smoke.mjs, smoke-fase2.mjs |
| Modo visitante (local) | Mantido e separado | Nenhum | manual: "Usar sem conta" |
| Programa guiado (onboarding, recomendação, Meu Programa, Hoje, Começar treino) | Movido para Treinos e para o card do Início | Navegação | vitest + screenshots |
| Body3D / MuscleMap / músculos trabalhados | Disponíveis em Progresso e no treino | Nenhum | screenshots |
| Telas OpenGym (Plan, Stats, History, Library, Home, Settings, Workout) | Restilizadas no sistema grafite/limão (CSS), tema escuro fixo | Estrutura original mantida | shots/final |
| Navegação (Programas + botão central Treinar) | 5 abas: Início, Treinos, Comunidade, Progresso, Perfil | Rotas antigas continuam acessíveis por link | screenshots |
| 11 idiomas | Seletor reduzido a pt e en | Outros idiomas ficam ocultos (arquivos mantidos) | vitest i18n |
| `session_pain_reports` (só registro) | Ocorrências com bloqueio do exercício e retomada explícita | Treino bloqueia o exercício após relato de dor | smoke.mjs |
| `coach_students` (vínculo livre) | Vínculo com 7 validações, histórico e encerramento | Vínculos antigos migrados como ativos | smoke.mjs |
| Admin legado `/api/admin/*` | Removido; funções incorporadas em `/api/adm/live` e `/api/adm/users/workouts`; /admin redireciona para /admin/painel | Nenhum | smoke.mjs (404 + admin legado incorporado) |
| Sessões guiadas | Guardam prescribed_count e pro_plan_id, usados no ranking | Sessões antigas não pontuam no %, só contam como válidas | ranking.test.mjs |
| — (novo) | Comunidade, moderação, ranking, avisos, mensagens, painel do profissional | — | smoke-fase2.mjs |
| Worker Cloudflare (`worker/`) | Removido do repositório | Nenhum em produção local | smoke.mjs |
| — (novo) | Termos versionados, LGPD (exportar/excluir via fila), mídia dos exercícios, contas PRO separadas | Cadastro exige aceite | smoke.mjs, smoke-fase3.mjs |
| — (novo) | Portal AVADESK PRO, assistente de treino, solicitações ao admin, modelos, painel admin desktop | Profissional deixa de criar vínculos | smoke-fase4.mjs |
| Configurações: tema claro/escuro e cor de destaque | Removidos; identidade fixa grafite/limão | Preferência antiga ignorada | screenshots |
