-- Descrições das corridas reescritas a partir da página de inscrição.
-- 1) O robô guarda o texto original da página (descricao_original).
-- 2) Uma tarefa diária do Claude reescreve com as próprias palavras e grava em descricao,
--    só onde descricao está vazia (nunca sobrescreve texto escrito à mão), e marca descricao_auto.
alter table corridas_pendentes
  add column if not exists descricao_original text,
  add column if not exists texto_lido_em timestamptz,
  add column if not exists descricao_auto boolean not null default false,
  add column if not exists descricao_auto_em timestamptz;
alter table corridas
  add column if not exists descricao_original text,
  add column if not exists texto_lido_em timestamptz,
  add column if not exists descricao_auto boolean not null default false,
  add column if not exists descricao_auto_em timestamptz;

-- enriquecimento passa a gravar também o texto da página
create or replace function robo_enriquecer(p_token text, p_itens jsonb)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; n integer;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 60 then raise exception 'lote inválido'; end if;
  update corridas_pendentes p set
    imagem_sugerida = coalesce(p.imagem_sugerida, left(x.imagem, 500)),
    lat = coalesce(p.lat, x.lat),
    lng = coalesce(p.lng, x.lng),
    local_largada = coalesce(p.local_largada, left(x.local, 200)),
    descricao_original = coalesce(nullif(left(x.texto, 6000), ''), p.descricao_original),
    texto_lido_em = case when x.texto is not null then now() else p.texto_lido_em end,
    enriquecido_em = now()
  from jsonb_to_recordset(p_itens) as x(chave text, imagem text, lat double precision, lng double precision, local text, texto text)
  where p.chave = x.chave and p.status = 'pendente';
  get diagnostics n = row_count;
  return n;
end $$;

-- corridas (publicadas e pendentes) que ainda não tiveram o texto da página lido
create or replace function robo_para_ler_textos(p_token text, p_limite integer default 40)
returns table(tabela text, id uuid, link_inscricao text)
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  return query
  (select 'corridas'::text, c.id, c.link_inscricao from corridas c
    where c.status = 'publicado' and c.data >= current_date and c.link_inscricao is not null
      and coalesce(c.descricao, '') = '' and c.texto_lido_em is null
    order by c.data limit least(greatest(coalesce(p_limite, 40), 1), 100))
  union all
  (select 'pendentes'::text, p.id, p.link_inscricao from corridas_pendentes p
    where p.status = 'pendente' and p.data >= current_date and p.link_inscricao is not null
      and coalesce(p.descricao, '') = '' and p.texto_lido_em is null
    order by p.data limit least(greatest(coalesce(p_limite, 40), 1), 100));
end $$;

create or replace function robo_guardar_textos(p_token text, p_itens jsonb)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; n1 integer; n2 integer;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 200 then raise exception 'lote inválido'; end if;
  update corridas c set descricao_original = coalesce(nullif(left(x.texto, 6000), ''), c.descricao_original), texto_lido_em = now()
    from jsonb_to_recordset(p_itens) as x(tabela text, id uuid, texto text) where x.tabela = 'corridas' and c.id = x.id;
  get diagnostics n1 = row_count;
  update corridas_pendentes p set descricao_original = coalesce(nullif(left(x.texto, 6000), ''), p.descricao_original), texto_lido_em = now()
    from jsonb_to_recordset(p_itens) as x(tabela text, id uuid, texto text) where x.tabela = 'pendentes' and p.id = x.id;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $$;

revoke all on function robo_para_ler_textos(text, integer) from public;
revoke all on function robo_guardar_textos(text, jsonb) from public;
grant execute on function robo_para_ler_textos(text, integer) to anon, authenticated;
grant execute on function robo_guardar_textos(text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
