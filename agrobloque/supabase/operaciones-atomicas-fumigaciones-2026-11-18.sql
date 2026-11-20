-- AgroBloque: fumigaciones atomicas (2026-11-18). Fase 1 de las funciones transaccionales.
--
-- POR QUE
--   Hoy la pantalla guarda una fumigacion en varios pasos sueltos: inserta la fumigacion, luego sus bloques y productos y
--   por ultimo descuenta el stock. Si un paso falla (corte de internet, permiso, stock), los anteriores quedan guardados:
--   una fumigacion sin su descuento de stock, o con el stock devuelto y los productos sin reponer. Editar y anular tienen
--   el mismo problema, y la pantalla intenta "deshacer a mano" lo que ya se guardo.
--   Ademas, al EDITAR, la pantalla borra los bloques y productos de la aplicacion y los vuelve a crear; esos borrados
--   exigen el permiso "eliminar" y el operador no lo tiene: el borrado no hace nada, no da error, y los bloques y productos
--   quedan DUPLICADOS.
--
-- QUE HACE
--   Tres funciones publicas que hacen todo dentro de UNA transaccion: si algo falla, no se guarda nada.
--     registrar_fumigaciones(p jsonb)        crea una o varias fumigaciones con sus bloques, productos y descuento de stock.
--     editar_fumigacion(p_id uuid, p jsonb)  corrige una fumigacion: devuelve su stock, reemplaza bloques y productos y descuenta de nuevo.
--     anular_fumigacion(p_id uuid, p_motivo text)  la marca como anulada y devuelve su stock.
--   Y tres ayudas privadas (private.consumir_stock_con_faltante, private.devolver_stock_fumigacion y
--   private.guardar_detalle_fumigacion) que las funciones publicas comparten.
--   Son SECURITY INVOKER: corren con los permisos de quien las llama (empresa, rol y permisos por modulo, modo soporte).
--   No se salta ninguna proteccion.
--
-- REGLA DE STOCK INSUFICIENTE (acordada el 2026-11-18, la misma que ya aplica la pantalla)
--   Si falta producto NO se bloquea: se descuenta lo que hay, el stock queda en 0, el movimiento de inventario anota
--   "faltaron X por stock insuficiente" y la funcion devuelve la lista de faltantes para avisarle a la persona.
--
-- EDITAR sin permiso de eliminar
--   Si la persona no tiene "eliminar" en Fumigaciones no puede reemplazar los bloques y productos. En vez de duplicarlos en
--   silencio, la funcion falla con un mensaje claro y NO guarda nada. (Pendiente de decidir: dar a "editar" el derecho de
--   reemplazar el detalle de su propia fumigacion.)
--
-- NO CAMBIA: tablas, politicas, permisos, ni ningun dato existente. Solo agrega funciones. Es repetible.
-- La pantalla seguira funcionando como hoy hasta que se actualice: si estas funciones no existen usa el camino anterior.
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayarlo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   3. Ejecutarlo UNA vez, completo, con "commit;". Es repetible.
--   4. Para deshacerlo: operaciones-atomicas-fumigaciones-2026-11-18-deshacer.sql
--
-- No declara ninguna variable llamada current_role (error del 2026-11-04).

begin;

-- ---------------------------------------------------------------------------------------------
-- Comprobaciones previas: si falta algo, se aborta antes de cambiar nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['fumigaciones', 'fumigacion_bloques', 'fumigacion_productos', 'productos', 'inventario_movimientos'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'No existe public.%.', t;
    end if;
  end loop;
  if to_regprocedure('public.ajustar_stock_producto(uuid,numeric,text,text,text,text)') is null then
    raise exception 'Falta public.ajustar_stock_producto (consolidacion-operativa-2026-09-17.sql).';
  end if;
  if to_regprocedure('public.consumir_stock_valorizado(uuid,numeric,text,uuid,uuid,uuid,date,text)') is null
     or to_regprocedure('public.revertir_consumos_valorizados(text,uuid)') is null then
    raise exception 'Faltan las funciones de consumo valorizado (costos-produccion-compras-2026-11-16.sql).';
  end if;
  if to_regprocedure('public.app_can_action(text,text)') is null then
    raise exception 'Faltan las funciones de permisos (app_can_action).';
  end if;
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'app_can_action declara la variable current_role: aplicar antes permisos-acciones-multiempresa-fix-2026-11-04.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ayuda: descontar stock de un producto sin bloquear si no alcanza
-- ---------------------------------------------------------------------------------------------
create or replace function private.consumir_stock_con_faltante(
  p_producto_id uuid, p_cantidad numeric, p_tipo text, p_modulo text, p_origen_id uuid,
  p_plantacion_id uuid, p_bloque_id uuid, p_fecha date, p_detalle text
) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  v_disponible numeric;
  v_consumido numeric;
  v_faltante numeric;
  v_detalle text;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    return jsonb_build_object('consumido', 0, 'faltante', 0, 'pedido', coalesce(p_cantidad, 0), 'disponible', null);
  end if;
  select greatest(0, coalesce(stock_actual, 0)) into v_disponible from public.productos where id = p_producto_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  v_consumido := least(p_cantidad, v_disponible);
  v_faltante := p_cantidad - v_consumido;
  if v_faltante <= 0.000000001 then v_faltante := 0; end if;
  v_detalle := p_detalle;
  if v_faltante > 0 then
    v_detalle := concat_ws(' · ', p_detalle, 'faltaron ' || round(v_faltante, 3)::text || ' por stock insuficiente');
  end if;

  if v_consumido > 0 then
    if p_origen_id is not null and p_plantacion_id is not null then
      perform public.consumir_stock_valorizado(p_producto_id, v_consumido, p_tipo, p_origen_id, p_plantacion_id, p_bloque_id, p_fecha, v_detalle);
    else
      perform public.ajustar_stock_producto(p_producto_id, -v_consumido, p_tipo, p_modulo, p_origen_id::text, v_detalle);
    end if;
  end if;
  return jsonb_build_object('consumido', v_consumido, 'faltante', v_faltante, 'pedido', p_cantidad, 'disponible', v_disponible);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ayuda: devolver al inventario lo que consumio una fumigacion
-- ---------------------------------------------------------------------------------------------
create or replace function private.devolver_stock_fumigacion(p_id uuid) returns void
language plpgsql security invoker set search_path = public, private as $$
declare
  v_revertidos integer;
  r record;
begin
  v_revertidos := public.revertir_consumos_valorizados('consumo_fumigacion', p_id);
  if coalesce(v_revertidos, 0) > 0 then return; end if;
  -- Fumigaciones anteriores al consumo valorizado: se devuelve lo que quedo anotado en cada producto.
  for r in
    select producto_id, sum(descuento_stock) as devolver
    from public.fumigacion_productos
    where fumigacion_id = p_id and producto_id is not null and coalesce(descuento_stock, 0) > 0
    group by producto_id
  loop
    perform public.ajustar_stock_producto(r.producto_id, r.devolver, 'devolucion_fumigacion', 'Fumigaciones', p_id::text, 'Edicion o anulacion de aplicacion');
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ayuda: guardar los bloques y productos de una fumigacion y descontar el stock.
--   p_item: { "bloques":   [{ "bloque_id", "cultivo_snapshot", "plantacion_id" }],
--             "productos": [{ "producto_id", "producto_nombre", "dosis", "cantidad", "unidad_uso", "descuento_stock" }] }
--   Devuelve la lista de faltantes (vacia si el stock alcanzo).
-- ---------------------------------------------------------------------------------------------
create or replace function private.guardar_detalle_fumigacion(p_id uuid, p_item jsonb, p_fecha date, p_tipo text) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  x jsonb;
  v_fp_id uuid;
  v_producto uuid;
  v_descuento numeric;
  v_bloque uuid := nullif(p_item #>> '{bloques,0,bloque_id}', '')::uuid;
  v_plantacion uuid := nullif(p_item #>> '{bloques,0,plantacion_id}', '')::uuid;
  v_res jsonb;
  v_faltantes jsonb := '[]'::jsonb;
begin
  for x in select e from jsonb_array_elements(coalesce(p_item -> 'bloques', '[]'::jsonb)) e loop
    insert into public.fumigacion_bloques (fumigacion_id, bloque_id, cultivo_snapshot, plantacion_id_snapshot)
    values (p_id, (x ->> 'bloque_id')::uuid, nullif(x ->> 'cultivo_snapshot', ''), nullif(x ->> 'plantacion_id', '')::uuid);
  end loop;

  for x in select e from jsonb_array_elements(coalesce(p_item -> 'productos', '[]'::jsonb)) e loop
    v_producto := nullif(x ->> 'producto_id', '')::uuid;
    v_descuento := nullif(x ->> 'descuento_stock', '')::numeric;
    insert into public.fumigacion_productos (fumigacion_id, producto_id, producto_nombre, dosis, cantidad, unidad_uso, descuento_stock)
    values (p_id, v_producto, nullif(x ->> 'producto_nombre', ''), x ->> 'dosis', nullif(x ->> 'cantidad', '')::numeric, nullif(x ->> 'unidad_uso', ''), v_descuento)
    returning id into v_fp_id;

    if v_producto is not null and coalesce(v_descuento, 0) > 0 then
      v_res := private.consumir_stock_con_faltante(v_producto, v_descuento, 'consumo_fumigacion', 'Fumigaciones', p_id, v_plantacion, v_bloque, p_fecha, coalesce(nullif(p_tipo, ''), 'fumigacion'));
      if (v_res ->> 'faltante')::numeric > 0 then
        -- Lo anotado en el producto es lo que realmente se descontó (así una devolución posterior no inventa stock).
        update public.fumigacion_productos set descuento_stock = (v_res ->> 'consumido')::numeric where id = v_fp_id;
        v_faltantes := v_faltantes || jsonb_build_array(v_res || jsonb_build_object(
          'producto_id', v_producto,
          'nombre', coalesce((select nombre from public.productos where id = v_producto), nullif(x ->> 'producto_nombre', ''), 'Producto'),
          'unidad', (select unidad from public.productos where id = v_producto)));
      end if;
    end if;
  end loop;
  return v_faltantes;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Crear una o varias fumigaciones
--   p: { "campo_id", "tipo", "fecha", "operario", "notas", "tanque_litros",
--        "aplicaciones": [{ "tanques_cantidad", "bloques": [...], "productos": [...] }] }
--   Cada aplicacion es una fumigacion (la pantalla crea una por bloque).
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_fumigaciones(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  a jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_fecha date := nullif(p ->> 'fecha', '')::date;
  v_faltantes jsonb := '[]'::jsonb;
begin
  if v_fecha is null then raise exception 'Falta la fecha de la fumigación.'; end if;
  if jsonb_array_length(coalesce(p -> 'aplicaciones', '[]'::jsonb)) = 0 then raise exception 'No hay aplicaciones para guardar.'; end if;
  for a in select e from jsonb_array_elements(p -> 'aplicaciones') e loop
    insert into public.fumigaciones (campo_id, tipo, fecha, operario, notas, tanque_litros, tanques_cantidad)
    values (nullif(p ->> 'campo_id', '')::uuid, nullif(p ->> 'tipo', ''), v_fecha, nullif(p ->> 'operario', ''), nullif(p ->> 'notas', ''),
            nullif(p ->> 'tanque_litros', '')::numeric, nullif(a ->> 'tanques_cantidad', '')::numeric)
    returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);
    v_faltantes := v_faltantes || private.guardar_detalle_fumigacion(v_id, a, v_fecha, p ->> 'tipo');
  end loop;
  return jsonb_build_object('ids', v_ids, 'faltantes', v_faltantes);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Corregir una fumigacion (mismo formato que registrar_fumigaciones, con una sola aplicacion en p)
--   p: { "campo_id", "tipo", "fecha", "operario", "notas", "tanque_litros", "tanques_cantidad", "bloques": [...], "productos": [...] }
-- ---------------------------------------------------------------------------------------------
create or replace function public.editar_fumigacion(p_id uuid, p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  v_fecha date := nullif(p ->> 'fecha', '')::date;
  v_faltantes jsonb;
begin
  if v_fecha is null then raise exception 'Falta la fecha de la fumigación.'; end if;
  update public.fumigaciones set
    campo_id = nullif(p ->> 'campo_id', '')::uuid, tipo = nullif(p ->> 'tipo', ''), fecha = v_fecha,
    operario = nullif(p ->> 'operario', ''), notas = nullif(p ->> 'notas', ''),
    tanque_litros = nullif(p ->> 'tanque_litros', '')::numeric, tanques_cantidad = nullif(p ->> 'tanques_cantidad', '')::numeric,
    updated_at = now()
  where id = p_id and not coalesce(anulada, false);
  if not found then raise exception 'No se pudo editar la fumigación: no existe, está anulada o no tienes permiso.'; end if;

  perform private.devolver_stock_fumigacion(p_id);

  delete from public.fumigacion_bloques where fumigacion_id = p_id;
  delete from public.fumigacion_productos where fumigacion_id = p_id;
  if exists (select 1 from public.fumigacion_bloques where fumigacion_id = p_id)
     or exists (select 1 from public.fumigacion_productos where fumigacion_id = p_id) then
    raise exception 'No tienes permiso para reemplazar los bloques y productos de una aplicación: hace falta el permiso de eliminar en Fumigaciones. No se guardó ningún cambio.' using errcode = '42501';
  end if;

  v_faltantes := private.guardar_detalle_fumigacion(p_id, p, v_fecha, p ->> 'tipo');
  return jsonb_build_object('id', p_id, 'faltantes', v_faltantes);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Anular una fumigacion y devolver su stock
-- ---------------------------------------------------------------------------------------------
create or replace function public.anular_fumigacion(p_id uuid, p_motivo text default null) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
begin
  update public.fumigaciones set
    anulada = true, anulada_at = now(), anulada_motivo = coalesce(nullif(p_motivo, ''), 'Anulada por el usuario'), updated_at = now()
  where id = p_id and not coalesce(anulada, false);
  if not found then raise exception 'No se pudo anular la fumigación: no existe, ya está anulada o no tienes permiso.'; end if;
  perform private.devolver_stock_fumigacion(p_id);
  return jsonb_build_object('id', p_id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecucion
-- ---------------------------------------------------------------------------------------------
revoke all on function private.consumir_stock_con_faltante(uuid, numeric, text, text, uuid, uuid, uuid, date, text) from public, anon;
revoke all on function private.devolver_stock_fumigacion(uuid) from public, anon;
revoke all on function private.guardar_detalle_fumigacion(uuid, jsonb, date, text) from public, anon;
revoke all on function public.registrar_fumigaciones(jsonb) from public, anon;
revoke all on function public.editar_fumigacion(uuid, jsonb) from public, anon;
revoke all on function public.anular_fumigacion(uuid, text) from public, anon;
grant execute on function private.consumir_stock_con_faltante(uuid, numeric, text, text, uuid, uuid, uuid, date, text) to authenticated;
grant execute on function private.devolver_stock_fumigacion(uuid) to authenticated;
grant execute on function private.guardar_detalle_fumigacion(uuid, jsonb, date, text) to authenticated;
grant execute on function public.registrar_fumigaciones(jsonb) to authenticated;
grant execute on function public.editar_fumigacion(uuid, jsonb) to authenticated;
grant execute on function public.anular_fumigacion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Verificacion final: si algo no quedo como se espera, se aborta y no se aplica nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  falta text;
  definer text;
begin
  select string_agg(n, ', ') into falta
  from unnest(array[
    'public.registrar_fumigaciones(jsonb)', 'public.editar_fumigacion(uuid,jsonb)', 'public.anular_fumigacion(uuid,text)',
    'private.consumir_stock_con_faltante(uuid,numeric,text,text,uuid,uuid,uuid,date,text)',
    'private.devolver_stock_fumigacion(uuid)', 'private.guardar_detalle_fumigacion(uuid,jsonb,date,text)'
  ]) n
  where to_regprocedure(n) is null;
  if falta is not null then raise exception 'Faltan funciones: %', falta; end if;

  -- Ninguna debe saltarse los permisos de quien llama.
  select string_agg(p.proname, ', ') into definer
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where p.prosecdef and p.proname in ('registrar_fumigaciones', 'editar_fumigacion', 'anular_fumigacion',
                                       'consumir_stock_con_faltante', 'devolver_stock_fumigacion', 'guardar_detalle_fumigacion');
  if definer is not null then raise exception 'Funciones SECURITY DEFINER no esperadas: %', definer; end if;

  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end $$;

commit;
