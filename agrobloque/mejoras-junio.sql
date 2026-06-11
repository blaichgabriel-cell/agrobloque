-- AgroBloque: correccion de lectura para invitados.
-- Ejecutar en Supabase SQL Editor si el invitado ve el inicio pero los modulos salen vacios.
-- No habilita crear, editar ni borrar para invitados.

create extension if not exists pgcrypto;

alter table if exists public.guest_access_links
  add column if not exists permisos jsonb;

create or replace function public.guest_allows_campo(target_campo_id uuid default null)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  headers jsonb;
  token text;
  digest_hex text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := '{}'::jsonb;
  end;

  token := headers->>'x-guest-token';
  if token is null or length(token) < 20 then
    return false;
  end if;

  digest_hex := encode(digest(token, 'sha256'), 'hex');

  return exists (
    select 1
    from public.guest_access_links g
    where g.token_hash = digest_hex
      and g.activo = true
      and (g.expires_at is null or g.expires_at > now())
      and (g.campo_id is null or target_campo_id is null or g.campo_id = target_campo_id)
  );
end;
$$;

grant execute on function public.guest_allows_campo(uuid) to anon, authenticated;

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

  select coalesce(
    g.permisos,
    '["buscar","alertas","historial","mapa","agenda","vivero","cosecha","inventario","fumigaciones","plan_nutricional","costos","contabilidad","reportes","compradores"]'::jsonb
  )
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
  tablas_globales text[] := array[
    'cultivos',
    'abonos',
    'productos',
    'categorias_producto',
    'compradores',
    'notas_modulo',
    'vivero_lotes',
    'contabilidad_movimientos'
  ];
begin
  foreach t in array tablas_globales loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to anon', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'guest_read_' || t, t);
      execute format(
        'create policy %I on public.%I for select to anon using (public.guest_allows_campo(null))',
        'guest_read_' || t,
        t
      );
    end if;
  end loop;
end $$;

do $$
declare
  t text;
  tablas_campo text[] := array[
    'campos',
    'sectores',
    'bloques',
    'costos',
    'tareas',
    'fumigaciones',
    'plan_nutricional_registros'
  ];
begin
  foreach t in array tablas_campo loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to anon', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'guest_read_' || t, t);

      if t = 'campos' then
        execute 'create policy guest_read_campos on public.campos for select to anon using (public.guest_allows_campo(id))';
      elsif exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'campo_id'
      ) then
        execute format(
          'create policy %I on public.%I for select to anon using (public.guest_allows_campo(campo_id))',
          'guest_read_' || t,
          t
        );
      else
        execute format(
          'create policy %I on public.%I for select to anon using (public.guest_allows_campo(null))',
          'guest_read_' || t,
          t
        );
      end if;
    end if;
  end loop;
end $$;

do $$
declare
  t text;
begin
  -- Tablas que se validan por bloque.
  foreach t in array array['plantaciones','cosechas','fotos_bloque','muertes_plantas','fertilizaciones','fertilizacion_planes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to anon', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'guest_read_' || t, t);
      execute format(
        'create policy %I on public.%I for select to anon using (exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id)))',
        'guest_read_' || t,
        t
      );
    end if;
  end loop;
end $$;

grant select on public.plantacion_abonos to anon;
alter table if exists public.plantacion_abonos enable row level security;
drop policy if exists guest_read_plantacion_abonos on public.plantacion_abonos;
create policy guest_read_plantacion_abonos on public.plantacion_abonos
  for select to anon using (
    exists (
      select 1
      from public.plantaciones p
      join public.bloques b on b.id = p.bloque_id
      where p.id = plantacion_id and public.guest_allows_campo(b.campo_id)
    )
  );

grant select on public.fumigacion_productos to anon;
alter table if exists public.fumigacion_productos enable row level security;
drop policy if exists guest_read_fumigacion_productos on public.fumigacion_productos;
create policy guest_read_fumigacion_productos on public.fumigacion_productos
  for select to anon using (
    exists (
      select 1
      from public.fumigaciones f
      where f.id = fumigacion_id and public.guest_allows_campo(f.campo_id)
    )
  );

grant select on public.fumigacion_bloques to anon;
alter table if exists public.fumigacion_bloques enable row level security;
drop policy if exists guest_read_fumigacion_bloques on public.fumigacion_bloques;
create policy guest_read_fumigacion_bloques on public.fumigacion_bloques
  for select to anon using (
    exists (
      select 1
      from public.bloques b
      where b.id = bloque_id and public.guest_allows_campo(b.campo_id)
    )
  );

grant select on public.fertilizacion_plan_aplicaciones to anon;
alter table if exists public.fertilizacion_plan_aplicaciones enable row level security;
drop policy if exists guest_read_fertilizacion_plan_aplicaciones on public.fertilizacion_plan_aplicaciones;
create policy guest_read_fertilizacion_plan_aplicaciones on public.fertilizacion_plan_aplicaciones
  for select to anon using (
    exists (
      select 1
      from public.fertilizacion_planes fp
      join public.bloques b on b.id = fp.bloque_id
      where fp.id = plan_id and public.guest_allows_campo(b.campo_id)
    )
  );

grant select on public.vivero_tratamientos to anon;
alter table if exists public.vivero_tratamientos enable row level security;
drop policy if exists guest_read_vivero_tratamientos on public.vivero_tratamientos;
create policy guest_read_vivero_tratamientos on public.vivero_tratamientos
  for select to anon using (public.guest_allows_campo(null));

-- Asistencia queda bloqueada para invitados.
alter table if exists public.asistencia enable row level security;
drop policy if exists guest_read_asistencia on public.asistencia;
create policy guest_read_asistencia on public.asistencia
  for select to anon using (false);

alter table if exists public.asistencia_notas_dia enable row level security;
drop policy if exists guest_read_asistencia_notas_dia on public.asistencia_notas_dia;
create policy guest_read_asistencia_notas_dia on public.asistencia_notas_dia
  for select to anon using (false);
