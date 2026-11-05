-- Padrão de busca também para a descrição da corrida (por site)
alter table padroes_busca add column if not exists desc_antes text, add column if not exists desc_depois text;
-- admin_reprocessar_site: também devolve à fila de leitura de texto as corridas do site sem descricao_original
-- (ver a função no banco; criada com create or replace)
