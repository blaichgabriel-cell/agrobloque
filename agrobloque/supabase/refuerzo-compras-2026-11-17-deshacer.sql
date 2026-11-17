-- Deshacer el refuerzo de compras (refuerzo-compras-2026-11-17.sql).
-- Devuelve inventario_compras y consumos_valorizados a como las dejo
-- costos-produccion-compras-2026-11-16.sql: guardia por empresa en una sola politica "for all",
-- una politica abierta "<tabla>_authenticated" y sin proteccion de modo soporte. Quita ademas los dos
-- triggers de borrado logico (inventario_compras y costos).
--
-- ATENCION: volver a este estado reabre el hueco (un usuario de solo lectura puede escribir en esas
-- tablas) y deja las compras fuera del modo soporte. Usarlo solo si el refuerzo causa un problema
-- que no se pueda corregir de otra forma, y volver a aplicarlo en cuanto se resuelva.
--
-- No toca datos. Es repetible.

begin;

do $$
declare
  t text;
  h text;
begin
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    h := substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8);

    -- Modo soporte
    execute format('drop trigger if exists soporte_solo_lectura on public.%I', t);
    execute format('drop policy if exists soporte_no_insert on public.%I', t);
    execute format('drop policy if exists soporte_no_update on public.%I', t);
    execute format('drop policy if exists soporte_no_delete on public.%I', t);

    -- Permisos por rol y por accion
    execute format('drop policy if exists %I on public.%I', 'app_action_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_delete_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_delete_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_select_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_base_delete_' || t, t);

    -- Guardia por empresa dividida
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_sel_' || h, t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_ins_' || h, t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_upd_' || h, t);
    execute format('drop policy if exists %I on public.%I', 'tenant_organization_guard_sp_del_' || h, t);

    -- Estado anterior (costos-produccion-compras-2026-11-16.sql)
    execute format('drop policy if exists tenant_organization_guard on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_authenticated', t);
    execute format(
      'create policy tenant_organization_guard on public.%I as restrictive for all to authenticated using (organizacion_id = (select private.current_organization_id())) with check (organizacion_id = (select private.current_organization_id()))',
      t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated', t
    );
  end loop;
end $$;

drop trigger if exists proteger_borrado_logico on public.inventario_compras;
drop trigger if exists proteger_borrado_logico on public.costos;

commit;
