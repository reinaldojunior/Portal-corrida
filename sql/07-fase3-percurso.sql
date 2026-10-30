-- PaceClub · Fase 3: percurso (GPX), simulador da prova e ranking de recorde
-- (já aplicado no banco pelo conector do Supabase em 29/10/2026)
-- Cole no SQL Editor do Supabase e clique em Run.

-- 1) Campos do percurso na tabela de corridas
alter table corridas add column if not exists percurso jsonb;          -- pontos [latitude, longitude, altitude]
alter table corridas add column if not exists percurso_km numeric(6,2);
alter table corridas add column if not exists subida_m int;
alter table corridas add column if not exists descida_m int;

-- 2) Novos módulos
insert into modulos (chave, nome, descricao, ativo, ordem) values
  ('simulador',       'Simulador da prova',      'Simula a prova km a km pelo percurso e pelo clima', true, 10),
  ('ranking_recorde', 'Onde bater meu recorde',  'Ranking das provas com mais chance de recorde',     true, 11)
on conflict (chave) do update set ativo = true;

-- 3) O simulador fica dentro da página da corrida, então ela precisa estar ligada
update modulos set ativo = true where chave = 'pagina_corrida';
