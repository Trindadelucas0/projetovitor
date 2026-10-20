-- Atualiza somente a configuracao empresarial que ainda usa a razao social antiga.
-- A mudanca da versao legal exige novo aceite dos documentos pelos usuarios afetados.
update app_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(value, '{razao_social}', '"ORNYGYM"'::jsonb, true),
            '{nome_fantasia}', '"ORNYGYM"'::jsonb, true
          ),
          '{email_suporte}', '"avadesktech@gmail.com"'::jsonb, true
        ),
        '{email_dpo}', '"avadesktech@gmail.com"'::jsonb, true
      ),
      '{email_financeiro}', '"avadesktech@gmail.com"'::jsonb, true
    ),
    '{email_moderacao}', '"avadesktech@gmail.com"'::jsonb, true
  ),
  '{doc_version}', '"1.1"'::jsonb, true
),
updated_at = now()
where key = 'empresa_legal'
  and value->>'razao_social' = '67.790.913 LUCAS RODRIGUES DA TRINDADE';
