-- Auditoria de segurança (11/11/2026)
-- 1) Inscrição nos avisos:
--    - devolve confirmacao_enviada_em, para o servidor não reenviar o e-mail de confirmação mais de 1x por dia;
--    - inscrição cancelada só volta com nova confirmação (antes, qualquer um reativava o e-mail de outra pessoa);
--    - inscrição ativa e confirmada não é alterada por terceiros.
-- O tipo de retorno mudou: precisa recriar a função (e refazer as permissões).
drop function if exists robo_avisos_inscrever(text, text, text, double precision, double precision, integer, text[]);
create function robo_avisos_inscrever(p_token text, p_email text, p_cidade text, p_lat double precision, p_lng double precision, p_raio integer, p_dist text[])
returns table(id uuid, token uuid, confirmado boolean, confirmacao_enviada_em timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'e-mail inválido'; end if;
  return query
  insert into inscritos_avisos as i (email, cidade, lat, lng, raio_km, distancias, ativo)
  values (lower(trim(p_email)), left(p_cidade, 80), p_lat, p_lng, least(greatest(coalesce(p_raio, 50), 5), 500), coalesce(p_dist, '{}'), true)
  on conflict (lower(email)) do update set cidade = excluded.cidade, lat = excluded.lat, lng = excluded.lng,
     raio_km = excluded.raio_km, distancias = excluded.distancias,
     confirmado = false,
     confirmacao_enviada_em = case when i.ativo then i.confirmacao_enviada_em else null end,
     ativo = true
  where not (i.confirmado and i.ativo)
  returning i.id, i.token, i.confirmado, i.confirmacao_enviada_em;
  if not found then
    return query select i.id, i.token, i.confirmado, i.confirmacao_enviada_em
      from inscritos_avisos i where lower(i.email) = lower(trim(p_email));
  end if;
end $$;
revoke all on function robo_avisos_inscrever(text, text, text, double precision, double precision, integer, text[]) from public;
grant execute on function robo_avisos_inscrever(text, text, text, double precision, double precision, integer, text[]) to anon, authenticated;

-- 2) Aviso do verificador do Supabase: search_path fixo
alter function public.noticias_autor_mapmove() set search_path = public;

notify pgrst, 'reload schema';
