-- AgroBloque: mejoras profesionales sin QR.
-- Ejecutar una sola vez en Supabase SQL Editor.

create table if not exists public.app_user_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nombre text,
  rol text not null default 'admin' check (rol in ('admin', 'operador', 'lectura')),
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  usuario_email text,
  accion text not null,
  modulo text not null,
  tabla text,
  registro_id text,
  detalle text,
  created_at timestamptz not null default now()
);

create table if not exists public.fertilizacion_planes (
  id uuid primary key default gen_random_uuid(),
  bloque_id uuid not null references public.bloques(id) on delete cascade,
  nombre text not null default 'Plan semanal',
  activo boolean not null default true,
  fecha_inicio date not null default current_date,
  litros_preparados numeric,
  frecuencia text not null default 'semanal',
  soluciones jsonb not null default '[]'::jsonb,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fertilizacion_plan_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.fertilizacion_planes(id) on delete cascade,
  bloque_id uuid not null references public.bloques(id) on delete cascade,
  fecha date not null default current_date,
  litros_aplicados numeric,
  responsable text,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists app_user_roles_email_idx on public.app_user_roles (email);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_modulo_idx on public.audit_log (modulo, created_at desc);
create index if not exists fertilizacion_planes_bloque_idx on public.fertilizacion_planes (bloque_id, activo);
create index if not exists fertilizacion_plan_aplicaciones_plan_fecha_idx on public.fertilizacion_plan_aplicaciones (plan_id, fecha desc);

alter table public.app_user_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.fertilizacion_planes enable row level security;
alter table public.fertilizacion_plan_aplicaciones enable row level security;

grant select, insert, update, delete on public.app_user_roles to authenticated;
grant select, insert on public.audit_log to authenticated;
grant select, insert, update, delete on public.fertilizacion_planes to authenticated;
grant select, insert, update, delete on public.fertilizacion_plan_aplicaciones to authenticated;

drop policy if exists app_user_roles_authenticated_select on public.app_user_roles;
drop policy if exists app_user_roles_authenticated_insert on public.app_user_roles;
drop policy if exists app_user_roles_authenticated_update on public.app_user_roles;
drop policy if exists app_user_roles_authenticated_delete on public.app_user_roles;

create policy app_user_roles_authenticated_select on public.app_user_roles
  for select to authenticated using (true);
create policy app_user_roles_authenticated_insert on public.app_user_roles
  for insert to authenticated with check (true);
create policy app_user_roles_authenticated_update on public.app_user_roles
  for update to authenticated using (true) with check (true);
create policy app_user_roles_authenticated_delete on public.app_user_roles
  for delete to authenticated using (true);

drop policy if exists audit_log_authenticated_select on public.audit_log;
drop policy if exists audit_log_authenticated_insert on public.audit_log;

create policy audit_log_authenticated_select on public.audit_log
  for select to authenticated using (true);
create policy audit_log_authenticated_insert on public.audit_log
  for insert to authenticated with check (true);

drop policy if exists fertilizacion_planes_authenticated_select on public.fertilizacion_planes;
drop policy if exists fertilizacion_planes_authenticated_insert on public.fertilizacion_planes;
drop policy if exists fertilizacion_planes_authenticated_update on public.fertilizacion_planes;
drop policy if exists fertilizacion_planes_authenticated_delete on public.fertilizacion_planes;

create policy fertilizacion_planes_authenticated_select on public.fertilizacion_planes
  for select to authenticated using (true);
create policy fertilizacion_planes_authenticated_insert on public.fertilizacion_planes
  for insert to authenticated with check (true);
create policy fertilizacion_planes_authenticated_update on public.fertilizacion_planes
  for update to authenticated using (true) with check (true);
create policy fertilizacion_planes_authenticated_delete on public.fertilizacion_planes
  for delete to authenticated using (true);

drop policy if exists fertilizacion_plan_aplicaciones_authenticated_select on public.fertilizacion_plan_aplicaciones;
drop policy if exists fertilizacion_plan_aplicaciones_authenticated_insert on public.fertilizacion_plan_aplicaciones;
drop policy if exists fertilizacion_plan_aplicaciones_authenticated_update on public.fertilizacion_plan_aplicaciones;
drop policy if exists fertilizacion_plan_aplicaciones_authenticated_delete on public.fertilizacion_plan_aplicaciones;

create policy fertilizacion_plan_aplicaciones_authenticated_select on public.fertilizacion_plan_aplicaciones
  for select to authenticated using (true);
create policy fertilizacion_plan_aplicaciones_authenticated_insert on public.fertilizacion_plan_aplicaciones
  for insert to authenticated with check (true);
create policy fertilizacion_plan_aplicaciones_authenticated_update on public.fertilizacion_plan_aplicaciones
  for update to authenticated using (true) with check (true);
create policy fertilizacion_plan_aplicaciones_authenticated_delete on public.fertilizacion_plan_aplicaciones
  for delete to authenticated using (true);
