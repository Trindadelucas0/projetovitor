# Autenticação e permissões

- **Senha**: bcrypt (custo 12). Login em `POST /api/auth/login`; sessão por JWT em cookie `avagym_token` (HttpOnly, Secure em HTTPS, SameSite) ou `Authorization: Bearer`. `token_version` em users permite encerrar todas as sessões.
- **Cadastro**: nome, e-mail, senha (mín. 8), data de nascimento (18+ calculado no servidor), aceite obrigatório de Termos e Privacidade, consentimento de saúde opcional; aceites gravados em `legal_acceptances` na mesma transação (BUG-019/027).
- **Papéis**: `user_roles.role_id` ∈ {aluno, profissional, admin}; contexto ativo em `users.active_context`.
- **Gates**: troca obrigatória de senha provisória (`must_change_password`), termos (versão nova ou conta sem aceite), conta bloqueada (`status`, `disabled_at`), liberação de ações (`access_unlocked_at`).
- **Permissão** central: rotas `/api/adm/*` só admin (403 PERMISSION_DENIED); rotas do profissional exigem perfil e, para vínculos, habilitação verificada; IDOR testado em `v5-seguranca.mjs`.
- **Recuperação de senha**: link de uso único por e-mail, com expiração e limite por endereço.
