# Auditoria das regras de negócio

Legenda: **C** confirmada por teste atual; **P** parcial (código/documento e prova incompleta); **NV** não verificada ponta a ponta.

| Regra | Resumo | Estado | Evidência/risco |
|---|---|---|---|
| RN-01 | persistência no PostgreSQL e arquivamento | P | migrations aplicadas; retenção total não exaurida |
| RN-02 | Treinar é o único motor; legado consulta | P | rotas/UI presentes; legado não percorrido integralmente |
| RN-03 | sessão nasce do treino ativo | P | controles no servidor e testes históricos; E2E não fechou |
| RN-04 | uma sessão aberta | P | restrição implementada; concorrência não submetida a carga |
| RN-05 | usuário normal e aluno de personal | C | perfis criados no laboratório |
| RN-06 | aluno criado pelo personal troca senha | P | fluxo existe; fixture atual não completou criação |
| RN-07 | senha provisória aparece uma vez e invalida sessões | P | código/testes; E2E incompleto |
| RN-08 | e-mail único e convite por código | P | validação existe; cadastro por código falhou na jornada |
| RN-09 | escopo restrito do aluno do personal | C | bloqueios e navegação confirmados parcialmente |
| RN-10 | conta nova visualiza, mas ações ficam travadas | C | `ACCESS_LOCKED` reproduzido |
| RN-11 | exceções permitidas à conta travada | P | allowlist inspecionada; não exaurida |
| RN-12 | um pedido de liberação e decisão auditada | P | pedido criado; UI admin não concluiu |
| RN-13 | admin libera/trava, exceto a própria conta | P | código e API; UI bloqueada pela fixture |
| RN-14 | usuário normal usa programas e pode vincular personal | P | programas visíveis; ativação não concluiu |
| RN-15 | personal precisa verificação aprovada | C | proteção reproduzida em API |
| RN-16 | alunos limitados pelo plano/concessões | P | cálculo implementado; última vaga concorrente NV |
| RN-17 | uma ficha ativa; anterior vira histórico | P | implementação presente; jornada não fechou |
| RN-18 | aluno coberto não desvincula ficha | C | restrição confirmada no E2E |
| RN-19 | ficha nova pausa programa do sistema | P | código/testes; E2E não concluiu publicação |
| RN-20 | ficha ativa impede iniciar programa do sistema | P | códigos de bloqueio presentes |
| RN-21 | série → cronômetro → descanso | P | UI existe; E2E quebrou antes do treino |
| RN-22 | inatividade de 60 min exige recuperação | P | worker/regra presentes; tempo real NV |
| RN-23 | ajuste manual exige motivo e exclui métricas | P | regra/testes; manipulação completa NV |
| RN-24 | exportação LGPD exige senha/e-mail e limite 24 h | P | controles presentes; envio real NV |
| RN-25 | cópia LGPD por e-mail/outbox | P | outbox presente; provedor real NV |
| RN-26 | exclusão analisada; admin não solicita pelo app | P | rotas e painel presentes |
| RN-27 | tema persistido e tours contextuais | P | tema/tours existem; seletor E2E falhou |
| RN-28 | PWA atualiza sem recarregar durante treino | NV | manifesto carregou; atualização em treino/dispositivo NV |
| RN-29 | sino e contador de notificações | P | componentes e API presentes |
| RN-30 | R1: usuário em dia vê sistema e personals vinculados | P | autorização presente; matriz completa NV |
| RN-31 | R2: coberto vê só escopo do personal | C | bloqueios confirmados |
| RN-32 | R3: personal em dia administra seu escopo | P | painel acessível; CRUD integral incompleto |
| RN-33 | R4: admin vê tudo | P | autorização no código; fixture impediu UI atual |
| RN-34 | R5: mensalidade própria soma escopos | P | entitlement presente; pagamento bloqueado |
| RN-35 | R6: personal pendente deixa aluno em leitura | P | estado alterado; UI do aluno não confirmou |
| RN-36 | R7: código vincula se verificado e com vaga | P | validações existem; jornada falhou |
| RN-37 | R8: criação pelo personal bloqueia até troca de senha | P | implementação presente; jornada falhou |
| RN-38 | R9: nova conta sem mensalidade solicita liberação | C | comportamento reproduzido |
| RN-39 | R10–R13: histórico, planos ocultos, retenção e treino único | P | conjunto implementado; provas atuais incompletas |

## Divergência crítica

A regra de conta travada não contempla `POST /api/billing/*` na allowlist. Isso conflita com a monetização nova: uma conta sem acesso não consegue contratar o acesso. O aceite deve exigir um teste automatizado de cadastro novo até liquidação e liberação, sem intervenção administrativa.

