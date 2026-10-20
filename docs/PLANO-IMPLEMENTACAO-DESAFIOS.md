# Plano de implementação — Desafios (executado)

| Fase | Conteúdo | Migração | Commit (local, sem push) | Smoke |
|---|---|---|---|---|
| 8 | Tempo de treino (cronômetro, pausa, descanso real) | 012 | "Tempo de treino…" | fase8 |
| A | Grupos | 013 | "V5 fase A…" | fase9 |
| B | Desafios: assistente, estados, regras versionadas, inscrições, convites, equipes | 014 | "V5 fase B…" | fase10 |
| B+ | Fim inclusivo; tela admin de limites por categoria | — | 8cc3d8b | fase10 |
| C | Feed do desafio, comprovantes, revisores, denúncias, silenciar sociais | 015 | 69c0fff / 5369115 | fase11 |
| D (V6) | Pontuação/ranking no backend, pódio, Minha posição, Entender pontuação, equipes, coletivo | 016 | 9e1ccf8 | fase12 |
| E | Troféus, prêmios oficiais, homologação, entregas, painéis admin/criador | 017 | "V5 fase E…" | fase13 |

Disciplina: backup `backup-db.ps1` (pg_dump.exe + DB_* do `.env`; a cadeia para se falhar) → pull do bundle → `migrate.js --no-seed` → reinício da API → `setup-e2e` → `smoke.mjs`.
Backups: `backups/avagym_20261014_*_antes_012…017.dump`.
