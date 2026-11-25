-- Comprobaciones de SOLO LECTURA del estado DESPUES de quitar-fotos-2026-11-25.sql. No crea ni cambia nada.
-- Ejecutar en el SQL Editor (o con psql) y revisar que no aparezca ninguna linea FALLA.

do $$
declare
  fallos integer := 0;
  cuerpo text;
  tipo text;
begin
  if to_regclass('public.fotos_bloque') is null
  then raise notice 'ok     ya no existe la tabla public.fotos_bloque';
  else raise notice 'FALLA  queda la tabla public.fotos_bloque'; fallos := fallos + 1; end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vivero_lotes' and column_name = 'fotos')
  then raise notice 'ok     ya no existe la columna vivero_lotes.fotos';
  else raise notice 'FALLA  queda la columna vivero_lotes.fotos'; fallos := fallos + 1; end if;

  if not exists (select 1 from public.notas_modulo where modulo = 'fotos_bloque')
  then raise notice 'ok     no quedan notas de fotos en notas_modulo';
  else raise notice 'FALLA  quedan notas de fotos en notas_modulo'; fallos := fallos + 1; end if;

  select case when p.prosecdef then 'definer' else 'invoker' end, p.prosrc into tipo, cuerpo
    from pg_proc p where p.oid = to_regprocedure('public.eliminar_plantacion(uuid,boolean)');
  if tipo = 'invoker' and cuerpo not ilike '%fotos_bloque%' and cuerpo ilike '%muertes_plantas%'
  then raise notice 'ok     eliminar_plantacion es SECURITY INVOKER y ya no toca fotos';
  else raise notice 'FALLA  eliminar_plantacion: tipo %, nombra fotos_bloque: %', tipo, (cuerpo ilike '%fotos_bloque%'); fallos := fallos + 1; end if;

  if has_function_privilege('authenticated', 'public.eliminar_plantacion(uuid,boolean)', 'execute')
     and not has_function_privilege('anon', 'public.eliminar_plantacion(uuid,boolean)', 'execute')
  then raise notice 'ok     eliminar_plantacion: la ejecuta authenticated y no anon';
  else raise notice 'FALLA  privilegios de eliminar_plantacion'; fallos := fallos + 1; end if;

  -- Ninguna funcion de la base debe nombrar ya la tabla borrada
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'private') and p.prosrc ilike '%fotos_bloque%')
  then raise notice 'ok     ninguna funcion de public ni private nombra fotos_bloque';
  else raise notice 'FALLA  hay funciones que todavia nombran fotos_bloque'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: las fotos se quitaron de la base y la eliminacion de plantaciones sigue funcionando.';
  else raise notice '% FALLO(S): revisar las lineas FALLA.', fallos; end if;
end $$;
