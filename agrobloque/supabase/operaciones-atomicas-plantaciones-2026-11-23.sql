-- AgroBloque: plantaciones atomicas (2026-11-23). Fase 3 de las funciones transaccionales.
--
-- POR QUE
--   Hoy la pantalla de la ficha del bloque guarda una plantacion en varios pasos sueltos:
--     * NUEVA: cierra la plantacion activa, crea la nueva y despues sus abonos. Si un paso falla intenta "deshacer a mano"
--       (reactivar la vieja, desactivar la nueva), y ese deshacer tambien puede fallar: el bloque puede quedar sin
--       plantacion activa, o con dos.
--     * EDITAR: actualiza la plantacion, BORRA todos sus abonos y los vuelve a insertar. Si el segundo paso falla, los
--       abonos se pierden. Ademas el borrado exige el permiso "eliminar": el operador no lo tiene, el borrado no hace nada
--       (sin error) y los abonos quedan DUPLICADOS.
--     * ELIMINAR: cuatro borrados seguidos sin revisar errores. Si alguno falla o no tiene permiso, queda a medias
--       (por ejemplo, sin abonos ni fotos pero con la plantacion).
--
-- QUE HACE
--   Tres funciones publicas que hacen todo dentro de UNA transaccion: si algo falla, no se guarda nada.
--     registrar_plantacion(p jsonb)             cierra la plantacion activa del bloque, crea la nueva y sus abonos.
--     editar_plantacion(p_id uuid, p jsonb)     actualiza la plantacion y, solo si cambiaron, reemplaza sus abonos.
--     eliminar_plantacion(p_id, p_con_fotos_y_muertes)   borra la plantacion con sus abonos (y sus fotos y muertes si se pide).
--   Son SECURITY INVOKER: corren con los permisos de quien las llama (empresa, rol, permisos del modulo "mapa", modo soporte).
--   No se salta ninguna proteccion.
--
-- EDITAR sin permiso de eliminar
--   Los abonos solo se reemplazan si cambiaron. Si no cambiaron (el caso mas comun: se corrige el cultivo, la fecha o las
--   plantas), no hace falta borrar nada y la edicion funciona con solo "editar". Si cambiaron y la persona no tiene
--   "eliminar", la funcion falla con un mensaje claro y NO guarda nada (en vez de duplicar los abonos en silencio).
--
-- ELIMINAR: que se borra
--   Igual que hoy: los abonos (en cascada). Con p_con_fotos_y_muertes = true (plantacion activa) tambien las fotos y las
--   muertes de esa plantacion. Con false (ciclos del historial) las fotos y muertes NO se borran: quedan sin plantacion, como hoy.
--   Cosechas, costos, fertilizaciones, fumigaciones y movimientos NO se borran: la base los deja sin plantacion (SET NULL).
--
-- NO CAMBIA: tablas, politicas, permisos ni ningun dato existente. Solo agrega funciones. Es repetible.
-- La pantalla seguira funcionando como hoy hasta que se actualice: si estas funciones no existen usa el camino anterior.
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayarlo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   3. Ejecutarlo UNA vez, completo, con "commit;". Es repetible.
--   4. Para deshacerlo: operaciones-atomicas-plantaciones-2026-11-23-deshacer.sql
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
  foreach t in array array['plantaciones', 'plantacion_abonos', 'abonos', 'fotos_bloque', 'muertes_plantas', 'bloques'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'No existe public.%.', t;
    end if;
  end loop;
  if to_regprocedure('public.app_can_action(text,text)') is null then
    raise exception 'Faltan las funciones de permisos (app_can_action).';
  end if;
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'app_can_action declara la variable current_role: aplicar antes permisos-acciones-multiempresa-fix-2026-11-04.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ayuda: abonos de una plantacion en una forma comparable (para saber si cambiaron)
-- ---------------------------------------------------------------------------------------------
create or replace function private.abonos_normalizados(p_abonos jsonb) returns text
language sql immutable set search_path = public, private as $$
  select coalesce(string_agg(fila, '|' order by fila), '')
  from (
    -- Unidad y alcance en blanco equivalen a sus valores por defecto ("kg" y "total"), que es como los guarda la pantalla.
    select concat_ws('~', coalesce(e ->> 'abono_id', ''), btrim(coalesce(e ->> 'cantidad', '')), coalesce(nullif(btrim(coalesce(e ->> 'unidad', '')), ''), 'kg'),
                     coalesce(nullif(btrim(coalesce(e ->> 'alcance', '')), ''), 'total')) as fila
    from jsonb_array_elements(coalesce(p_abonos, '[]'::jsonb)) e
  ) f;
$$;

-- ---------------------------------------------------------------------------------------------
-- Crear una plantacion nueva en un bloque
--   p: { "bloque_id", "cultivo_id", "fecha_siembra", "cantidad_plantas", "notas",
--        "abonos": [{ "abono_id", "cantidad", "unidad", "alcance" }] }
--   Cierra (activa = false) la plantacion activa del bloque, crea la nueva y sus abonos. Devuelve { "id", "cerradas" }.
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_plantacion(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  v_bloque uuid := nullif(p ->> 'bloque_id', '')::uuid;
  v_cultivo uuid := nullif(p ->> 'cultivo_id', '')::uuid;
  v_fecha date := nullif(p ->> 'fecha_siembra', '')::date;
  v_id uuid;
  v_cerradas integer;
  x jsonb;
begin
  if v_bloque is null then raise exception 'Falta el bloque.'; end if;
  if v_cultivo is null then raise exception 'Falta el cultivo.'; end if;
  if v_fecha is null then raise exception 'Falta la fecha de siembra.'; end if;

  update public.plantaciones set activa = false where bloque_id = v_bloque and coalesce(activa, false);
  get diagnostics v_cerradas = row_count;

  insert into public.plantaciones (bloque_id, cultivo_id, notas, fecha_siembra, cantidad_plantas, activa)
  values (v_bloque, v_cultivo, nullif(p ->> 'notas', ''), v_fecha, nullif(p ->> 'cantidad_plantas', '')::integer, true)
  returning id into v_id;

  for x in select e from jsonb_array_elements(coalesce(p -> 'abonos', '[]'::jsonb)) e loop
    insert into public.plantacion_abonos (plantacion_id, abono_id, cantidad, unidad, alcance)
    values (v_id, (x ->> 'abono_id')::uuid, nullif(x ->> 'cantidad', ''), coalesce(nullif(x ->> 'unidad', ''), 'kg'), coalesce(nullif(x ->> 'alcance', ''), 'total'));
  end loop;

  return jsonb_build_object('id', v_id, 'cerradas', v_cerradas);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Corregir una plantacion: cultivo, fecha, plantas y notas; y los abonos solo si cambiaron
--   p: { "cultivo_id", "fecha_siembra", "cantidad_plantas", "notas", "abonos": [...] }  (sin "abonos" no se tocan)
-- ---------------------------------------------------------------------------------------------
create or replace function public.editar_plantacion(p_id uuid, p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  v_cultivo uuid := nullif(p ->> 'cultivo_id', '')::uuid;
  v_fecha date := nullif(p ->> 'fecha_siembra', '')::date;
  v_antes text;
  v_reemplazados boolean := false;
  x jsonb;
begin
  if v_cultivo is null then raise exception 'Falta el cultivo.'; end if;
  if v_fecha is null then raise exception 'Falta la fecha de siembra.'; end if;

  update public.plantaciones set
    cultivo_id = v_cultivo, notas = nullif(p ->> 'notas', ''), fecha_siembra = v_fecha,
    cantidad_plantas = nullif(p ->> 'cantidad_plantas', '')::integer
  where id = p_id;
  if not found then raise exception 'No se pudo editar la plantación: no existe o no tienes permiso.'; end if;

  if p ? 'abonos' then
    select private.abonos_normalizados(coalesce(jsonb_agg(jsonb_build_object('abono_id', a.abono_id, 'cantidad', a.cantidad, 'unidad', a.unidad, 'alcance', a.alcance)), '[]'::jsonb))
      into v_antes from public.plantacion_abonos a where a.plantacion_id = p_id;
    if v_antes is distinct from private.abonos_normalizados(p -> 'abonos') then
      delete from public.plantacion_abonos where plantacion_id = p_id;
      if exists (select 1 from public.plantacion_abonos where plantacion_id = p_id) then
        raise exception 'No tienes permiso para reemplazar los abonos de una plantación: hace falta el permiso de eliminar en el mapa. No se guardó ningún cambio.' using errcode = '42501';
      end if;
      for x in select e from jsonb_array_elements(coalesce(p -> 'abonos', '[]'::jsonb)) e loop
        insert into public.plantacion_abonos (plantacion_id, abono_id, cantidad, unidad, alcance)
        values (p_id, (x ->> 'abono_id')::uuid, nullif(x ->> 'cantidad', ''), coalesce(nullif(x ->> 'unidad', ''), 'kg'), coalesce(nullif(x ->> 'alcance', ''), 'total'));
      end loop;
      v_reemplazados := true;
    end if;
  end if;

  return jsonb_build_object('id', p_id, 'abonos_reemplazados', v_reemplazados);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Eliminar una plantacion
--   p_con_fotos_y_muertes = true  (plantacion activa): borra tambien sus fotos y muertes registradas.
--   p_con_fotos_y_muertes = false (ciclo del historial): las fotos y muertes quedan sin plantacion, como hoy.
-- ---------------------------------------------------------------------------------------------
create or replace function public.eliminar_plantacion(p_id uuid, p_con_fotos_y_muertes boolean default true) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  n integer;
  v_fotos integer := 0;
  v_muertes integer := 0;
begin
  -- Sin "for update": en modo soporte la fila se puede leer pero no bloquear, y asi el aviso correcto es "solo lectura".
  if not exists (select 1 from public.plantaciones where id = p_id) then
    raise exception 'No se pudo eliminar la plantación: no existe o no tienes permiso.';
  end if;

  if p_con_fotos_y_muertes then
    delete from public.fotos_bloque where plantacion_id = p_id;
    get diagnostics v_fotos = row_count;
    delete from public.muertes_plantas where plantacion_id = p_id;
    get diagnostics v_muertes = row_count;
    if exists (select 1 from public.fotos_bloque where plantacion_id = p_id) or exists (select 1 from public.muertes_plantas where plantacion_id = p_id) then
      raise exception 'No tienes permiso para eliminar las fotos y muertes de esta plantación. No se eliminó nada.' using errcode = '42501';
    end if;
  end if;

  delete from public.plantacion_abonos where plantacion_id = p_id;
  if exists (select 1 from public.plantacion_abonos where plantacion_id = p_id) then
    raise exception 'No tienes permiso para eliminar los abonos de esta plantación. No se eliminó nada.' using errcode = '42501';
  end if;

  delete from public.plantaciones where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No tienes permiso para eliminar esta plantación. No se eliminó nada.' using errcode = '42501';
  end if;

  return jsonb_build_object('id', p_id, 'fotos', v_fotos, 'muertes', v_muertes);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecucion
-- ---------------------------------------------------------------------------------------------
revoke all on function private.abonos_normalizados(jsonb) from public, anon;
revoke all on function public.registrar_plantacion(jsonb) from public, anon;
revoke all on function public.editar_plantacion(uuid, jsonb) from public, anon;
revoke all on function public.eliminar_plantacion(uuid, boolean) from public, anon;
grant execute on function private.abonos_normalizados(jsonb) to authenticated;
grant execute on function public.registrar_plantacion(jsonb) to authenticated;
grant execute on function public.editar_plantacion(uuid, jsonb) to authenticated;
grant execute on function public.eliminar_plantacion(uuid, boolean) to authenticated;

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
    'public.registrar_plantacion(jsonb)', 'public.editar_plantacion(uuid,jsonb)', 'public.eliminar_plantacion(uuid,boolean)', 'private.abonos_normalizados(jsonb)'
  ]) n
  where to_regprocedure(n) is null;
  if falta is not null then raise exception 'Faltan funciones: %', falta; end if;

  select string_agg(p.proname, ', ') into definer
  from pg_proc p
  where p.prosecdef and p.proname in ('registrar_plantacion', 'editar_plantacion', 'eliminar_plantacion', 'abonos_normalizados');
  if definer is not null then raise exception 'Funciones SECURITY DEFINER no esperadas: %', definer; end if;

  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end $$;

commit;
