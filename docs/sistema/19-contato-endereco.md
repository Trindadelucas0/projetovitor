# 19 - Contato e endereço (cadastro e perfil)

Pedido do Lucas (16/10/2026).

## Cadastro
- Telefone (máscara BR (11) 98765-4321), CEP (00000-000) com busca automática, rua, número, complemento (opcional), bairro, cidade e UF.
- A tela de cadastro exige o conjunto completo. A API valida o formato sempre e exige o conjunto quando o campo `contact` é enviado (clientes antigos sem `contact` continuam aceitos e recebem o aviso).
- CEP: `GET /api/cep?cep=` (público, limitado a 40/10 min por IP) consulta `https://brasilapi.com.br/api/cep/v2/{cep}` **pelo backend**, timeout de 4 s. Falha/timeout → 503 `CEP_UNAVAILABLE` com `manual: true`; CEP inexistente → 404. Os campos ficam sempre editáveis.

## Perfil
- Perfil > Perfil social: card "Contato e endereço" (resumo, com selo público/privado por item) e seção no modal "Editar perfil".
- `GET/POST /api/me/contact`.

## Privacidade
| Dado | Padrão | Toggle |
|---|---|---|
| Telefone | privado | `show_phone` |
| E-mail | privado | `show_email` |
| Bairro | privado | `show_address` |
| Cidade/UF | público | `show_city` |
| Rua, número, complemento, CEP | **nunca público** | - |

Perfil privado (`is_private`) continua escondendo tudo de quem não é seguidor aprovado.

## Dados
- Tabela `user_contact` (migration `053_contato_endereco.sql`, down `db/down/053_down.sql`), FK `users(id) on delete cascade`.
- Auditoria: `cadastro.contato` e `perfil.contato_atualizado` com **só os nomes** dos campos alterados (nunca os valores).
- LGPD: entra na exportação (descoberta por FK) e é apagada na exclusão (`PERSONAL` em `lgpd.js`).
- Contas existentes: `GET /api/auth/me` devolve `profile_incomplete`; o app mostra um aviso dispensável (sem bloqueio). Admin não recebe o aviso.

## Testes
`app/api/test/v5-contato.mjs` (5) e e2e `v5-aceite-cadastro`, `v5-social`, personas (helper `e2e/_contact.js`).