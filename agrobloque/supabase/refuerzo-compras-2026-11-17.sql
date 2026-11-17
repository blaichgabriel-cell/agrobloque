-- AgroBloque: refuerzo de permisos y de modo soporte para las tablas de compras (2026-11-17).
--
-- POR QUE
--   costos-produccion-compras-2026-11-16.sql creo dos tablas (inventario_compras y consumos_valorizados)
--   con una proteccion distinta a la del resto de la base:
--     1) Solo tienen el filtro por empresa y una politica abierta "using (true)". No miran el rol ni los
--        permisos por accion: un usuario de solo lectura de la misma empresa podia insertar o anular
--        filas hablando directo con la API (la pantalla le oculta los botones, la base no lo frenaba).
--     2) Quedaron fuera del modo soporte (modo-soporte-2026-11-11.sql): sin las politicas soporte_no_*
--        ni el trigger de solo lectura, y con la guardia por empresa sin dividir, asi que en soporte las
--        compras salian vacias.
--     3) costos.anulada es un borrado logico nuevo y no pedia el permiso "delete" del modulo.
--
-- QUE HACE (usa los mismos patrones y nombres que el resto de las tablas)
--   A) Guardia por empresa dividida: leer con private.read_organization_id() (empresa propia o la de
--      soporte autorizado) y escribir solo con private.current_organization_id().
--   B) Permisos: app_base_* (permisivas), app_write_* (rol admin u operador) y app_action_* (permiso por
--      accion del modulo "inventario"). Reemplaza las politicas abiertas "<tabla>_authenticated".
--   C) Borrado logico: anular una compra exige "delete" de inventario; anular un costo exige "delete" de
--      costos (private.proteger_borrado_logico, ya instalada en refuerzo-permisos-2026-11-10.sql).
--   D) Modo soporte: politicas soporte_no_insert/update/delete y trigger soporte_solo_lectura.
--
-- QUE ACCION PIDE CADA ESCRITURA
--   inventario_compras:    crear -> "create", editar -> "edit", anular -> "delete" (todas de inventario).
--   consumos_valorizados:  crear y editar -> "edit" de inventario (ya lo exige actualizar el stock en
--                          productos dentro de la misma funcion), borrar -> "delete".
--   El rol por defecto "operador" (ver, crear y editar) sigue pudiendo comprar y consumir; no puede anular.
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayar en el proyecto temporal restaurado (scripts/respaldos/ensayar-sql.ps1) con las pruebas
--      supabase/pruebas/refuerzo-compras-real.sql y el deshacer.
--   3. Ejecutarlo UNA vez, completo, en SQL Editor. Es repetible: si se ejecuta otra vez no cambia nada.
--      Para ENSAYAR sin cambiar nada: cambiar el "commit;" del final por "rollback;".
--   4. Para deshacerlo: refuerzo-compras-2026-11-17-deshacer.sql
--
-- No toca datos: solo politicas y triggers.
-- No declara ninguna variable llamada current_role (error del 2026-11-04).

begin;

-- ---------------------------------------------------------------------------------------------
-- Comprobaciones previas: si falta algo, se aborta antes de cambiar nada.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.inventario_compras') is null or to_regclass('public.consumos_valorizados') is null then
    raise exception 'Faltan las tablas de compras. Aplicar antes costos-produccion-compras-2026-11-16.sql.';
  end if;
  if to_regprocedure('private.read_organization_id()') is null
     or to_regprocedure('private.support_mode_active()') is null
     or to_regprocedure('private.soporte_bloquear_escritura()') is null then
    raise exception 'Falta el modo soporte. Aplicar antes modo-soporte-2026-11-11.sql.';
  end if;
  if to_regprocedure('private.proteger_borrado_logico()') is null then
    raise exception 'Falta private.proteger_borrado_logico(). Aplicar antes refuerzo-permisos-2026-11-10.sql.';
  end if;
  if to_regprocedure('public.app_can_write()') is null or to_regprocedure('public.app_can_action(text,text)') is null then
    raise exception 'Faltan las funciones de permisos (app_can_write / app_can_action).';
  end if;
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'app_can_action declara la variable current_role: aplicar antes permisos-acciones-multiempresa-fix-2026-11-04.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- PARTE A: guardia por empresa dividida (leer = empresa propia o de soporte; escribir = solo la propia)
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
  h text;
begin
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    -- Mismo sufijo que genera modo-soporte-2026-11-11.sql para tenant_organization_guard.
    h := substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8);

    execute format('drop policy if exists tenant_organization_guard on public.%I', t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_sel_' || h, t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_ins_' || h, t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_upd_' || h, t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_del_' || h, t);

    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (organizacion_id = (select private.read_organization_id()))',
      'tenant_organization_guard_sp_sel_' || h, t
    );
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (organizacion_id = (select private.current_organization_id()))',
      'tenant_organization_guard_sp_ins_' || h, t
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (organizacion_id = (select private.current_organization_id())) with check (organizacion_id = (select private.current_organization_id()))',
      'tenant_organization_guard_sp_upd_' || h, t
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (organizacion_id = (select private.current_organization_id()))',
      'tenant_organization_guard_sp_del_' || h, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- PARTE B: permisos por rol y por accion (reemplaza las politicas abiertas "<tabla>_authenticated")
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
  accion_insert text;
begin
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    accion_insert := case t when 'inventario_compras' then 'create' else 'edit' end;

    execute format('drop policy if exists %I on public.%I', t || '_authenticated', t);

    execute format('drop policy if exists %I on public.%I', 'app_base_select_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_delete_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_delete_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_delete_' || t, t);

    execute format('create policy %I on public.%I for select to authenticated using (true)', 'app_base_select_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', 'app_base_insert_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', 'app_base_update_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', 'app_base_delete_' || t, t);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_can_write())',
      'app_write_insert_' || t, t
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.app_can_write()) with check (public.app_can_write())',
      'app_write_update_' || t, t
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.app_can_write())',
      'app_write_delete_' || t, t
    );

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_can_action(%L, %L))',
      'app_action_insert_' || t, t, 'inventario', accion_insert
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.app_can_action(%L, %L)) with check (public.app_can_action(%L, %L))',
      'app_action_update_' || t, t, 'inventario', 'edit', 'inventario', 'edit'
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.app_can_action(%L, %L))',
      'app_action_delete_' || t, t, 'inventario', 'delete'
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- PARTE C: borrados logicos protegidos por el permiso "delete" del modulo
-- ---------------------------------------------------------------------------------------------
drop trigger if exists proteger_borrado_logico on public.inventario_compras;
create trigger proteger_borrado_logico
  before update of anulada on public.inventario_compras
  for each row execute function private.proteger_borrado_logico('inventario', 'anulada', 'true');

-- costos.anulada se agrego con las compras: anular un costo cuenta como eliminarlo.
drop trigger if exists proteger_borrado_logico on public.costos;
create trigger proteger_borrado_logico
  before update of anulada on public.costos
  for each row execute function private.proteger_borrado_logico('costos', 'anulada', 'true');

-- ---------------------------------------------------------------------------------------------
-- PARTE D: modo soporte (solo lectura), igual que las demas tablas con organizacion_id
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    execute format('drop policy if exists soporte_no_insert on public.%I', t);
    execute format('drop policy if exists soporte_no_update on public.%I', t);
    execute format('drop policy if exists soporte_no_delete on public.%I', t);
    execute format(
      'create policy soporte_no_insert on public.%I as restrictive for insert to authenticated with check (not (select private.support_mode_active()))',
      t
    );
    execute format(
      'create policy soporte_no_update on public.%I as restrictive for update to authenticated using (not (select private.support_mode_active())) with check (not (select private.support_mode_active()))',
      t
    );
    execute format(
      'create policy soporte_no_delete on public.%I as restrictive for delete to authenticated using (not (select private.support_mode_active()))',
      t
    );
    execute format('drop trigger if exists soporte_solo_lectura on public.%I', t);
    execute format(
      'create trigger soporte_solo_lectura before insert or update or delete on public.%I for each statement execute function private.soporte_bloquear_escritura()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Verificacion final: si algo no quedo como se espera, se aborta y no se aplica nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
  falta text;
begin
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    select string_agg(n, ', ') into falta
    from unnest(array[
      'tenant_organization_guard_sp_sel_' || substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8),
      'tenant_organization_guard_sp_ins_' || substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8),
      'tenant_organization_guard_sp_upd_' || substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8),
      'tenant_organization_guard_sp_del_' || substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8),
      'app_base_select_' || t, 'app_base_insert_' || t, 'app_base_update_' || t, 'app_base_delete_' || t,
      'app_write_insert_' || t, 'app_write_update_' || t, 'app_write_delete_' || t,
      'app_action_insert_' || t, 'app_action_update_' || t, 'app_action_delete_' || t,
      'soporte_no_insert', 'soporte_no_update', 'soporte_no_delete'
    ]) n
    where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = n);
    if falta is not null then
      raise exception 'En % faltan politicas: %', t, falta;
    end if;

    if exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t
        and (p.policyname in ('tenant_organization_guard', t || '_authenticated')
             or (p.cmd = 'ALL' and coalesce(p.qual, '') in ('true', '')))
    ) then
      raise exception 'En % siguen politicas abiertas o sin dividir.', t;
    end if;

    if not exists (
      select 1 from pg_trigger g
      where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal
    ) then
      raise exception 'En % falta el trigger soporte_solo_lectura.', t;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger g where g.tgrelid = 'public.inventario_compras'::regclass and g.tgname = 'proteger_borrado_logico' and not g.tgisinternal)
     or not exists (select 1 from pg_trigger g where g.tgrelid = 'public.costos'::regclass and g.tgname = 'proteger_borrado_logico' and not g.tgisinternal) then
    raise exception 'Faltan los triggers proteger_borrado_logico de inventario_compras o costos.';
  end if;

  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end $$;

commit;
