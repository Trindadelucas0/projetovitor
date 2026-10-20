# Planos e Pagamento

Implementação em `app/api/billing/` (core.js, coupons.js, routes.js, providers/asaas.js, providers/simulado.js), regras de acesso em `app/api/entitlements.js` e telas em `app/frontend/src/views/billing/` (Billing.jsx, AdmBilling.jsx, billing.css). As regras de negócio completas estão no PDF `deploy/regras-planos-avagym.pdf` (fora do git).

## Catálogo (migrations 049 e 063)

- Quatro ofertas comerciais: Grátis (`aluno_free` e `profissional_free`, um por área), Individual (`individual`, aluno), Personal 15 (`pro`) e Personal Ilimitado (`pro_ilimitado`). A constante `CATALOG` em routes.js restringe a página pública, a lista do app e a contratação a esses ids.
- 049 cria `pro` (recursos `prescrever`, `convidar_alunos`, `construtor_treino`, `fichas_publicas`; limite `alunos_ativos` 30), renomeia os gratuitos para "Grátis", desativa os demais planos e move as assinaturas para o equivalente. O mapa antigo fica em `plan_migration_049`; `db/down/049_down.sql` reverte.
- 048 adiciona `fichas_publicas` às versões vigentes dos PRO antigos. A regra `POST /api/pro/programs/submit` em `ROUTE_RULES` exige `fichas_publicas` somente quando `monetizacao_ativa=true` (`whenMonetized`).
- A migration 060 preserva o marco anterior. A migration 063 define a oferta vigente: Individual por R$ 12,90/mês, Personal 15 por R$ 39,90/mês e Personal Ilimitado por R$ 79,90/mês. O Personal 15 limita 15 alunos ativos; o Ilimitado usa `alunos_ativos: null`. Ambos permanecem com `sellable=false`; liberar venda é uma ação operacional posterior à homologação real.

Nenhum plano oferece teste automático. O acesso temporário existe somente quando um cupom válido o concede; os dias são definidos na campanha. Para profissionais, o cupom continua vinculado ao Personal 15. Downgrade para o Personal 15 preserva alunos existentes e bloqueia apenas novos vínculos enquanto o uso estiver acima de 15. Upgrade para o Ilimitado remove a trava de capacidade quando a troca da assinatura é efetivada.

## Rotas

| Rota | Acesso | Função |
|---|---|---|
| GET /api/public/plans | público (cache 60 s) | Catálogo com `purchasable`, `price_label`, `features`, `test_mode` |
| GET /api/billing/config | logado | Provedor, modo teste, cartões de teste, `requires_holder_info` |
| GET /api/billing/me | logado | Assinaturas por área, cartões, cobranças, estado de acesso |
| POST /api/billing/cards, cards/remove | logado | Tokeniza (nunca guarda o número) / remove cartão |
| POST /api/billing/subscribe | logado | Contrata com `payment_type: card \| pix`; `card_id` só é obrigatório no cartão |
| POST /api/billing/pix/regenerate | dono logado | Gera outro Pix depois da expiração e invalida logicamente o anterior |
| POST /api/billing/pix/confirm-test | dono logado, só simulador | Confirma o Pix em teste sem existir em Asaas |
| POST /api/billing/change-card, pay-now, cancel, reactivate | logado | Gestão da assinatura |
| POST /api/billing/coupon/validate, coupon/redeem | logado | Cupom de desconto / acesso experimental |
| GET /api/convite?code=CODIGO | público | Resolve somente os dados públicos e a disponibilidade do cupom/link |
| GET /api/referral/me | responsável logado | Código, link, limite e resultados próprios, sem telefone/e-mail dos indicados |
| POST /api/adm/billing/referral-coupons | admin | Cria atomicamente campanha e cupom personalizados para uma conta |
| POST /api/billing/webhook/asaas | header `asaas-access-token` | Webhook do Asaas (token + idempotência por `event_id`) |
| POST /api/billing/webhook/simulado | header `x-webhook-token` | Webhook do simulador (só com BILLING_PROVIDER simulado) |
| GET/POST /api/adm/billing/* | admin | overview, settings, plans, campaigns, codes, partners, subscriptions, charges, reconcile, simulate, webhooks/replay |

## Máquina de estados

`trial → ativa → (renovação recusada) inadimplente → (retentativas esgotadas) carencia → suspensa(financeiro)`; `ativa → cancel_at_period_end → cancelada` (volta ao Grátis). O job `tick` (a cada `BILLING_TICK_MS`, padrão 60 s, lock consultivo no Postgres) renova, refaz tentativas, vence carência, encerra cancelamentos e reconcilia cobranças pendentes. Política em `app_settings`: `monetizacao_ativa`, `cobranca_carencia_dias`, `cobranca_retentativas_dias`, `experimental_dias`, `parceiros_comissao_pct`, `aviso_fim_teste_dias`.

## Tabelas

`plans`, `plan_versions`, `subscriptions` (`payment_type`), `subscription_events`, `payment_methods` (somente token, bandeira e 4 últimos), `billing_customers`, `billing_charges` (`payment_type`, apresentação e expiração do Pix, chave de idempotência única), `billing_webhook_events` (único por provedor + event_id), `campaigns`, `promotion_codes`, `promotion_redemptions`, `partners`, `partner_commissions`, `attribution_events`, `entitlement_grants`, `plan_migration_049`. Limite `null` significa ilimitado; a API devolve `effective_limit: null` e `available: null`. As migrations aditivas 057 e 062 não apagam histórico; a 062 remove o teste automático dos planos e pausa os cupons automáticos antigos ainda ativos. Toda ação grava em `audit_log` (`cobranca.*`, `plano.*`, `cupom.*`, `parceiro.*`).

## Notificações

`notifyBilling` grava em `notifications` (kind `billing`, dedupe), envia push e enfileira e-mail (`email_outbox`, kind `cobranca`). No modo teste o e-mail leva "[TESTE]" e o texto avisa que nada foi cobrado.

## Variáveis de ambiente

| Variável | Teste (atual) | Produção |
|---|---|---|
| BILLING_PROVIDER | ausente ou `simulado` | `asaas` |
| ASAAS_ENV | ausente (sandbox) | `producao` |
| ASAAS_API_KEY | ausente, ou chave `$aact_hmlg_…` para o sandbox | chave `$aact_prod_…` |
| ASAAS_WEBHOOK_TOKEN | obrigatório ao usar Asaas | obrigatório (o mesmo do painel Asaas) |
| SIM_WEBHOOK_TOKEN | opcional (habilita o webhook do simulador) | não usar |
| BILLING_TICK / BILLING_TICK_MS | padrão | padrão (`off` desliga o job) |

Configuração Asaas incompleta ou incompatível impede a API de iniciar. Não existe retorno silencioso ao simulador. Os requisitos e o procedimento completo ficam em `docs/sistema/21-asaas-ambientes.md`.

## Testes

- API: `app/api/test/v5-cobranca.mjs` (cartão, Pix, propriedade, expiração/regeneração, webhook, idempotência, renovação, carência e demais regras) e `app/api/test/asaas-provider.test.mjs` (configuração fail-closed e contrato Pix do Asaas).
- E2E: `app/frontend/e2e/v5-cobranca.spec.js` (página pública, link no login, checkout com cartão recusado e aprovado, cancelar/desfazer, aba do admin).

## Estado operacional do beta

Preço definido não significa venda liberada. Antes da primeira venda, o painel deve mostrar Asaas em produção, webhook autenticado e uma cobrança controlada deve comprovar criação, confirmação, idempotência, conciliação e estorno. Até essa prova, os planos pagos permanecem com `sellable=false` e a monetização pública desligada.
