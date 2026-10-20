# Backlog priorizado da auditoria

| Ordem | ID | Pri. | Entrega | Esforço | Aceite resumido |
|---:|---|---|---|---|---|
| 1 | AUD-001 | P0 | permitir contratação segura por conta bloqueada | M | **concluído e validado localmente no simulador** |
| 2 | AUD-002 | P1 | validar PIX/cartão com provedor e idempotência | G | cobrança, webhook, repetição, falha e conciliação provados |
| 3 | AUD-003 | P1 | tornar configuração legal obrigatória antes de operar | P | **código concluído; falta preencher dados reais** |
| 4 | AUD-004 | P1 | reconstruir fixtures E2E independentes | M | **aceites corrigidos; falta reexecutar os 86 passos** |
| 5 | AUD-005 | P1 | atualizar dependências críticas/altas | M | **concluído: npm audit com 0 alertas** |
| 6 | AUD-006 | P1 | executar homologação autenticada e anti-IDOR | M | matriz de ownership por perfil passa |
| 7 | AUD-007 | P2 | ensaiar backup/restore e rollback | M | RPO/RTO medidos e restauração verificada |
| 8 | AUD-008 | P2 | reduzir bundle e medir Web Vitals mobile | M | orçamento definido e rotas críticas medidas |
| 9 | AUD-009 | P2 | escolher estratégia do app nativo | G | Capacitor conectado ao SaaS ou promessa removida |
| 10 | AUD-010 | P2 | piloto comercial acompanhado | M | 3–5 clientes pagos e métricas de ativação/renovação |

Os estados acima registram a rodada de correções posterior à auditoria. Nada foi publicado em produção por esta execução.

