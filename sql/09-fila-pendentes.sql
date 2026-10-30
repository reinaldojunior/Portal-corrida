-- PaceClub · Fila de corridas encontradas pela busca automática
-- (já aplicado no banco pelo conector do Supabase em 29/10/2026)
create table if not exists corridas_pendentes (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,              -- nome normalizado + data, evita duplicar
  nome text not null,
  cidade text not null,
  estado text not null default 'SP',
  data date not null,
  horario time,
  distancias text,
  preco_a_partir numeric(8,2),
  link_inscricao text,
  fonte text,
  fonte_url text,
  observacao text,
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  corrida_id uuid references corridas(id) on delete set null,
  criado_em timestamptz not null default now(),
  revisado_em timestamptz
);
create index if not exists pendentes_status_idx on corridas_pendentes (status, data);
alter table corridas_pendentes enable row level security;
create policy "admin gerencia pendentes" on corridas_pendentes for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on corridas_pendentes to authenticated;
