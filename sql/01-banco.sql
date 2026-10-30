-- =========================================================
-- PaceClub · Banco de dados (Fase 1)
-- Cole tudo no Supabase: SQL Editor > New query > Run
-- =========================================================

-- ---------- Administradores ----------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ---------- Atualiza "atualizado_em" automaticamente ----------
create or replace function tocar_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end;
$$;

-- ---------- Módulos (liga/desliga no admin) ----------
create table if not exists modulos (
  chave text primary key,
  nome text not null,
  descricao text,
  ativo boolean not null default false,
  ordem int not null default 0
);

insert into modulos (chave, nome, descricao, ativo, ordem) values
  ('agenda',          'Agenda de corridas',     'Lista "Perto de você" e calendário',        true,  1),
  ('mapa',            'Mapa de corridas',       'Mapa compacto na home e mapa expandido',    true,  2),
  ('noticias',        'Notícias',               'Manchetes e editorias',                      false, 3),
  ('pagina_corrida',  'Página da corrida',      'Página completa com percurso, kit e FAQ',    false, 4),
  ('calculadora',     'Calculadora de pace',    'Ferramenta de pace e projeções',             false, 5),
  ('aviso_provas',    'Aviso de novas provas',  'Cadastro de e-mail para alertas',            false, 6),
  ('altimetria',      'Altimetria do percurso', 'Upload de GPX e gráfico de elevação',        false, 7),
  ('busca_ia',        'Busca de corridas com IA','Encontra corridas e manda para aprovação',  false, 8),
  ('coach_ia',        'Coach de IA',            'Treinos personalizados',                     false, 9)
on conflict (chave) do nothing;

-- ---------- Corridas ----------
create table if not exists corridas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  cidade text not null,
  estado text not null default 'SP',
  local_largada text,
  lat double precision,
  lng double precision,
  data date not null,
  horario time,
  descricao text,
  organizador text,
  link_inscricao text,
  imagem_url text,
  kit_inclui text[] default '{}',
  inscricoes_abertas boolean not null default true,
  status text not null default 'rascunho' check (status in ('rascunho','publicado','arquivado')),
  origem text not null default 'manual' check (origem in ('manual','ia','exemplo')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists corridas_data_idx on corridas (data);
create index if not exists corridas_cidade_idx on corridas (cidade);
drop trigger if exists corridas_atualizado on corridas;
create trigger corridas_atualizado before update on corridas
  for each row execute function tocar_atualizado_em();

-- Cada corrida pode ter várias distâncias, cada uma com seu preço
create table if not exists corrida_distancias (
  id uuid primary key default gen_random_uuid(),
  corrida_id uuid not null references corridas(id) on delete cascade,
  km numeric(6,3) not null,
  rotulo text not null,          -- ex.: '5K', '10K', 'Meia maratona'
  preco numeric(8,2)
);
create index if not exists distancias_corrida_idx on corrida_distancias (corrida_id);

-- ---------- Notícias ----------
create table if not exists noticias (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titulo text not null,
  resumo text,
  conteudo text,
  editoria text not null default 'regiao' check (editoria in ('regiao','brasil','mundo','treino','percurso','equipamento')),
  imagem_url text,
  destaque boolean not null default false,
  autor text,
  status text not null default 'rascunho' check (status in ('rascunho','publicado','arquivado')),
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists noticias_publicado_idx on noticias (publicado_em desc);
drop trigger if exists noticias_atualizado on noticias;
create trigger noticias_atualizado before update on noticias
  for each row execute function tocar_atualizado_em();

-- ---------- Aviso de novas provas (newsletter) ----------
create table if not exists inscritos_avisos (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  cidade text,
  criado_em timestamptz not null default now()
);

-- =========================================================
-- Segurança (RLS): o público só lê o que está publicado;
-- só administradores criam, editam e apagam.
-- =========================================================
alter table admins              enable row level security;
alter table modulos             enable row level security;
alter table corridas            enable row level security;
alter table corrida_distancias  enable row level security;
alter table noticias            enable row level security;
alter table inscritos_avisos    enable row level security;

drop policy if exists "admin vê admins" on admins;
create policy "admin vê admins" on admins for select using (is_admin());

drop policy if exists "todos leem módulos" on modulos;
create policy "todos leem módulos" on modulos for select using (true);
drop policy if exists "admin edita módulos" on modulos;
create policy "admin edita módulos" on modulos for all using (is_admin()) with check (is_admin());

drop policy if exists "público lê corridas publicadas" on corridas;
create policy "público lê corridas publicadas" on corridas for select using (status = 'publicado' or is_admin());
drop policy if exists "admin edita corridas" on corridas;
create policy "admin edita corridas" on corridas for all using (is_admin()) with check (is_admin());

drop policy if exists "público lê distâncias" on corrida_distancias;
create policy "público lê distâncias" on corrida_distancias for select using (
  exists (select 1 from corridas c where c.id = corrida_id and (c.status = 'publicado' or is_admin()))
);
drop policy if exists "admin edita distâncias" on corrida_distancias;
create policy "admin edita distâncias" on corrida_distancias for all using (is_admin()) with check (is_admin());

drop policy if exists "público lê notícias publicadas" on noticias;
create policy "público lê notícias publicadas" on noticias for select using (status = 'publicado' or is_admin());
drop policy if exists "admin edita notícias" on noticias;
create policy "admin edita notícias" on noticias for all using (is_admin()) with check (is_admin());

drop policy if exists "qualquer um se inscreve" on inscritos_avisos;
create policy "qualquer um se inscreve" on inscritos_avisos for insert with check (true);
drop policy if exists "admin vê inscritos" on inscritos_avisos;
create policy "admin vê inscritos" on inscritos_avisos for select using (is_admin());
drop policy if exists "admin remove inscritos" on inscritos_avisos;
create policy "admin remove inscritos" on inscritos_avisos for delete using (is_admin());

-- =========================================================
-- Dados de exemplo (fictícios) para testar o mapa.
-- Para apagar depois: delete from corridas where origem = 'exemplo';
-- =========================================================
with novas as (
  insert into corridas (slug, nome, cidade, local_largada, lat, lng, data, horario, status, origem) values
    ('exemplo-parque-ecologico', 'Corrida do Parque Ecológico', 'Indaiatuba',   'Parque Ecológico',  -23.0890, -47.2110, '2026-10-04', '07:00', 'publicado', 'exemplo'),
    ('exemplo-night-run-salto',  'Night Run Salto',             'Salto',        'Centro',            -23.2003, -47.2869, '2026-10-11', '19:00', 'publicado', 'exemplo'),
    ('exemplo-meia-itu',         'Meia de Itu',                 'Itu',          'Praça da Matriz',   -23.2642, -47.2993, '2026-10-18', '06:30', 'publicado', 'exemplo'),
    ('exemplo-rural-elias',      'Corrida Rural Elias Fausto',  'Elias Fausto', 'Estádio municipal', -23.0428, -47.3736, '2026-10-25', '07:00', 'publicado', 'exemplo'),
    ('exemplo-primavera-mm',     'Corrida da Primavera',        'Monte Mor',    'Centro',            -22.9467, -47.3158, '2026-11-08', '07:00', 'publicado', 'exemplo')
  on conflict (slug) do nothing
  returning id, slug
)
insert into corrida_distancias (corrida_id, km, rotulo)
select n.id, d.km, d.rotulo
from novas n
join (values
  ('exemplo-parque-ecologico', 5, '5K'), ('exemplo-parque-ecologico', 10, '10K'),
  ('exemplo-night-run-salto', 5, '5K'),  ('exemplo-night-run-salto', 10, '10K'),
  ('exemplo-meia-itu', 10, '10K'),       ('exemplo-meia-itu', 21.0975, '21K'),
  ('exemplo-rural-elias', 8, '8K'),
  ('exemplo-primavera-mm', 5, '5K')
) as d(slug, km, rotulo) on d.slug = n.slug;

-- =========================================================
-- ÚLTIMO PASSO (rodar separado, depois de criar seu usuário em
-- Authentication > Users > Add user):
--
-- insert into admins (user_id)
-- select id from auth.users where email = 'SEU_EMAIL_AQUI';
-- =========================================================
