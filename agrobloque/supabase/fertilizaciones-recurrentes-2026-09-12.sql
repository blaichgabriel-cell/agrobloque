-- AgroBloque: planes diarios/semanales y aplicaciones reales de fertilizacion.
-- Migracion aditiva: no elimina ni modifica datos existentes.

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

alter table public.fertilizacion_planes
  add column if not exists campo_id uuid references public.campos(id) on delete cascade,
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null,
  add column if not exists objetivo text,
  add column if not exists tanque_litros numeric,
  add column if not exists tanques_cantidad numeric not null default 1,
  add column if not exists dia_semana integer,
  add column if not exists fecha_fin date,
  add column if not exists ec_objetivo numeric;

alter table public.fertilizacion_plan_aplicaciones
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null,
  add column if not exists tanques_aplicados numeric not null default 1,
  add column if not exists estado text not null default 'completa',
  add column if not exists ec_final numeric,
  add column if not exists productos jsonb not null default '[]'::jsonb;

alter table public.fertilizaciones
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null,
  add column if not exists plan_id uuid references public.fertilizacion_planes(id) on delete set null,
  add column if not exists tanque_litros numeric,
  add column if not exists tanques_cantidad numeric not null default 1,
  add column if not exists estado text not null default 'completa',
  add column if not exists dosis_alcance text not null default 'por_tanque';

alter table public.fertilizacion_planes drop constraint if exists fertilizacion_planes_frecuencia_check;
alter table public.fertilizacion_planes
  add constraint fertilizacion_planes_frecuencia_check check (frecuencia in ('diaria', 'semanal'));

alter table public.fertilizacion_plan_aplicaciones drop constraint if exists fertilizacion_plan_aplicaciones_estado_check;
alter table public.fertilizacion_plan_aplicaciones
  add constraint fertilizacion_plan_aplicaciones_estado_check check (estado in ('completa', 'parcial', 'suspendida'));

create index if not exists fertilizacion_planes_campo_activo_idx
  on public.fertilizacion_planes (campo_id, activo);
create index if not exists fertilizacion_planes_plantacion_idx
  on public.fertilizacion_planes (plantacion_id, activo);

grant select, insert, update, delete on public.fertilizacion_planes to authenticated;
grant select, insert, update, delete on public.fertilizacion_plan_aplicaciones to authenticated;

alter table public.fertilizacion_planes enable row level security;
alter table public.fertilizacion_plan_aplicaciones enable row level security;

drop policy if exists fertilizacion_planes_authenticated_select on public.fertilizacion_planes;
drop policy if exists fertilizacion_planes_authenticated_insert on public.fertilizacion_planes;
drop policy if exists fertilizacion_planes_authenticated_update on public.fertilizacion_planes;
drop policy if exists fertilizacion_planes_authenticated_delete on public.fertilizacion_planes;
create policy fertilizacion_planes_authenticated_select on public.fertilizacion_planes for select to authenticated using (true);
create policy fertilizacion_planes_authenticated_insert on public.fertilizacion_planes for insert to authenticated with check (true);
create policy fertilizacion_planes_authenticated_update on public.fertilizacion_planes for update to authenticated using (true) with check (true);
create policy fertilizacion_planes_authenticated_delete on public.fertilizacion_planes for delete to authenticated using (true);

drop policy if exists fertilizacion_plan_aplicaciones_authenticated_select on public.fertilizacion_plan_aplicaciones;
drop policy if exists fertilizacion_plan_aplicaciones_authenticated_insert on public.fertilizacion_plan_aplicaciones;
drop policy if exists fertilizacion_plan_aplicaciones_authenticated_update on public.fertilizacion_plan_aplicaciones;
drop policy if exists fertilizacion_plan_aplicaciones_authenticated_delete on public.fertilizacion_plan_aplicaciones;
create policy fertilizacion_plan_aplicaciones_authenticated_select on public.fertilizacion_plan_aplicaciones for select to authenticated using (true);
create policy fertilizacion_plan_aplicaciones_authenticated_insert on public.fertilizacion_plan_aplicaciones for insert to authenticated with check (true);
create policy fertilizacion_plan_aplicaciones_authenticated_update on public.fertilizacion_plan_aplicaciones for update to authenticated using (true) with check (true);
create policy fertilizacion_plan_aplicaciones_authenticated_delete on public.fertilizacion_plan_aplicaciones for delete to authenticated using (true);
