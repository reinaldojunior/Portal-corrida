-- Já aplicado pelo conector do Supabase em 17/11/2026.
-- Percurso 3D da corrida: pontos do KMZ (nomes, grupos, visibilidade), tempo alvo por percurso e estratégia padrão.
-- Leitura segue a política existente (público lê corridas publicadas); só o admin grava (política "admin edita corridas").
alter table public.corridas add column if not exists percurso_3d jsonb;
