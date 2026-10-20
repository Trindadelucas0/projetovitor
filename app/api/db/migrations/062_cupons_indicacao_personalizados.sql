-- Cupons personalizados: teste somente por cupom criado pelo administrador.
-- Preserva concessoes, resgates e historico existentes.
update plans set trial_days=null, updated_at=now() where trial_days is not null;

update campaigns
set status='pausada', updated_at=now(), notes=concat_ws(' | ', notes, 'Pausada pela migration 062: cupons de indicacao agora sao criados pelo administrador.')
where name='Indicações de usuários' and status='ativa';

update promotion_codes pc
set status='pausado'
from campaigns c
where pc.campaign_id=c.id and c.name='Indicações de usuários' and pc.status='ativo';
