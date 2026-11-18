-- Deshacer el refuerzo de las otras tablas (refuerzo-otras-tablas-2026-11-18.sql).
-- Quita las politicas restrictivas app_write_* y app_action_* de proveedores_credito, proveedor_movimientos,
-- plan_nutricional_registros, asistencia_notas_dia, contabilidad_facturas e inventario_movimientos, y deja
-- cada tabla como estaba: filtro por empresa y sus politicas permisivas anteriores.
--
-- ATENCION: volver a este estado reabre el hueco (un usuario de solo lectura puede escribir en esas tablas
-- hablando directo con la API). Usarlo solo si el refuerzo causa un problema que no se pueda corregir de otra
-- forma, y volver a aplicarlo en cuanto se resuelva.
--
-- No toca datos. Es repetible.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['proveedores_credito', 'proveedor_movimientos', 'plan_nutricional_registros',
                           'asistencia_notas_dia', 'contabilidad_facturas', 'inventario_movimientos'] loop
    execute format('drop policy if exists %I on public.%I', 'app_action_delete_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_action_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_delete_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'app_write_insert_' || t, t);
  end loop;
end $$;

commit;
