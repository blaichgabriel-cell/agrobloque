-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer del refuerzo de compras.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
  t text;
begin
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_organization_guard' and cmd = 'ALL')
       and exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_authenticated' and cmd = 'ALL')
    then raise notice 'ok     % volvio a la guardia unica y la politica abierta', t;
    else raise notice 'FALLA  % no volvio al estado anterior', t; fallos := fallos + 1; end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                   and (policyname like 'tenant_organization_guard_sp_%' or policyname like 'app_%' or policyname like 'soporte_no_%'))
    then raise notice 'ok     % ya no tiene politicas del refuerzo', t;
    else raise notice 'FALLA  % conserva politicas del refuerzo', t; fallos := fallos + 1; end if;

    if not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname in ('soporte_solo_lectura', 'proteger_borrado_logico') and not g.tgisinternal)
    then raise notice 'ok     % ya no tiene triggers del refuerzo', t;
    else raise notice 'FALLA  % conserva triggers del refuerzo', t; fallos := fallos + 1; end if;
  end loop;

  if not exists (select 1 from pg_trigger g where g.tgrelid = 'public.costos'::regclass and g.tgname = 'proteger_borrado_logico' and not g.tgisinternal)
  then raise notice 'ok     costos ya no tiene el trigger de borrado logico del refuerzo';
  else raise notice 'FALLA  costos conserva el trigger de borrado logico'; fallos := fallos + 1; end if;

  if pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%'
  then raise notice 'ok     app_can_action sigue sin current_role';
  else raise notice 'FALLA  app_can_action usa current_role'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer del refuerzo de compras deja las tablas como estaban.';
  else raise notice '% FALLO(S) en el deshacer del refuerzo de compras.', fallos; end if;
end $$;
