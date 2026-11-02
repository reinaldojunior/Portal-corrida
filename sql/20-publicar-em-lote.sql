-- Admin: publica de uma vez as pendentes selecionadas na aba Pendentes.
-- Mesma regra do robô (robo_publicar_completas): não duplica corrida já publicada,
-- usa a imagem sugerida com crédito e cria as distâncias. Exige link, imagem e pino.
create or replace function admin_publicar_pendentes(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p record; novo uuid; n int := 0; dup int := 0; pulou int := 0; base text; s text; k int;
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  if p_ids is null or cardinality(p_ids) > 500 then raise exception 'seleção inválida'; end if;
  for p in select * from corridas_pendentes where id = any(p_ids) and status = 'pendente' order by data loop
    if p.link_inscricao is null or p.imagem_sugerida is null or p.lat is null or p.lng is null then pulou := pulou + 1; continue; end if;
    if exists (select 1 from corridas c where c.data = p.data and lower(unaccent(c.cidade)) = lower(unaccent(p.cidade))
               and similarity(lower(unaccent(c.nome)), lower(unaccent(p.nome))) > 0.55) then
      update corridas_pendentes set status = 'aprovada', revisado_em = now(), observacao = coalesce(observacao || ' ', '') || '(já existia no site)' where id = p.id;
      dup := dup + 1; continue;
    end if;
    base := trim(both '-' from left(regexp_replace(lower(unaccent(p.nome || '-' || p.data::text)), '[^a-z0-9]+', '-', 'g'), 90));
    s := base; k := 1;
    while exists (select 1 from corridas where slug = s) loop k := k + 1; s := base || '-' || k; end loop;
    insert into corridas (slug, nome, cidade, estado, data, horario, local_largada, lat, lng, descricao, organizador, link_inscricao,
                          imagem_url, imagem_credito, status, origem, inscricoes_abertas)
    values (s, p.nome, p.cidade, coalesce(p.estado, 'SP'), p.data, p.horario, p.local_largada, p.lat, p.lng, p.descricao, p.organizador, p.link_inscricao,
            p.imagem_sugerida, 'Imagem: divulgação' || coalesce(' / ' || p.organizador, ''), 'publicado', 'manual', true)
    returning id into novo;
    if coalesce(p.distancias, '') <> '' then
      insert into corrida_distancias (corrida_id, rotulo, km)
      select novo, d.rotulo,
             case when d.num is null then null when d.num between 21 and 21.2 then 21.0975 when d.num between 42 and 42.3 then 42.195 else d.num end
      from (select trim(x) as rotulo, nullif(replace(substring(trim(x) from '^(\d+(?:[.,]\d+)?)\s*[Kk]'), ',', '.'), '')::numeric as num
            from regexp_split_to_table(p.distancias, '\s*,\s*(?!\d)') as x where trim(x) <> '') d;
    end if;
    update corridas_pendentes set status = 'aprovada', corrida_id = novo, revisado_em = now() where id = p.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('publicadas', n, 'ja_existiam', dup, 'incompletas', pulou);
end $$;
revoke all on function admin_publicar_pendentes(uuid[]) from public, anon;
grant execute on function admin_publicar_pendentes(uuid[]) to authenticated;
