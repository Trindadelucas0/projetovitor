# Anexo técnico — Avaliação Postural

Apoio à implementação. O comportamento oficial está em `app/DOCUMENTACAO-SISTEMA.md`.
Data: 21/10/2026. Migration: `072_avaliacao_postural.sql`.

## 1. Fonte e divergências registradas

Transcrito de `docs/referencias/EXEMPLO-AV-PROTOCOLO.pdf` (cópia de "EXEMPLO AV HOMEM.pdf"), sem a
identidade visual e sem a marca de terceiros que aparecem no documento. As 18 posições conferem com o
briefing. Duas observações que **não** foram resolvidas em silêncio:

**O PDF está redigido no feminino** ("Deitada no chão", "Sentada de lado para a câmera") e prescreve
biquíni, mencionando sunga de passagem. Virou dois protocolos oficiais: `postural-masculino`, com
concordância e vestimenta adaptadas, e `postural-feminino`, com a redação original. Nenhuma adaptação
altera o significado de um movimento — muda concordância verbal e peça de roupa.

| Etapa | PDF de referência | Briefing | O que está no banco |
|---|---|---|---|
| 18 — Borboletinha | "force a máxima abertura das pernas com a **contração dos glúteos**" | "**não forçar** a abertura dos quadris" | Instrução do PDF + cuidado do briefing, e `needs_review = true` com o motivo em `review_note`. **Publicar exige confirmação explícita na tela.** |
| 11 e 13 — Decúbito dorsal | "joelhos totalmente estendidos e os pés totalmente apontados para cima e para trás" | "seguir orientação do profissional sobre a posição dos pés" | Detalhe do PDF (é o protocolo autoritativo) |
| 12 e 14 — Puxando a coxa | "achatando a lombar no solo" | omitido | Acrescentado |
| 16 — Alcançar os pés | "com a cabeça alinhada ao tronco" | omitido | Acrescentado |

**Mídia do PDF não foi incorporada.** São fotos de uma pessoa real identificável, com marca de terceiro em
todas as páginas. O briefing diz que essas mídias dependem de confirmação de direitos de uso, e usá-las como
demonstração exibida a todos os alunos exigiria autorização da pessoa retratada, não só do cliente. Os
campos `reference_media_key` e `demo_media_key` nascem nulos, e o botão "ver demonstração" só é renderizado
quando há mídia. A extração, quando autorizada, precisa de `poppler-utils` (ausente no ambiente atual):
`pdfimages -all docs/referencias/EXEMPLO-AV-PROTOCOLO.pdf docs/referencias/av-protocolo/img`.

## 2. Restrições do código que mudaram o desenho

| A especificação pedia | Realidade | Decisão |
|---|---|---|
| `GET /api/assessments/:id` | `server.js` casa método + caminho **exato**; não há parâmetro de caminho | ids em query string. Não foi introduzido matcher de rota só para este módulo |
| Áreas separadas de Profissional e Administração | A migration 069 fez do personal o admin do tenant, e a árvore de rotas `pro` do frontend foi retirada pelo plano único | Separação real onde importa: namespaces, guards e permissões distintos (`/api/pro/*` e `/api/adm/*`), com dois grupos de menu próprios. As telas renderizam no único shell roteado. Quando o app reabrir para vários personais, a operação sai de lá sem tocar no servidor |
| R2 como armazenamento | `r2Driver()` era um stub que lançava erro | Driver implementado em `storage/r2.js` com SigV4 escrito à mão (sem SDK: a API tem 4 dependências de runtime) |
| Upload retomável | Não há multipart nem infraestrutura de chunks | **Retentativa por arquivo, não retomada por byte.** Ver §4 |

## 3. Imutabilidade da versão publicada

Quatro travas, nenhuma dependendo de trigger (o repositório não usa nenhum):

1. `posture_steps.version_id` aponta para a **versão**, nunca para o protocolo.
2. `posture_assessments.protocol_version_id` é pinado no pedido e nenhum `update` do módulo o toca.
3. Índice parcial garante um só rascunho por protocolo; publicar grava `locked_at`.
4. Todo handler de escrita de etapa valida `status='rascunho'` → 409 `VERSION_LOCKED`.

Provado em `test/postural-adm.integration.mjs`: o aluno começa na v1, a administração publica a v2 com uma
etapa renomeada e outra acrescentada, e a avaliação em andamento continua com 18 etapas e o título antigo.

## 4. Upload: o que é retomável e o que não é

```
init  → reserva o slot (índice parcial) e devolve upload_token (foto) ou put_url pré-assinada (vídeo)
foto  → corpo bruto para a API: sniff dos 16 primeiros bytes + sha256 recalculado + tamanho conferido
vídeo → PUT direto no R2 e depois /captura/confirm: HeadObject + Range 0-15 + sniff
fim   → /submit confere as etapas obrigatórias da versão pinada
```

**Não existe retomada por faixa de bytes, e esta entrega não a cria.** O que existe:

1. **Retentativa por arquivo** — reenvia o arquivo inteiro; o slot e o `expected_sha256` sobrevivem, então a
   retentativa é idempotente e nunca duplica linha ou objeto.
2. **Granularidade por etapa** — 18 transferências pequenas e independentes: cair na etapa 12 não custa as
   outras 17.
3. **Fila offline** (`lib/outbox.js`) — fechar o app não perde o arquivo escolhido.

Retomada real exigiria o multipart do R2 (`CreateMultipartUpload`/`UploadPart`/`CompleteMultipartUpload`,
disponíveis na API). Fica como ponto de extensão documentado.

No caminho pré-assinado o servidor garante **existência, tamanho real e tipo real** do objeto — não o
`sha256`, que exigiria baixar os 25 MB de volta. O hash do vídeo fica registrado como declarado pelo cliente.

Limites: foto 8 MB no servidor (o cliente reencoda para 1600 px, o que também remove EXIF/GPS), vídeo 25 MB,
teto agregado de 120 MB por avaliação.

## 5. Decisões de segurança registradas

- A chave do arquivo **nunca** sai em JSON, nem para o profissional. O cliente recebe `has_media`.
- `GET /api/media/private` está em `PUBLIC_ROUTES` e valida só o HMAC: **proibido** para este módulo.
- O acesso é do profissional **explicitamente designado** na avaliação, mais o admin do tenant. A
  especificação proíbe compartilhar automaticamente entre vários profissionais vinculados. O vínculo é
  reconferido a cada leitura: encerrar o vínculo corta o acesso na hora, inclusive aos bytes.
- **Decisão consciente:** o admin do tenant (hoje o próprio personal) vê a mídia sensível, porque o guard
  deixa admin passar. Se isso virar inaceitável, a trava é uma permissão granular em `app_settings`.
- Concluir um ciclo **já consentido** continua liberado se a assinatura cair no meio (`submit`, `upload` e
  `confirm` em `ALWAYS_ALLOWED`): deixar dado pessoal sensível preso no aparelho do aluno é pior que o
  prejuízo comercial de um ciclo. Iniciar avaliação nova continua exigindo acesso.
- `posture_captures` **não** está em `PERSONAL` (`lgpd.js`): o laço de exclusão apaga por qualquer coluna com
  FK para `users`, e ali a única é `reviewed_by` — excluir a conta de um profissional apagaria as capturas
  dos alunos. A exclusão do titular é explícita, escopada por `posture_assessments.student_id`.

## 6. Bugs encontrados pela verificação

Todos corrigidos; registrados porque custaram diagnóstico:

| Bug | Causa |
|---|---|
| 500 ao criar recorrência | `date + numeric`: o parâmetro do dia chegava como numeric. Precisou de `::int` nos três usos do mesmo `$6`, senão o Postgres recusa a inferência de tipo |
| 500 ao reordenar e remover etapa | As posições de estacionamento eram negativas e violavam `check (position between 1 and 200)`. A faixa foi para 500 e o estacionamento usa +300; o teto real de 200 etapas passou para a API |
| Exclusão LGPD apagaria capturas de alunos | `posture_captures` em `PERSONAL` (ver §5) |
| Contagem da fila quebraria com filtro | Os contadores reusavam o array de parâmetros que depois recebia os filtros; no Postgres, parâmetro a mais do que a consulta referencia é erro de bind |

## 7. Validação executada

Banco de teste recriado do zero (`db/test-db-reset.ps1`), com as migrations 070, 071 e 072 aplicadas:

| Suíte | Testes |
|---|---|
| `test/postural-storage.test.mjs` | 10 |
| `test/postural-media.test.mjs` | 12 |
| `test/postural-job.test.mjs` | 10 |
| `test/postural.integration.mjs` | 23 |
| `test/postural-pro.integration.mjs` | 21 |
| `test/postural-adm.integration.mjs` | 19 |
| `app/frontend` — `npm test` | 356 (32 arquivos) |

`npm run migrate` duas vezes seguidas: idempotente (segunda execução cria 0 versões e 0 etapas).

**Não homologado:** o módulo não foi aberto em navegador nem em aparelho real; não há cenários Playwright
próprios; o driver R2 não foi exercitado contra o bucket real (falta o token — o smoke manual é
`api/scripts/r2-smoke.mjs`); e a comparação visual lado a lado entre períodos não foi implementada.

Duas suítes antigas do repositório falham por motivo **anterior** a este módulo e seguem assim:
`test/smoke.mjs` (o `fetch` do node não manda header `Origin` e o guard de CSRF recusa escrita sem `Origin`
nem `Bearer`) e `test/tapago.integration.mjs` (402 do gate comercial, que hoje é deny-by-default e exige
assinatura paga — a fixture antiga não cria nenhuma).

## 8. Riscos conhecidos

| Risco | Situação |
|---|---|
| Plano gratuito do R2 (10 GB-mês) | Uma avaliação ocupa ~82 MB: cerca de 120 avaliações. O painel de indicadores mostra o consumo e avisa a partir de 80%; a retenção (730 dias por padrão) é configurável |
| Bucket em ENAM e VPS no Brasil | O vídeo vai direto R2 ↔ celular, sem passar pela VPS. A foto é pequena e segue por proxy |
| iOS PWA não tem upload em segundo plano | Um arquivo por vez, fila persistente e aviso explícito "mantenha o app aberto". **Não prometer** upload em segundo plano |
| Metadados de vídeo | A foto é reencodada e perde EXIF; o vídeo não é reencodado e mantém os metadados do aparelho |
| Revogação do consentimento no meio do ciclo | O portão bloqueia novas etapas; o que já foi coletado segue até a retenção ou um pedido de exclusão |
| Sem trigger de imutabilidade no banco | Índice parcial + validação em todo handler + trilha de eventos. Trigger fica como extensão |
