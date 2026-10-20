# Relatório de decisão de lançamento

> Revalidação de 18/10/2026: a recomendação vigente é **beta controlado por convite**, sem venda pública ampla e sem ativação do Asaas real. O parecer econômico e os critérios objetivos estão em `14-DECISAO-DISTRIBUICAO-E-VIABILIDADE.md`.

## Decisão

**Manter beta controlado no sandbox.** Os bloqueadores locais de contratação, migration e dependências foram corrigidos, mas a cobrança real e a publicação destas mudanças ainda não foram autorizadas nem comprovadas.

## Fundamentação

- Capacidade técnica: **parcialmente pronta**. O produto tem arquitetura e funções reais, compila e possui boa base unitária.
- Prontidão operacional: **insuficiente**. Cobrança real, recuperação, restore e regressão E2E precisam de prova atual.
- Hipótese comercial: **plausível**. O segmento paga por ferramentas comparáveis.
- Disposição a pagar pela ORNY: **não demonstrada**. Não foram fornecidas vendas, renovações ou piloto pago.

## Gate para nova decisão

1. AUD-001 resolvido e automatizado. **Atendido localmente no simulador.**
2. Provedor real validado em homologação e produção limitada.
3. Nenhuma dependência crítica explorável no artefato distribuído.
4. Documentos legais completos e aceites versionados.
5. Jornadas críticas aluno/personal/admin verdes em banco limpo.
6. Testes autenticados de ownership/IDOR em homologação.
7. Backup restaurado e rollback ensaiado.
8. Ao menos um ciclo de beta pago com suporte e reconciliação.

Até os demais gates, chamar o produto de “beta controlado em sandbox” é compatível com a evidência; chamar de SaaS comercial publicado e pronto ainda não é.

