-- AgroBloque: refuerzo de permisos en la tabla de ventas (2026-11-17).
--
-- POR QUE
--   public.ventas solo tiene el filtro por empresa y politicas abiertas "ventas_authenticated_*" con
--   "using (true)". No miran el rol ni los permisos por accion: un usuario de solo lectura (o un operador con
--   el modulo Ventas en "solo ver") de la misma empresa podia crear, editar y BORRAR ventas hablando directo
--   con la API. La pantalla le oculta los botones; la base no lo frenaba. Es dinero.
--   El resto de las tablas del negocio ya tiene estas dos capas (app_write_* y app_action_*).
--
-- QUE HACE (mismos nombres y patron que permisos-acciones.sql y refuerzo-compras-2026-11-17.sql)
--   app_write_insert/update/delete_ventas   RESTRICTIVAS: solo admin u operador (public.app_can_write()).
--   app_action_insert/update/delete_ventas  RESTRICTIVAS: permiso por accion del modulo "ventas":
--                                           crear -> "create", editar (incluye cobrar) -> "edit",
--                                           borrar -> "delete".
--   No toca las politicas abiertas existentes (ventas_authenticated_*): siguen como capa base, igual que
--   app_base_* en las demas tablas, y las nuevas restricciones se suman encima.
--
-- COMO QUEDA CADA ROL (con los permisos por defecto)
--   admin     todo.
--   operador  ver, crear y editar ventas (registrar y cobrar); NO borrar (igual que en la pantalla).
--   lectura   solo ver.
--   Si a una persona se le dieron acciones a medida para "ventas", se respetan.
--
-- NO CAMBIA: la lectura (todos siguen viendo las ventas de su empresa), el aislamiento entre empresas, el
-- modo soporte (ya protegida con soporte_no_* y soporte_solo_lectura) ni ningun dato.
-- Nada en la base escribe en ventas salvo esta pantalla: ningun trigger ni funcion lo hace (revisado).
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayarlo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   3. Ejecutarlo UNA vez, completo, con "commit;". Es repetible.
--   4. Para deshacerlo: refuerzo-ventas-2026-11-17-deshacer.sql
--
-- No toca datos: solo politicas. No declara ninguna variable llamada current_role (error del 2026-11-04).

begin;

-- ---------------------------------------------------------------------------------------------
-- Comprobaciones previas: si falta algo, se aborta antes de cambiar nada.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ventas') is null then
    raise exception 'No existe public.ventas.';
  end if;
  if to_regprocedure('public.app_can_write()') is null or to_regprocedure('public.app_can_action(text,text)') is null then
    raise exception 'Faltan las funciones de permisos (app_can_write / app_can_action).';
  end if;
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'app_can_action declara la variable current_role: aplicar antes permisos-acciones-multiempresa-fix-2026-11-04.sql.';
  end if;
  -- El modo soporte ya debe proteger esta tabla; si no, algo anda mal y no se debe seguir.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname = 'soporte_no_insert')
     or not exists (select 1 from pg_trigger g where g.tgrelid = 'public.ventas'::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal) then
    raise exception 'public.ventas no tiene la proteccion del modo soporte. Aplicar antes modo-soporte-2026-11-11.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos por rol y por accion
-- ---------------------------------------------------------------------------------------------
drop policy if exists app_write_insert_ventas on public.ventas;
drop policy if exists app_write_update_ventas on public.ventas;
drop policy if exists app_write_delete_ventas on public.ventas;
drop policy if exists app_action_insert_ventas on public.ventas;
drop policy if exists app_action_update_ventas on public.ventas;
drop policy if exists app_action_delete_ventas on public.ventas;

create policy app_write_insert_ventas on public.ventas as restrictive
  for insert to authenticated with check (public.app_can_write());
create policy app_write_update_ventas on public.ventas as restrictive
  for update to authenticated using (public.app_can_write()) with check (public.app_can_write());
create policy app_write_delete_ventas on public.ventas as restrictive
  for delete to authenticated using (public.app_can_write());

create policy app_action_insert_ventas on public.ventas as restrictive
  for insert to authenticated with check (public.app_can_action('ventas', 'create'));
create policy app_action_update_ventas on public.ventas as restrictive
  for update to authenticated using (public.app_can_action('ventas', 'edit')) with check (public.app_can_action('ventas', 'edit'));
create policy app_action_delete_ventas on public.ventas as restrictive
  for delete to authenticated using (public.app_can_action('ventas', 'delete'));

-- ---------------------------------------------------------------------------------------------
-- Verificacion final: si algo no quedo como se espera, se aborta y no se aplica nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  falta text;
begin
  select string_agg(n, ', ') into falta
  from unnest(array[
    'app_write_insert_ventas', 'app_write_update_ventas', 'app_write_delete_ventas',
    'app_action_insert_ventas', 'app_action_update_ventas', 'app_action_delete_ventas'
  ]) n
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'ventas' and p.policyname = n and p.permissive = 'RESTRICTIVE'
  );
  if falta is not null then
    raise exception 'En ventas faltan politicas restrictivas: %', falta;
  end if;

  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end $$;

commit;
