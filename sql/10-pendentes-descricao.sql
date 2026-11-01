-- Já aplicado pelo conector em 31/10/2026.
alter table public.corridas_pendentes add column if not exists descricao text;
alter table public.corridas_pendentes add column if not exists organizador text;
