-- AgroBloque: edicion, anulacion y trazabilidad de los modulos activos.
-- Ejecutar despues de consolidacion-operativa-2026-09-17.sql.

begin;

alter table public.fertilizaciones
  add column if not exists grupo_id uuid,
  add column if not exists anulada boolean not null default false,
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_motivo text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_by uuid;

alter table public.fertilizacion_planes
  add column if not exists finalizado_at timestamptz,
  add column if not exists updated_by uuid;

alter table public.tareas
  add column if not exists anulada boolean not null default false,
  add column if not exists anulada_at timestamptz,
  add column if not exists cancelada boolean not null default false,
  add column if not exists origen_tipo text,
  add column if not exists origen_id uuid,
  add column if not exists prioridad text not null default 'normal',
  add column if not exists responsable text,
  add column if not exists anulada_motivo text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.fumigaciones
  add column if not exists anulada boolean not null default false,
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_motivo text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.cosechas
  add column if not exists anulada boolean not null default false,
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_motivo text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vivero_lotes
  add column if not exists archivado boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vivero_tratamientos
  add column if not exists anulado boolean not null default false,
  add column if not exists anulado_at timestamptz,
  add column if not exists anulado_motivo text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.adelantos
  add column if not exists anulado boolean not null default false,
  add column if not exists anulado_at timestamptz,
  add column if not exists anulado_motivo text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.plantaciones
  add column if not exists archivada boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bloques
  add column if not exists archivado boolean not null default false,
  add column if not exists superficie_m2 numeric,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.alertas_gestion (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  usuario_id uuid not null default auth.uid(),
  estado text not null default 'pendiente' check (estado in ('pendiente','revisada','pospuesta','resuelta')),
  pospuesta_hasta date,
  updated_at timestamptz not null default now(),
  unique (clave, usuario_id)
);

alter table public.alertas_gestion enable row level security;
drop policy if exists alertas_gestion_usuario on public.alertas_gestion;
create policy alertas_gestion_usuario on public.alertas_gestion
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
grant select, insert, update, delete on public.alertas_gestion to authenticated;

create index if not exists fertilizaciones_grupo_idx on public.fertilizaciones(grupo_id);
create index if not exists tareas_origen_idx on public.tareas(origen_tipo, origen_id);

commit;
