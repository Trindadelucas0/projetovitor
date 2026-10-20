# Registro de bugs - AVAGYM

Regra: todo bug é corrigido **e** documentado aqui. Consulte este registro antes de mexer em uma área.
A seção "Reteste QA" de cada bug é preenchida só pelo agente de testes.

| ID | Data | Título | Perfil | Status |
|---|---|---|---|---|
| [BUG-001](bugs/BUG-001.md) | 2026-10-16 | Termos pedidos duas vezes (ALTA) | aluno, personal (toda conta nova) | corrigido, aguardando reteste |
| [BUG-002](bugs/BUG-002.md) | 2026-10-16 | AD-27: conta liberada continua na fila de pedidos | admin | corrigido, aguardando reteste |
| [BUG-003](bugs/BUG-003.md) | 2026-10-16 | AD-40/43: /admin/painel para aluno/personal | aluno, personal | corrigido, aguardando reteste |
| [BUG-004](bugs/BUG-004.md) | 2026-10-16 | /home de aluno novo abria /treinos?aba=historico vazio | aluno | corrigido, aguardando reteste |
| [BUG-005](bugs/BUG-005.md) | 2026-10-16 | Acessibilidade dos switches de Configurações | todos | corrigido, aguardando reteste |
| [BUG-006](bugs/BUG-006.md) | 2026-10-16 | `fetchpriority` em JSX | todos (Login) | corrigido, aguardando reteste |
| [BUG-007](bugs/BUG-007.md) | 2026-10-16 | PWA: nome, cores, ícone maskable, zoom e natoGym | todos (instalação) | reprovado no reteste; corrigido de novo, aguardando reteste |
| [BUG-008](bugs/BUG-008.md) | 2026-10-16 | HSTS desligado no nginx de produção | todos | corrigido, aguardando reteste |
| [BUG-009](bugs/BUG-009.md) | 2026-10-16 | Avatares fora do DATA_DIR | todos | corrigido, aguardando reteste |
| [BUG-010](bugs/BUG-010.md) | 2026-10-16 | Incidente PERSONAS_BASE/CASOS_DIR: testes no banco real | dados reais (admin/Lucas) | corrigido, aguardando reteste |
| [BUG-011](bugs/BUG-011.md) | 2026-10-16 | Migration 028 falha em banco novo | infra/testes | corrigido, aguardando reteste |
| [BUG-012](bugs/BUG-012.md) | 2026-10-16 | Aluno do personal travado: 403 em POST /api/legal/accept (ALTA) | aluno do personal | corrigido, aguardando reteste |
| [BUG-013](bugs/BUG-013.md) | 2026-10-16 | Mídia gravada fora do DATA_DIR (MÉDIA) | todos; infra/backup | corrigido, aguardando reteste |
| [BUG-014](bugs/BUG-014.md) | 2026-10-16 | Banco novo sem organização padrão | infra/testes | corrigido, aguardando reteste |
| [BUG-015](bugs/BUG-015.md) | 2026-10-16 | program_equipment vazio em banco novo | infra/testes | corrigido, aguardando reteste |
| [BUG-016](bugs/BUG-016.md) | 2026-10-16 | qualifications/verify: 500 com id inválido | admin | corrigido, aguardando reteste |
| [BUG-017](bugs/BUG-017.md) | 2026-10-16 | Configuração "comentários de alunos" ignorada | aluno, admin | aberto: aguardando decisão do Lucas |
| [BUG-018](bugs/BUG-018.md) | 2026-10-16 | API caiu na subida com a 043 (tabelas da 001 com o mesmo nome) (ALTA) | todos | corrigido, aguardando reteste |
| [BUG-019](bugs/BUG-019.md) | 2026-10-16 | Aceite de Termos/Privacidade/18+ só depois do login (gate) em vez de no cadastro | visitante, aluno, profissional | corrigido, aguardando reteste |
| [BUG-020](bugs/BUG-020.md) | 2026-10-16 | Gateway de produção sem cabeçalhos de segurança (clickjacking) | todos (produção) | corrigido, aguardando reteste |
| [BUG-021](bugs/BUG-021.md) | 2026-10-16 | Service worker com título padrão "AVADESK" | todos (notificações push) | corrigido, aguardando reteste |
| [BUG-022](bugs/BUG-022.md) | 2026-10-16 | HTTP não redireciona para HTTPS | todos (produção) | corrigido, aguardando reteste |
| [BUG-023](bugs/BUG-023.md) | 2026-10-16 | CSRF só era checado depois da validação do corpo / sem Origin passava | todos | corrigido, aguardando reteste |
| [BUG-024](bugs/BUG-024.md) | 2026-10-16 | /api/health público expunha contagens/detalhes | público | corrigido, aguardando reteste |
| [BUG-025](bugs/BUG-025.md) | 2026-10-16 | HEAD /api/health não respondia 200 | monitoração | corrigido, aguardando reteste |
| [BUG-026](bugs/BUG-026.md) | 2026-10-16 | Sem envio de teste de e-mail no admin | admin | corrigido, aguardando reteste |
| [BUG-027](bugs/BUG-027.md) | 2026-10-16 | Cadastro em produção exigia 18+ sem campo na tela; troca por data de nascimento | visitante (cadastro) | corrigido, aguardando reteste |
| [BUG-028](bugs/BUG-028.md) | 2026-10-16 | Termos públicos (/api/terms) diziam "versão provisória" e "AVADESK Fitness" | todos | corrigido, aguardando reteste |
| [BUG-029](bugs/BUG-029.md) | 2026-10-16 | academ.avadesk.com.br fora do ar (TLS unexpected eof) | quem usa o endereço antigo | encerrado: domínio abandonado (decisão do Lucas) |
| [BUG-030](bugs/BUG-030.md) | 2026-10-16 | /api/admin/programs devolve 404 | admin | esperado (documentado) |
| [BUG-031](bugs/BUG-031.md) | 2026-10-16 | Nova tentativa após cartão recusado era tratada como sucesso no checkout | aluno/personal | corrigido, aguardando reteste |
| [BUG-032](bugs/BUG-032.md) | 2026-10-16 | Restos da marca AVADESK em telas visíveis (login, admin, legais, onboarding) | todos | corrigido, aguardando reteste |
| [BUG-033](bugs/BUG-033.md) | 2026-10-16 | Logout não invalidava o avagym_token | todos | corrigido, aguardando reteste |
| [BUG-034](bugs/BUG-034.md) | 2026-10-16 | AVADESK restante no bundle e no nome da organização | todos | corrigido, aguardando reteste |
| [BUG-035](bugs/BUG-035.md) | 2026-10-16 | Programas prontos do seed antigo em /api/programs | aluno | corrigido no código; arquivar em produção no deploy |
| [BUG-036](bugs/BUG-036.md) | 2026-10-16 | /api/plan 400, paywall desligado, preços a definir | QA | esperado/aguardando preços (documentado) |
| [BUG-037](bugs/BUG-037.md) | 2026-10-16 | Autor 'Equipe AVAGYM' inventado no fallback do programa | aluno | corrigido, aguardando reteste |
| [BUG-038](bugs/BUG-038.md) | 2026-10-16 | confirm()/prompt() nativos na cobrança | aluno/profissional | corrigido, aguardando reteste |
| [BUG-039](bugs/BUG-039.md) | 2026-10-16 | POST /api/logout (Sair) não revogava a sessão | todos | corrigido, aguardando reteste |
| [BUG-040](bugs/BUG-040.md) | 2026-10-16 | Remover cartão sem id válido: 400 genérico | aluno/profissional | corrigido, aguardando reteste |
| [BUG-041](bugs/BUG-041.md) | 2026-10-16 | Teste gratuito reutilizável com outra conta do mesmo titular | aluno/profissional | corrigido, aguardando reteste |
| [BUG-042](bugs/BUG-042.md) | 2026-10-16 | Recursos premium sem verificação central de acesso | todos | corrigido (ativo só com Monetização ligada), aguardando reteste |
| [BUG-043](bugs/BUG-043.md) | 2026-10-16 | Limite da campanha estourava sob concorrência | admin | corrigido, aguardando reteste |
| [BUG-044](bugs/BUG-044.md) | 2026-10-16 | Sinal antifraude por IP confiava em cabeçalho do cliente | admin | corrigido, aguardando reteste |
| [BUG-045](bugs/BUG-045.md) | 2026-10-16 | Aviso LGPD com caracteres U+FFFD (fonte fora de UTF-8) | aluno/profissional | corrigido, aguardando reteste |
| [BUG-046](bugs/BUG-046.md) | 2026-10-16 | /api/cep sem limite efetivo por IP e sem cabeçalhos RateLimit | público | corrigido, aguardando reteste |
