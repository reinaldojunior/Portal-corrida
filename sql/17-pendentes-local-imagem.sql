-- Já aplicado pelo conector em 02/11/2026.
alter table public.corridas_pendentes add column if not exists lat double precision;
alter table public.corridas_pendentes add column if not exists lng double precision;
alter table public.corridas_pendentes add column if not exists local_largada text;
alter table public.corridas_pendentes add column if not exists imagem_sugerida text;
