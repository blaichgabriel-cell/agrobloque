-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer del refuerzo de las otras tablas.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
  t text;
begin
  foreach t in array array['proveedores_credito', 'proveedor_movimientos', 'plan_nutricional_registros',
                           'asistencia_notas_dia', 'contabilidad_facturas', 'inventario_movimientos'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                   and (policyname like 'app_write_%' or policyname like 'app_action_%'))
    then raise notice 'ok     % ya no tiene las politicas del refuerzo', t;
    else raise notice 'FALLA  % conserva politicas del refuerzo', t; fallos := fallos + 1; end if;

    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'soporte_no_insert')
       and exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal)
    then raise notice 'ok     % sigue protegida en modo soporte', t;
    else raise notice 'FALLA  % perdio la proteccion de soporte', t; fallos := fallos + 1; end if;

    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE')
    then raise notice 'ok     % conserva sus politicas base', t;
    else raise notice 'FALLA  % perdio sus politicas base', t; fallos := fallos + 1; end if;
  end loop;

  if pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%'
  then raise notice 'ok     app_can_action sigue sin current_role';
  else raise notice 'FALLA  app_can_action usa current_role'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer del refuerzo de las otras tablas las deja como estaban.';
  else raise notice '% FALLO(S) en el deshacer del refuerzo de las otras tablas.', fallos; end if;
end $$;
