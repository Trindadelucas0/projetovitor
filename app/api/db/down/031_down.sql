-- Reverte a 031. Atenção: a escolha do treino ativo e o histórico de trocas deixam de existir (user_programs/pro_plans ficam intactos).
drop table if exists student_active_training_history;
drop table if exists student_active_training;
alter table users drop constraint if exists users_theme_pref_chk;
alter table users drop column if exists theme_pref;
