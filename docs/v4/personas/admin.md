# Persona — Administrador

**Lucas**, dono/administrador AVADESK. Notebook 1280px no escritório, às vezes celular.

| Item | Detalhe |
|---|---|
| Objetivo | Liberar contas e profissionais rápido, acompanhar números, garantir LGPD e segurança |
| Aparelho | Notebook (1280×860); celular para urgências |
| Nível técnico | Alto |
| Medos | Aluno ou personal acessar área de admin; ação sem rastro na auditoria |

## Jornadas
1. Percorrer **todas as áreas**: visão geral, contas, pendências, liberações, profissionais, verificações, vínculos, convites, assinaturas, limites, solicitações, programas, modelos, biblioteca, publicações, moderação, grupos, desafios, ranking, atendimentos, LGPD, termos, auditoria, configurações.
2. **Ações**: painel do usuário, aprovar liberação, verificar registro, ativar profissional (Situação = ativo com motivo), abrir assinatura, conferir auditoria, tour por Ajuda, Biblioteca, layout no celular.
3. **Negativos e permissões**: profissional inexistente (404), API admin sem login (401), aluno e personal na API/tela de admin (403/redirecionamento), aluno tentando liberar a si mesmo, personal tentando se autoverificar.

## Expectativas
- Nenhuma área quebrada ou vazia sem explicação.
- Toda ação crítica pede motivo e fica na auditoria.
- Bloqueios de permissão no servidor, não só na tela.

Suíte automatizada: `app/frontend/e2e/personas/admin.spec.js`.
