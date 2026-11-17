-- Robô de percursos: procura GPX/KML/KMZ (Google My Maps, RideWithGPS, arquivo direto) na página de inscrição
-- das provas futuras sem percurso. O que achar fica em percurso_sugestao até o admin aprovar ou descartar.
alter table corridas
  add column if not exists percurso_busca_em timestamptz,
  add column if not exists percurso_sugestao jsonb;

-- fila: publicadas, futuras, com link, sem GPX em nenhuma distância, sem sugestão pendente,
-- nunca procuradas ou procuradas há mais de 7 dias
create or replace function robo_para_buscar_percurso(p_token text, p_limite integer default 25)
returns table(id uuid, link_inscricao text, distancias jsonb)
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  return query
  select c.id, c.link_inscricao,
         coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'rotulo', d.rotulo, 'km', d.km) order by d.km)
                   from corrida_distancias d where d.corrida_id = c.id), '[]'::jsonb)
  from corridas c
  where c.status = 'publicado' and c.data >= current_date
    and coalesce(c.link_inscricao, '') <> ''
    and jsonb_array_length(coalesce(c.percurso, '[]'::jsonb)) <= 1
    and not exists (select 1 from corrida_distancias d where d.corrida_id = c.id and jsonb_array_length(coalesce(d.percurso, '[]'::jsonb)) > 1)
    and c.percurso_sugestao is null
    and (c.percurso_busca_em is null or c.percurso_busca_em < now() - interval '7 days')
  order by c.percurso_busca_em nulls first, c.data
  limit least(greatest(p_limite, 1), 60);
end $$;

-- grava a procura: sempre marca a data; a sugestão só quando o robô achou algo
create or replace function robo_guardar_percurso(p_token text, p_itens jsonb)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; n integer;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 30 or length(p_itens::text) > 3000000 then raise exception 'lote inválido'; end if;
  update corridas c set
    percurso_busca_em = now(),
    percurso_sugestao = case when jsonb_typeof(x.sugestao) = 'object' then x.sugestao else c.percurso_sugestao end
  from jsonb_to_recordset(p_itens) as x(id uuid, sugestao jsonb)
  where c.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function robo_para_buscar_percurso(text, integer) from public;
revoke all on function robo_guardar_percurso(text, jsonb) from public;
grant execute on function robo_para_buscar_percurso(text, integer) to anon, authenticated;
grant execute on function robo_guardar_percurso(text, jsonb) to anon, authenticated;
