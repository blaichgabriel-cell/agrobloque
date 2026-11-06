-- AgroBloque: inteligencia operativa, lotes de inventario y contexto de aplicaciones.
-- NO EJECUTAR TODAVIA: el frontend desplegado aun no usa estas funciones.
-- Migracion aditiva: no elimina ni reescribe registros existentes.
-- Ejecutar despues de multiempresa-organizaciones-2026-11-02.sql.

begin;

alter table public.fumigaciones
  add column if not exists temperatura numeric,
  add column if not exists viento_kmh numeric,
  add column if not exists condicion_climatica text,
  add column if not exists hora_aplicacion time;

create table if not exists public.inventario_lotes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  lote text,
  proveedor text,
  fecha_ingreso date not null default current_date,
  fecha_vencimiento date,
  cantidad_inicial numeric not null check (cantidad_inicial > 0),
  cantidad_disponible numeric not null check (cantidad_disponible >= 0),
  precio_unitario numeric not null default 0 check (precio_unitario >= 0),
  notas text,
  organizacion_id uuid not null default private.current_organization_id() references public.organizaciones(id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventario_lotes_producto_idx on public.inventario_lotes(producto_id);
create index if not exists inventario_lotes_vencimiento_idx on public.inventario_lotes(fecha_vencimiento) where cantidad_disponible > 0;
create index if not exists inventario_lotes_organizacion_idx on public.inventario_lotes(organizacion_id);

alter table public.inventario_lotes enable row level security;
drop policy if exists tenant_organization_guard on public.inventario_lotes;
create policy tenant_organization_guard on public.inventario_lotes
  as restrictive for all to authenticated
  using (organizacion_id = (select private.current_organization_id()))
  with check (organizacion_id = (select private.current_organization_id()));

drop policy if exists inventario_lotes_authenticated on public.inventario_lotes;
create policy inventario_lotes_authenticated on public.inventario_lotes
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.inventario_lotes to authenticated;

commit;

-- Verificacion (solo lectura): no ejecutar la migracion hasta que el frontend la use.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'fumigaciones' and column_name in ('temperatura','viento_kmh','condicion_climatica','hora_aplicacion'))
    or table_name = 'inventario_lotes'
  )
order by table_name, ordinal_position;
