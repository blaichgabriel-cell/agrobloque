-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer del refuerzo de ventas.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas'
                 and (policyname like 'app_write_%' or policyname like 'app_action_%'))
  then raise notice 'ok     ventas ya no tiene las politicas del refuerzo';
  else raise notice 'FALLA  ventas conserva politicas del refuerzo'; fallos := fallos + 1; end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname like 'ventas_authenticated_%') = 4
  then raise notice 'ok     ventas conserva sus politicas base (ventas_authenticated_*)';
  else raise notice 'FALLA  ventas perdio politicas base'; fallos := fallos + 1; end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname = 'soporte_no_insert')
     and exists (select 1 from pg_trigger g where g.tgrelid = 'public.ventas'::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal)
  then raise notice 'ok     ventas sigue protegida en modo soporte';
  else raise notice 'FALLA  ventas perdio la proteccion de soporte'; fallos := fallos + 1; end if;

  if pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%'
  then raise notice 'ok     app_can_action sigue sin current_role';
  else raise notice 'FALLA  app_can_action usa current_role'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer del refuerzo de ventas deja la tabla como estaba.';
  else raise notice '% FALLO(S) en el deshacer del refuerzo de ventas.', fallos; end if;
end $$;
