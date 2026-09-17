-- AgroBloque: base operativa confiable.
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

alter table public.plantaciones
  add column if not exists cantidad_plantas integer;

alter table public.plantaciones
  drop constraint if exists plantaciones_cantidad_plantas_check;
alter table public.plantaciones
  add constraint plantaciones_cantidad_plantas_check
  check (cantidad_plantas is null or cantidad_plantas >= 0);

alter table public.tareas
  add column if not exists anulada boolean not null default false,
  add column if not exists anulada_at timestamptz;

create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric not null,
  stock_anterior numeric not null,
  stock_nuevo numeric not null,
  tipo text not null,
  modulo text,
  referencia_id text,
  detalle text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists inventario_movimientos_producto_fecha_idx
  on public.inventario_movimientos(producto_id, created_at desc);

alter table public.inventario_movimientos enable row level security;
drop policy if exists inventario_movimientos_select on public.inventario_movimientos;
drop policy if exists inventario_movimientos_insert on public.inventario_movimientos;
create policy inventario_movimientos_select on public.inventario_movimientos
  for select to authenticated using (true);
create policy inventario_movimientos_insert on public.inventario_movimientos
  for insert to authenticated with check (auth.uid() is not null);

create or replace function public.ajustar_stock_producto(
  p_producto_id uuid,
  p_delta numeric,
  p_tipo text,
  p_modulo text default null,
  p_referencia_id text default null,
  p_detalle text default null
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_anterior numeric;
  v_nuevo numeric;
begin
  select coalesce(stock_actual, 0)
    into v_anterior
    from public.productos
   where id = p_producto_id
   for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  v_nuevo := greatest(0, v_anterior + coalesce(p_delta, 0));

  update public.productos
     set stock_actual = v_nuevo
   where id = p_producto_id;

  insert into public.inventario_movimientos(
    producto_id, cantidad, stock_anterior, stock_nuevo, tipo,
    modulo, referencia_id, detalle
  ) values (
    p_producto_id, p_delta, v_anterior, v_nuevo, coalesce(p_tipo, 'ajuste'),
    p_modulo, p_referencia_id, p_detalle
  );

  return v_nuevo;
end;
$$;

grant execute on function public.ajustar_stock_producto(uuid, numeric, text, text, text, text) to authenticated;
grant select, insert on public.inventario_movimientos to authenticated;

commit;
