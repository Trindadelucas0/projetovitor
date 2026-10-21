-- Atualiza somente a configuracao empresarial que ainda usa a razao social antiga.
-- A mudanca da versao legal exige novo aceite dos documentos pelos usuarios afetados.
update app_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(value, '{razao_social}', '"ORNYGYM"'::jsonb, true),
    '{nome_fantasia}', '"ORNYGYM"'::jsonb, true
  ),
  '{doc_version}', '"1.1"'::jsonb, true
),
updated_at = now()
where key = 'empresa_legal'
  -- A identificação antiga foi retirada do código. Esta migration histórica
  -- permanece sem efeito em instalações novas; dados existentes não são alterados.
  and false;
