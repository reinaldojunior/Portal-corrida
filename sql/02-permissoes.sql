-- =========================================================
-- PaceClub · Correção de permissões
-- Cole no SQL Editor do Supabase e clique em Run.
-- Resolve o erro "permission denied for table ..." (código 42501).
-- =========================================================

grant usage on schema public to anon, authenticated;

-- Leitura pública (o que cada visitante pode ver é controlado pelas
-- políticas de RLS que já criamos; isto só libera o acesso à tabela)
grant select on modulos, corridas, corrida_distancias, noticias to anon, authenticated;

-- Cadastro no aviso de novas provas
grant insert on inscritos_avisos to anon, authenticated;

-- O que o administrador logado pode fazer
grant select, insert, update, delete on
  corridas, corrida_distancias, noticias, inscritos_avisos, admins
  to authenticated;
