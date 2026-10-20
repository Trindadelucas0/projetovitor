# Modelo de dados — Grupos, Desafios, Ranking, Troféus e Prêmios

Migrações (cada uma com backup `pg_dump` antes e script de volta em `db/down/`):
| Migração | Tabelas |
|---|---|
| 013_grupos | `groups`, `group_members`, `share_invites` (convites de grupo **e** desafio; a tabela legada `invites` foi preservada) |
| 014_desafios | `challenge_categories` (min/max dias), `challenges`, `challenge_rule_versions`, `challenge_teams`, `challenge_members`, `challenge_status_log` |
| 015_desafios_feed_comprovantes | `challenge_posts`, `challenge_post_likes`, `challenge_post_comments`, `challenge_proofs`, `challenge_proof_log`, `proof_reviewers`, `challenge_media` (dono de cada arquivo), `challenge_feed_bans`, `notification_prefs`; `content_reports.target_type` ampliado |
| 016_desafios_ranking | `challenge_results` (kind provisório/final, `rules_version`, `period_start/end`, `data` jsonb, `homologated_at/by`) |
| 017_trofeus_premiacoes | `trophy_templates`, `challenge_trophies`, `user_trophies`, `prizes`, `prize_winners`, `prize_log` |

Chaves importantes:
- `challenge_proofs`: índice único parcial `(challenge_id, session_id)` para comprovantes vivos → uma sessão, um comprovante por desafio. `sha256` indexado → arquivo repetido recusado.
- `challenge_posts`: único `(author_id, client_id)` → reenvio após falha não duplica.
- `user_trophies`: único `(user_id, challenge_id, template_id)`.
- `prize_winners`: único `(prize_id, user_id)`.
- Sessões usadas na contagem: `sessions.status='done'`, `finished_at` presente, `voided_at` e `ranking_invalid_at` nulos.

Retenção: mídias em `api/uploads` (mesmo armazenamento do feed). Registros de comprovante e prêmio são mantidos para auditoria; remoção de conta (`scripts/remover-usuarios.mjs`) apaga em cascata.
