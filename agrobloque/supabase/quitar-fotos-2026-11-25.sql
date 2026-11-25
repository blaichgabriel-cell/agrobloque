-- AgroBloque: quitar las fotos del producto (2026-11-25).
--
-- POR QUE
--   Decision del dueno: la version final no tendra fotos. El front ya no las muestra ni las guarda (commit
--   "Quita las fotos del producto", desplegado en Vercel). Las fotos se guardaban como texto base64 dentro de la base
--   (3 fotos de El Sembrador = 13,7 MB, el 93 % del tamano de la base).
--
-- QUE HACE
--   1. Reemplaza public.eliminar_plantacion(p_id, p_con_fotos_y_muertes) para que ya no toque fotos_bloque. El nombre del
--      parametro se conserva (el front lo sigue enviando); ahora solo significa "borrar tambien las muertes".
--   2. Borra las notas de fotos de notas_modulo (modulo = 'fotos_bloque'; hoy no hay ninguna).
--   3. Borra la columna public.vivero_lotes.fotos (hoy los 9 lotes la tienen vacia: []).
--   4. BORRA la tabla public.fotos_bloque con sus politicas, indices y disparadores. Se pierden las 3 fotos de
--      El Sembrador: quedan solo en el respaldo de la base del 2026-11-25 y en la carpeta fotos-bloques-2026-11-25
--      (fuera del repo).
--
-- SEGURIDAD
--   Se aborta (sin cambiar nada) si fotos_bloque no tiene EXACTAMENTE las 3 filas esperadas (o ninguna) o si algun lote del vivero
--   tiene fotos: asi no se borra nada que el dueno no haya visto. Es repetible (si ya esta aplicado, no hace nada).
--
-- ANTES DE EJECUTAR
--   1. Respaldo nuevo de la base (el plan Free no tiene respaldos automaticos).
--   2. El front nuevo ya debe estar desplegado (el viejo consulta fotos_bloque y daria error).
--   3. Ensayo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   4. Ejecutarlo UNA vez, completo, con "commit;".
--   5. Deshacer: quitar-fotos-2026-11-25-deshacer.sql (recrea la tabla y la columna VACIAS; las fotos se restauran
--      desde el respaldo si hiciera falta).
--
-- Nota: operaciones-atomicas-plantaciones-2026-11-23.sql nombra fotos_bloque; es historia ya aplicada y no debe
-- volver a ejecutarse despues de este archivo. No declara ninguna variable llamada current_role.

begin;

-- ---------------------------------------------------------------------------------------------
-- Comprobaciones previas: si algo no es como se espera, se aborta antes de cambiar nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  n integer;
begin
  if to_regprocedure('public.eliminar_plantacion(uuid,boolean)') is null then
    raise exception 'Falta public.eliminar_plantacion(uuid, boolean) (operaciones-atomicas-plantaciones-2026-11-23.sql).';
  end if;
  if to_regclass('public.muertes_plantas') is null or to_regclass('public.plantacion_abonos') is null then
    raise exception 'Faltan tablas que usa eliminar_plantacion (muertes_plantas o plantacion_abonos).';
  end if;
  if to_regclass('public.fotos_bloque') is not null then
    execute 'select count(*) from public.fotos_bloque' into n;
    if n not in (0, 3) then
      raise exception 'Se esperaban 3 fotos (o ninguna) en fotos_bloque y hay %. Revisa antes de borrarlas.', n;
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vivero_lotes' and column_name = 'fotos') then
    execute $q$select count(*) from public.vivero_lotes where fotos <> '[]'::jsonb$q$ into n;
    if n > 0 then
      raise exception 'Hay % lote(s) del vivero con fotos guardadas. Revisa antes de borrarlas.', n;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. eliminar_plantacion sin fotos (mismo nombre y parametros; el front no cambia)
--      p_con_fotos_y_muertes = true  (plantacion activa): borra tambien sus muertes registradas.
--      p_con_fotos_y_muertes = false (ciclo del historial): las muertes quedan sin plantacion, como hoy.
-- ---------------------------------------------------------------------------------------------
create or replace function public.eliminar_plantacion(p_id uuid, p_con_fotos_y_muertes boolean default true) returns jsonb
language plpgsql security invoker set search_path = public, private as $$
declare
  n integer;
  v_muertes integer := 0;
begin
  -- Sin "for update": en modo soporte la fila se puede leer pero no bloquear, y asi el aviso correcto es "solo lectura".
  if not exists (select 1 from public.plantaciones where id = p_id) then
    raise exception 'No se pudo eliminar la plantación: no existe o no tienes permiso.';
  end if;

  if p_con_fotos_y_muertes then
    delete from public.muertes_plantas where plantacion_id = p_id;
    get diagnostics v_muertes = row_count;
    if exists (select 1 from public.muertes_plantas where plantacion_id = p_id) then
      raise exception 'No tienes permiso para eliminar las muertes de esta plantación. No se eliminó nada.' using errcode = '42501';
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

  return jsonb_build_object('id', p_id, 'muertes', v_muertes);
end $$;

revoke all on function public.eliminar_plantacion(uuid, boolean) from public, anon;
grant execute on function public.eliminar_plantacion(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. a 4. Datos y estructura de fotos
-- ---------------------------------------------------------------------------------------------
delete from public.notas_modulo where modulo = 'fotos_bloque';

alter table public.vivero_lotes drop column if exists fotos;

drop table if exists public.fotos_bloque;

-- ---------------------------------------------------------------------------------------------
-- Verificacion final: si algo no quedo como se espera, se aborta y no se aplica nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  tipo text;
  cuerpo text;
begin
  if to_regclass('public.fotos_bloque') is not null then
    raise exception 'fotos_bloque sigue existiendo.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vivero_lotes' and column_name = 'fotos') then
    raise exception 'vivero_lotes.fotos sigue existiendo.';
  end if;
  if exists (select 1 from public.notas_modulo where modulo = 'fotos_bloque') then
    raise exception 'Quedan notas de fotos en notas_modulo.';
  end if;
  select case when p.prosecdef then 'definer' else 'invoker' end, p.prosrc into tipo, cuerpo
    from pg_proc p where p.oid = to_regprocedure('public.eliminar_plantacion(uuid,boolean)');
  if tipo <> 'invoker' then
    raise exception 'eliminar_plantacion debe ser SECURITY INVOKER.';
  end if;
  if cuerpo ilike '%fotos_bloque%' then
    raise exception 'eliminar_plantacion todavia nombra fotos_bloque.';
  end if;
  if has_function_privilege('anon', 'public.eliminar_plantacion(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.eliminar_plantacion(uuid,boolean)', 'execute') then
    raise exception 'Privilegios de eliminar_plantacion incorrectos.';
  end if;
end $$;

commit;
