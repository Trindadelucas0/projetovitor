# Primeiro acesso: banco zerado → admin, profissional e aluno

Pré-requisito: API em :8787 e app em :4449 rodando; migrations aplicadas (`node db/migrate.js --no-seed`).

## 1. Primeiro administrador (CLI, uma vez)
```
cd F:\academia\acade\app\api
npm run create-admin
```
Informe e-mail, nome e senha (mín. 10 caracteres, digitada sem eco). A conta nasce **ativa**, só com o papel `admin`, com o aceite dos termos vigentes registrado e com auditoria `admin.criado_cli`.
Não existe cadastro público que vire admin. O seed (`node db/migrate.js`) só cria admin se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem no `.env`.

## 2. Profissional (conta própria)
1. A pessoa abre http://localhost:4449 → Criar conta (e-mail próprio da conta PRO), aceita os termos. A conta fica pendente.
2. Admin → http://localhost:4449/#/admin/painel → Usuários: abre a conta → **Liberar** e altera o papel para **profissional**.
3. Admin → Profissionais: define a capacidade (vagas), estado ativo e se pode publicar.
4. O profissional entra, vai em Perfil e envia a habilitação (CREF/CREFITO, área). O admin a **verifica** em Profissionais. Sem habilitação verificada não há vínculos.

## 3. Aluno
1. Cria conta pelo app com outro e-mail e aceita os termos (fica pendente).
2. Admin → Usuários: **Liberar** e atribuir um **plano de acesso** (define quantos profissionais o aluno pode ter).
3. Vínculo: Admin → Vínculos → escolhe aluno + profissional + área (as 7 verificações rodam), **ou** o profissional pede vínculo pelo código do aluno (Perfil → Meu código) e o admin aprova em Solicitações.
4. O profissional cria e disponibiliza o treino em AVADESK PRO → Criar treino.

Se um profissional também quiser treinar, usa uma **segunda conta** de aluno com outro e-mail; o admin pode marcar "mesma pessoa" (só auditoria).

## Zerar os dados de novo (local)
`powershell -File db\backup.ps1 antes_zerar` e depois `npm run zerar-dados -- --confirmar ZERAR`. Mantém exercícios e mídia, músculos/3D, programas do catálogo, planos de acesso, configurações, tenant e termos. Não rode `test/setup-e2e.mjs` depois se não quiser as contas de teste.
