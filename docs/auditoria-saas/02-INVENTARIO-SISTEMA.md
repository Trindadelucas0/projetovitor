# Inventário do sistema auditado

## Baseline

| Item | Evidência |
|---|---|
| Repositório | `F:\academia\acade` |
| Aplicação | `F:\academia\acade\app` |
| Corte principal | `main` / `1353db7631004803b67e93c797ae6d28c54c1874` |
| Estado no fechamento | `main` / `ae288310ddc8daa2050727d606e751c94d7597ce`; avanço externo à auditoria |
| Produto publicado | ORNY 1.2.8 |
| Produção documentada | `https://ornygym.avadesk.com.br/`, `/opt/avagym`, PM2 `avagym-api` e `avagym-web` |
| Banco | PostgreSQL; 56 migrations numeradas até `057` |
| Frontend | React 19, Vite 8, PWA, Capacitor 7 |
| Backend | Node HTTP, rotas centralizadas, PostgreSQL |
| Fontes oficiais lidas | PRD, documentação técnica, manual e `app/DOCUMENTACAO-SISTEMA.md` |

As alterações locais existentes foram preservadas. Durante a execução, outro fluxo avançou o repositório pelos commits `288793a` e `ae28831` e acrescentou mudanças locais de identificação legal/suporte. A auditoria não criou esses commits nem essas mudanças e não os reverteu. Ela não executou checkout, reset, deploy ou migration em banco de uso.

## Perfis e superfícies

- Visitante: entrada, cadastro, login, recuperação e documentos legais.
- Usuário normal: onboarding, programas, treino, progresso, comunidade e perfil.
- Aluno do personal: ficha, treino, vínculo, atendimento e conteúdo do personal.
- Profissional: verificação, alunos, convites, fichas, acompanhamento, comunidade e plano.
- Administrador: usuários, liberações, profissionais, vínculos, conteúdo, moderação, LGPD, auditoria, configuração e billing.

## Integrações e processos

- PostgreSQL é a persistência principal; filas de e-mail e auditoria são persistidas.
- E-mail usa outbox/provedor configurável.
- Cobrança possui simulador, cartão, PIX candidato, webhooks e job; operação real não foi comprovada.
- Uploads e mídia passam por endpoints próprios; testes hostis básicos foram executados.
- PWA possui manifesto e service worker. O build nativo Capacitor está explicitamente configurado como standalone/local, sem backend, portanto não é o mesmo SaaS sincronizado.

## Diferença documental

Os três PDFs ainda descrevem AVAGYM V4.3 rev. 2, commit `63454ec`, enquanto o candidato e a produção documentada estão em ORNY 1.2.8 / `1353db7`. Os PDFs são referência histórica; a documentação Markdown e o código corrente prevaleceram quando houve divergência.

