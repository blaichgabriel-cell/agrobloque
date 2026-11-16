-- AgroBloque: compras, stock valorizado y costos directos por plantacion.
-- Aplicar despues de multiempresa-organizaciones-2026-11-02.sql.
-- Aditiva: el stock existente queda sin valor y no se registra como compra.

begin;

alter table public.productos
  add column if not exists stock_sin_valor numeric not null default 0,
  add column if not exists stock_valorizado numeric not null default 0,
  add column if not exists valor_stock numeric not null default 0;

-- Solo la primera ejecucion toma el stock anterior como existencia sin precio.
update public.productos
set stock_sin_valor = greatest(coalesce(stock_actual, 0), 0)
where stock_sin_valor = 0 and stock_valorizado = 0 and valor_stock = 0
  and coalesce(stock_actual, 0) > 0;

alter table public.costos
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null,
  add column if not exists origen_tipo text,
  add column if not exists origen_id uuid,
  add column if not exists anulada boolean not null default false,
  add column if not exists anulada_at timestamptz;

alter table public.cosechas
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null;

alter table public.inventario_movimientos
  add column if not exists costo_unitario numeric,
  add column if not exists costo_total numeric not null default 0,
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null,
  add column if not exists origen_tipo text,
  add column if not exists origen_id uuid,
  add column if not exists movimiento_revertido_id uuid references public.inventario_movimientos(id) on delete restrict;

create table if not exists public.inventario_compras (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  fecha date not null default current_date,
  cantidad numeric not null check (cantidad > 0),
  unidad text not null,
  cantidad_stock numeric not null check (cantidad_stock > 0),
  precio_total numeric not null check (precio_total > 0),
  costo_unitario numeric not null check (costo_unitario > 0),
  costo_id uuid references public.costos(id) on delete restrict,
  movimiento_id uuid references public.inventario_movimientos(id) on delete restrict,
  anulada boolean not null default false,
  anulada_at timestamptz,
  notas text,
  organizacion_id uuid not null default private.current_organization_id() references public.organizaciones(id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.consumos_valorizados (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  plantacion_id uuid references public.plantaciones(id) on delete set null,
  bloque_id uuid references public.bloques(id) on delete set null,
  fecha date not null default current_date,
  cantidad_stock numeric not null check (cantidad_stock >= 0),
  costo_unitario numeric not null default 0,
  costo_total numeric not null default 0,
  origen_tipo text not null,
  origen_id uuid not null,
  movimiento_id uuid references public.inventario_movimientos(id) on delete restrict,
  anulado boolean not null default false,
  organizacion_id uuid not null default private.current_organization_id() references public.organizaciones(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organizacion_id, origen_tipo, origen_id, producto_id, plantacion_id)
);

create index if not exists inventario_compras_producto_fecha_idx on public.inventario_compras(producto_id, fecha desc);
create index if not exists consumos_valorizados_plantacion_fecha_idx on public.consumos_valorizados(plantacion_id, fecha desc);
create index if not exists costos_plantacion_fecha_idx on public.costos(plantacion_id, fecha desc);
create index if not exists cosechas_plantacion_fecha_idx on public.cosechas(plantacion_id, fecha desc);

alter table public.inventario_compras enable row level security;
alter table public.consumos_valorizados enable row level security;

drop policy if exists tenant_organization_guard on public.inventario_compras;
create policy tenant_organization_guard on public.inventario_compras as restrictive for all to authenticated
  using (organizacion_id = (select private.current_organization_id()))
  with check (organizacion_id = (select private.current_organization_id()));
drop policy if exists inventario_compras_authenticated on public.inventario_compras;
create policy inventario_compras_authenticated on public.inventario_compras for all to authenticated using (true) with check (true);

drop policy if exists tenant_organization_guard on public.consumos_valorizados;
create policy tenant_organization_guard on public.consumos_valorizados as restrictive for all to authenticated
  using (organizacion_id = (select private.current_organization_id()))
  with check (organizacion_id = (select private.current_organization_id()));
drop policy if exists consumos_valorizados_authenticated on public.consumos_valorizados;
create policy consumos_valorizados_authenticated on public.consumos_valorizados for all to authenticated using (true) with check (true);

grant select, insert, update on public.inventario_compras to authenticated;
grant select, insert, update on public.consumos_valorizados to authenticated;

create or replace function public.registrar_compra_inventario(
  p_producto_id uuid, p_fecha date, p_cantidad numeric, p_unidad text,
  p_cantidad_stock numeric, p_precio_total numeric, p_notas text default null
) returns uuid
language plpgsql security invoker set search_path = public, private as $$
declare
  v_producto public.productos%rowtype;
  v_compra_id uuid := gen_random_uuid();
  v_costo_id uuid;
  v_movimiento_id uuid;
  v_nuevo_stock numeric;
  v_nuevo_valorizado numeric;
  v_nuevo_valor numeric;
  v_unitario numeric;
begin
  if p_cantidad_stock <= 0 or p_precio_total <= 0 then raise exception 'Cantidad y precio deben ser mayores a cero'; end if;
  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  v_unitario := p_precio_total / p_cantidad_stock;
  v_nuevo_stock := coalesce(v_producto.stock_actual, 0) + p_cantidad_stock;
  v_nuevo_valorizado := coalesce(v_producto.stock_valorizado, 0) + p_cantidad_stock;
  v_nuevo_valor := coalesce(v_producto.valor_stock, 0) + p_precio_total;

  insert into public.costos(tipo, descripcion, monto, fecha, campo_id, bloque_id, origen_tipo, origen_id)
  values ('insumos', 'Compra de ' || v_producto.nombre, p_precio_total, coalesce(p_fecha,current_date), null, null, 'compra_inventario', v_compra_id)
  returning id into v_costo_id;

  update public.productos set stock_actual=v_nuevo_stock, stock_valorizado=v_nuevo_valorizado,
    valor_stock=v_nuevo_valor, precio_unitario=case when v_nuevo_valorizado > 0 then v_nuevo_valor/v_nuevo_valorizado else 0 end
  where id=p_producto_id;

  insert into public.inventario_movimientos(producto_id,cantidad,stock_anterior,stock_nuevo,tipo,modulo,referencia_id,detalle,costo_unitario,costo_total,origen_tipo,origen_id)
  values(p_producto_id,p_cantidad_stock,v_producto.stock_actual,v_nuevo_stock,'compra','Inventario',v_compra_id::text,'Compra de inventario',v_unitario,p_precio_total,'compra_inventario',v_compra_id)
  returning id into v_movimiento_id;

  insert into public.inventario_compras(id,producto_id,fecha,cantidad,unidad,cantidad_stock,precio_total,costo_unitario,costo_id,movimiento_id,notas)
  values(v_compra_id,p_producto_id,coalesce(p_fecha,current_date),p_cantidad,p_unidad,p_cantidad_stock,p_precio_total,v_unitario,v_costo_id,v_movimiento_id,p_notas);
  return v_compra_id;
end $$;

create or replace function public.anular_compra_inventario(p_compra_id uuid) returns boolean
language plpgsql security invoker set search_path = public, private as $$
declare v_compra public.inventario_compras%rowtype; v_producto public.productos%rowtype;
begin
  select * into v_compra from public.inventario_compras where id=p_compra_id and not anulada for update;
  if not found then raise exception 'Compra no encontrada o ya anulada'; end if;
  select * into v_producto from public.productos where id=v_compra.producto_id for update;
  if coalesce(v_producto.stock_valorizado,0) < v_compra.cantidad_stock then raise exception 'No se puede anular: parte de esta compra ya fue consumida'; end if;
  update public.productos set stock_actual=greatest(0,stock_actual-v_compra.cantidad_stock),
    stock_valorizado=greatest(0,stock_valorizado-v_compra.cantidad_stock), valor_stock=greatest(0,valor_stock-v_compra.precio_total),
    precio_unitario=case when stock_valorizado-v_compra.cantidad_stock > 0 then greatest(0,valor_stock-v_compra.precio_total)/(stock_valorizado-v_compra.cantidad_stock) else 0 end
  where id=v_compra.producto_id;
  update public.costos set anulada=true, anulada_at=now() where id=v_compra.costo_id;
  update public.inventario_compras set anulada=true, anulada_at=now() where id=p_compra_id;
  insert into public.inventario_movimientos(producto_id,cantidad,stock_anterior,stock_nuevo,tipo,modulo,referencia_id,detalle,costo_unitario,costo_total,origen_tipo,origen_id,movimiento_revertido_id)
  values(v_compra.producto_id,-v_compra.cantidad_stock,v_producto.stock_actual,greatest(0,v_producto.stock_actual-v_compra.cantidad_stock),'anulacion_compra','Inventario',p_compra_id::text,'Anulacion de compra',v_compra.costo_unitario,-v_compra.precio_total,'anulacion_compra',p_compra_id,v_compra.movimiento_id);
  return true;
end $$;

grant execute on function public.registrar_compra_inventario(uuid,date,numeric,text,numeric,numeric,text) to authenticated;
grant execute on function public.anular_compra_inventario(uuid) to authenticated;

create or replace function public.consumir_stock_valorizado(
  p_producto_id uuid, p_cantidad numeric, p_tipo text, p_origen_id uuid,
  p_plantacion_id uuid default null, p_bloque_id uuid default null,
  p_fecha date default current_date, p_detalle text default null
) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  v_producto public.productos%rowtype;
  v_sin_valor numeric;
  v_valorizado numeric;
  v_costo_unitario numeric;
  v_costo_total numeric;
  v_movimiento_id uuid;
  v_consumo_id uuid;
begin
  if p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  select * into v_producto from public.productos where id=p_producto_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if coalesce(v_producto.stock_actual,0) < p_cantidad then raise exception 'Stock insuficiente'; end if;

  v_sin_valor := least(coalesce(v_producto.stock_sin_valor,0), p_cantidad);
  v_valorizado := p_cantidad - v_sin_valor;
  v_costo_unitario := case when coalesce(v_producto.stock_valorizado,0)>0 then coalesce(v_producto.valor_stock,0)/v_producto.stock_valorizado else 0 end;
  v_costo_total := v_valorizado * v_costo_unitario;

  update public.productos set
    stock_actual=greatest(0,stock_actual-p_cantidad),
    stock_sin_valor=greatest(0,stock_sin_valor-v_sin_valor),
    stock_valorizado=greatest(0,stock_valorizado-v_valorizado),
    valor_stock=greatest(0,valor_stock-v_costo_total),
    precio_unitario=case when stock_valorizado-v_valorizado>0 then greatest(0,valor_stock-v_costo_total)/(stock_valorizado-v_valorizado) else 0 end
  where id=p_producto_id;

  insert into public.inventario_movimientos(producto_id,cantidad,stock_anterior,stock_nuevo,tipo,modulo,referencia_id,detalle,costo_unitario,costo_total,plantacion_id,origen_tipo,origen_id)
  values(p_producto_id,-p_cantidad,v_producto.stock_actual,v_producto.stock_actual-p_cantidad,p_tipo,'Aplicaciones',p_origen_id::text,p_detalle,v_costo_unitario,v_costo_total,p_plantacion_id,p_tipo,p_origen_id)
  returning id into v_movimiento_id;

  insert into public.consumos_valorizados(producto_id,plantacion_id,bloque_id,fecha,cantidad_stock,costo_unitario,costo_total,origen_tipo,origen_id,movimiento_id)
  values(p_producto_id,p_plantacion_id,p_bloque_id,coalesce(p_fecha,current_date),p_cantidad,v_costo_unitario,v_costo_total,p_tipo,p_origen_id,v_movimiento_id)
  on conflict (organizacion_id,origen_tipo,origen_id,producto_id,plantacion_id)
  do update set cantidad_stock=excluded.cantidad_stock,costo_unitario=excluded.costo_unitario,costo_total=excluded.costo_total,movimiento_id=excluded.movimiento_id,anulado=false
  returning id into v_consumo_id;
  return jsonb_build_object('stock',v_producto.stock_actual-p_cantidad,'costo_total',v_costo_total,'costo_unitario',v_costo_unitario,'movimiento_id',v_movimiento_id,'consumo_id',v_consumo_id);
end $$;

create or replace function public.revertir_consumos_valorizados(p_origen_tipo text, p_origen_id uuid) returns integer
language plpgsql security invoker set search_path = public, private as $$
declare c record; p public.productos%rowtype; v_valorizado numeric; v_sin_valor numeric; v_total integer:=0;
begin
  for c in select cv.*, im.cantidad from public.consumos_valorizados cv join public.inventario_movimientos im on im.id=cv.movimiento_id
    where cv.origen_tipo=p_origen_tipo and cv.origen_id=p_origen_id and not cv.anulado for update of cv
  loop
    select * into p from public.productos where id=c.producto_id for update;
    v_valorizado := case when c.costo_unitario>0 then c.costo_total/c.costo_unitario else 0 end;
    v_sin_valor := greatest(0,c.cantidad_stock-v_valorizado);
    update public.productos set stock_actual=stock_actual+c.cantidad_stock,stock_sin_valor=stock_sin_valor+v_sin_valor,
      stock_valorizado=stock_valorizado+v_valorizado,valor_stock=valor_stock+c.costo_total,
      precio_unitario=case when stock_valorizado+v_valorizado>0 then (valor_stock+c.costo_total)/(stock_valorizado+v_valorizado) else 0 end
    where id=c.producto_id;
    update public.consumos_valorizados set anulado=true where id=c.id;
    insert into public.inventario_movimientos(producto_id,cantidad,stock_anterior,stock_nuevo,tipo,modulo,referencia_id,detalle,costo_unitario,costo_total,plantacion_id,origen_tipo,origen_id,movimiento_revertido_id)
    values(c.producto_id,c.cantidad_stock,p.stock_actual,p.stock_actual+c.cantidad_stock,'devolucion_'||p_origen_tipo,'Aplicaciones',p_origen_id::text,'Reversion de consumo',c.costo_unitario,-c.costo_total,c.plantacion_id,'reversion_'||p_origen_tipo,p_origen_id,c.movimiento_id);
    v_total:=v_total+1;
  end loop;
  return v_total;
end $$;

grant execute on function public.consumir_stock_valorizado(uuid,numeric,text,uuid,uuid,uuid,date,text) to authenticated;
grant execute on function public.revertir_consumos_valorizados(text,uuid) to authenticated;

-- Vincula datos historicos al ciclo correspondiente por bloque y fecha.
update public.cosechas c set plantacion_id=(select p1.id from public.plantaciones p1 where p1.bloque_id=c.bloque_id and p1.fecha_siembra<=c.fecha order by p1.fecha_siembra desc limit 1)
where c.plantacion_id is null;

update public.costos c set plantacion_id=(select p1.id from public.plantaciones p1 where p1.bloque_id=c.bloque_id and p1.fecha_siembra<=c.fecha order by p1.fecha_siembra desc limit 1)
where c.plantacion_id is null and c.bloque_id is not null;

commit;

