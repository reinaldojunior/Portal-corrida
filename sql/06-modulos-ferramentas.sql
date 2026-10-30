-- PaceClub · Novas ferramentas
-- (já aplicado no banco pelo conector do Supabase em 29/10/2026)
-- Cole no SQL Editor do Supabase e clique em Run.
insert into modulos (chave, nome, descricao, ativo, ordem) values
  ('ritmos_treino',     'Ritmos de treino',     'Ritmos de rodagem, limiar e tiros pelo método VDOT', true, 7),
  ('pulseira_pace',     'Pulseira de pace',     'Tempos de passagem por km para o tempo alvo',         true, 8),
  ('conversor_esteira', 'Conversor de esteira', 'Pace em km/h e min/milha e o contrário',              true, 9)
on conflict (chave) do update set ativo = true;
