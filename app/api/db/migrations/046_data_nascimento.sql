-- BUG-027: data de nascimento no cadastro; a confirmacao de 18+ (legal_acceptances 'maioridade') e gravada a partir dela.
alter table users add column if not exists birth_date date;
