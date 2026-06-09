-- AgroBloque: mejoras junio
-- Incluye: notas diarias de asistencia y Plan Nutricional.

create extension if not exists pgcrypto;

create table if not exists public.asistencia_notas_dia (
  id uuid primary key default gen_random_uuid(),
  campo_id uuid references public.campos(id) on delete cascade,
  fecha date not null,
  dia_semana text,
  trabajos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campo_id, fecha)
);

create table if not exists public.plan_nutricional_registros (
  id uuid primary key default gen_random_uuid(),
  campo_id uuid references public.campos(id) on delete cascade,
  bloque_id uuid references public.bloques(id) on delete set null,
  fecha date not null default current_date,
  objetivo text,
  tanque_litros numeric,
  ec_agua numeric,
  ec_objetivo numeric,
  ec_final numeric,
  productos jsonb not null default '[]'::jsonb,
  notas text,
  origen text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asistencia_notas_dia enable row level security;
alter table public.plan_nutricional_registros enable row level security;

grant select, insert, update, delete on public.asistencia_notas_dia to authenticated;
grant select, insert, update, delete on public.plan_nutricional_registros to authenticated;
grant select on public.plan_nutricional_registros to anon;

drop policy if exists asistencia_notas_auth_select on public.asistencia_notas_dia;
drop policy if exists asistencia_notas_auth_insert on public.asistencia_notas_dia;
drop policy if exists asistencia_notas_auth_update on public.asistencia_notas_dia;
drop policy if exists asistencia_notas_auth_delete on public.asistencia_notas_dia;

create policy asistencia_notas_auth_select on public.asistencia_notas_dia
  for select to authenticated using (true);
create policy asistencia_notas_auth_insert on public.asistencia_notas_dia
  for insert to authenticated with check (true);
create policy asistencia_notas_auth_update on public.asistencia_notas_dia
  for update to authenticated using (true) with check (true);
create policy asistencia_notas_auth_delete on public.asistencia_notas_dia
  for delete to authenticated using (true);

drop policy if exists plan_nutricional_auth_select on public.plan_nutricional_registros;
drop policy if exists plan_nutricional_auth_insert on public.plan_nutricional_registros;
drop policy if exists plan_nutricional_auth_update on public.plan_nutricional_registros;
drop policy if exists plan_nutricional_auth_delete on public.plan_nutricional_registros;
drop policy if exists plan_nutricional_guest_select on public.plan_nutricional_registros;

create policy plan_nutricional_auth_select on public.plan_nutricional_registros
  for select to authenticated using (true);
create policy plan_nutricional_auth_insert on public.plan_nutricional_registros
  for insert to authenticated with check (true);
create policy plan_nutricional_auth_update on public.plan_nutricional_registros
  for update to authenticated using (true) with check (true);
create policy plan_nutricional_auth_delete on public.plan_nutricional_registros
  for delete to authenticated using (true);

create policy plan_nutricional_guest_select on public.plan_nutricional_registros
  for select to anon using (
    exists (
      select 1
      from public.guest_access_links g
      where g.activo = true
        and (g.expires_at is null or g.expires_at > now())
    )
  );
