-- Clubes do Strava monitorados pelo robô de coleta.
-- Cada clube ativo é consultado diariamente; novos eventos viram rascunhos em corridas_pendentes.

create table if not exists strava_clubes (
  id        serial primary key,
  slug      text not null unique,       -- slug ou id numérico do clube no Strava
  nome      text,                       -- nome amigável para exibição no admin
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table strava_clubes enable row level security;
create policy "admin_tudo" on strava_clubes
  using (is_admin()) with check (is_admin());

-- Rastreia quais eventos do Strava já foram importados (evita duplicatas)
alter table corridas add column if not exists strava_event_id text;
alter table corridas_pendentes add column if not exists strava_event_id text;

create index if not exists idx_corridas_strava_event_id
  on corridas (strava_event_id)
  where strava_event_id is not null;

create index if not exists idx_pendentes_strava_event_id
  on corridas_pendentes (strava_event_id)
  where strava_event_id is not null;

-- Funções para o robô acessar o token Strava sem JWT de usuário.
-- Requer SUPABASE_SERVICE_KEY (service role) no lado servidor.
create or replace function strava_token_servico()
returns text language plpgsql security definer set search_path = public as $$
begin
  return (select refresh_token from strava_conta where id = 1);
end $$;

create or replace function strava_salvar_token_servico(t text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update strava_conta set refresh_token = t, atualizado = now() where id = 1;
end $$;

revoke all on function strava_token_servico() from public, anon, authenticated;
revoke all on function strava_salvar_token_servico(text) from public, anon, authenticated;
-- só acessíveis com service role (SUPABASE_SERVICE_KEY)
