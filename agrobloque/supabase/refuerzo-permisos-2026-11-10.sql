-- Refuerzo de permisos en la base (2026-11-10)
--
-- Cierra dos huecos que la pantalla ya tapa pero la base no:
--   A) "Eliminar" y "Anular" son borrados LOGICOS (activo=false, anulada=true...). Para la base eso es
--      una edicion, asi que un operador podia hacerlos hablando directo con la API. Un trigger ahora
--      exige el permiso "delete" del modulo.
--   B) Un usuario de "solo lectura" (o un operador) podia LEER por la API los datos de personal y
--      finanzas (asistencia, adelantos, contabilidad...). Ahora esas tablas solo las lee un admin.
--      Costos sigue mostrando el total de jornales con una funcion que devuelve solo la suma.
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. El front con la funcion jornales_por_campo ya debe estar desplegado (src/pages/Costos.js).
--   3. Ejecutarlo UNA vez, completo, en SQL Editor. Para ENSAYAR sin cambiar nada: cambiar el
--      "commit;" del final por "rollback;" y ejecutar; si no da error, volver a "commit;".
--   4. Para deshacerlo: refuerzo-permisos-2026-11-10-deshacer.sql
--
-- No toca datos: solo funciones, triggers y politicas.

begin;

-- ---------------------------------------------------------------------------------------------
-- PARTE A: borrados logicos protegidos por el permiso "delete" del modulo
-- ---------------------------------------------------------------------------------------------

create or replace function private.proteger_borrado_logico()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Argumentos del trigger: modulo, columna, valor que significa "eliminado".
  modulo text := tg_argv[0];
  valor_eliminado text := tg_argv[2];
  antes text := to_jsonb(old) ->> tg_argv[1];
  despues text := to_jsonb(new) ->> tg_argv[1];
begin
  -- Solo se controla a quien entra con sesion (la app). El SQL Editor y las tareas de
  -- mantenimiento no tienen sesion y no se tocan.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Solo importa el cambio de "vigente" a "eliminado".
  if despues is distinct from valor_eliminado or antes is not distinct from valor_eliminado then
    return new;
  end if;

  -- Al editar una fertilizacion la app reemplaza la anterior: es parte de editar, no un borrado.
  if tg_table_name = 'fertilizaciones'
     and coalesce(to_jsonb(new) ->> 'anulada_motivo', '') like 'Reemplazada%' then
    return new;
  end if;

  if not public.app_can_action(modulo, 'delete') then
    raise exception 'No tienes permiso para eliminar o anular este registro (%).', modulo
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_borrado_logico on public.productos;
create trigger proteger_borrado_logico
  before update of activo on public.productos
  for each row execute function private.proteger_borrado_logico('inventario', 'activo', 'false');

drop trigger if exists proteger_borrado_logico on public.cosechas;
create trigger proteger_borrado_logico
  before update of anulada on public.cosechas
  for each row execute function private.proteger_borrado_logico('cosecha', 'anulada', 'true');

drop trigger if exists proteger_borrado_logico on public.fumigaciones;
create trigger proteger_borrado_logico
  before update of anulada on public.fumigaciones
  for each row execute function private.proteger_borrado_logico('fumigaciones', 'anulada', 'true');

drop trigger if exists proteger_borrado_logico on public.fertilizaciones;
create trigger proteger_borrado_logico
  before update of anulada on public.fertilizaciones
  for each row execute function private.proteger_borrado_logico('plan_nutricional', 'anulada', 'true');

drop trigger if exists proteger_borrado_logico on public.vivero_lotes;
create trigger proteger_borrado_logico
  before update of archivado on public.vivero_lotes
  for each row execute function private.proteger_borrado_logico('vivero', 'archivado', 'true');

drop trigger if exists proteger_borrado_logico on public.vivero_tratamientos;
create trigger proteger_borrado_logico
  before update of anulado on public.vivero_tratamientos
  for each row execute function private.proteger_borrado_logico('vivero', 'anulado', 'true');

-- ---------------------------------------------------------------------------------------------
-- PARTE B: personal y finanzas solo los lee un administrador
-- ---------------------------------------------------------------------------------------------

-- Total de jornales por campo para la pantalla de Costos, sin exponer lo que cobra cada persona.
-- Corre con permisos del dueño de la funcion, por eso filtra a mano por la empresa de quien llama
-- y exige poder ver Costos.
create or replace function public.jornales_por_campo(p_desde date)
returns table (campo_id uuid, total numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.campo_id, coalesce(sum(a.monto), 0)::numeric as total
  from public.asistencia a
  join public.operarios o on o.id = a.operario_id
  where a.fecha >= p_desde
    and a.organizacion_id = (select private.current_organization_id())
    and o.organizacion_id = (select private.current_organization_id())
    and public.app_can_action('costos', 'view')
  group by o.campo_id;
$$;

revoke all on function public.jornales_por_campo(date) from public, anon;
grant execute on function public.jornales_por_campo(date) to authenticated;

-- Politica restrictiva: se suma a las que ya existen y solo deja pasar a los administradores.
-- No afecta a los enlaces de invitado (rol anon) ni al servidor (clave de servicio).
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
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ((select public.app_is_admin()))',
      'solo_admin_lee_' || tabla, tabla
    );
  end loop;
end;
$$;

commit;
-- Para ensayar sin cambiar nada: reemplazar la linea "commit;" por "rollback;".
