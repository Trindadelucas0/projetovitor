# AVAGYM — Plano dos Guided Tours (V4.3)

> Pedido do Lucas: "bem planejado, bem detalhado, bem feito, com UX/UI bem definida". Este documento vem antes do código. A implementação segue exatamente o que está aqui.

## 1. Referências e o que tiramos de cada uma
| Referência | Princípio aplicado no AVAGYM |
|---|---|
| NN/g — *Onboarding Tutorials vs. Contextual Help* (nngroup.com/articles/onboarding-tutorials) | Um tutorial longo logo de cara é esquecido. O tour de boas-vindas fica **curto (≤5 passos)** e o resto vira **tour por tela, na 1ª vez que a pessoa abre a tela** (ajuda contextual). |
| NN/g — *Mobile-App Onboarding: An Analysis of Components and Techniques* | Sempre dá para **pular**; mostrar progresso; o tour não pode impedir o uso; "deck of cards" só para conceitos novos (aqui: cadeado e ficha do personal). |
| NN/g — *Instructional Overlays and Coach Marks for Mobile Apps* | A marca precisa apontar para **um elemento real e visível**, um por vez, com texto curto e alto contraste. Nada de sobrepor a tela inteira de setas. |
| Material 3 — *Onboarding* / HIG — *Onboarding* | Ensinar fazendo, adiar o que não é essencial, permitir rever depois ("Ver tour de novo" no Perfil). |
| WAI-ARIA APG — *Dialog (Modal) Pattern* | O card é `role="dialog"`, `aria-modal="true"`, com `aria-labelledby` (título) e `aria-describedby` (texto). **O foco entra no card e fica preso nele**; Esc = Pular; ao fechar, o foco volta ao elemento que estava focado. |
| WCAG 2.2 — 1.4.3 / 1.4.11 contraste; 2.1.1 teclado; 2.4.3 ordem de foco; 2.4.11 foco não encoberto; 2.5.8 alvo ≥24px (usamos 44px); 2.3.3 animação; 4.1.3 mensagens de status | Contraste AA nos temas claro e escuro; tudo operável por teclado (Tab, Enter, ←/→, Esc); botões com 44px; com `prefers-reduced-motion` não há transição nem rolagem suave; o "Passo x de n" é anunciado. |
| Padrões de coach marks (Intro.js, Shepherd, Driver.js — estudados, **não** usados) | **Spotlight com recorte**: um retângulo com cantos arredondados sobre o alvo e o resto escurecido via `box-shadow` gigante. O card fica abaixo ou acima do alvo, conforme o espaço. Sem biblioteca, cerca de 6 KB. |

## 2. Regras de disparo
1. **Boas-vindas**: aparece no 1º acesso, na tela inicial do perfil, depois dos gates (troca de senha, termos).
2. **Tour por tela**: na **1ª vez** que a pessoa abre aquela tela e todos os alvos do 1º passo existem.
3. **Nunca** com treino ativo no aparelho (sessão local em andamento) nem em `/treinar`, `/concluido` ou o construtor.
4. Um tour por vez, e só depois que o boas-vindas daquele perfil terminou ou foi pulado.
5. Passo cujo alvo não existe na tela é **pulado sozinho** (telas variam por dado).
6. "Pular" ou "Concluir" grava o estado no Postgres (`user_tours`), e o tour não volta. **Perfil › "Ver tour de novo"** zera o estado e reabre o boas-vindas.
7. Progresso salvo no **Postgres** (tabela nova `user_tours`, migration 033 com down). O navegador só guarda cache visual.

## 3. Design
- **Spotlight**: recorte do alvo com 8px de folga e raio de 14px. Fundo `rgba(0,0,0,.62)`. Contorno de 2px na cor de destaque do tema (`--ag-acc`).
- **Card**: largura `min(340px, 100vw − 24px)`, fundo `--ag-card`/superfície do tema, raio 18px, sombra.
  - Conteúdo: **título** (≤40 caracteres), **texto** (≤140 caracteres), "Passo x de n" com pontinhos, e botões **Voltar** (fantasma), **Próximo/Concluir** (primário, 44px) e **Pular** (link no topo).
- **Posição**: abaixo do alvo se couber; senão, acima; senão, centralizado (passos sem alvo). Em 375px o card ocupa a largura com 12px de margem. O alvo é rolado para a vista (`scrollIntoView`, `block: center`, instantâneo se houver reduced-motion).
- **Temas**: só variáveis de tema, sem cor fixa, então funciona no claro e no escuro.
- **Teclado**: Tab/Shift+Tab presos no card; Enter/→ = Próximo; ← = Voltar; Esc = Pular.
- **Leitor de tela**: o card é um diálogo nomeado e o passo é anunciado. O conteúdo de trás recebe `aria-hidden` enquanto o tour está aberto.
- **Movimento**: fade/translate de 160ms, desligado com `prefers-reduced-motion: reduce`.

## 4. Tours por perfil (ordem, alvo, texto PT-BR)
Alvo = `data-testid` existente. `—` = passo centralizado sem alvo.

### 4.1 Usuário normal (`normal`)
**boas-vindas** (Início)
1. — · "Bem-vindo ao AVAGYM" · "Um minuto para conhecer o app. Você pode pular quando quiser."
2. `week-ring` · "Minha semana" · "Aqui você vê quantos treinos fez nesta semana e o que falta para a meta."
3. `bell` · "Notificações" · "Avisos do personal, desafios e lembretes chegam aqui."
4. `tab-treinos` · "Treinos" · "Seus programas e as fichas do personal ficam nesta aba. Só um treino fica ativo por vez."
5. `tab-perfil` · "Perfil" · "Tema claro ou escuro, segurança, seus dados e 'Ver tour de novo'."

**treinos** (Treinos, 1ª vez)
1. `tab-programas` · "Programas do sistema" · "Escolha um programa pronto para o seu objetivo."
2. `tab-profissionais` · "Fichas do personal" · "Quando um personal enviar uma ficha, ela aparece aqui e passa a ser o treino ativo."
3. `tab-historico` · "Histórico" · "Todos os treinos que você já fez."

**comunidade** (1ª vez)
1. `new-post` · "Publicar" · "Compartilhe um treino ou uma conquista."
2. `com-shortcuts` · "Desafios e grupos" · "Entre em desafios e acompanhe o ranking."

**progresso** (1ª vez)
1. `progress` · "Seu progresso" · "Volume, frequência e músculos trabalhados ao longo das semanas."

**perfil** (1ª vez)
1. `security` · "Segurança" · "Troque a senha e saia de todos os aparelhos."
2. `meus-dados` · "Seus dados" · "Peça uma cópia dos seus dados por e-mail ou a exclusão da conta."

### 4.2 Aluno do personal (`personal_client`)
**boas-vindas**
1. — · "Bem-vindo! Seu personal criou sua conta" · "Você treina com as fichas dele, participa da comunidade e dos desafios dele."
2. `start-pro-card` / `client-wait` · "Sua ficha" · "A ficha do personal aparece aqui. Uma ficha nova substitui a anterior."
3. `lock-banner` · "Áreas com cadeado" · "Algumas áreas ficam fora do plano do seu personal. Toque em 'Solicitar liberação' para pedir acesso."
4. `tab-treinos` · "Treinos" · "Ficha ativa e fichas anteriores (só para consulta)."
5. `tab-perfil` · "Perfil" · "Tema, senha, seus dados e 'Ver tour de novo'."

**treinos**: `tab-profissionais` ("Ficha ativa"), `plan-history` ("Fichas anteriores: só leitura").
**comunidade**: `new-post` ("A comunidade do seu personal").
**progresso / perfil**: iguais aos do usuário normal.

### 4.3 Personal (pro)
**boas-vindas** (Painel PRO)
1. — · "Bem-vindo ao AVADESK PRO" · "Aqui você acompanha seus alunos e envia fichas."
2. `ptab-alunos` · "Alunos" · "Lista dos alunos vinculados, com treinos e evolução."
3. `ptab-atendimentos` · "Atendimentos" · "Dúvidas e ocorrências dos alunos, com prazo."
4. `pt-convites` · "Convidar ou cadastrar aluno" · "Convide pelo código ou crie a conta do aluno com senha provisória."
5. `capacity` · "Limite de alunos" · "Quantas vagas você usa do seu plano."

**convites** (1ª vez): `pro-clients` ("Cadastrar aluno: a senha provisória aparece uma vez só. Copie e envie ao aluno."), `pc-create`.
**alunos** (1ª vez): `stu-search` ("Busque um aluno"), `stu-card` ("Abra o aluno para criar a ficha ou ver o histórico").

### 4.4 Admin
**boas-vindas** (Painel admin)
1. — · "Central administrativa" · "Tudo o que precisa de decisão fica aqui."
2. `adm-dashboard` · "Dashboard" · "Números do dia e filas pendentes."
3. `adm-liberacoes` · "Liberação de contas" · "Aprove ou recuse pedidos e trave ou libere contas. Nada é apagado."
4. `adm-verificacoes` · "Verificação profissional" · "Valide o cadastro dos personais."
5. `adm-lgpd` · "LGPD" · "Pedidos de dados e de exclusão."

**liberacoes** (1ª vez): `adm-liberacoes` ("Pedidos pendentes aparecem primeiro. Ao recusar, escreva o motivo: a pessoa vê.").

## 5. Dicas contextuais em itens travados
- **Faixa de cadeado** (todas as telas): diz *por que* está travado ("Conta em liberação" ou "Conta do seu personal") e leva a "Solicitar liberação".
- **Tela de área travada** (aluno do personal): explica que a conta faz parte do plano do personal e o que está incluso, com o botão "Solicitar liberação" e o status do pedido.
- **Ação travada** (folha que abre quando o servidor recusa): repete o motivo enviado pelo servidor e oferece "Solicitar liberação" ali mesmo.
- O tour de boas-vindas do aluno do personal **aponta para a faixa** (passo 3).

## 6. Dados
`user_tours(user_id uuid fk users, tour_key text, status text check in ('concluido','pulado'), step int, updated_at timestamptz, primary key(user_id,tour_key))`. Down: `drop table user_tours`.
API: `GET /api/me/tours`, `POST /api/me/tours` `{key,status,step}`, `POST /api/me/tours/reset`. Liberadas mesmo com a conta travada.

## 7. Testes (Playwright, por perfil)
Para cada perfil (normal, aluno do personal, personal, admin), em 390×844:
1. O boas-vindas aparece no 1º acesso, tem "Passo 1 de n" e o foco está no card.
2. Next/Back funcionam por teclado; Esc pula.
3. O estado está gravado no servidor: recarregar não reabre.
4. O tour da tela abre na 1ª visita.
5. "Ver tour de novo" reabre o boas-vindas.
6. Não abre com treino ativo.
7. axe sem violações no card.
8. reduced-motion respeitado.

Prints: `evidencias-tours/<perfil>-<tour>-<passo>.png` (escuro, mais um claro por perfil).
