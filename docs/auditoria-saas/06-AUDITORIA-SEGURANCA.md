# Auditoria de segurança e privacidade

## Controles confirmados

- Autenticação e autorização são aplicadas no backend antes das rotas.
- Há separação de função administrativa, escopo de personal e gates de entitlement/acesso.
- CSRF valida origem nas escritas; CORS possui allowlist configurável.
- CSP, HSTS e headers restritivos foram observados na superfície pública.
- Testes de injeção, upload malicioso, path traversal, rate limit e `X-Forwarded-For` forjado passaram.
- Ações sensíveis e LGPD possuem trilha de auditoria/outbox.

## Achados

| ID | Prioridade | Achado | Risco | Aceite recomendado |
|---|---|---|---|---|
| SEC-01 | P1 | 19 dependências vulneráveis no frontend, 4 críticas | cadeia de build/mobile; Capacitor 7.6.8 afetado | atualizar versões, auditar novamente e gerar binários limpos |
| SEC-02 | P1 | produção autenticada não foi submetida a IDOR/BOLA | isolamento real permanece não provado | homologação autenticada com contas fictícias e autorização |
| SEC-03 | P1 | configuração legal da base limpa contém placeholders | consentimento inválido/incompleto | impedir ativação enquanto dados obrigatórios não forem configurados |
| SEC-04 | P2 | quatro cenários da suite de segurança não chegaram à assertiva esperada | cobertura atual incompleta | isolar estado/contas e executar cada cenário independentemente |
| SEC-05 | P2 | dependências e secrets não têm prova de rotina operacional contínua | risco de deriva | CI com audit/SBOM e rotação documentada |

## Limites

Não houve pentest destrutivo, varredura externa agressiva, exploração de produção, leitura de dados reais nem validação de configuração do provedor. O relatório não certifica conformidade LGPD; registra apenas controles técnicos observáveis.

