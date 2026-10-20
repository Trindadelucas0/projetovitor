# AVAGYM V4.1 — Análise de UX/UI, reorganização e melhorias

Data: 15/10/2026 · Branch `v4` · Prints (390×844, @2x) em `evidencias-v41/antes/` e `evidencias-v41/depois/`
(gerados por `app/frontend/e2e/ux-v41.spec.js`, `UX=1`, apenas contas de teste locais — nenhuma conta real).

## 1. Referências usadas (e como cada uma justifica as mudanças)

| Sigla | Referência | Onde aplicamos |
|---|---|---|
| NN#1…#10 | Nielsen, *10 Usability Heuristics* — https://www.nngroup.com/articles/ten-usability-heuristics/ | #1 visibilidade do status (cronômetro grande da série, selo "Treino ativo", contador no sino); #3 controle e liberdade (desvincular, reiniciar cronômetro, "registrar sem cronômetro"); #4 consistência (mesmo cabeçalho com sino no aluno e no profissional); #5 prevenção de erros (confirmações antes de desvincular; backend recusa estados inválidos); #8 estética minimalista (avisos saem do corpo da home; atalhos duplicados removidos) |
| WCAG 2.2 | W3C WCAG 2.2 AA — https://www.w3.org/TR/WCAG22/ | 1.4.3 contraste (tema claro com verde-escuro #3d5f00 p/ texto e limão p/ superfícies; axe sem violações sérias); 1.4.4/1.4.10 redimensionar/reflow (sem rolagem horizontal 320–430 px, já testado); 2.4.7 e 2.4.11 foco visível/não encoberto (`:focus-visible` com contorno de 3 px); 2.5.8 tamanho do alvo (mín. 24 px; adotamos 44 px em todos os botões/links de ação); 4.1.2 nome/função/valor (`role=timer`, `role=radiogroup` no tema, `aria-label` no sino com contagem) |
| HIG | Apple Human Interface Guidelines — Layout, Buttons, Dark Mode — https://developer.apple.com/design/human-interface-guidelines/ | alvos ≥ 44×44 pt; tema claro/escuro seguindo o sistema ("Automático"); campos com 16 px para o Safari não aplicar zoom ao focar |
| M3 | Material Design 3 — Top app bar, Badges, Navigation bar — https://m3.material.io/ | ações globais (notificações) no topo direito com *badge* numérico; navegação inferior de 5 destinos mantida; um botão primário por tela |
| Fitness | Padrões de apps de treino (Strong, Hevy, Nike Training Club, Apple Fitness) | fluxo "Iniciar série → cronômetro grande → Concluir → descanso com contagem regressiva → próxima série"; "Minha semana" (anel + dias) no topo da home; um plano ativo por vez com troca explícita |
| PWA | web.dev — *Service worker lifecycle* / *Handling updates* — https://web.dev/articles/service-worker-lifecycle | `skipWaiting` + `clients.claim`, `registration.update()` periódico e ao voltar ao foco, `index.html`/`sw.js` sem cache, recarga em momento seguro |

## 2. Achados por tela (antes → depois)

### Aluno
| Tela | Problema (antes) | Mudança aplicada (depois) | Ref. |
|---|---|---|---|
| **Treinar** (`/treinar`) | Cronômetro da série escondido em texto pequeno ("Série em andamento · 1:18"); a série começava sozinha ao fim do descanso; "Concluir série" era a única ação | Botão grande **INICIAR SÉRIE N** → painel grande com cronômetro da série (`role=timer`, meta de reps/carga ou barra p/ exercícios por tempo) e **CONCLUIR SÉRIE** → descanso (já existente) com **"Iniciar próxima série agora"** e "Pular descanso". "Já fiz — registrar sem cronômetro" e "Reiniciar cronômetro" como links de 44 px. Mídia encolhe enquanto a série roda para o cronômetro caber sem rolar. Pausa, recuperação e eventos mantidos; novo evento `set_start` aceito pela máquina de estados (servidor e app). | NN#1, NN#3, Fitness |
| **Início** (`/hoje`) | "Sua semana" no meio da página; avisos como cartão no corpo; atalhos duplicados (Acompanhamento aparecia 2×; Comunidade já é aba) | Ordem nova: cabeçalho (data, saudação, sequência, **sino com contador**) → **Minha semana** → treino ativo (selo "Treino ativo · sistema/profissional") + COMEÇAR/CONTINUAR → "O que vem hoje" → atalhos → ranking → corpo. Cartão de avisos e lista duplicada saíram da home (os destinos continuam acessíveis pelos atalhos/abas). | NN#8, M3, Fitness |
| **Notificações** (`/avisos`) | Título "Avisos", entrada só pelo perfil/home | Renomeada para **Notificações**, aberta pelo sino (aluno e profissional); perfil mantém atalho | M3 badges, NN#4 |
| **Treinos** (`/treinos`) | Não ficava claro qual treino estava valendo; ficha do profissional e programa do sistema podiam coexistir | Cartão **Treino ativo** no topo com a regra explicada e a ação certa (desvincular programa / aviso de ficha travada). Programas avulsos ficam só consulta quando há ficha do profissional. Botões das fichas mudam conforme o estado ("Começar este treino" / "Desvincular programa e aceitar" / desabilitado). | NN#1, NN#5 |
| **Meu programa** | "Trocar programa" e "Abandonar" sem relação com a regra de 1 ficha | "Trocar programa (desvincula o atual)" e "Desvincular programa", com confirmação explicando que vai para o histórico | NN#3, NN#5 |
| **Programas / Recomendados / Detalhe** | Aluno de professor podia iniciar programa avulso | Aviso "Você treina com a ficha de …" e botão de início bloqueado (também no backend: `COACH_LOCKED`) | NN#5 |
| **Progresso** | Itens "treino livre" visíveis | Renomeados para "registros antigos / somente consulta" (dados intactos) | V4 |
| **Perfil** | Ordem sem lógica (troféus e respostas antes da conta; tema enterrado em "Preferências") | Ordem: **Aparência** (Automático/Claro/Escuro) → Treino (respostas, treino ativo, 3D, biblioteca) → Conta (Notificações, acompanhamento, plano, áreas) → contexto/convites → troféus → Meus dados → Segurança → Avançado → Sair | NN#8, HIG Settings |
| Global | Zoom estranho no iOS; fontes/espaçamentos largos para 375–430 px | viewport `maximum-scale=1` (o iOS ainda permite pinça; só impede o zoom automático), **todos os campos 16 px**, escala de títulos com `clamp()`, paddings 16 px, botões 52/60 px (antes 56/72), anel da semana 112 px, `text-size-adjust`, `prefers-reduced-motion` | HIG, WCAG 1.4.4 |
| Global | Só tema escuro | **Tema claro** completo (aluno, profissional, admin, telas herdadas), preferência em `users.theme_pref` (Postgres), padrão **Automático** (segue o sistema) | HIG Dark Mode, WCAG 1.4.3 |

### Profissional
| Tela | Problema | Mudança |
|---|---|---|
| Painel PRO | Sem acesso rápido a notificações; atalhos fora da ordem de uso | Cabeçalho com **sino**; atalhos reordenados: Painel → Meus treinos → Convites → Limite → Verificação → Perfil (NN#4, M3) |
| Perfil | Tema inexistente | Aparência no Perfil (mesmo componente) |

### Admin
| Tela | Problema | Mudança |
|---|---|---|
| Dashboard (celular) | KPIs em 1 coluna → página enorme | KPIs em **2 colunas** abaixo de 600 px |
| Geral | Só escuro | Tema claro aplicado à barra lateral, gaveta, tabelas e pílulas |

## 3. Regras de negócio implementadas nesta versão

**Um treino ativo / uma ficha por vez** (`app/api/active-training.js`, migration `031_tema_treino_ativo.sql` + `db/down/031_down.sql`):
1. Só UMA ficha por vez: com programa do sistema ativo, `POST /api/guided/start` de outro programa → `409 MUST_DETACH`.
2. O aluno pode **desvincular** o programa do sistema (`POST /api/active-training/detach`): `user_programs.status='abandoned'`, `end_reason='desvinculado pelo aluno'` + linha em `student_active_training_history`. Nada é apagado.
3. Ficha do profissional que chega com programa ativo fica **aguardando**; para aceitar (`POST /api/active-training`), precisa desvincular antes (`409 MUST_DETACH`). Sem programa do sistema, a ficha é o treino ativo.
4. Aluno com ficha do profissional **não escolhe programa avulso** (`409 COACH_LOCKED`) e **não desvincula a ficha** (`403 PRO_DETACH_ONLY`) — **decisão confirmada pelo Lucas**: só o personal retira a ficha (chave `STUDENT_CAN_DETACH_PRO=false`).
5. `POST /api/guided/sessions/start` só aceita o treino ativo (`409 NOT_ACTIVE_TRAINING`).

**Treino livre**: o botão "Treino livre" do motor antigo (`views/Workout.jsx`) ficou atrás de `SHOW_FREESTYLE=false`; textos "treino livre" viraram "registros antigos". Dados e rotas antigas preservados.

**Exportar dados — REMOVIDO** (exceção pontual autorizada explicitamente pelo Lucas): saiu do Perfil ("Exportar meus dados"), de Preferências ("Export backup (JSON)"), a função `exportMyData` do app e o endpoint `GET /api/me/export` (agora 404). Nenhum dado do banco foi apagado; o código anterior está no git (`f05b4cc`) e no tgz de backup pré-deploy. O antigo "exportar arquivo de plano" das rotinas legadas ficou só escondido (`lib/features.js`). O "Exportar CSV" das tabelas do admin foi mantido (ferramenta administrativa, não exportação de dados do usuário).

## 4. Auto-atualização do PWA
- `sw.js`: nome do cache leva o id do build (`avagym-rt-v41-<build>`) → cada deploy muda os bytes do SW; `skipWaiting` + `clients.claim`; navegação e `version.json` sempre da rede (`cache: no-store`).
- `vite.config.js`: gera `dist/version.json` (`{ build, at }`) e injeta `__BUILD_ID__` no bundle.
- `lib/pwa-update.js`: registro com `updateViaCache:'none'`, `registration.update()` a cada 20 min, ao voltar ao foco e ao reconectar; compara `version.json` com o build carregado; no `controllerchange` recarrega **só fora do treino** — em `/treinar`/`/concluido` ou com sessão aberta mostra "Nova versão disponível — atualiza ao terminar o treino." e recarrega quando o treino termina. Proteção contra laço de recarga.
- Gateway: `index.html`, `sw.js`, `version.json`, `manifest.json` com `Cache-Control: no-cache, no-store, must-revalidate`; `/assets/*` (hash) continua `immutable`. No deploy, os assets do build anterior são mantidos em `dist/assets` para quem ainda está com a versão antiga aberta (sem 404 de chunk no meio do treino).
- Teste: `src/lib/v41.test.js` (regra "não recarregar durante o treino") + verificação em produção de `version.json`, cabeçalhos e nome do cache no `sw.js`.

## 5. Propostas maiores (não aplicadas — precisam de decisão)
1. **Admin mobile**: transformar o menu lateral em navegação inferior com 4–5 seções principais (hoje: hambúrguer). Grande, mexe em todas as telas do admin.
2. **Profissional**: unificar "Meus alunos" + "Atendimentos" em uma caixa de entrada por aluno (pendências primeiro).
3. **Treinar**: modo paisagem/tela cheia com cronômetro gigante e controle por voz/fone; tela bloqueada com Live Activity (exige app nativo).
4. **Home**: personalizar a ordem dos blocos (arrastar) e esconder Ranking para quem não participa.
5. **Comunidade**: filtros fixos no topo (Seguindo / Profissionais / Desafios) em vez de rolagem longa.
6. **Notificações**: agrupar por tipo e marcar como lida ao abrir; configurações de push por categoria.

## 6. Perguntas abertas
1. Aluno **vinculado a professor mas ainda sem ficha**: deve ficar bloqueado para programas do sistema já? (Implementado: o bloqueio começa quando existe ficha ativa.)
2. Profissional que envia **mais de uma ficha** ao mesmo aluno: a mais recente vira a ativa automaticamente? (Implementado: vale a escolhida pelo aluno ou, sem escolha, a mais recente; as demais aparecem como não iniciáveis.)
3. Com a exportação removida, como atender pedidos de **portabilidade (LGPD art. 18, V)**? Sugestão: atendimento manual pelo admin.

## 7. Prints sugeridos (antes → depois)
- Treino: `antes/aluno-treinar-1.png` → `depois/aluno-treinar-1.png` (Iniciar série) e `depois/aluno-treinar-2-serie.png` (cronômetro grande)
- Descanso: `depois/aluno-treinar-3-descanso.png`
- Início: `antes/aluno-inicio.png` → `depois/aluno-inicio.png`
- Tema claro: `depois/aluno-claro-inicio.png`, `depois/aluno-claro-treinar-2-serie.png`
- Treinos/treino ativo: `depois/aluno-treinos.png`; Admin 2 colunas: `depois/admin-painel.png`
