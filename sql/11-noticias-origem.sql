-- Já aplicado pelo conector em 31/10/2026.
alter table public.noticias add column if not exists fonte_nome text;
alter table public.noticias add column if not exists fonte_url text;
alter table public.noticias add column if not exists fontes_extras text;
alter table public.noticias add column if not exists origem text not null default 'manual';
alter table public.noticias add column if not exists verificacao text;
alter table public.noticias add column if not exists verificacao_nota text;
alter table public.noticias add column if not exists verificado_em timestamptz;
