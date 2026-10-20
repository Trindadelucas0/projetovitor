# AVAGYM V5.0 — Anexo técnico de implementação

Origem do escopo: PRD funcional V5.0 (16/10/2026).
Código analisado: repositório `Trindadelucas0/acade` (`f:\academia\acade`).
Versão do código no momento da análise: frontend 1.2.7, api 1.2.4, V4.4 em homologação (commit `52a5540`).
 Revisão em 16/10/2026 sobre a V4.4 local não commitada (ver seção 10).

Este anexo é apoio à implementação. O plano para leitura do usuário fica no chat.
Ele NÃO autoriza implementação: aguarda autorização explícita.

---

## 1. Evidência verificada

| Área | Evidência | Conclusão |
|---|---|---|
| Registro de rotas da API | `app/api/server.js:386` | Módulos entram por `Object.assign(routes, modulo({json, readBody}))`; rota é chave `"MÉTODO /caminho"` → handler async. Nenhum framework novo é necessário. |
| Quem publica hoje | `app/api/community.js:1-2`, `:22-27` (`canPublish`) | Admin sempre; profissional exige `professional_profiles.state='ativo'` e `can_publish`; **aluno retorna `false`**. Bloqueio explícito no código, não só na interface. |
| Estrutura do post | `app/api/db/migrations/005_comunidade_ranking.sql:4-9` | `posts(id, tenant_id, author_id, title, body, category, image_url, status, moderation_reason, created_at, updated_at, edited_at)`. Sem vídeo, sem enquete, sem vínculo com sessão. |
| Curtidas/comentários/denúncias | `005_comunidade_ranking.sql:11-22` | `post_likes` (PK post+user), `post_comments` **sem `parent_id`** (comentário é plano), `content_reports(target_type, target_id, reporter_id, reason, status, decision...)`. |
| Denúncia de outros alvos | `015_desafios_feed_comprovantes.sql:31` + `community.js:18` | A constraint de `target_type` foi removida e o código aceita `['ch_post','ch_comment','challenge','group','user','proof']`. Denunciar perfil/grupo já é parcialmente suportado no banco. |
| Escopo por personal | `034_escopo_comunidade.sql:3-4` | `posts.scope_pro_id` e `challenges.scope_pro_id` (`NULL` = sistema). Reusar este padrão para todo conteúdo novo com escopo. |
| Seguir | `004_profissionais_atendimento.sql:105-108` | `follows(follower_id, professional_id)` — relação assimétrica aluno→profissional. Não serve para seguir qualquer perfil. |
| Foto de perfil | `app/api/pro.js:276-278`; consultas em `ranking.js:60`, `groups.js:27`, `challenge-feed.js:146`, `challenge-score.js:93` | Foto existe apenas em `professional_profiles.photo_url`. Cinco consultas leem esse campo para exibir avatar de **qualquer** usuário. Avatar do aluno é sempre iniciais (`components/Podium.jsx:2`, `components/ui.jsx`). |
| Avaliação física | `001_init.sql:47-56` (`user_profiles`: goal, level, location, days_per_week, minutes_per_session, sex, birth_date, height_cm, prefs), `:57-61` (`health_restrictions`), `:162-166` (`body_weights(measured_at, weight_kg, source)`), `:167` (`body_goals`) | Existe altura, peso, objetivo, nível, rotina e restrições. **Não existem** circunferências, composição corporal, fotos de evolução nem autorização de compartilhamento com profissional. |
| Progresso e estatísticas | `views/guided/Progress.jsx`, `views/Stats.jsx`, `components/LineChart.jsx`, `Heatmap.jsx`, `BodyMap.jsx`, `lib/progression.js`, `lib/muscles.js`, `lib/onerm.js` | Já existem totais, gráfico semanal, mapa muscular 3D, heatmap de 12 meses, recordes, evolução por exercício e 1RM. Filtros atuais: 7/30/90 dias, 1 ano, todos. |
| Biblioteca e mídia de exercício | `views/Library.jsx`, `lib/exercises.js`, `components/Media.jsx`, `app/api/exmedia.js` | Catálogo com busca e filtros; upload de mídia binário com verificação por assinatura de arquivo, limites 5 MB (foto) e 60 MB (vídeo), arquivos em `api/uploads/`. Sem painel de lacunas editoriais. |
| Grupos | `013_grupos.sql`, `app/api/groups.js`, `views/app/Grupos.jsx` | Grupos, membros, papéis, políticas livre/aprovação/convite, capa, regras e convites por código. |
| Desafios | `014_desafios.sql:13` (`challenges.group_id`), `app/api/challenges.js`, `challenge-rules.js`, `challenge-score.js`, `challenge-feed.js`, `views/app/Desafios.jsx` | Vínculo desafio↔grupo **já existe**; máquina de estados, regras versionadas, comprovantes e feed separado já existem. |
| Ranking e troféus | `005_...:24-38` (`ranking_prefs`, `ranking_snapshots`), `app/api/ranking.js`, `017_trofeus_premiacoes.sql`, `app/api/prizes.js`, `views/app/Ranking.jsx`, `Trofeus.jsx`, `components/Podium.jsx` | Ranking semanal/mensal com opt-out, snapshots, troféus e prêmios já implementados. Sem ranking de grupo e sem histórico individual de posições. |
| Geração de imagem | nenhuma ocorrência de `canvas`/`toBlob`/`html2canvas` em `frontend/src` | Cartões #TáPago são 100% novos. Único compartilhamento nativo hoje: `navigator.share` em `views/guided/Profile.jsx` (código do aluno). |
| Dependências | `app/api/package.json` (bcryptjs, jsonwebtoken, pg, web-push), `app/frontend/package.json` | **Não há biblioteca de processamento de imagem** na API. O frontend tem `@capacitor/share` e `@capacitor/filesystem`. |
| Migrations | `app/api/db/migrations/001..036` | Próximo número livre: **037**. Existe `app/api/db/backup.ps1` e script `npm run migrate`. |
| Testes | `app/api/test/` (`mjs`, `node --test`; `smoke-fase2..14`, `v3-*`, `v4-fase*`, `v41.mjs`, `v42.mjs`, `v43-*.mjs`), `frontend` vitest, `frontend/e2e/*.spec.js` + `playwright.config.js` | Padrão existente: um arquivo de teste por fase, além das suítes de regressão. |
| Deploy | `docker-compose.yml`, `app/web/Dockerfile`/`nginx.conf`, `scripts/dev-start.ps1`, `scripts/dev-stop.ps1`, `ATUALIZAR-VPS.txt` | Disciplina declarada: backup → pull → migrate → restart → teste. |
| Documentação | `app/DOCUMENTACAO-SISTEMA.md`, `DOCUMENTACAO-SISTEMA.md`, `docs/como-usar-o-sistema.md` | Regra do projeto: atualizar a documentação oficial e o guia na mesma entrega que muda comportamento. |

### ASSUMPTION e UNKNOWN

- ASSUMPTION: `professional_profiles.can_publish` continua sendo um gate válido para profissionais depois de liberar a publicação para alunos (passa a ser restrição adicional, não a única).
- UNKNOWN: se a política atual de "quem pode comentar" é configuração global por tenant (`getSettings` em `app/api/pro.js`). Precisa ser lida antes de implementar políticas por usuário.
- UNKNOWN: cota real de disco da VPS e política de expurgo de `api/uploads/`. Não há medição no código; é pré-requisito antes de liberar vídeo no feed geral.
- UNKNOWN: se o catálogo de exercícios em produção usa CDN (`build:mobile` aponta para jsdelivr) — afeta o desenho do pipeline de imagens de perfil.

Verificado: 32 caminhos.

---

## 2. Matriz PRD × código

| Item do PRD | Situação hoje | Trabalho necessário |
|---|---|---|
| 2. Perfil social e foto | Não existe para aluno; foto só de profissional | Novo (migration + upload + telas + ajuste das 5 consultas de avatar) |
| 3. Avaliação física e medidas | Só peso, altura, restrições, onboarding | Novo (tabela de medidas, wizard, IMC, gráficos, autorização de compartilhamento) |
| 4. Início contextual | Já tem streak, meta da semana, treino ativo e bloco `StartHere` | Ajuste pontual (ocultar recomendações com treino ativo vindo do servidor) |
| 5. Estatísticas detalhadas | Existem gráficos, filtros e mapa muscular | Ampliação (comparação com período anterior, filtro por programa/exercício, KPIs faltantes) |
| 6. Auditoria da biblioteca | Catálogo e mídia existem | Novo painel de lacunas + campos editoriais (instruções, erros comuns) |
| 7. Feed social | Feed cronológico de profissionais; curtir/comentar/denunciar | Ampliação grande (vídeo, enquete, respostas encadeadas, vínculo com atividade, seguir qualquer perfil) |
| 8. Criar publicação | Composer de post com imagem (profissional) | Ampliação (tipo, destino, visibilidade, prévia, vídeo, enquete) |
| 9. #TáPago | Inexistente | Novo (geração de imagem no cliente + 5 modelos + 3 formatos + compartilhar/salvar) |
| 10. Grupos como comunidade | Grupos com membros, capa, regras, convites | Ampliação (feed próprio do grupo, publicação fixada, busca interna) |
| 11. Desafios | Completos, com `group_id` e comprovantes | Ampliação leve (categorias de origem, tipos de objetivo, estados já existem) |
| 12. Ranking social | Semanal/mensal com opt-out + troféus | Ampliação (ranking de grupo, histórico de posições, cartão compartilhável) |
| 13. Moderação | Denúncia de post/comentário/desafio + painel admin + `audit_log` | Ampliação (bloquear/silenciar, fila unificada, denúncia de perfil/grupo) |
| 15. Infra (mídia, performance, segurança) | Upload validado por assinatura; sem pipeline de imagem; sem cotas; feed em SQL direto | Novo (separação público/privado, pipeline, cotas, paginação por cursor) |

---

## 3. Decisões tomadas com o usuário (16/10/2026)

1. **Quem publica:** todos os usuários liberados (aluno, profissional e admin), respeitando permissão da conta e do grupo.
2. **Primeira entrega:** identidade e dados (foto de perfil, perfil social, avaliação física).
3. **Cadência:** fase a fase, com validação a cada entrega.
4. Decisões complementares de 16/10 (tarde): ver seção 10.6 (publicação por usuários liberados, perfil público/privado, avaliação física privada por padrão, storage local com driver R2 futuro).

---

## 4. Etapa 1 — Identidade, foto de perfil e perfil social

### 4.1 Dados — migration `037_identidade_social.sql` (aditiva)

```sql
-- perfil social (público) separado dos dados privados
create table if not exists social_profiles (
  user_id uuid primary key references users on delete cascade,
  handle text,                       -- @usuario
  display_name text,
  bio text,
  goal text,                          -- objetivo fitness exibido
  city text,
  is_private boolean not null default true,
  follow_policy  text not null default 'todos'      check (follow_policy  in ('todos','aprovacao','ninguem')),
  comment_policy text not null default 'seguidores' check (comment_policy in ('todos','seguidores','ninguem')),
  mention_policy text not null default 'seguidores' check (mention_policy in ('todos','seguidores','ninguem')),
  posts_visibility text not null default 'seguidores' check (posts_visibility in ('publico','seguidores','privado')),
  show_achievements boolean not null default false,
  show_training     boolean not null default false,
  updated_at timestamptz default now()
);
create unique index if not exists social_profiles_handle_idx on social_profiles (lower(handle));

-- foto de perfil: uma por usuário; arquivo em disco, metadados no banco
create table if not exists user_avatar (
  user_id uuid primary key references users on delete cascade,
  path text not null, mime text not null, bytes int not null, sha256 text not null,
  width int, height int, updated_at timestamptz default now()
);

-- seguir qualquer perfil (não substitui `follows`, que é aluno→profissional)
create table if not exists social_follows (
  follower_id uuid not null references users on delete cascade,
  followee_id uuid not null references users on delete cascade,
  status text not null default 'ativo' check (status in ('ativo','pendente','bloqueado')),
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
```

Justificativa de não reaproveitar tabelas: `follows` tem semântica de vínculo com profissional (usada em regras de escopo) e `posts.image_url` é um único campo de imagem por post. Misturar mudaria o significado dos registros atuais.

### 4.2 Alterações por arquivo e símbolo

| Arquivo | Mudança | Efeito observável |
|---|---|---|
| `app/api/db/migrations/037_identidade_social.sql` (novo) | 3 tabelas e 1 índice único | Nada visível; base pronta |
| `app/api/avatar.js` (novo) | `AVATAR_SQL` (expressão SQL única que resolve foto social → foto profissional → nulo), `handleNormalize`, rotas `GET/POST/DELETE /api/me/avatar` e `GET/POST /api/me/social-profile` | Uma só fonte de avatar para todo o sistema |
| `app/api/server.js` | registrar o módulo junto aos demais (`server.js:386` e vizinhos) | Novas rotas ativas |
| `app/api/ranking.js`, `groups.js`, `challenge-feed.js`, `challenge-score.js`, `community.js` | trocar as 5 subconsultas `(select photo_url from professional_profiles ...)` por `AVATAR_SQL` | Avatar do aluno aparece no ranking, grupos e desafios sem alterar as regras |
| `app/frontend/src/views/guided/Profile.jsx` | seção Conta ganha foto (alterar/remover), nome de exibição, `@identificador`, bio, objetivo, cidade e chaves de privacidade | Usuário edita a própria identidade social |
| `app/frontend/src/components/ui.jsx` (`Av`) | passa a receber a foto do perfil social; mantém iniciais quando não houver | Consistência de avatar nas listas |
| `app/frontend/src/views/app/Pro.jsx` (`photo_url`) | continua funcionando; passa a ser alimentado pelo mesmo upload | Profissional não perde o que já existe |
| `app/frontend/src/locales/pt.js` (e demais locales) | novas strings | Textos traduzidos |

### 4.3 Regras

- Upload aceita somente imagem (PNG/JPEG/WEBP), valida pela assinatura do arquivo (mesmo padrão de `exmedia.js`), limite 5 MB.
- Redimensionamento e recorte acontecem **no navegador** (canvas): quadrado, 512 px, reencode JPEG. Isso também remove metadados EXIF sensíveis, atendendo ao item 15.5 do PRD sem adicionar biblioteca de imagem à API.
- Substituir a foto apaga o arquivo anterior; remover volta para iniciais.
- Identificador `@usuario` é único (índice em `lower(handle)`) e reservado apenas para contas liberadas.
- Peso, altura, medidas, saúde e restrições nunca entram no perfil social (item 2.3 do PRD) — são servidos por endpoints próprios, com autorização.
- Selo de verificação continua dependendo de `professional_verifications` (`identity.js`); profissional não verificado não recebe selo.

### 4.4 Etapas técnicas

- [ ] `037_identidade_social.sql` — cria as 3 tabelas — `npm run migrate` executa sem erro e `003/004/.../036_down` continua reversível
- [ ] `app/api/avatar.js` — rotas de avatar e perfil social com `requireAuth` — `curl` autenticado grava, lê e remove; tentativa sem sessão retorna 401
- [ ] `app/api/server.js` — registrar módulo — rota responde 200
- [ ] Substituir as 5 leituras de avatar — ranking/grupos/desafios exibem foto quando existir e iniciais quando não
- [ ] `Profile.jsx` + `Av` — upload, prévia, remover, campos de identidade e privacidade
- [ ] Locales `pt` (+ os outros 10) — sem string crua na tela

### 4.5 Validação

- Novo `app/api/test/v5-fase1.mjs` (`node --test`): upload válido, recusa de arquivo com extensão falsa, limite de tamanho, identificador duplicado, perfil privado não listado, 401 sem sessão.
- `frontend/src/lib/*.test.js` (vitest): normalização de `@handle`, resolução de avatar com fallback para iniciais.
- `frontend/e2e/v5-fase1.spec.js` (Playwright): trocar foto, remover foto, salvar perfil.
- Regressão obrigatória: `v43-um-treino.mjs`, `v42.mjs`, vitest e as suítes Playwright existentes.

---

## 5. Etapa 2 — Minha avaliação física

### 5.1 Dados — migration `038_avaliacao_fisica.sql` (aditiva)

Decisão: **estender `body_weights`** em vez de criar uma segunda tabela de medidas, para não duplicar o conceito de medição (o PRD proíbe tabelas duplicadas) e para o gráfico de peso continuar lendo a mesma origem.

```sql
alter table body_weights add column if not exists height_cm numeric(5,1);
alter table body_weights add column if not exists waist_cm numeric(5,1);
alter table body_weights add column if not exists hip_cm numeric(5,1);
alter table body_weights add column if not exists chest_cm numeric(5,1);
alter table body_weights add column if not exists arm_cm numeric(5,1);
alter table body_weights add column if not exists thigh_cm numeric(5,1);
alter table body_weights add column if not exists calf_cm numeric(5,1);
alter table body_weights add column if not exists body_fat_pct numeric(4,1);
alter table body_weights add column if not exists muscle_mass_kg numeric(5,2);
alter table body_weights add column if not exists notes text;
alter table body_weights alter column weight_kg drop not null;  -- medição pode ter só circunferência

create table if not exists body_photos (             -- privado
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  measured_at timestamptz not null, path text not null, mime text not null,
  bytes int not null, sha256 text not null, created_at timestamptz default now()
);

create table if not exists assessment_drafts (       -- salvamento parcial do wizard
  user_id uuid primary key references users on delete cascade,
  step smallint not null default 1, data jsonb not null default '{}', updated_at timestamptz default now()
);

create table if not exists data_share_authorizations (
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  professional_id uuid not null references users on delete cascade,
  categories text[] not null default '{}', purpose text,
  granted_at timestamptz default now(), revoked_at timestamptz,
  granted_by uuid references users
);
create index if not exists data_share_authorizations_idx on data_share_authorizations (user_id, professional_id) where revoked_at is null;
```

`user_profiles`, `health_restrictions` e `user_onboarding` continuam sendo usadas como estão; o wizard grava rotina e segurança ali, sem migrar dados antigos.

### 5.2 Alterações por arquivo e símbolo

| Arquivo | Mudança | Efeito observável |
|---|---|---|
| `app/api/db/migrations/038_avaliacao_fisica.sql` (novo) | colunas + 3 tabelas | Registros de peso atuais permanecem intactos |
| `app/api/assessments.js` (novo) | rotas de medições, rascunho do wizard, IMC e autorizações de compartilhamento | Dados privados só saem para o próprio usuário ou profissional autorizado |
| `app/api/private-media.js` (novo) | armazenamento privado de fotos de evolução + leitura autenticada | Nenhuma URL pública previsível (item 15.2 do PRD) |
| `app/frontend/src/views/guided/Assessment.jsx` (novo) | wizard de 6 etapas com progresso, Voltar, Continuar, Pular e "Salvar e sair" | Preenchimento parcial e retomada |
| `app/frontend/src/views/guided/Progress.jsx` | novo acesso "Minha avaliação física" e gráficos de medidas | Peso, circunferências e composição ao longo do tempo |
| `app/frontend/src/components/LineChart.jsx` | reaproveitado (sem reescrita) | Sem gráfico novo do zero |
| `app/frontend/src/views/v3/AdmUser360.jsx` / `views/pro/Portal.jsx` | bloco "Informações compartilhadas pelo aluno" somente quando houver autorização ativa | Profissional vê apenas o autorizado |

### 5.3 Regras

- IMC = peso ÷ (altura × altura), exibido com data e aviso de triagem; nunca usado isoladamente para prescrever.
- Faixas de adulto não são aplicadas automaticamente quando `user_profiles.birth_date` indicar menor de idade; gestação não é inferida (o sistema não pergunta).
- Gráficos nunca inventam valores nem interpolam lacunas (item 3.5 do PRD).
- Compartilhamento exige: `coach_students` ativo com o profissional + autorização vigente com finalidade e categorias. Revogar encerra o acesso sem apagar as medições.
- Sessões com tempo corrigido continuam fora dos indicadores oficiais, conforme V4.3 (`sessions.ranking_invalid_at`).

### 5.4 Etapas técnicas

- [ ] `038_avaliacao_fisica.sql` — colunas e tabelas — migração aplica e `down` correspondente existe
- [ ] `assessments.js` — CRUD de medições + rascunho — teste de API grava duas medições sem sobrescrever a anterior
- [ ] `private-media.js` — upload e leitura de foto de evolução — sem sessão retorna 401; arquivo não é acessível por URL direta
- [ ] Autorizações — conceder e revogar — após revogar, o profissional perde acesso ao dado
- [ ] `Assessment.jsx` — wizard — recarregar a página no passo 3 retoma o preenchimento
- [ ] Gráficos em `Progress.jsx` — séries por período — sem dado no período, estado vazio explícito

### 5.5 Validação

- `app/api/test/v5-fase2.mjs`: IMC, peso nulo permitido, histórico preservado, autorização concedida/revogada, acesso negado entre usuários (tentativa de ler medida de outro usuário deve falhar).
- `frontend/e2e/v5-fase2.spec.js`: wizard completo, wizard interrompido e retomado, foto privada não listada em feed.
- Regressão: suítes listadas em 4.5.

---

## 6. Etapas 3 a 8 — roteiro técnico resumido

Cada uma abre com uma conferência curta (`UNKNOWN` resolvido) antes do código.

### Etapa 3 — Progresso e estatísticas detalhadas
- Servidor: agregação de métricas com filtros de período/programa/exercício e comparação com período anterior equivalente. Sem percentual quando a base anterior é zero (item 5.3 do PRD).
- Frontend: nova tela de estatísticas (`views/guided/Stats.jsx` ou rota irmã de Progresso, sem substituir a atual) + acesso "Estatísticas detalhadas"; Início ganha os indicadores do item 4.2 e a ocultação contextual do item 4.3 lida do servidor.
- Reuso: `LineChart`, `Heatmap`, `BodyMap`, `lib/progression.js`, `lib/onerm.js`, `lib/muscles.js`.
- Cuidado: `sessions.ranking_invalid_at`/`voided_at` ficam fora dos indicadores; registros antigos vão para bloco separado e identificado.

### Etapa 4 — Social essencial (a maior)
- Liberar publicação: trocar `canPublish` (`community.js:22-27`) por regra de permissão (conta liberada + política do grupo), mantendo `can_publish` como gate adicional do profissional.
- Migration `039`: `post_media` (múltiplas mídias, foto e vídeo), `post_comments.parent_id` (respostas encadeadas), `post_activity` (vínculo com sessão/conquista/desafio), `post_polls` + `post_poll_votes`, `saved_posts`, `user_blocks` (bloquear/silenciar). Reaproveitar `content_reports` (a constraint já foi removida em 015).
- Feeds: "Seguindo" cronológico reverso e "Para você" com regras simples (item 7.2 do PRD), paginados por cursor.
- Visibilidade por publicação e por política do autor; conteúdo privado nunca aparece em feed público (CA-10).
- Compartilhamento explícito: nada de publicar treino, peso, saúde ou mensagem privada automaticamente (item 7.7).
- Moderação: fila única de denúncias, bloquear/silenciar, auditoria em `audit_log`.
- Dependência: pipeline de mídia e cotas (seção 7).

### Etapa 5 — #TáPago (compartilhamento)
- Novo, no frontend: geração de imagem com canvas a partir de dados elegíveis vindos do servidor; 5 modelos (A–E) e formatos 1:1, 9:16, 4:5.
- `navigator.share` quando disponível; fallback de salvar imagem (PWA) e `@capacitor/share` + `@capacitor/filesystem` no app.
- Índices do servidor: apenas métricas válidas; o usuário oculta indicadores, nunca edita resultado verificado (item 9.5).
- Depende da Etapa 3 para os números do resumo semanal.

### Etapa 6 — Grupos como comunidades e formatos novos
- Migration `040`: `group_posts` (ou `posts.group_id`), `group_post_pins`, busca interna. Desafio↔grupo já existe (`challenges.group_id`).
- Enquetes e vídeo curto do feed geral entram aqui; hoje não existem.
- Grupos privados: conteúdo não indexado nem distribuído fora do grupo (CA-13).

### Etapa 7 — Desafios, ranking social e auditoria da biblioteca
- Desafios: expor categorias de origem (oficial, profissional, comunidade) e tipos de objetivo; estados, regras versionadas e comprovantes já existem — ampliação leve.
- Ranking: ranking de grupo e histórico individual de posições; fórmula oficial da V4.3 não muda sem decisão explícita.
- Biblioteca: colunas editoriais (instruções, erros comuns, revisado_em) + painel de lacunas por exercício (CA-17), sem destruir históricos vinculados.

### Etapa 8 — Otimização e lançamento
- Testes de carga, revisão de acessibilidade, PWA em Android e iOS, custo de mídia, rollout progressivo e monitoramento.

---

## 7. Infra transversal (precisa entrar antes da Etapa 4)

1. **Mídia:** separar público (feed), privado (fotos corporais, documentos profissionais), comprovantes e temporários; rota autenticada para privado, sem URL previsível (hoje existe `api/uploads/` e `private/pro-docs/`).
2. **Pipeline:** validação por assinatura (já existe), compressão e miniaturas no cliente, limpeza de arquivos órfãos agendada.
3. **Cotas:** limite por usuário e por conta, para evitar custo descontrolado (item 15.3).
4. **Performance:** feed com paginação por cursor; métricas agregadas no servidor e não recalculadas desde o início do histórico a cada abertura.
5. **Segurança:** autorização efetiva em toda rota nova, visibilidade por publicação, limite de requisições, moderação auditável, controle de acesso a dados de saúde e remoção de metadados de foto.
6. **PWA:** estados explícitos de sincronização; nunca afirmar que uma publicação subiu antes da confirmação do servidor (item 15.6).

---

## 8. Validação global e deploy

- Unitário: `cd app/frontend; npm test` (vitest).
- API: `cd app/api; node --test test/v5-faseN.mjs` mais as regressões `v42.mjs`, `v43-*.mjs` e `smoke-fase*.mjs`.
- Navegador: `npx playwright test` (config padrão) e `playwright.organization.config.js`.
- Antes de cada migration em produção: backup (`app/api/db/backup.ps1`), aplicar, reiniciar, testar (disciplina já usada no projeto).
- Cada entrega atualiza `app/DOCUMENTACAO-SISTEMA.md`, `DOCUMENTACAO-SISTEMA.md` e `docs/como-usar-o-sistema.md`.

## 9. Critérios de aceite mapeados

CA-01 a CA-06 → Etapas 1 e 2 · CA-07 → Etapas 2 e 3 · CA-08 a CA-12 → Etapas 4 e 5 · CA-13 a CA-16 → Etapas 6 e 7 · CA-17 → Etapa 7 · CA-18 a CA-20 → validação contínua em toda entrega.

---

## 10. Revisão de 16/10/2026 (pós V4.4 local) — plano por módulo

Revisão feita sobre o código em `F:\academia\acade` **com as alterações V4.4 ainda não commitadas** (U1–U4). As seções 1–9 continuam válidas; esta seção acrescenta, por módulo do PRD V5.0, o que existe, o que reaproveitar, migrations, endpoints/telas, testes, riscos, dependências, decisões e esforço relativo (P = pequeno, M = médio, G = grande, GG = muito grande).

### 10.0 O que a V4.4 mudou e que a V5 deve reaproveitar

| Item V4.4 | Onde | Uso na V5 |
|---|---|---|
| Prioridade do treino (`trainingPriority`, `shouldOfferOnboarding`, `coachContextState`) | `frontend/src/lib/trainingPriority.js` (+ teste) | Base do módulo (c): ocultar recomendados com treino ativo já tem função pura; falta só o estado vir do servidor. |
| Cartão de vínculo único `CoachContext` | `frontend/src/components/MyCoaches.jsx` | Reaproveitar no Início V5 sem criar outro aviso. |
| `habilitacao()` e `publish_block_reason` | `api/pro.js`, `api/community.js` | Modelo de "permissão explicada" para todas as ações sociais novas (post, grupo, desafio). |
| Negações com `{ error, code }` | `api/pro.js`, `api/community.js`, `api/auth.js` | Padrão obrigatório nas rotas novas (`PERMISSION_DENIED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`...). |
| Configuração `liberacao_prazo_texto` em `app_settings` | `api/pro.js` (`DEFAULT_SETTINGS`/`allowed`) | Mesmo mecanismo para cotas e limites da V5 (ex.: `limite_midia_mb`, `limite_posts_dia_aluno`) sem migration. |

### 10.1 Tabelas existentes relevantes (confirmadas nas migrations 001–036)

`posts`, `post_likes`, `post_comments` (sem `parent_id`), `content_reports`, `feed_categories`, `follows` (aluno→profissional), `groups`, `group_members`, `challenges`, `challenge_*` (members, posts, post_comments, post_likes, proofs, proof_log, results, rule_versions, status_log, teams, trophies, media, categories, feed_bans), `proof_reviewers`, `ranking_prefs`, `ranking_pref_history`, `ranking_snapshots`, `trophy_templates`, `user_trophies`, `prizes`, `prize_winners`, `prize_log`, `user_profiles`, `health_restrictions`, `body_weights`, `body_goals`, `user_onboarding`, `sessions`, `session_sets`, `session_time_corrections`, `session_events`, `exercises`, `exercise_media`, `exercise_muscles`, `exercise_contraindications`, `programs`, `program_revisions`, `program_reviews`, `program_badges`, `notifications`, `notification_prefs`, `audit_log`, `app_settings`, `professional_profiles` (`photo_url`, `can_publish`, `verification_status`), `professional_verifications`, `coach_students`. Próxima migration livre: **037**.

### 10.2 Matriz por módulo

#### (a) Perfil social e foto — esforço **M**
- **Existe:** foto só em `professional_profiles.photo_url` (lida em 5 consultas: ranking, grupos, challenge-feed, challenge-score, community); iniciais em `components/ui.jsx`/`Podium.jsx`; selo de verificado vindo de `professional_qualifications.status='verificada'` (`community.js` FEED_SQL).
- **Reaproveitar:** validação por assinatura de `exmedia.js`; `follows` continua para vínculo profissional.
- **Migration:** `037_identidade_social.sql` (seção 4.1: `social_profiles`, `user_avatar`, `social_follows`).
- **Endpoints/telas:** `GET/POST/DELETE /api/me/avatar`, `GET/POST /api/me/social-profile`, `GET /api/u/:handle`, `POST /api/social/follow|unfollow`; tela "Editar perfil" (rota complementar a partir de `views/guided/Profile.jsx`), perfil público.
- **Testes:** `api/test/v5-fase1.mjs` (handle duplicado, upload falso, privado não listado, 401), vitest de normalização de handle e fallback de avatar, Playwright trocar/remover foto.
- **Riscos:** expor peso/saúde por engano — o endpoint público só lê `social_profiles`; recorte/EXIF dependem do canvas no cliente.
- **Decisões:** público/privado é escolha do usuário (10.6 item 2). Pendente: handle obrigatório ou opcional.

#### (b) Minha avaliação física — esforço **G**
- **Existe:** `user_profiles` (sexo, nascimento, altura), `body_weights(measured_at, weight_kg, source)`, `body_goals`, `health_restrictions`, onboarding em `views/guided/Onboarding.jsx`; `components/LineChart.jsx`.
- **Migration:** `038_avaliacao_fisica.sql` (seção 5.1: colunas em `body_weights`, `body_photos`, `assessment_drafts`, `data_share_authorizations`).
- **Endpoints/telas:** `api/assessments.js` (medições, rascunho, autorizações), `api/private-media.js` (leitura autenticada, sem URL previsível); `views/guided/Assessment.jsx` (wizard 6 etapas, salvar e sair); gráficos em Progresso; bloco "compartilhado pelo aluno" em `views/pro/Portal.jsx`.
- **Regras:** IMC = kg/m² com aviso de triagem; sem faixas adulto para menor de 18 (via `birth_date`) e gestação (pergunta opcional e explícita, nunca inferida); compartilhamento só com `coach_students` ativo + autorização vigente revogável.
- **Testes:** `v5-fase2.mjs` (IMC, histórico preservado, acesso cruzado negado, revogação), Playwright retomar wizard.
- **Riscos:** dados sensíveis (LGPD) — incluir as novas tabelas no export/erase de `api/lgpd.js`; backup precisa cobrir arquivos privados.
- **Decisões:** privada por padrão, compartilhamento por categoria, revogável e auditado (10.6 item 3). Pendente: perguntar gestação (opcional)?

#### (c) Início — indicadores e ocultar recomendados — esforço **P**
- **Existe:** `views/guided/Today.jsx` já mostra sequência (`streak_weeks`), meta semanal (`st.week`), treino ativo; `api/active-training.js` (`AT.get`) informa treino ativo; V4.4 `trainingPriority`.
- **Novo:** bloco com treinos/semana, minutos, última atividade (vindo de `GET /api/guided/state` ampliado ou `GET /api/me/indicators`), contando só sessões válidas (`countsInMetrics` em `api/pro.js`, sem `session_time_corrections`/`ranking_invalid_at`). Recomendados ocultos quando o servidor indicar treino ativo.
- **Migration:** nenhuma.
- **Testes:** vitest da regra de ocultação; spec Início com e sem treino ativo.

#### (d) Progresso + Estatísticas detalhadas — esforço **G**
- **Existe:** `views/guided/Progress.jsx`, `views/Stats.jsx`, `LineChart`, `Heatmap`, `BodyMap`, `lib/progression.js`, `lib/onerm.js`; filtros 7/30/90/365/todos (cliente).
- **Novo:** `GET /api/me/stats?from&to&compare=1` agregando no servidor (KPIs + 6 séries), período personalizado, comparação com período anterior **sem %** quando base = 0, exclusão de tempo corrigido, sem calorias; tela "Estatísticas detalhadas" como rota nova (Progresso atual preservado).
- **Migration:** provavelmente só índices (`040_indices_stats.sql`: `sessions(user_id, started_at)` se faltar) — confirmar com EXPLAIN.
- **Testes:** API com base zero, exclusão de corrigidos; vitest de formatação de comparação.
- **Risco:** divergência entre números do Início, Progresso, Ranking — usar uma única função SQL de "sessão válida".

#### (e) Biblioteca — auditoria e painel editorial — esforço **M**
- **Existe:** `exercises`, `exercise_media`, `exercise_muscles`, `exercise_contraindications`; `api/exmedia.js` (upload validado, 5 MB foto / 60 MB vídeo); `views/Library.jsx` (/library para personal/admin, confirmado em `App.jsx`); créditos em `public/media/exercicios/CREDITS.md`.
- **Novo:** `GET /api/adm/exercises/audit` (lacunas: sem mídia, sem instruções, sem músculos, sem licença, duplicados por nome normalizado); painel em `views/admin/`; ações revisar/arquivar (arquivar = flag, nunca delete, pois `session_sets`/`program_workout_exercises` referenciam).
- **Migration:** `041_exercicios_editorial.sql` (colunas `instructions`, `common_errors`, `reviewed_at`, `reviewed_by`, `archived_at`, `media_license`, `media_source`).
- **Decisão:** quais licenças aceitas além da atual (Gym visual / MIT)?

#### (f) Comunidade — feeds, interações, selos — esforço **GG**
- **Existe:** `api/community.js` (feed cronológico, likes, comentários planos, denúncias, seguir profissional, limite diário), escopo `posts.scope_pro_id` (034), `canPublish` + V4.4 `publish_block_reason`; feed de desafios separado em `challenge-feed.js`.
- **Migration:** `039_social_posts.sql`: `posts.kind`, `posts.visibility`, `posts.shared_post_id`, `post_media`, `post_comments.parent_id`, `post_activity` (vínculo real com `sessions`/`challenge_results`/`user_trophies`), `post_mentions`, `post_hashtags`, `saved_posts`, `user_blocks` (bloquear/silenciar). Reaproveitar `content_reports`.
- **Endpoints:** `GET /api/feed?tab=seguindo|para_voce&cursor=`, CRUD de post por tipo, respostas, compartilhar com comentário, salvar, bloquear/silenciar.
- **Regras:** selo "Atividade registrada" só com `post_activity` apontando para sessão válida do autor; "Resultado homologado" só com `challenge_results` homologado; nada publicado automaticamente.
- **Riscos:** custo de consulta do feed (cursor + índices), vazamento de privado (CA-10), moderação em escala.
- **Decidido (10.6 item 1):** todo usuário liberado publica no feed geral, respeitando moderação e permissões de grupo; `canPublish` e `publishBlock` serão ajustados na fase 3.

#### (g) Editor de publicação e enquetes — esforço **M**
- **Existe:** composer de post com imagem em `views/app/Comunidade.jsx`; upload em `community.js` (pasta `uploads`).
- **Migration:** em `039`: `post_polls(post_id, options jsonb 2–4, closes_at)`, `post_poll_votes(poll_id, user_id, option)` com PK (poll,user) = voto definitivo.
- **Testes:** voto duplicado → 409; 1 ou 5 opções → 400; upload com extensão falsa recusado.

#### (h) Cartões #TáPago — esforço **M**
- **Existe:** nada de canvas; `navigator.share` só em `Profile.jsx`; `@capacitor/share` e `@capacitor/filesystem` no frontend; `BodyMap` para moldura muscular.
- **Novo:** `GET /api/me/share-card?kind=treino|semana|mapa|evolucao|desafio&ref=` devolvendo só dados elegíveis; renderização canvas no cliente (1:1, 9:16, 4:5); Web Share com fallback "Salvar imagem".
- **Dependência:** (d) para números da semana.

#### (i) Grupos — esforço **M**
- **Existe:** `013_grupos.sql`, `api/groups.js`, `views/app/Grupos.jsx` — capa, regras, papéis, políticas livre/aprovação/convite, convites por código.
- **Novo:** feed do grupo (`posts.group_id` em `039` — preferível a tabela paralela), fixar post, papel moderador (conferir se já existe no check de `group_members.role`), conteúdo de grupo privado fora de feeds públicos (CA-13).

#### (j) Desafios — esforço **P/M**
- **Existe:** máquina de estados, regras versionadas, comprovantes com recurso (`proofs/appeal`), ranking, troféus, `challenges.group_id`, `scope_pro_id`; documentos `docs/MATRIZ-PERMISSOES-DESAFIOS.md`, `docs/AUDITORIA-COMPROVANTES.md`.
- **Novo:** expor origem oficial/profissional/comunidade, descoberta, integração com feed (post de resultado homologado), validação de metas perigosas em `challenge-rules.js` (limites máximos por tipo).
- **Decisão:** quem cria desafio de comunidade (aluno liberado? só moderador?).

#### (k) Ranking social — esforço **P**
- **Existe:** `api/ranking.js`, `ranking_prefs` (opt-out), snapshots, fórmula V4.3 (`challenge-score.js`/`ranking.js`).
- **Novo:** ranking entre seguidos/grupo respeitando `ranking_prefs` e privacidade do perfil; fórmula **não muda**.

#### (l) Moderação — esforço **M**
- **Existe:** `content_reports` (alvos ampliados em 015), moderação em `community.js`/`admcrud.js`, `challenge_feed_bans`, `audit_log`, `views/app/AdminCommunity.jsx`.
- **Novo:** fila unificada (post, comentário, perfil, grupo, mídia), ações auditadas com motivo, bloqueio/silêncio do usuário (`user_blocks`), notificação ao autor no padrão V4.4.

### 10.3 Transversal técnico (antes da fase 3)
- **Mídia:** hoje `api/uploads/` é público e quatro módulos gravam direto em disco. Decidido (10.6 item 4): interface `storage` com driver local agora e R2 depois; privado em diretório separado, só por endpoint autenticado; ambos no backup.
- **Pipeline:** recorte/resize/re-encode no cliente (remove EXIF); servidor valida assinatura, tamanho e dimensões; miniaturas.
- **Cotas e rate limit:** via `app_settings` + `usage_counters` (já existe) — confirmar estrutura de `usage_counters` antes.
- **Feed por cursor** `(created_at, id)`; índices nas novas tabelas.
- **Negações** sempre `{ error, code }`.

### 10.4 Ordem recomendada e esforço relativo

| Fase PRD | Conteúdo | Esforço | Depende de |
|---|---|---|---|
| 0 | Regressão verde (atualizar suíte `.mjs` que espera `token` no cadastro; Playwright instalado), inventário de mídia, decisões abaixo | M | — |
| 1 | (a) perfil/foto + (b) avaliação física | M + G | Transversal de mídia privada |
| 2 | (c) Início + (d) Estatísticas | P + G | — |
| 3 | Transversal + (f) social essencial + (g) editor + (l) moderação básica + (h) cartão de treino | GG | Fase 1 (avatar e perfil público/privado); interface `storage` |
| 4 | (h) demais cartões, enquetes, vídeo curto | M | Fase 3, cotas |
| 5 | (i) grupos + (j) desafios + (k) ranking | M | Fase 3 |
| 6 | Carga, segurança, PWA Android/iOS, acessibilidade, custos, rollout | M | Todas |
| — | (e) Biblioteca editorial | M | Independente; pode correr em paralelo à fase 2 |

### 10.5 Decisões de produto pendentes
1. `@identificador` obrigatório ou opcional.
2. Pergunta sobre gestação na avaliação física (opcional).
3. Licenças aceitas para mídia de exercício.
4. Quem cria desafios de comunidade e limites de metas.
5. Cotas de mídia por usuário e se vídeo entra na fase 4 (depende do disco da VPS e, depois, do custo no R2).
6. "Para você": regras simples aceitas (recência + seguidos + mesmo grupo/personal), sem algoritmo de engajamento.

### 10.6 Decisões do Lucas (16/10/2026, tarde) — incorporadas

1. **Publicação no feed geral:** todo usuário **liberado** (`access_unlocked_at` não nulo, conta `ativo`) pode publicar, respeitando suspensão/restrição de moderação (`content_reports`, `user_blocks`, `professional_profiles.can_publish=false` quando restringido) e as permissões do grupo. Impacto no código: `canPublish` em `api/community.js` passa a ser `liberado && !restrito` (o gate `can_publish` do profissional vira restrição de moderação, não pré-requisito); `publishBlock` (V4.4) ganha os códigos `ACCOUNT_LOCKED` e `MODERATION_RESTRICTED`; o item "Permissão para publicar" de `habilitacao()` muda de texto. Aluno do personal (escopo `scope_pro_id`) segue a regra de escopo de `api/scope.js` para onde o post aparece.
2. **Perfil público ou privado (escolha do usuário):** `social_profiles.is_private` (037). **Público** vê e participa das comunidades em geral; **privado** vê somente as comunidades/grupos dos quais participa (feed geral filtrado por `group_members`/escopo). Regras derivadas: feed "Para você" e descoberta de grupos públicos só para perfil público; posts de perfil privado só aparecem para membros da mesma comunidade; trocar de público para privado não apaga nada, só filtra. Testes: privado não lista grupos de que não é membro; público lista; troca de modo preserva histórico.
3. **Avaliação física privada por padrão:** nenhuma categoria visível ao personal sem autorização explícita do aluno por categoria (`data_share_authorizations.categories`), revogável a qualquer momento, com `audit` em conceder, revogar e **cada leitura** pelo profissional (`audit_log`, ação `avaliacao.lida`). Exige vínculo ativo em `coach_students`; encerrar o vínculo revoga automaticamente.
4. **Armazenamento de mídia:** pasta local agora, atrás de uma interface `storage` (`put`, `get`, `delete`, `signedUrl`) em `app/api/storage/` com `driver=local` (padrão) e `driver=r2` (Cloudflare R2, S3‑compatible) depois, escolhido por config (`STORAGE_DRIVER`, `STORAGE_LOCAL_PUBLIC_DIR`, `STORAGE_LOCAL_PRIVATE_DIR`, `R2_*`). Mídia **privada** em diretório separado, fora de `api/uploads/` (pública), servida **somente** por endpoint autenticado (`GET /api/media/private/:id`, checagem de dono/autorização; `signedUrl` local = token curto assinado com o `secret` do `DATA_DIR`). `app/api/db/backup.ps1` passa a incluir os dois diretórios. Migração dos uploads atuais (`community.js`, `exmedia.js`, `identity.js`, `challenge-feed.js`) para a interface é feita aos poucos, sem mudar URLs públicas existentes.
Nada desta seção foi implementado.
