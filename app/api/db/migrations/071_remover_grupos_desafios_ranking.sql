-- ORNY 2.0.1: retirada definitiva de Grupos, Desafios, Ranking e premiações.
-- Migration deliberadamente destrutiva. Aplicar somente após backup validado do
-- PostgreSQL e execução do limpador de mídias de desafios em modo confirmado.

-- Contratos comerciais deixam de anunciar/autorizar os recursos retirados.
update plan_versions
set features = features - 'ranking' - 'desafios_oficiais'
where features ? 'ranking' or features ? 'desafios_oficiais';

delete from entitlement_grants
where kind = 'feature' and key in ('ranking', 'desafios_oficiais');

update plans
set description = regexp_replace(
      regexp_replace(coalesce(description, ''), ',? *ranking', '', 'gi'),
      ',? *desafios? *(oficiais)?', '', 'gi'
    ),
    benefits = (
      select coalesce(jsonb_agg(item), '[]'::jsonb)
      from jsonb_array_elements(coalesce(plans.benefits, '[]'::jsonb)) item
      where coalesce(item->>'key', '') not in ('ranking', 'desafios', 'desafios_oficiais', 'trofeus', 'premiacoes')
        and coalesce(item->>'label', '') !~* '(ranking|desafio|troféu|trofeu|premia)'
    ),
    updated_at = now();

delete from app_settings
where key in ('ranking_percentual_sessao', 'ranking_min_percent', 'ranking_timezone');

-- Referências externas e históricos específicos dos recursos retirados.
delete from notifications
where kind ~* '^(desafio|challenge|ranking|grupo|group|premio|prize|trofeu|trophy)'
   or link ~* '(/desafio/|/desafios|/grupo/|[?&]tab=(desafios|grupos|ranking)|/ranking)';

delete from content_reports
where target_type in ('ch_post', 'ch_comment', 'challenge', 'group', 'proof');

delete from audit_log
where coalesce(entity, '') ~* '^(challenge|desafio|group|grupo|ranking|prize|premio|trophy|trofeu)'
   or action ~* '(challenge|desafio|group|grupo|ranking|prize|premio|trophy|trofeu)';

alter table content_reports drop constraint if exists content_reports_target_type_check;
alter table content_reports
  add constraint content_reports_target_type_check
  check (target_type in ('post', 'comment', 'user'));

-- Dependências são removidas das folhas para as tabelas-raiz.
drop table if exists prize_log cascade;
drop table if exists prize_winners cascade;
drop table if exists prizes cascade;
drop table if exists user_trophies cascade;
drop table if exists challenge_trophies cascade;
drop table if exists trophy_templates cascade;

drop table if exists challenge_results cascade;
drop table if exists challenge_media cascade;
drop table if exists challenge_feed_bans cascade;
drop table if exists proof_reviewers cascade;
drop table if exists challenge_proof_log cascade;
drop table if exists challenge_proofs cascade;
drop table if exists challenge_post_comments cascade;
drop table if exists challenge_post_likes cascade;
drop table if exists challenge_posts cascade;
drop table if exists challenge_status_log cascade;
drop table if exists challenge_members cascade;
drop table if exists challenge_teams cascade;
drop table if exists challenge_rule_versions cascade;
drop table if exists challenges cascade;
drop table if exists challenge_categories cascade;

drop table if exists group_members cascade;
drop table if exists share_invites cascade;
drop table if exists groups cascade;

drop table if exists ranking_snapshots cascade;
drop table if exists ranking_pref_history cascade;
drop table if exists ranking_prefs cascade;
