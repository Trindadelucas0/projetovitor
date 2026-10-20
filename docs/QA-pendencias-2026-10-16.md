# Pendências do reteste QA de 2026-10-16

## Arquivos deixados pela API de teste do QA (NÃO apagados: aguardam confirmação)
Lista completa: `docs/bugs/anexos/arquivos-teste-qa-2026-10-16.tsv` (pasta, arquivo, bytes, hora, referência em avagym_test / avagym).

**app\api\uploads: 31 arquivos, 14:54:09–15:05:25, todos referenciados no avagym_test e em nenhum lugar do avagym (real).**
- 4 mp4 de 12.582.912 bytes: 6b9b5a564723cdc6eb04f507, 0f7a7c63bb1d3802cee6bffb, 3f69ab9a6de15c7f7ca7053c, d85fadae00e17a1cbb0bcf28
- 7 mp4 de 76 bytes: ecb1de08fdb6a4206b9c8b63, 158ab1a1c695e491c905c300, e2b558d1d669fd4abd21cb73, a536370cfe2085b0866fb1a7, c00fb6b19e2df807604926b7, ae4b75208a733b120bb93ce2, ca7ce56b60b12f006baf2e51
- 20 png de 37 bytes: b7c59883817fcaf3bd32da33, f0751d67ed4045fdbfa8db9f, be10d8bded955426ccf71a42, 097636ada02ae8a03ac3ca27, 9a64fa82ae0cdd93c7200050, c453675b75e14264b1bd66fc, 1417ff3c9b544adf04a5f3b1, 39bbec5c1832b205cbb585a0, 41e3dbcd88de560889b8dac1, 859262668f798255c58a16ee, 6039e747ae771881cf05d791, 94e2d088fdd180ca9a2e6ec9, b565c26f3197392d98321518, 4e7a9b5826a005ec9ddc1666, f157913a91c26471058c6d28, 944926b0e80f18b322ce8da2, cfc922ca9eb723c9599818e7, 8b416e707fd9f853fb16e823, 03167fa12747d405036c9e65, 3b98912e51092c99dbf85986

**app\api\private\pro-docs:** o arquivo do QA é `fb39a006-5922-4d05-98a7-8c230737c1da.pdf` (14:53:22, 14 bytes, o único depois de o avagym_test ser recriado). Mas a pasta tem **29 PDFs de 14 bytes criados hoje (12:10–14:53)** que não são referenciados em nenhum dos dois bancos (avagym_test foi recriado depois). Todos são PDFs falsos de teste; nenhum está em `professional_documents` do avagym.
Também há ~96 arquivos antigos em app\api\uploads sem referência no banco real (ver `BUG-013-migracao-midia-avagym.tsv`, coluna acao = "ignorado").

## Programas guiados (decisão do Lucas)
- Item "Programas guiados" removido do menu do admin (`AdminApp.jsx`).
- `db/migrate.js`: os 21 programas não são mais semeados. Só entram com `SEED_PROGRAMS=1`, usado apenas por `test-db-reset.ps1` porque as suítes ainda exercitam o motor de programas. Os programas que já existem no banco real **não foram apagados** (apagar dados exige ordem explícita).

## Labels reais
- `/pro?tab=treinos` (`views/pro/Portal.jsx`): o filtro "Filtrar por especialidade" agora tem `<label>` visível.
- `/library` (`views/Library.jsx`): a busca ganhou `<label class="sr-only" for="lib-q">Buscar exercício</label>`; os dois selects já estavam dentro de `<label>` visível.

## Reset do rate limit para testes
`POST /api/test/rate-limit/reset` só é registrado quando NODE_ENV != production, DB_NAME termina em `_test` e `TEST_RL_RESET=1`. Fora disso a rota não existe (404). `v5-seguranca.mjs` chama no início; está no allowlist do `v3-sem-visitante`.

## /settings para personal e admin
Não é intencional: os shells de personal (`isProAccount`) e de admin em `App.jsx` não declaram `/settings`, então a rota cai no `path="*"` e manda para `/pro` ou `/admin/painel`. Só o shell do aluno tem `/settings`. Consequência: personal/admin não abrem a tela de Configurações (switches de notificação, tema). **Atualização:** a pedido, `/settings` foi adicionado às áreas do personal e do admin (`App.jsx`), com regressão em `frontend/e2e/qa-settings-pro-admin.spec.js` (2/2). O título "AVADESK PRO" virou "AVAGYM" em App.jsx, Portal.jsx, Builder.jsx, TabBar.jsx, tours.js e care.js.

## Placeholders dos documentos legais (dados do Lucas)
Os marcadores são preenchidos pela tela admin "Dados da empresa" (`PUT /api/adm/company`). No banco do PC do Lucas, hoje está tudo **vazio**, exceto a versão:
- razão social, nome fantasia, CNPJ, endereço
- e-mail do DPO (e o nome do encarregado, se quiser que apareça)
- e-mail de suporte, e-mail de moderação, e-mail financeiro
- link/canal de cancelamento, foro, data de vigência
- **provedor e país da VPS** (privacidade.js): não existe campo para ele na tela, então vai sempre aparecer "a preencher" até criarmos o campo ou fixarmos no texto
- "índice" de reajuste e "prazo de aviso" (assinatura.js): fixos em "a definir" no código
Preenchidos automaticamente: preços (catálogo), nome/CPF ou CNPJ/CREF do profissional (perfil dele).
