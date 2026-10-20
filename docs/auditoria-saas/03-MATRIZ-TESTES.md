# Matriz de testes e cobertura

## Ambientes

| Ambiente | Uso | Resultado |
|---|---|---|
| Banco `orny_auditoria_20261017_test` | integrações/API | migrations e seeds aplicados |
| Banco `orny_auditoria_e2e_20261017_test` | navegador | migrations, seeds e fixtures aplicados |
| Produção | somente leitura pública | `/`, `/api/health` e manifesto: HTTP 200 |

## Suites

| Prova | Resultado | Leitura correta |
|---|---|---|
| Build frontend | passou | candidato compila; há chunks acima de 500 kB |
| Vitest frontend | **289/289** | componentes e regras cobertos pela suite atual |
| Testes Node/API selecionados | passaram | regras unitárias, desafios e score sem falha nas suites executadas |
| API segurança | **7/11** | headers, injeção, upload, traversal, rate limit e XFF passaram; 4 cenários sofreram bloqueio/cascata |
| API monetização admin | **5/5** | configuração e administração no simulador funcionaram |
| API indicação | **6/9** | falhas de trial/cupom sob `ACCESS_LOCKED` |
| API assinatura | **1/7** | escritas de cobrança bloqueadas por `ACCESS_LOCKED` |
| E2E Playwright | **24/86** | resultado não equivale a 62 bugs; fixture legal/admin e cascatas dominaram as falhas |

## E2E por perfil

| Fluxo | Passou | Total | Observação |
|---|---:|---:|---|
| usuário normal | 14 | 29 | entrada e navegação parcial; treino quebrou após ativação |
| personal | 7 | 19 | painel visível; criação de aluno/ficha não completou |
| cadastro por código | 1 | 6 | vínculo não foi criado pela fixture |
| personal pendente | 2 | 4 | operações diretas de admin passaram; UI do aluno não confirmou |
| administrador | 0 | 28 | sessão ficou retida no aceite legal; falhas em cascata |

## Classificação da evidência

- **Confirmado:** build, unitários, migrations, respostas públicas, controles de segurança que passaram e bloqueio de billing reproduzido.
- **Parcial:** treino, personal, comunidade e administração, pois há código/testes mas a jornada integral atual não fechou.
- **Não verificado:** pagamento real, e-mail real, recuperação após perda de rede em dispositivo, concorrência de última vaga em carga e produção autenticada.

O resultado bruto e as capturas estão em `13-EVIDENCIAS/`; mensagens de erro foram mantidas sem credenciais.

