-- Já aplicado pelo conector em 02/11/2026.
alter table public.corridas_pendentes add column if not exists percurso_url text;
alter table public.corridas_pendentes add column if not exists percurso_info text;
