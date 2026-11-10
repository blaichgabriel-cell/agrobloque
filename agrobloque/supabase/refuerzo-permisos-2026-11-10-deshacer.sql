-- Deshace refuerzo-permisos-2026-11-10.sql (solo quita lo que ese script creo; no toca datos).
-- Despues de esto Costos vuelve a leer la tabla asistencia directamente (el front tiene respaldo).

begin;

drop trigger if exists proteger_borrado_logico on public.productos;
drop trigger if exists proteger_borrado_logico on public.cosechas;
drop trigger if exists proteger_borrado_logico on public.fumigaciones;
drop trigger if exists proteger_borrado_logico on public.fertilizaciones;
drop trigger if exists proteger_borrado_logico on public.vivero_lotes;
drop trigger if exists proteger_borrado_logico on public.vivero_tratamientos;
drop function if exists private.proteger_borrado_logico();

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'asistencia', 'asistencia_notas_dia', 'adelantos',
    'contabilidad_movimientos', 'contabilidad_facturas',
    'proveedores_credito', 'proveedor_movimientos'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'solo_admin_lee_' || tabla, tabla);
  end loop;
end;
$$;

drop function if exists public.jornales_por_campo(date);

commit;
