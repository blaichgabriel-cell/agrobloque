-- AgroBloque: roles reales y permisos por modulos.
-- Ejecutar una sola vez en Supabase SQL Editor.

alter table if exists public.app_user_roles
  add column if not exists permisos jsonb;

alter table if exists public.guest_access_links
  add column if not exists permisos jsonb;

create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.rol
      from public.app_user_roles r
      where lower(r.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and r.activo = true
      limit 1
    ),
    'admin'
  );
$$;

create or replace function public.app_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_current_role() in ('admin', 'operador');
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_current_role() = 'admin';
$$;

grant execute on function public.app_current_role() to authenticated;
grant execute on function public.app_can_write() to authenticated;
grant execute on function public.app_is_admin() to authenticated;

create or replace function public.guest_get_permissions()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  headers jsonb;
  token text;
  digest_hex text;
  permisos_json jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := '{}'::jsonb;
  end;

  token := headers->>'x-guest-token';
  if token is null or length(token) < 20 then
    return jsonb_build_object('ok', false, 'permisos', '[]'::jsonb);
  end if;

  digest_hex := encode(digest(token, 'sha256'), 'hex');

  select coalesce(g.permisos, '["buscar","alertas","historial","mapa","agenda","vivero","cosecha","inventario","fumigaciones","plan_nutricional","costos","contabilidad","reportes","compradores"]'::jsonb)
  into permisos_json
  from public.guest_access_links g
  where g.token_hash = digest_hex
    and g.activo = true
    and (g.expires_at is null or g.expires_at > now())
  limit 1;

  return jsonb_build_object('ok', permisos_json is not null, 'permisos', coalesce(permisos_json, '[]'::jsonb));
end;
$$;

grant execute on function public.guest_get_permissions() to anon, authenticated;

do $$
declare
  t text;
  tablas text[] := array[
    'campos',
    'sectores',
    'bloques',
    'plantaciones',
    'plantacion_abonos',
    'cultivos',
    'abonos',
    'productos',
    'categorias_producto',
    'operarios',
    'asistencia',
    'cosechas',
    'costos',
    'fumigaciones',
    'fumigacion_productos',
    'fumigacion_bloques',
    'fertilizaciones',
    'fertilizacion_planes',
    'fertilizacion_plan_aplicaciones',
    'plan_nutricional_registros',
    'compradores',
    'tareas',
    'notas_modulo',
    'asistencia_notas_dia',
    'vivero_lotes',
    'vivero_tratamientos',
    'contabilidad_movimientos',
    'fotos_bloque',
    'muertes_plantas'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists %I on public.%I', 'app_write_insert_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_write_update_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_write_delete_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_base_select_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_base_insert_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_base_update_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_base_delete_' || t, t);

      execute format(
        'create policy %I on public.%I for select to authenticated using (true)',
        'app_base_select_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (true)',
        'app_base_insert_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (true) with check (true)',
        'app_base_update_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (true)',
        'app_base_delete_' || t,
        t
      );

      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_can_write())',
        'app_write_insert_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I as restrictive for update to authenticated using (public.app_can_write()) with check (public.app_can_write())',
        'app_write_update_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (public.app_can_write())',
        'app_write_delete_' || t,
        t
      );
    end if;
  end loop;
end $$;

do $$
declare
  t text;
  tablas_admin text[] := array['app_user_roles', 'guest_access_links'];
begin
  foreach t in array tablas_admin loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists %I on public.%I', 'app_admin_insert_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_admin_update_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_admin_delete_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_admin_base_select_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_admin_base_insert_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_admin_base_update_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'app_admin_base_delete_' || t, t);

      execute format(
        'create policy %I on public.%I for select to authenticated using (true)',
        'app_admin_base_select_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (true)',
        'app_admin_base_insert_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (true) with check (true)',
        'app_admin_base_update_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (true)',
        'app_admin_base_delete_' || t,
        t
      );

      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_is_admin())',
        'app_admin_insert_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I as restrictive for update to authenticated using (public.app_is_admin()) with check (public.app_is_admin())',
        'app_admin_update_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (public.app_is_admin())',
        'app_admin_delete_' || t,
        t
      );
    end if;
  end loop;
end $$;
