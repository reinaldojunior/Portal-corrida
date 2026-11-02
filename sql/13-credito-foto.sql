-- Já aplicado pelo conector em 01/11/2026.
alter table public.noticias add column if not exists imagem_credito text;
alter table public.corridas add column if not exists imagem_credito text;
