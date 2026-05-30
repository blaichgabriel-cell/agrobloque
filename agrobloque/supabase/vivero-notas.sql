-- AgroBloque: tablas para Vivero / Plantinero y Blog de notas.
-- Ejecutar una sola vez en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.notas_modulo (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  referencia_tipo text,
  referencia_id uuid,
  fecha date not null default current_date,
  titulo text,
  contenido text not null,
  created_at timestamptz not null default now()
);

create index if not exists notas_modulo_modulo_fecha_idx
  on public.notas_modulo (modulo, fecha desc, created_at desc);

create table if not exists public.vivero_lotes (
  id uuid primary key default gen_random_uuid(),
  campo_id uuid references public.campos(id) on delete set null,
  fecha_siembra date not null,
  cultivo text not null,
  variedad text,
  semilla text,
  cantidad_semillas numeric not null default 0,
  bandejas numeric not null default 0,
  sustrato text,
  abono_sustrato text,
  fecha_estimada_trasplante date,
  fecha_real_trasplante date,
  germinadas numeric not null default 0,
  perdidas numeric not null default 0,
  estado text not null default 'sembrado',
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vivero_lotes_fecha_idx
  on public.vivero_lotes (fecha_siembra desc);

create index if not exists vivero_lotes_campo_idx
  on public.vivero_lotes (campo_id);

create table if not exists public.vivero_tratamientos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.vivero_lotes(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null,
  producto text,
  dosis text,
  responsable text,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists vivero_tratamientos_lote_fecha_idx
  on public.vivero_tratamientos (lote_id, fecha desc);

alter table public.notas_modulo enable row level security;
alter table public.vivero_lotes enable row level security;
alter table public.vivero_tratamientos enable row level security;

grant select, insert, update, delete on public.notas_modulo to authenticated;
grant select, insert, update, delete on public.vivero_lotes to authenticated;
grant select, insert, update, delete on public.vivero_tratamientos to authenticated;

drop policy if exists notas_modulo_authenticated_select on public.notas_modulo;
drop policy if exists notas_modulo_authenticated_insert on public.notas_modulo;
drop policy if exists notas_modulo_authenticated_update on public.notas_modulo;
drop policy if exists notas_modulo_authenticated_delete on public.notas_modulo;

create policy notas_modulo_authenticated_select on public.notas_modulo
  for select to authenticated using (true);
create policy notas_modulo_authenticated_insert on public.notas_modulo
  for insert to authenticated with check (true);
create policy notas_modulo_authenticated_update on public.notas_modulo
  for update to authenticated using (true) with check (true);
create policy notas_modulo_authenticated_delete on public.notas_modulo
  for delete to authenticated using (true);

drop policy if exists vivero_lotes_authenticated_select on public.vivero_lotes;
drop policy if exists vivero_lotes_authenticated_insert on public.vivero_lotes;
drop policy if exists vivero_lotes_authenticated_update on public.vivero_lotes;
drop policy if exists vivero_lotes_authenticated_delete on public.vivero_lotes;

create policy vivero_lotes_authenticated_select on public.vivero_lotes
  for select to authenticated using (true);
create policy vivero_lotes_authenticated_insert on public.vivero_lotes
  for insert to authenticated with check (true);
create policy vivero_lotes_authenticated_update on public.vivero_lotes
  for update to authenticated using (true) with check (true);
create policy vivero_lotes_authenticated_delete on public.vivero_lotes
  for delete to authenticated using (true);

drop policy if exists vivero_tratamientos_authenticated_select on public.vivero_tratamientos;
drop policy if exists vivero_tratamientos_authenticated_insert on public.vivero_tratamientos;
drop policy if exists vivero_tratamientos_authenticated_update on public.vivero_tratamientos;
drop policy if exists vivero_tratamientos_authenticated_delete on public.vivero_tratamientos;

create policy vivero_tratamientos_authenticated_select on public.vivero_tratamientos
  for select to authenticated using (true);
create policy vivero_tratamientos_authenticated_insert on public.vivero_tratamientos
  for insert to authenticated with check (true);
create policy vivero_tratamientos_authenticated_update on public.vivero_tratamientos
  for update to authenticated using (true) with check (true);
create policy vivero_tratamientos_authenticated_delete on public.vivero_tratamientos
  for delete to authenticated using (true);
