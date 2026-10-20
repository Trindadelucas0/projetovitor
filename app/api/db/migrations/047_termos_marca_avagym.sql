-- BUG-028: texto dos termos (terms_versions) ainda dizia "versao provisoria" e "AVADESK Fitness".
-- Ajuste NO MESMO registro/versao (nao muda a versao, entao ninguem e obrigado a aceitar de novo). Placeholders da empresa ficam.
update terms_versions set
  title = btrim(replace(replace(title, ' (versão provisória)', ''), '(versão provisória)', '')),
  body = replace(replace(replace(regexp_replace(body, '^TEXTO PROVISÓRIO[^\n]*[\r\n]+', ''), 'AVADESK Fitness', 'AVAGYM'), 'AVADESK', 'AVAGYM'), 'Avadesk', 'AVAGYM')
where title ilike '%provisória%' or body ilike '%AVADESK%' or body like 'TEXTO PROVISÓRIO%';