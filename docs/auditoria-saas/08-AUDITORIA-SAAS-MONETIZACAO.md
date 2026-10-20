# Auditoria SaaS e monetização

## O que existe

Catálogo de planos, trial, cupom, cartão, PIX candidato, assinatura, cobrança avulsa, cancelamento, reativação, webhooks, conciliação, parceiros e painel administrativo. A suite administrativa do simulador passou 5/5.

## O que ainda não pode ser vendido como comprovado

- Liquidação real no provedor, webhook assinado, repetição/idempotência e reconciliação.
- Estorno, chargeback, inadimplência e retomada de acesso ponta a ponta.
- PIX candidato está em alterações locais; não é evidência de versão publicada.
- Métricas comerciais (MRR, churn, conversão, CAC, LTV) com clientes reais.

## Bloqueio P0 — corrigido no candidato local

O middleware executava antes da monetização e impedia a compra. As rotas estritamente necessárias de billing foram incluídas na allowlist, mantendo autorização e ownership dentro de cada rota. O modelo comercial passou a tratar conta nova como aberta e suspensão administrativa como estado separado. Depois da correção, as suites locais passaram **14/14 em cobrança** e **7/7 em assinatura**, no simulador.

1. conta nova bloqueada abre planos;
2. valida/aplica cupom;
3. contrata por cartão ou PIX;
4. webhook idempotente confirma cobrança;
5. entitlement e acesso mudam uma única vez;
6. reprocessamento não duplica assinatura/cobrança;
7. falha permanece recuperável sem liberação manual.

Os sete comportamentos foram cobertos no simulador, incluindo PIX pendente/confirmado, cartão recusado, webhook repetido, preço vindo do servidor, renovação, carência e conciliação. Isso não equivale a homologação do Asaas real.

## Prontidão operacional

Mesmo após corrigir o P0, recomenda-se piloto com provedor em homologação, depois produção limitada a poucos clientes e reconciliação diária. Cobrança não deve ser ativada para toda a base antes de alertas, suporte, política de cancelamento e rotina financeira estarem definidos.

