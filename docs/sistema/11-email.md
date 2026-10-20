# E-mail (Resend)

- Fila `email_outbox`: o código e gatilhos do banco (cadastro, troca de senha, vínculo, ficha, convite, status) inserem mensagens; o worker (`mailer.js`) envia em lotes, com idempotência (`Idempotency-Key`), novas tentativas com espera crescente e erro permanente para 4xx.
- Provedor: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM`. Remetente atual: **AVAGYM <nao-responda@avadesk.com.br>** (domínio verificado). O domínio ornygym.avadesk.com.br foi criado no Resend e aguarda os registros DNS (DKIM, SPF MX/TXT); falta também DMARC em `_dmarc.avadesk.com.br`.
- Links dos e-mails usam `ORIGIN` (https://ornygym.avadesk.com.br).
- Teste: admin -> `POST /api/adm/email-test {"to":"..."}` devolve o id do Resend.
