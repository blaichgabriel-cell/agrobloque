-- Deshacer el refuerzo de ventas (refuerzo-ventas-2026-11-17.sql).
-- Quita las seis politicas restrictivas (app_write_* y app_action_* de public.ventas) y deja la tabla como
-- estaba: filtro por empresa y politicas abiertas ventas_authenticated_*.
--
-- ATENCION: volver a este estado reabre el hueco (un usuario de solo lectura puede crear, editar y borrar
-- ventas). Usarlo solo si el refuerzo causa un problema que no se pueda corregir de otra forma, y volver a
-- aplicarlo en cuanto se resuelva.
--
-- No toca datos. Es repetible.

begin;

drop policy if exists app_action_delete_ventas on public.ventas;
drop policy if exists app_action_update_ventas on public.ventas;
drop policy if exists app_action_insert_ventas on public.ventas;
drop policy if exists app_write_delete_ventas on public.ventas;
drop policy if exists app_write_update_ventas on public.ventas;
drop policy if exists app_write_insert_ventas on public.ventas;

commit;
