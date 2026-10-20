# 20 - Monetização: cupons personalizados, indicação e motor de acesso

Decisões do Lucas D1–D9 (16/10/2026). Tudo fica **desligado** até a virada: com `monetizacao_ativa = false` nada muda para o usuário.

## Acesso temporário por cupom
- Nenhum plano inicia período gratuito automaticamente. O benefício só existe via cupom válido criado ou mantido pela administração.
- A duração é definida na campanha, de 1 a 90 dias, e calculada no servidor. Aluno recebe o **Individual**; profissional recebe o **PRO** vinculado ao Personal 15. O overlay está em `entitlements.resolve()`.
- **Teste único por titular** (D6, sem SMS):
  - `trial_grants` é único por conta;
  - `trial_identities` usa a PK (tenant, tipo, hash), com hash HMAC de e-mail normalizado (Gmail sem pontos/+tag), telefone normalizado e CPF opcional.
  - Um conflito retorna `TRIAL_ALREADY_USED` e grava em `fraud_signals` (`teste_reuso_identidade`). Dispositivo e IP só geram alerta.
- **Concorrência**:
  - o resgate trava o código **e** a campanha (`for update of pc, cp`);
  - os índices únicos fecham as corridas (clique duplo, contas paralelas).
- **Indicação**:
  - cada cupom possui responsável, público, dias, limite e validade opcional;
  - `GET /api/convite` devolve apenas primeiro nome, público, dias, validade e disponibilidade; abrir o link não consome uso;
  - cadastro pelo link envia o código ao servidor; cupom encerrado não impede criar a conta e não consome vaga;
  - `referral_attributions` é única por usuário: vale o **primeiro indicador válido**, que nunca é sobrescrito;
  - autoindicação é recusada (`SELF_REFERRAL`);
  - `referral_conversions` registra o 'teste'.
- **Admin**:
  - `POST /api/adm/billing/referral-coupons` exige responsável do mesmo tenant, público, 1–90 dias e limite positivo e cria campanha/código atomicamente;
  - código e link podem ser pausados, reativados ou encerrados; a conta responsável consulta somente seus próprios resultados;
  - histórico em `coupon_changes`.

## Motor de acesso (F3): `app/api/access.js`
- **Origens de acesso:**
  - `propria`: assinatura paga ativa, em teste, inadimplente ou em carência;
  - `teste`;
  - `concessao`: `entitlement_grants` com key `acesso`, usada na transição D1 e em cortesias do admin;
  - `personal`: aluno vinculado a um personal com acesso (D4).
- `monetizationGate` (no `server.js`): com a monetização ligada, **nega por padrão** toda rota fora de `ALWAYS_ALLOWED` e responde `402 ACCESS_REQUIRED`.
  - Continuam liberados (D3): login, assinatura e pagamento, perfil, configurações, LGPD, gestão da conta, aceite de convite de personal e leitura do próprio painel de distribuição.
  - Rotas `/api/pro/*` exigem acesso de profissional. O admin nunca é bloqueado.
- `GET /api/access/me` devolve as origens, o teste (ativo e restante) e a elegibilidade.
- O interruptor `monetizacao_ativa` tem cache de 5 s, limpo quando o admin salva a configuração.

## Testes
`app/api/test/v6-monetizacao-cupons.mjs` cobre duração configurada, inválido/expirado/revogado/esgotado, mesmo titular (telefone e Gmail), resgates simultâneos, limite da campanha sob concorrência, indicação + primeiro indicador, autoindicação, teste PRO, permissões de admin, gate ligado/desligado/expirado e patrocínio do personal. `app/api/test/v6-indicacao.mjs` cobre criação administrativa, link público sem consumo, cadastro automático, privacidade e cadastro sem benefício após o limite.

## Histórico de fases
- F5: link `/convite/CODIGO` e cliques implementados; clique não consome benefício.
- F6: estados `pendente`/`vencida` e bloqueio do teste sem cupom no checkout.
- F7: Admin > Monetização.
- F8: telas.
- F9: fila de fraude.
- F10: virada e transição D1, só com o OK do Lucas.

## Atualização F7–F10 (16/10/2026)

- **Histórico D1 (16/10):** a transição antiga de 7 dias de quem estava no Grátis conta como o teste único. Concessões já criadas permanecem válidas até o `ends_at`; a migration 062 não cria novas transições e não apaga esse histórico.
- **F7:** Administração › Monetização (`/api/adm/monetizacao/*`, só admin), com 9 submenus. A receita confirmada (pagamentos reais) aparece separada do simulador, e o MRR aparece como estimativa. A troca de indicador é feita só pelo admin, com motivo e auditoria.
- **F8:** cartão "Teste PRO ativo" com o tempo restante, uma faixa global e um 402 `ACCESS_REQUIRED` que leva à assinatura. Também há o campo de cupom na tela de assinatura.
- **F9:** sinais de 3+ testes do mesmo IP/dispositivo em 24h (`FRAUD_TRIALS_PER_IP`) e uma fila de revisão (descartar/confirmar com nota, auditado). Os sinais só geram alerta.
- **F10:** `app/api/scripts/virada-monetizacao.mjs` (dry-run por padrão). Ver `22-virada-monetizacao.md`. **Não executado.**

## Antes da virada (16/10/2026, 20:10 BRT)
- Cadastro em 6 etapas: perfil, dados, assinatura (planos do perfil / "Tenho um cupom" / "Decidir depois"), contratar ou cupom, confirmação com aceite e onboarding. Quem escolhe um plano é levado a Planos e pagamento.
- Tela do personal `#/pro/assinatura` (`GET /api/billing/pro-summary`, sempre liberada) mostra plano, status, alunos permitidos, vagas usadas, próximo vencimento e acesso à gestão da assinatura, além do painel de indicações.
- BUG-044: IP real (`clientip.js`); BUG-045: check de UTF-8; BUG-046: `/api/cep` limitado a 10 por minuto por IP, com cabeçalhos RateLimit.

## Atualização dos cupons personalizados (19/10/2026)

A migration `062_cupons_indicacao_personalizados.sql` define `plans.trial_days=null` e pausa a campanha automática histórica **Indicações de usuários** e seus códigos ainda ativos. Campanhas, resgates, atribuições e `trial_grants` anteriores são preservados. Aplicar a migration e publicar são etapas operacionais separadas; não foram executadas nesta implementação local.
