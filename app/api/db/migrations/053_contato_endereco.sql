-- V5 (pedido do Lucas 16/10/2026): contato e endereco no cadastro/perfil.
-- Telefone, e-mail e bairro sao privados por padrao (cada um com toggle); cidade/UF publicas por padrao (toggle);
-- rua, numero, complemento e CEP NUNCA sao publicos. Exportado e apagado pela LGPD (FK para users).
create table if not exists user_contact (
  user_id uuid primary key references users(id) on delete cascade,
  tenant_id uuid not null,
  phone text, cep text, street text, number text, complement text, neighborhood text, city text, uf text,
  show_phone boolean not null default false,
  show_email boolean not null default false,
  show_address boolean not null default false,
  show_city boolean not null default true,
  updated_at timestamptz not null default now(),
  check (phone is null or phone ~ '^[0-9]{10,11}$'),
  check (cep is null or cep ~ '^[0-9]{8}$'),
  check (uf is null or uf ~ '^[A-Z]{2}$')
);