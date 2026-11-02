-- Já aplicado pelo conector em 02/11/2026.
alter table public.corrida_distancias add column if not exists horas numeric;
alter table public.corrida_distancias alter column km drop not null;
