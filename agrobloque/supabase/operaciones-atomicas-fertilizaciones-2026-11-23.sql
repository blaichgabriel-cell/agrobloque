-- AgroBloque: fertilizaciones atomicas (2026-11-23). Fase 2 de las funciones transaccionales.
--
-- POR QUE
--   Hoy la pantalla guarda una fertilizacion en varios pasos sueltos: inserta las filas (una por bloque), luego descuenta
--   el stock producto por producto, y despues guarda el seguimiento del plan y cierra la tarea del calendario. Si un
--   paso falla (corte de internet, permiso, stock), los anteriores quedan guardados: una aplicacion sin su descuento de
--   stock, o el stock descontado a medias. Editar (anular la aplicacion vieja, devolver el stock y crear la nueva) y
--   anular tienen el mismo problema, y la pantalla intenta "deshacer a mano" lo que ya se guardo.
--
-- QUE HACE
--   Tres funciones publicas que hacen todo dentro de UNA transaccion: si algo falla, no se guarda nada.
--     registrar_fertilizacion(p jsonb)   crea la aplicacion (una fila por bloque), descuenta el stock, guarda el seguimiento
--                                        del plan y marca la tarea del dia como completada.
--     editar_fertilizacion(p_ids, p_grupo_origen, p_legado, p)   anula la aplicacion vieja, devuelve su stock y crea la nueva.
--     anular_fertilizacion(p_ids, p_grupo_origen, p_motivo, p_legado)   la anula y devuelve su stock.
--   Y dos ayudas privadas (private.guardar_fertilizacion y private.devolver_stock_fertilizacion). Reutilizan
--   private.consumir_stock_con_faltante, de la fase 1 (operaciones-atomicas-fumigaciones-2026-11-18.sql), que debe estar aplicada.
--   Son SECURITY INVOKER: corren con los permisos de quien las llama (empresa, rol, permisos por modulo, modo soporte).
--   No se salta ninguna proteccion. Anular o reemplazar una aplicacion exige el permiso "eliminar" en Fertilizaciones
--   (trigger proteger_borrado_logico), igual que hoy.
--
-- REGLA DE STOCK INSUFICIENTE (acordada el 2026-11-18)
--   Si falta producto NO se bloquea: se descuenta lo que hay, el stock queda en 0, el movimiento anota
--   "faltaron X por stock insuficiente" y la funcion devuelve la lista de faltantes para avisarle a la persona.
--
-- COMO SE DEVUELVE EL STOCK (anular y editar)
--   1. El consumo valorizado (bloques con cultivo activo) se revierte con revertir_consumos_valorizados.
--   2. Despues se devuelve lo que los movimientos de inventario dicen que se consumio realmente y sigue sin devolver
--      (consumos menos devoluciones ya hechas de esa aplicacion): exacto, sin recalcular unidades y sin devolver dos veces.
--      Asi tambien se devuelven los bloques sin cultivo activo de un grupo mixto (la pantalla anterior solo devolvia los valorizados).
--   3. Solo si la aplicacion no tiene ningun movimiento (registros muy antiguos), se usa la lista p_legado que calcula la
--      pantalla con su cuenta de siempre.
--
-- NO CAMBIA: tablas, politicas, permisos ni ningun dato existente. Solo agrega funciones. Es repetible.
-- La pantalla seguira funcionando como hoy hasta que se actualice: si estas funciones no existen usa el camino anterior.
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayarlo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   3. Ejecutarlo UNA vez, completo, con "commit;". Es repetible.
--   4. Para deshacerlo: operaciones-atomicas-fertilizaciones-2026-11-23-deshacer.sql
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
  foreach t in array array['fertilizaciones', 'fertilizacion_plan_aplicaciones', 'tareas', 'productos', 'inventario_movimientos'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'No existe public.%.', t;
    end if;
  end loop;
  if to_regprocedure('private.consumir_stock_con_faltante(uuid,numeric,text,text,uuid,uuid,uuid,date,text)') is null then
    raise exception 'Falta la fase 1 (operaciones-atomicas-fumigaciones-2026-11-18.sql): private.consumir_stock_con_faltante.';
  end if;
  if to_regprocedure('public.ajustar_stock_producto(uuid,numeric,text,text,text,text)') is null then
    raise exception 'Falta public.ajustar_stock_producto (consolidacion-operativa-2026-09-17.sql).';
  end if;
  if to_regprocedure('public.revertir_consumos_valorizados(text,uuid)') is null then
    raise exception 'Falta el consumo valorizado (costos-produccion-compras-2026-11-16.sql): revertir_consumos_valorizados.';
  end if;
  if to_regprocedure('public.app_can_action(text,text)') is null then
    raise exception 'Faltan las funciones de permisos (app_can_action).';
  end if;
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'app_can_action declara la variable current_role: aplicar antes permisos-acciones-multiempresa-fix-2026-11-04.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ayuda: devolver al inventario lo que consumio una aplicacion de fertilizacion
--   p_origen: id del grupo de la aplicacion (o de su primera fila si no tiene grupo)
--   p_legado: [{ "producto_id", "cantidad" }] calculado por la pantalla; solo se usa si no hay ningun movimiento
-- ---------------------------------------------------------------------------------------------
create or replace function private.devolver_stock_fertilizacion(p_origen uuid, p_legado jsonb, p_motivo text) returns void
language plpgsql security invoker set search_path = public, private as $$
declare
  v_revertidos integer;
  v_hubo boolean := false;
  r record;
  x jsonb;
begin
  if p_origen is not null then
    -- Primero el consumo valorizado (bloques con cultivo activo). Despues, lo que quede sin devolver segun los movimientos
    -- (bloques sin cultivo activo): un mismo grupo puede tener bloques de los dos tipos.
    v_revertidos := public.revertir_consumos_valorizados('consumo_fertilizacion', p_origen);

    for r in
      select producto_id, -sum(cantidad) as neto
      from public.inventario_movimientos
      where referencia_id = p_origen::text and producto_id is not null
        and tipo in ('consumo_fertilizacion', 'devolucion_fertilizacion', 'devolucion_consumo_fertilizacion')
      group by producto_id
    loop
      v_hubo := true;
      if r.neto > 0 then
        perform public.ajustar_stock_producto(r.producto_id, r.neto, 'devolucion_fertilizacion', 'Fertilizaciones', p_origen::text, p_motivo);
      end if;
    end loop;
    if v_hubo or coalesce(v_revertidos, 0) > 0 then return; end if;
  end if;

  -- Aplicaciones sin ningun movimiento (muy antiguas): la cuenta que calcula la pantalla.
  for x in select e from jsonb_array_elements(coalesce(p_legado, '[]'::jsonb)) e loop
    if nullif(x ->> 'producto_id', '') is not null and coalesce(nullif(x ->> 'cantidad', '')::numeric, 0) > 0 then
      perform public.ajustar_stock_producto((x ->> 'producto_id')::uuid, (x ->> 'cantidad')::numeric, 'devolucion_fertilizacion', 'Fertilizaciones', p_origen::text, p_motivo);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ayuda: guardar una aplicacion (filas por bloque + descuento de stock + seguimiento del plan + tarea completada)
--   p: { "grupo_id", "fecha",
--        "aplicaciones": [{ "bloque_id", "plantacion_id", "plan_id", "tanque_litros", "tanques_cantidad", "estado", "dosis_alcance",
--                           "notas", "soluciones", "detalle", "descuentos": [{ "producto_id", "cantidad" }] }],
--        "seguimiento": [{ "plan_id", "bloque_id", "plantacion_id", "litros_aplicados", "tanques_aplicados", "estado", "productos", "notas" }],
--        "planes_completar": [uuid] }
--   Devuelve { "ids": [...], "faltantes": [...] }.
-- ---------------------------------------------------------------------------------------------
create or replace function private.guardar_fertilizacion(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  a jsonb;
  d jsonb;
  s jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_fecha date := nullif(p ->> 'fecha', '')::date;
  v_grupo uuid := nullif(p ->> 'grupo_id', '')::uuid;
  v_producto uuid;
  v_plantacion uuid;
  v_bloque uuid;
  v_res jsonb;
  v_faltantes jsonb := '[]'::jsonb;
begin
  if v_fecha is null then raise exception 'Falta la fecha de la fertilización.'; end if;
  if jsonb_array_length(coalesce(p -> 'aplicaciones', '[]'::jsonb)) = 0 then raise exception 'No hay bloques para guardar.'; end if;

  for a in select e from jsonb_array_elements(p -> 'aplicaciones') e loop
    v_bloque := (a ->> 'bloque_id')::uuid;
    v_plantacion := nullif(a ->> 'plantacion_id', '')::uuid;
    insert into public.fertilizaciones (bloque_id, grupo_id, plantacion_id, plan_id, fecha, tanque_litros, tanques_cantidad, estado, dosis_alcance, notas, soluciones)
    values (v_bloque, v_grupo, v_plantacion, nullif(a ->> 'plan_id', '')::uuid, v_fecha, nullif(a ->> 'tanque_litros', '')::numeric,
            nullif(a ->> 'tanques_cantidad', '')::numeric, nullif(a ->> 'estado', ''), nullif(a ->> 'dosis_alcance', ''), nullif(a ->> 'notas', ''), a -> 'soluciones')
    returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);

    for d in select e from jsonb_array_elements(coalesce(a -> 'descuentos', '[]'::jsonb)) e loop
      v_producto := nullif(d ->> 'producto_id', '')::uuid;
      if v_producto is not null and coalesce(nullif(d ->> 'cantidad', '')::numeric, 0) > 0 then
        v_res := private.consumir_stock_con_faltante(v_producto, (d ->> 'cantidad')::numeric, 'consumo_fertilizacion', 'Fertilizaciones', v_grupo,
                                                     v_plantacion, v_bloque, v_fecha, nullif(a ->> 'detalle', ''));
        if (v_res ->> 'faltante')::numeric > 0 then
          v_faltantes := v_faltantes || jsonb_build_array(v_res || jsonb_build_object(
            'producto_id', v_producto,
            'nombre', coalesce((select nombre from public.productos where id = v_producto), 'Producto'),
            'unidad', (select unidad from public.productos where id = v_producto)));
        end if;
      end if;
    end loop;
  end loop;

  for s in select e from jsonb_array_elements(coalesce(p -> 'seguimiento', '[]'::jsonb)) e loop
    insert into public.fertilizacion_plan_aplicaciones (plan_id, bloque_id, plantacion_id, fecha, litros_aplicados, tanques_aplicados, estado, productos, notas)
    values ((s ->> 'plan_id')::uuid, (s ->> 'bloque_id')::uuid, nullif(s ->> 'plantacion_id', '')::uuid, v_fecha,
            nullif(s ->> 'litros_aplicados', '')::numeric, nullif(s ->> 'tanques_aplicados', '')::numeric, nullif(s ->> 'estado', ''), s -> 'productos', nullif(s ->> 'notas', ''));
  end loop;

  if jsonb_array_length(coalesce(p -> 'planes_completar', '[]'::jsonb)) > 0 then
    update public.tareas set completada = true, fecha_completada = v_fecha, updated_at = now()
    where origen_tipo = 'fertilizacion_plan' and fecha_programada = v_fecha
      and origen_id in (select x::uuid from jsonb_array_elements_text(p -> 'planes_completar') x);
  end if;

  return jsonb_build_object('ids', v_ids, 'faltantes', v_faltantes);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Registrar una fertilizacion
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_fertilizacion(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  v_res jsonb;
begin
  v_res := private.guardar_fertilizacion(p);
  return v_res || jsonb_build_object('grupo_id', nullif(p ->> 'grupo_id', ''));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Corregir una fertilizacion: anula la aplicacion vieja, devuelve su stock y crea la nueva (p, con grupo_id nuevo)
-- ---------------------------------------------------------------------------------------------
create or replace function public.editar_fertilizacion(p_ids uuid[], p_grupo_origen uuid, p_legado jsonb, p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  n integer;
  v_res jsonb;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No hay aplicación para corregir.'; end if;
  update public.fertilizaciones set
    anulada = true, anulada_at = now(), anulada_motivo = 'Reemplazada por edición', updated_at = now()
  where id = any(p_ids) and not coalesce(anulada, false);
  get diagnostics n = row_count;
  if n <> array_length(p_ids, 1) then
    raise exception 'No se pudo preparar la edición: la aplicación no existe, ya está anulada o no tienes permiso.';
  end if;

  perform private.devolver_stock_fertilizacion(coalesce(p_grupo_origen, p_ids[1]), p_legado, 'Edición de fertilización');
  v_res := private.guardar_fertilizacion(p);
  return v_res || jsonb_build_object('grupo_id', nullif(p ->> 'grupo_id', ''));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Anular una fertilizacion y devolver su stock
-- ---------------------------------------------------------------------------------------------
create or replace function public.anular_fertilizacion(p_ids uuid[], p_grupo_origen uuid, p_motivo text, p_legado jsonb default null) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  n integer;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No hay aplicación para anular.'; end if;
  update public.fertilizaciones set
    anulada = true, anulada_at = now(), anulada_motivo = coalesce(nullif(p_motivo, ''), 'Anulada por el usuario'), updated_at = now()
  where id = any(p_ids) and not coalesce(anulada, false);
  get diagnostics n = row_count;
  if n <> array_length(p_ids, 1) then
    raise exception 'No se pudo anular: la aplicación no existe, ya está anulada o no tienes permiso.';
  end if;
  perform private.devolver_stock_fertilizacion(coalesce(p_grupo_origen, p_ids[1]), p_legado, coalesce(nullif(p_motivo, ''), 'Anulada por el usuario'));
  return jsonb_build_object('ids', to_jsonb(p_ids));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecucion
-- ---------------------------------------------------------------------------------------------
revoke all on function private.devolver_stock_fertilizacion(uuid, jsonb, text) from public, anon;
revoke all on function private.guardar_fertilizacion(jsonb) from public, anon;
revoke all on function public.registrar_fertilizacion(jsonb) from public, anon;
revoke all on function public.editar_fertilizacion(uuid[], uuid, jsonb, jsonb) from public, anon;
revoke all on function public.anular_fertilizacion(uuid[], uuid, text, jsonb) from public, anon;
grant execute on function private.devolver_stock_fertilizacion(uuid, jsonb, text) to authenticated;
grant execute on function private.guardar_fertilizacion(jsonb) to authenticated;
grant execute on function public.registrar_fertilizacion(jsonb) to authenticated;
grant execute on function public.editar_fertilizacion(uuid[], uuid, jsonb, jsonb) to authenticated;
grant execute on function public.anular_fertilizacion(uuid[], uuid, text, jsonb) to authenticated;

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
    'public.registrar_fertilizacion(jsonb)', 'public.editar_fertilizacion(uuid[],uuid,jsonb,jsonb)', 'public.anular_fertilizacion(uuid[],uuid,text,jsonb)',
    'private.devolver_stock_fertilizacion(uuid,jsonb,text)', 'private.guardar_fertilizacion(jsonb)'
  ]) n
  where to_regprocedure(n) is null;
  if falta is not null then raise exception 'Faltan funciones: %', falta; end if;

  select string_agg(p.proname, ', ') into definer
  from pg_proc p
  where p.prosecdef and p.proname in ('registrar_fertilizacion', 'editar_fertilizacion', 'anular_fertilizacion',
                                       'devolver_stock_fertilizacion', 'guardar_fertilizacion');
  if definer is not null then raise exception 'Funciones SECURITY DEFINER no esperadas: %', definer; end if;

  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end $$;

commit;
