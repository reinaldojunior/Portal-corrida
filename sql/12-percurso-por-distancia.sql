-- Já aplicado pelo conector em 01/11/2026.
alter table public.corrida_distancias add column if not exists percurso jsonb;
alter table public.corrida_distancias add column if not exists percurso_km numeric;
alter table public.corrida_distancias add column if not exists subida_m integer;
alter table public.corrida_distancias add column if not exists descida_m integer;
