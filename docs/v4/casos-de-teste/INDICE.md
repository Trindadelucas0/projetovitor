# Casos de teste por persona — índice

- Documento principal: [CASOS-DE-TESTE-AVAGYM.md](CASOS-DE-TESTE-AVAGYM.md)
- Por perfil: [aluno-cliente.md](aluno-cliente.md) · [aluno-do-personal.md](aluno-do-personal.md) · [personal.md](personal.md) · [admin.md](admin.md)
- Personas: [../personas/](../personas/)
- Suítes: `app/frontend/e2e/personas/*.spec.js` (kit em `_kit.js`)

## Como reexecutar (só local)
1. API local em :8787 com Postgres local (nunca a VPS). Sem `RESEND_API_KEY` no ambiente.
2. `cd app/frontend && env -u RESEND_API_KEY npx playwright test e2e/personas/`
3. `python3 docs/v4/casos-de-teste/gerar-casos.py` (gera os .md a partir de `resultados-*.json`).
Cada execução cria contas fictícias novas; nada é apagado.
