-- AgroBloque: permisos por accion y soporte para invitacion real de usuarios.
-- Ejecutar una sola vez en Supabase SQL Editor.

alter table if exists public.app_user_roles
  add column if not exists acciones jsonb;

create unique index if not exists app_user_roles_email_unique
  on public.app_user_roles (lower(email));

create or replace function public.app_current_actions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.acciones
      from public.app_user_roles r
      where lower(r.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and r.activo = true
      limit 1
    ),
    '{}'::jsonb
  );
$$;

create or replace function public.app_can_action(module_key text, action_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rol_actual text;
  acciones_json jsonb;
  acciones_modulo jsonb;
begin
  rol_actual := public.app_current_role();

  if rol_actual = 'admin' then
    return true;
  end if;

  acciones_json := public.app_current_actions();
  acciones_modulo := acciones_json -> module_key;

  if acciones_modulo is null then
    if rol_actual = 'operador' then
      return action_key in ('view', 'create', 'edit');
    end if;
    return action_key = 'view';
  end if;

  return acciones_modulo ? action_key;
end;
$$;

grant execute on function public.app_current_actions() to authenticated;
grant execute on function public.app_can_action(text, text) to authenticated;

do $$
declare
  item text[];
  pares text[][] := array[
    array['campos','mapa'],
    array['sectores','mapa'],
    array['bloques','mapa'],
    array['plantaciones','mapa'],
    array['plantacion_abonos','mapa'],
    array['fotos_bloque','mapa'],
    array['muertes_plantas','mapa'],
    array['cultivos','configuracion'],
    array['abonos','inventario'],
    array['productos','inventario'],
    array['categorias_producto','inventario'],
    array['operarios','asistencia'],
    array['asistencia','asistencia'],
    array['adelantos','asistencia'],
    array['asistencia_notas_dia','asistencia'],
    array['cosechas','cosecha'],
    array['costos','costos'],
    array['fumigaciones','fumigaciones'],
    array['fumigacion_productos','fumigaciones'],
    array['fumigacion_bloques','fumigaciones'],
    array['fertilizaciones','plan_nutricional'],
    array['fertilizacion_planes','plan_nutricional'],
    array['fertilizacion_plan_aplicaciones','plan_nutricional'],
    array['plan_nutricional_registros','plan_nutricional'],
    array['compradores','compradores'],
    array['tareas','agenda'],
    array['notas_modulo','historial'],
    array['vivero_lotes','vivero'],
    array['vivero_tratamientos','vivero'],
    array['contabilidad_movimientos','contabilidad']
  ];
begin
  foreach item slice 1 in array pares loop
    if to_regclass('public.' || item[1]) is not null then
      execute format('drop policy if exists %I on public.%I', 'app_action_insert_' || item[1], item[1]);
      execute format('drop policy if exists %I on public.%I', 'app_action_update_' || item[1], item[1]);
      execute format('drop policy if exists %I on public.%I', 'app_action_delete_' || item[1], item[1]);

      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_can_action(%L, %L))',
        'app_action_insert_' || item[1], item[1], item[2], 'create'
      );
      execute format(
        'create policy %I on public.%I as restrictive for update to authenticated using (public.app_can_action(%L, %L)) with check (public.app_can_action(%L, %L))',
        'app_action_update_' || item[1], item[1], item[2], 'edit', item[2], 'edit'
      );
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (public.app_can_action(%L, %L))',
        'app_action_delete_' || item[1], item[1], item[2], 'delete'
      );
    end if;
  end loop;
end $$;
