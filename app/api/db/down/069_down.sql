-- Desfaz a marcação do personal do ambiente.
--
-- Remove apenas o que a 069 criou e é seguro remover: a chave de configuração
-- 'personal_user_id'. Sem ela, a isenção de vaga/limite deixa de valer e o vínculo
-- automático no cadastro para de acontecer — que é o estado anterior.
--
-- NÃO desfaz, de propósito:
--   - perfis profissionais ativados: podem ter sido usados para publicar fichas reais;
--     desativar quebraria o acesso do personal às próprias fichas;
--   - plano de acesso 'personal_unico' e as atribuições: desatribuir deixaria alunos
--     sem plano de acesso, impedindo qualquer vínculo;
--   - vínculos aluno↔personal já criados.
-- Reverter esses três exige decisão caso a caso, com os dados na mão.

delete from app_settings where key = 'personal_user_id';
