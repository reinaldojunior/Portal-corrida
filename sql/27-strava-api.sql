-- Conexão com a API do Strava (importar GPX das rotas). O refresh token fica numa linha só,
-- sem leitura direta: apenas as funções abaixo, e só para admin.
create table if not exists strava_conta (
  id int primary key default 1 check (id = 1),
  refresh_token text not null,
  atleta text,
  atualizado timestamptz not null default now()
);
alter table strava_conta enable row level security;
revoke all on strava_conta from anon, authenticated;

create or replace function strava_token()
returns text language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  return (select refresh_token from strava_conta where id = 1);
end $$;

create or replace function strava_salvar_token(t text, quem text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  insert into strava_conta (id, refresh_token, atleta, atualizado) values (1, t, quem, now())
  on conflict (id) do update set refresh_token = excluded.refresh_token, atleta = coalesce(excluded.atleta, strava_conta.atleta), atualizado = now();
end $$;

revoke all on function strava_token() from public, anon;
revoke all on function strava_salvar_token(text, text) from public, anon;
grant execute on function strava_token() to authenticated;
grant execute on function strava_salvar_token(text, text) to authenticated;
