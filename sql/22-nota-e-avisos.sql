-- ============ 1) Nota de confiança das pendentes (0 a 100) ============
-- link 20 · imagem 20 · pino 10 · pino conferido 10 · local exato (não só a cidade) 15 · distâncias 15 · horário 5 · descrição 5
-- O robô só publica sozinho com nota >= 90 (exige link, imagem, pino conferido, local exato e distâncias).

-- o local é só o nome da cidade/estado? (ex.: "Anápolis Goiás", "Valinhos, SP", "Centro")
create or replace function local_so_cidade(p_local text, p_cidade text, p_uf text)
returns boolean language sql stable set search_path = public, extensions as $$
  select p_local is null or length(regexp_replace(
    regexp_replace(
      replace(lower(unaccent(p_local)), lower(unaccent(coalesce(p_cidade, '~'))), ' '),
      '\m(' || coalesce(lower(p_uf), 'zz') || '|brasil|centro|estado|de|do|da|acre|alagoas|amapa|amazonas|bahia|ceara|distrito|federal|espirito|santo|goias|maranhao|mato|grosso|sul|minas|gerais|para|paraiba|parana|pernambuco|piaui|rio|janeiro|grande|norte|rondonia|roraima|santa|catarina|sao|paulo|sergipe|tocantins)\M', ' ', 'g'),
    '[^a-z0-9]', '', 'g')) < 4
$$;

-- campo calculado: aparece na API como "nota_pendente" (select=*,nota_pendente)
create or replace function nota_pendente(p corridas_pendentes)
returns integer language sql stable set search_path = public, extensions as $$
  select case when p.link_inscricao is null then 0 else
      20
    + case when p.imagem_sugerida is not null then 20 else 0 end
    + case when p.lat is not null and p.lng is not null then 10 else 0 end
    + case when p.lat is not null and p.pino_conferido_em is not null then 10 else 0 end
    + case when p.lat is not null and not local_so_cidade(p.local_largada, p.cidade, p.estado) then 15 else 0 end
    + case when coalesce(p.distancias, '') <> '' then 15 else 0 end
    + case when p.horario is not null then 5 else 0 end
    + case when coalesce(p.descricao, '') <> '' then 5 else 0 end
  end
$$;
grant execute on function nota_pendente(corridas_pendentes) to anon, authenticated;
grant execute on function local_so_cidade(text, text, text) to anon, authenticated;

-- publicação automática do robô: agora pela nota (>= 90)
create or replace function robo_publicar_completas(p_token text)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; p record; novo uuid; n integer := 0; base text; s text; k int;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  for p in
    select cp.* from corridas_pendentes cp
    where cp.status = 'pendente' and cp.data >= current_date
      and cp.link_inscricao is not null and coalesce(cp.distancias, '') <> ''
      and cp.imagem_sugerida is not null and cp.lat is not null and cp.lng is not null and cp.pino_conferido_em is not null
      and nota_pendente(cp) >= 90
    order by cp.data limit 100
  loop
    if exists (select 1 from corridas c where c.data = p.data and lower(unaccent(c.cidade)) = lower(unaccent(p.cidade))
               and similarity(lower(unaccent(c.nome)), lower(unaccent(p.nome))) > 0.55) then
      update corridas_pendentes set status = 'aprovada', revisado_em = now(), observacao = coalesce(observacao || ' ', '') || '(já existia no site)' where id = p.id;
      continue;
    end if;
    base := trim(both '-' from left(regexp_replace(lower(unaccent(p.nome || '-' || p.data::text)), '[^a-z0-9]+', '-', 'g'), 90));
    s := base; k := 1;
    while exists (select 1 from corridas where slug = s) loop k := k + 1; s := base || '-' || k; end loop;
    insert into corridas (slug, nome, cidade, estado, data, horario, local_largada, lat, lng, descricao, organizador, link_inscricao,
                          imagem_url, imagem_credito, status, origem, inscricoes_abertas)
    values (s, p.nome, p.cidade, coalesce(p.estado, 'SP'), p.data, p.horario, p.local_largada, p.lat, p.lng, p.descricao, p.organizador, p.link_inscricao,
            p.imagem_sugerida, 'Imagem: divulgação' || coalesce(' / ' || p.organizador, ''), 'publicado', 'ia', true)
    returning id into novo;
    insert into corrida_distancias (corrida_id, rotulo, km)
    select novo, d.rotulo,
           case when d.num is null then null when d.num between 21 and 21.2 then 21.0975 when d.num between 42 and 42.3 then 42.195 else d.num end
    from (select trim(x) as rotulo, nullif(replace(substring(trim(x) from '^(\d+(?:[.,]\d+)?)\s*[Kk]'), ',', '.'), '')::numeric as num
          from regexp_split_to_table(p.distancias, '\s*,\s*(?!\d)') as x where trim(x) <> '') d;
    update corridas_pendentes set status = 'aprovada', corrida_id = novo, revisado_em = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ 2) Avisos por e-mail (inscrição com preferências e confirmação) ============
alter table inscritos_avisos
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists raio_km integer not null default 50,
  add column if not exists distancias text[] not null default '{}',     -- vazio = todas; ex.: {5K,10K,21K,42K}
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists confirmado boolean not null default false,
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmacao_enviada_em timestamptz,
  add column if not exists ativo boolean not null default true,
  add column if not exists ultimo_envio timestamptz;
create unique index if not exists inscritos_avisos_email on inscritos_avisos (lower(email));
create unique index if not exists inscritos_avisos_token on inscritos_avisos (token);
-- a inscrição agora passa pelo servidor (que manda o e-mail de confirmação); ninguém insere direto
drop policy if exists "qualquer um se inscreve" on inscritos_avisos;
revoke insert on inscritos_avisos from anon, authenticated;

-- servidor (com a chave do robô): cria ou atualiza a inscrição e devolve o token para o e-mail de confirmação
create or replace function robo_avisos_inscrever(p_token text, p_email text, p_cidade text, p_lat double precision, p_lng double precision, p_raio integer, p_dist text[])
returns table(id uuid, token uuid, confirmado boolean) language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'e-mail inválido'; end if;
  return query
  insert into inscritos_avisos as i (email, cidade, lat, lng, raio_km, distancias, ativo)
  values (lower(trim(p_email)), left(p_cidade, 80), p_lat, p_lng, least(greatest(coalesce(p_raio, 50), 5), 500), coalesce(p_dist, '{}'), true)
  on conflict (lower(email)) do update set cidade = excluded.cidade, lat = excluded.lat, lng = excluded.lng,
     raio_km = excluded.raio_km, distancias = excluded.distancias, ativo = true
  returning i.id, i.token, i.confirmado;
end $$;

create or replace function avisos_confirmar(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update inscritos_avisos set confirmado = true, confirmado_em = coalesce(confirmado_em, now()), ativo = true where token = p_token;
  return found;
end $$;

create or replace function avisos_sair(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update inscritos_avisos set ativo = false where token = p_token;
  return found;
end $$;

-- servidor: quem deve receber o resumo da semana (confirmados e ativos, sem envio nos últimos 6 dias)
create or replace function robo_avisos_para_enviar(p_token text)
returns table(id uuid, email text, cidade text, lat double precision, lng double precision, raio_km integer, distancias text[], token uuid, desde timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  return query select i.id, i.email, i.cidade, i.lat, i.lng, i.raio_km, i.distancias, i.token,
                      coalesce(i.ultimo_envio, i.confirmado_em, i.criado_em)
    from inscritos_avisos i
    where i.confirmado and i.ativo and (i.ultimo_envio is null or i.ultimo_envio < now() - interval '6 days');
end $$;

-- servidor: inscrições ainda sem e-mail de confirmação (para reenviar se o envio falhou)
create or replace function robo_avisos_sem_confirmacao(p_token text)
returns table(id uuid, email text, token uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  return query select i.id, i.email, i.token from inscritos_avisos i
    where not i.confirmado and i.ativo and i.confirmacao_enviada_em is null and i.criado_em > now() - interval '7 days';
end $$;

create or replace function robo_avisos_marcar(p_token text, p_ids uuid[], p_tipo text)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; n int;
begin
  select encode(digest(p_token, 'sha256'), 'hex') = hash into ok from robo.chave where robo.chave.id = 1;
  if not coalesce(ok, false) then raise exception 'acesso negado'; end if;
  if p_tipo = 'confirmacao' then update inscritos_avisos set confirmacao_enviada_em = now() where id = any(p_ids);
  else update inscritos_avisos set ultimo_envio = now() where id = any(p_ids); end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function robo_avisos_inscrever(text, text, text, double precision, double precision, integer, text[]) from public;
revoke all on function robo_avisos_para_enviar(text) from public;
revoke all on function robo_avisos_sem_confirmacao(text) from public;
revoke all on function robo_avisos_marcar(text, uuid[], text) from public;
revoke all on function avisos_confirmar(uuid) from public;
revoke all on function avisos_sair(uuid) from public;
grant execute on function robo_avisos_inscrever(text, text, text, double precision, double precision, integer, text[]) to anon, authenticated;
grant execute on function robo_avisos_para_enviar(text) to anon, authenticated;
grant execute on function robo_avisos_sem_confirmacao(text) to anon, authenticated;
grant execute on function robo_avisos_marcar(text, uuid[], text) to anon, authenticated;
grant execute on function avisos_confirmar(uuid) to anon, authenticated;
grant execute on function avisos_sair(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
