-- Reverte 082. Remove apenas cards automaticos sem URL, que nao cabem no contrato anterior.
delete from community_notices where live_id is not null and destination_url is null;
drop index if exists community_notices_live_unique;
alter table community_notices drop column if exists live_id;
alter table community_notices alter column destination_url set not null;
