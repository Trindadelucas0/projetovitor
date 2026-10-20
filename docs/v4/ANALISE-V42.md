# AVAGYM V4.2 — contas do personal, liberação, histórico de fichas, LGPD por e-mail
## O que mudou
- **Tipo de conta no banco** (`users.account_type`: `normal` | `personal_client`).
- **Aluno do personal**: o personal cadastra em PRO › Convites › "Cadastrar aluno"; o sistema gera uma senha provisória (mostrada uma única vez, com "Copiar acesso" e "Nova senha"). No 1º login a troca de senha é obrigatória (o backend recusa tudo com `MUST_CHANGE_PASSWORD`). A conta só usa as fichas, a comunidade e os desafios do personal; as outras áreas mostram uma tela explicativa com "Solicitar liberação".
- **Cadastro aberto + cadeado**: uma conta nova vê todas as telas, mas as ações (iniciar treino, publicar, cadastrar aluno/ficha…) ficam travadas no backend (`ACCESS_LOCKED`), com uma faixa de cadeado e "Solicitar liberação". As contas existentes foram liberadas pela migration 032.
- **Admin › Liberação de contas**: pedidos (aprovar/recusar com nota), lista de contas travadas (liberar) e "Travar uma conta" por e-mail. Nada é apagado.
- **Ficha nova substitui a anterior** (criar, publicar ou criar pelo admin): a anterior fica `arquivado` com `superseded_by` e aparece em "Fichas anteriores" (somente leitura). Não dá para iniciar treino nela.
- **LGPD**: Perfil › Meus dados › "Pedir cópia dos meus dados" exige a senha e o e-mail da conta. Limite de 1 pedido a cada 24 h, com auditoria. O arquivo vai por e-mail (fila `email_outbox` no Postgres, cópia para `LGPD_COPY_EMAIL`). Não existe download direto.
- **Ponto de extensão de pagamento**: `PAYMENT.forUnlock/forProfessional` em accounts-v42.js e `unlock_requests.payment_ref`. Ainda sem gateway.
## Configuração pendente
O SMTP está vazio no .env; veja as instruções em .env.example. Enquanto não for configurado, os e-mails ficam com status `pendente`.
## Testes
API: test/v42.mjs (34 ok), v41 (17 ok), v4-fase2 (46 ok). Frontend: vitest 243/243. Playwright: fase1–4 21/21 e v42 5/5.
## Perguntas abertas
1. O pagamento do personal pela conta do aluno ainda não existe. Hoje vale o modelo atual de vagas; o ponto de extensão está pronto.
2. O aluno do personal tem acesso a Progresso e Histórico (deixei liberado porque são dados dele). Confirmar.
3. Um aluno normal vinculado e sem ficha continua usando os programas do sistema (conforme A).
4. Portabilidade LGPD enquanto o e-mail não está configurado: o pedido fica na fila e o prazo legal conta. Definir o provedor.
5. Uma conta de personal nova fica travada para cadastrar alunos e fichas até a liberação pelo admin. Confirmar.
