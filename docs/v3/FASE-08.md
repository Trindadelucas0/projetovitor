# Fase 8 — regras de unicidade

Pedido do Lucas: "crie regras onde não pode ser o mesmo email etc". Regras valem no **banco** (índice/gatilho), na **API** (409 com `code`) e na **tela** (mensagem amigável).

| Dado | Regra | Banco | API | Tela |
|---|---|---|---|---|
| E-mail | `lower(trim())`, único na plataforma inteira | gatilho `users_normalize_email` + índice `users_email_norm_uq` (o antigo `users_email_uq` em `lower(email)` continua) | cadastro, login, esqueci a senha, admin criar/editar, profissional cria conta: normalizam; duplicado → 409 `EMAIL_EXISTS`; corrida tratada pelo 23505 | "Este e-mail já tem conta. Quer entrar ou recuperar a senha?" com botões **Entrar com este e-mail** / **Recuperar a senha** |
| Registro profissional | (conselho, UF, número só letras/dígitos sem zeros à esquerda) pertence a 1 conta; `OUTRO` não entra | tabela `professional_registry_claims` (PK `professional_registry_uq`) mantida por gatilho em `professional_verifications`; `registry_taken()` para a API | `POST /api/pro/verification` → 409 `REGISTRY_EXISTS` (pré-checagem + 23505) | "Este registro profissional já está vinculado a outra conta. Se ele é seu, fale com a administração." no campo do número |
| Código do aluno | já único (`users_share_code_uq`, fase 6/021) | confirmado | — | — |
| Telefone / CPF | **não existem no schema** | — | — | não definido (criar quando os campos existirem) |

Nenhuma mensagem revela nome, id ou e-mail do dono. Trocar o número do registro libera o anterior.

Duplicatas conferidas **antes** da migration — local e produção: 0 e-mails duplicados, 0 e-mails fora do padrão, 0 registros duplicados, 0 códigos repetidos.

Migration `024_unicidade.sql` (+ `down/024_down.sql`). Backup local: `backups/avagym_20261015_133125_antes_v3_fase08.dump`.

Testes: `v3-fase8` 18/18 (inclui corrida de 4 cadastros simultâneos e inserção direta no banco), `emailExists.test.js`; regressão completa ok.

Não definido: telefone/CPF; registro em `professional_qualifications` (fluxo antigo do admin) não entra na regra — só a verificação V3.
