-- Reverte 080 (apaga a agenda de calls e as reservas).
drop table if exists call_bookings;
drop table if exists personal_availability;
alter table professional_profiles drop column if exists zoom_url;
