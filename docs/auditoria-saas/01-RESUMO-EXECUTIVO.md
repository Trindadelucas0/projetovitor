# Auditoria 360° ORNY/AVAGYM — resumo executivo

**Data de fechamento:** 18/10/2026  
**Corte principal auditado:** `main` em `1353db7`, acrescido das alterações locais de cobrança então existentes  
**Mudança durante a execução:** o checkout avançou externamente para `ae28831`; a publicação de PIX ficou documentada em `288793a`, ainda com provedor simulado  
**Produção pública observada:** ORNY 1.2.8; recursos públicos responderam, sem teste autenticado  
**Decisão atualizada após correções locais:** **beta controlado no sandbox; lançamento comercial amplo continua condicionado à homologação do provedor e à publicação validada**.

## Resultado

A ORNY já tem substância de produto: autenticação, treino guiado, personal, comunidade, administração, LGPD e uma base de monetização existem no código. Build e 289 testes de frontend passaram; migrations e dados-base foram instalados em bancos exclusivos da auditoria; os endpoints administrativos de monetização testados passaram. A superfície pública de produção respondeu com HTTPS, HSTS, CSP, manifesto e health check. O avanço posterior do checkout foi registrado, mas as suites completas não foram reexecutadas contra esse novo corte e ele não substitui silenciosamente a evidência do baseline.

Ela ainda não está pronta para venda ampla. O achado mais grave é a circularidade entre liberação e cobrança: contas novas ficam bloqueadas pelo `accessGate`, mas as escritas de `/api/billing/*` não estão entre as ações permitidas. Nos testes, contratação, cupom e pagamento retornaram `ACCESS_LOCKED`. Assim, a pessoa que deveria pagar pode depender de liberação manual antes de conseguir pagar. A cobrança PIX candidata também ainda é alteração local, não versão publicada nem operação financeira real comprovada.

## Scorecard baseado em evidência

| Área | Peso | Nota | Confiança | Síntese |
|---|---:|---:|---|---|
| Jornadas essenciais | 20% | 6,0 | média | boa cobertura unitária; E2E atual teve cascatas de fixture |
| Regras de negócio | 15% | 6,5 | média | regras extensas no servidor; matriz parcialmente executada |
| Segurança e privacidade | 15% | 6,5 | média | controles centrais presentes; produção autenticada não testada |
| UX e acessibilidade | 15% | 6,0 | média | jornadas principais existem; regressão E2E não é confiável integralmente |
| SaaS e monetização | 15% | 3,5 | alta | contratação bloqueada e gateway real não validado |
| Arquitetura e operação | 10% | 6,0 | média | build/migrations sólidos; bundle grande e app nativo desconectado |
| Mercado e prontidão comercial | 10% | 4,5 | baixa | hipótese plausível, sem prova de disposição a pagar |
| **Total ponderado** | **100%** | **5,6/10** | **média** | **beta controlado, não lançamento amplo** |

## Correções aplicadas ao candidato em 18/10/2026

- A compra passou a ser permitida mesmo quando a conta está suspensa, sem liberar as demais ações.
- Pagamento inicial confirmado ativa o plano; o modelo comercial novo não depende mais de fila manual para contas novas.
- Cobrança e assinatura passaram integralmente no simulador: 14/14 e 7/7.
- A migration `058` foi corrigida e todo o schema aplicou do zero em `orny_fix_20261018_test`.
- Fixtures de admin/profissional agora registram os aceites legais vigentes.
- Dados legais obrigatórios passaram a ser validados e a hospedagem deixou de ser placeholder sem campo.
- Dependências caíram de 19 alertas (4 críticos) para **0 alertas no `npm audit`**.

## Bloqueadores remanescentes

1. **P1 — provedor real não validado.** O ambiente permanece corretamente em `BILLING_PROVIDER=simulado` e `ASAAS_ENV=sandbox`; não há cobrança real autorizada.
2. **P1 — regressão E2E completa precisa ser reexecutada.** A causa da fixture legal foi corrigida, mas os 86 passos não foram declarados verdes sem nova execução integral.
3. **P1 — dados legais reais precisam ser preenchidos pelo administrador.** O código agora impede salvar configuração incompleta e produção exige completude, mas os valores reais não foram inventados.
4. **P1 — produção não recebeu estas correções.** Código local, teste local e publicação permanecem estados separados.

## O que esta decisão não afirma

- Não afirma que produção contém os dados fictícios, placeholders ou falhas observadas no banco isolado.
- Não afirma que 62 falhas E2E são 62 bugs; várias são efeitos em cascata da fixture e seletores desatualizados.
- Não valida vendas. Pesquisa de concorrentes mostra referência de mercado, não disposição real a pagar pela ORNY.
- Não autoriza correções, deploy, migration em banco de uso ou mudança de infraestrutura.

