-- Reprocessamento automático: todo dia (agendamento das 5h) devolve à fila do robô as pendentes
-- sem imagem ou sem local que foram lidas há mais de 3 dias. Organizadores costumam publicar a arte
-- e o local dias depois de abrir as inscrições. Cada prova volta no máximo 5 vezes.
alter table corridas_pendentes add column if not exists reprocessamentos integer not null default 0;

create or replace function robo_reprocessar_incompletas(p_token text, p_limite integer default 150)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; n integer;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  update corridas_pendentes set enriquecido_em = null, tentativas_enriquecer = 0, reprocessamentos = reprocessamentos + 1
   where id in (
     select id from corridas_pendentes
      where status = 'pendente' and data >= current_date and link_inscricao is not null
        and enriquecido_em is not null and enriquecido_em < now() - interval '3 days'
        and (imagem_sugerida is null or lat is null)
        and reprocessamentos < 5
      order by data
      limit least(greatest(coalesce(p_limite, 150), 1), 500));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function robo_reprocessar_incompletas(text, integer) from public;
grant execute on function robo_reprocessar_incompletas(text, integer) to anon, authenticated;
notify pgrst, 'reload schema';
