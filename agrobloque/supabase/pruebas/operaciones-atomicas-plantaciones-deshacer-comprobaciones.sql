-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer de las plantaciones atomicas.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
begin
  if to_regprocedure('public.registrar_plantacion(jsonb)') is null
     and to_regprocedure('public.editar_plantacion(uuid,jsonb)') is null
     and to_regprocedure('public.eliminar_plantacion(uuid,boolean)') is null
  then raise notice 'ok     ya no existen las tres funciones publicas';
  else raise notice 'FALLA  quedan funciones publicas'; fallos := fallos + 1; end if;

  if to_regprocedure('private.abonos_normalizados(jsonb)') is null
  then raise notice 'ok     ya no existe la ayuda privada';
  else raise notice 'FALLA  queda la ayuda privada'; fallos := fallos + 1; end if;

  if pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%'
  then raise notice 'ok     app_can_action sigue sin current_role';
  else raise notice 'FALLA  app_can_action usa current_role'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer de las plantaciones atomicas deja todo como estaba.';
  else raise notice '% FALLO(S) en el deshacer de las plantaciones atomicas.', fallos; end if;
end $$;
