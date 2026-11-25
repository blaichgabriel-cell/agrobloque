-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer de quitar-fotos.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
  n integer;
begin
  if to_regclass('public.fotos_bloque') is not null
  then raise notice 'ok     se recreo la tabla public.fotos_bloque';
  else raise notice 'FALLA  no existe public.fotos_bloque'; fallos := fallos + 1; end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'fotos_bloque';
  if n = 24 then raise notice 'ok     fotos_bloque tiene sus 24 politicas';
  else raise notice 'FALLA  fotos_bloque tiene % politicas (se esperaban 24)', n; fallos := fallos + 1; end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vivero_lotes' and column_name = 'fotos')
  then raise notice 'ok     se recreo vivero_lotes.fotos';
  else raise notice 'FALLA  no existe vivero_lotes.fotos'; fallos := fallos + 1; end if;

  if (select prosrc from pg_proc where oid = to_regprocedure('public.eliminar_plantacion(uuid,boolean)')) ilike '%fotos_bloque%'
  then raise notice 'ok     eliminar_plantacion volvio a la version anterior (con fotos)';
  else raise notice 'FALLA  eliminar_plantacion no volvio a la version anterior'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer deja las fotos como estaban (sin datos).';
  else raise notice '% FALLO(S) en el deshacer de quitar-fotos.', fallos; end if;
end $$;
