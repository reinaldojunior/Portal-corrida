-- PaceClub · Novo módulo: Zonas de frequência cardíaca
-- Cole no SQL Editor do Supabase e clique em Run.
insert into modulos (chave, nome, descricao, ativo, ordem) values
  ('zonas_fc', 'Zonas de frequência cardíaca', 'Calculadora de zonas de FC com pace por zona', true, 6)
on conflict (chave) do update set ativo = true;
