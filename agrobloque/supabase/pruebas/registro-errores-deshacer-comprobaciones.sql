-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer del registro de errores.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
begin
  if to_regprocedure('public.registrar_error_app(jsonb)') is null
     and to_regprocedure('public.plataforma_errores(integer)') is null
     and to_regprocedure('public.plataforma_errores_descartar(text)') is null
     and to_regprocedure('private.purgar_errores_app()') is null
  then raise notice 'ok     ya no existen las funciones del registro de errores';
  else raise notice 'FALLA  quedan funciones del registro de errores'; fallos := fallos + 1; end if;

  if to_regclass('private.errores_app') is null
  then raise notice 'ok     ya no existe la tabla private.errores_app';
  else raise notice 'FALLA  queda la tabla private.errores_app'; fallos := fallos + 1; end if;

  if to_regprocedure('public.is_platform_admin()') is not null and to_regprocedure('private.current_organization_id()') is not null
  then raise notice 'ok     las funciones de permisos y de plataforma siguen intactas';
  else raise notice 'FALLA  se perdio una funcion de permisos'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer del registro de errores deja todo como estaba.';
  else raise notice '% FALLO(S) en el deshacer del registro de errores.', fallos; end if;
end $$;
