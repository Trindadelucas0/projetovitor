# Virada da monetização (F10). Executar SOMENTE com o OK explícito do Lucas

Script: `app/api/scripts/virada-monetizacao.mjs`. Ele roda tudo em uma transação: se der erro, nada é gravado.

## O que o script faz
1. Seleciona as contas ativas (aluno/profissional, não admin) que não têm acesso próprio: sem assinatura paga ou pendente, sem teste já registrado e sem cortesia `acesso` vigente. Quem tem os dois papéis recebe uma única transição (o teste é por pessoa).
2. **D1 (Lucas, 16/10):** a transição de `transicao_dias` (padrão 7) **conta como o teste único** e cria `trial_grants(source='transicao')` + `trial_identities`. Um cupom de teste depois é recusado. Se o admin desligar `transicao_conta_como_teste`, a transição vira cortesia e não consome o teste.
3. Envia a notificação no app: "Você tem 7 dias de acesso completo… (este é o seu período de teste)… Seus dados ficam guardados."
4. Liga `monetizacao_ativa=true` (a menos que se use `--no-switch`) e registra `monetizacao.virada` no audit_log.
5. É idempotente: rodar de novo não duplica nada.

## Passo a passo (VPS)
```bash
cd /opt/avagym/app/api   # (caminho da app na VPS)
# 1. backup
pg_dump -Fc -d avagym -f /opt/avagym-backups/avagym_$(date +%Y%m%d_%H%M%S)_pre-virada.dump
# 2. simulação (não grava)
node scripts/virada-monetizacao.mjs --dry-run
# 3. aplicar (somente com o OK do Lucas)
node scripts/virada-monetizacao.mjs --apply --confirm VIRAR --backup-ok
# 4. conferir: Admin › Monetização › Visão geral ("Em teste agora") e GET /api/access/me de uma conta de teste
```
Sem `--confirm VIRAR --backup-ok`, o `--apply` é recusado.

## Rollback
- **Rápido (recomendado):** Admin › Cobrança › desligar "Monetização ativa". Com isso, ninguém é bloqueado. As transições ficam registradas e não fazem mal.
- **Desfazer as transições** (só se o Lucas pedir; elas apagam o teste consumido):
  `update trial_grants set revoked_at=now(), revoke_reason='rollback virada' where source='transicao';` e, para liberar o teste de novo, `delete from trial_identities where trial_id in (select id from trial_grants where source='transicao'); delete from trial_grants where source='transicao';`
  Isso exige confirmação do Lucas antes de apagar.
- **Total:** restaurar o dump `pre-virada` com `pg_restore --clean`.

## Teste
`app/api/test/v6-virada.mjs` (avagym_test, restrito às contas criadas no próprio teste e sem ligar a monetização) cobre:
- dry-run;
- apply;
- D1 (cupom recusado);
- idempotência;
- política false (vira cortesia).
