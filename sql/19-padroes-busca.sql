-- Padrões de busca por site: ensinam o robô (e o botão "Buscar foto e local") onde
-- ficam a imagem e o local da largada em cada site de inscrição.
-- O texto procurado é o que fica ENTRE o marcador "antes" e o marcador "depois" no código da página.

create table if not exists padroes_busca (
  dominio text primary key,              -- ex.: sporttimer.com.br (sem www)
  img_antes text,
  img_depois text,
  local_antes text,
  local_depois text,
  observacao text,
  atualizado_em timestamptz not null default now()
);

alter table padroes_busca enable row level security;
drop policy if exists "todos leem padrões" on padroes_busca;
create policy "todos leem padrões" on padroes_busca for select using (true);
drop policy if exists "admin edita padrões" on padroes_busca;
create policy "admin edita padrões" on padroes_busca for all using (is_admin()) with check (is_admin());

-- Devolve à fila do robô as pendentes de um site que ficaram sem imagem ou sem pino
create or replace function admin_reprocessar_site(p_site text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  if coalesce(length(trim(p_site)), 0) < 4 then raise exception 'site inválido'; end if;
  update corridas_pendentes set enriquecido_em = null, tentativas_enriquecer = 0
   where status = 'pendente' and data >= current_date and link_inscricao ilike '%' || trim(p_site) || '%'
     and (imagem_sugerida is null or lat is null);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function admin_reprocessar_site(text) from public, anon;
grant execute on function admin_reprocessar_site(text) to authenticated;
