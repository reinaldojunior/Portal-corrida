-- 1) Registro de cada rodada do robô (coleta e enriquecimento), para a aba "Robô" do admin.
--    A rodada grava o início; se a Vercel derrubar por tempo, o registro fica sem fim = "não terminou".
create table if not exists robo_execucoes (
  id bigserial primary key,
  rota text not null,              -- coletar / enriquecer
  parametros text,                 -- ex.: grupo=1, site=sympla.com.br, so=pinos
  origem text not null default 'agendado',  -- agendado / admin
  inicio timestamptz not null default now(),
  fim timestamptz,
  ok boolean,
  resultado jsonb,
  erro text
);
create index if not exists robo_execucoes_inicio on robo_execucoes (inicio desc);
alter table robo_execucoes enable row level security;
grant select on robo_execucoes to authenticated;
drop policy if exists "admin vê execuções" on robo_execucoes;
create policy "admin vê execuções" on robo_execucoes for select using (is_admin());

create or replace function robo_log_inicio(p_token text, p_rota text, p_parametros text, p_origem text default 'agendado')
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; novo bigint;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  delete from robo_execucoes where inicio < now() - interval '60 days';
  insert into robo_execucoes (rota, parametros, origem) values (left(p_rota, 40), left(p_parametros, 200), left(coalesce(p_origem, 'agendado'), 20)) returning id into novo;
  return novo;
end $$;

create or replace function robo_log_fim(p_token text, p_id bigint, p_ok boolean, p_resultado jsonb, p_erro text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  update robo_execucoes set fim = now(), ok = p_ok, resultado = p_resultado, erro = left(p_erro, 1000) where id = p_id;
end $$;

-- 2) Corridas que já passaram: pendentes vencidas saem da fila e as inscrições das publicadas fecham.
--    As corridas publicadas continuam no ar (a página mostra "já aconteceu"), só saem da agenda.
alter table corridas_pendentes drop constraint if exists corridas_pendentes_status_check;
alter table corridas_pendentes add constraint corridas_pendentes_status_check check (status in ('pendente', 'aprovada', 'recusada', 'expirada'));

create or replace function robo_limpar_passadas(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; np int; nc int;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  update corridas_pendentes set status = 'expirada', revisado_em = now() where status = 'pendente' and data < current_date;
  get diagnostics np = row_count;
  update corridas set inscricoes_abertas = false where inscricoes_abertas and data < current_date;
  get diagnostics nc = row_count;
  return jsonb_build_object('pendentes_expiradas', np, 'inscricoes_fechadas', nc);
end $$;

revoke all on function robo_log_inicio(text, text, text, text) from public;
revoke all on function robo_log_fim(text, bigint, boolean, jsonb, text) from public;
revoke all on function robo_limpar_passadas(text) from public;
grant execute on function robo_log_inicio(text, text, text, text) to anon, authenticated;
grant execute on function robo_log_fim(text, bigint, boolean, jsonb, text) to anon, authenticated;
grant execute on function robo_limpar_passadas(text) to anon, authenticated;
notify pgrst, 'reload schema';
