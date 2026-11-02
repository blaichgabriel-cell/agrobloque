-- AgroBloque: migracion multiempresa con identidad configurable y aislamiento RLS.
-- IMPORTANTE:
-- 1. Hacer un backup antes de ejecutar.
-- 2. Ejecutar el archivo completo, una sola vez, en Supabase SQL Editor.
-- 3. Los datos actuales se asignan a una organizacion inicial llamada AgroBloque.
-- 4. No borra registros ni modifica IDs existentes.

begin;

create schema if not exists private;

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(trim(nombre)) between 2 and 100),
  slug text not null unique,
  logo_url text,
  telefono text,
  email text,
  color_primario text not null default '#0F3923',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizaciones (nombre, slug)
select 'AgroBloque', 'agrobloque'
where not exists (select 1 from public.organizaciones);

alter table public.app_user_roles
  add column if not exists permisos jsonb,
  add column if not exists acciones jsonb,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists organizacion_id uuid references public.organizaciones(id);

update public.app_user_roles r
set user_id = u.id
from auth.users u
where r.user_id is null
  and lower(r.email) = lower(u.email);

-- Convierte en membresias explicitas las cuentas que ya podian entrar antes
-- de esta migracion. Las cuentas creadas despues requeriran una invitacion.
insert into public.app_user_roles (
  email, nombre, rol, activo, user_id, organizacion_id
)
select
  lower(u.email),
  coalesce(u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  case when lower(u.email) = 'agrobloquetoni@gmail.com' then 'operador' else 'admin' end,
  true,
  u.id,
  (select id from public.organizaciones order by created_at, id limit 1)
from auth.users u
where u.email is not null
  and not exists (
    select 1 from public.app_user_roles r where lower(r.email) = lower(u.email)
  );

do $$
declare
  default_org uuid;
  table_name text;
  tenant_tables text[] := array[
    'app_user_roles', 'guest_access_links', 'audit_log',
    'campos', 'sectores', 'bloques', 'plantaciones', 'plantacion_abonos',
    'cultivos', 'abonos', 'productos', 'categorias_producto',
    'operarios', 'asistencia', 'adelantos', 'asistencia_notas_dia',
    'cosechas', 'ventas', 'costos', 'compradores',
    'fumigaciones', 'fumigacion_productos', 'fumigacion_bloques',
    'fertilizaciones', 'fertilizacion_planes', 'fertilizacion_plan_aplicaciones',
    'plan_nutricional_registros', 'tareas', 'notas_modulo',
    'vivero_lotes', 'vivero_tratamientos',
    'inventario_movimientos', 'alertas_gestion',
    'contabilidad_movimientos', 'contabilidad_facturas',
    'proveedores_credito', 'proveedor_movimientos',
    'fotos_bloque', 'muertes_plantas'
  ];
  constraint_name text;
begin
  select id into default_org
  from public.organizaciones
  order by created_at, id
  limit 1;

  if default_org is null then
    raise exception 'No se pudo crear la organizacion inicial';
  end if;

  foreach table_name in array tenant_tables loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists organizacion_id uuid',
      table_name
    );
    execute format(
      'update public.%I set organizacion_id = $1 where organizacion_id is null',
      table_name
    ) using default_org;

    constraint_name := left(table_name || '_organizacion_id_fkey', 63);
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = to_regclass('public.' || table_name)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organizacion_id) references public.organizaciones(id) on delete restrict',
        table_name, constraint_name
      );
    end if;

    execute format(
      'alter table public.%I alter column organizacion_id set not null',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I (organizacion_id)',
      left(table_name || '_organizacion_id_idx', 63), table_name
    );
  end loop;
end $$;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.organizacion_id
  from public.app_user_roles r
  where r.activo = true
    and (
      (r.user_id is not null and r.user_id = (select auth.uid()))
      or lower(r.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    )
  order by (r.user_id = (select auth.uid())) desc, r.updated_at desc nulls last
  limit 1;
$$;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.rol
    from public.app_user_roles r
    where r.activo = true
      and r.organizacion_id = private.current_organization_id()
      and (
        (r.user_id is not null and r.user_id = (select auth.uid()))
        or lower(r.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
    limit 1
  ), 'lectura');
$$;

create or replace function private.current_app_actions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.acciones
    from public.app_user_roles r
    where r.activo = true
      and r.organizacion_id = private.current_organization_id()
      and (
        (r.user_id is not null and r.user_id = (select auth.uid()))
        or lower(r.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
    limit 1
  ), '{}'::jsonb);
$$;

create or replace function private.request_guest_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers jsonb;
  token text;
  org_id uuid;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := '{}'::jsonb;
  end;
  token := headers ->> 'x-guest-token';
  if token is null or length(token) < 20 then return null; end if;
  select g.organizacion_id into org_id
  from public.guest_access_links g
  where g.token_hash = token and g.activo = true
    and (g.expires_at is null or g.expires_at > now())
  order by g.created_at desc limit 1;
  return org_id;
end;
$$;

grant usage on schema private to authenticated, anon;
revoke all on function private.current_organization_id() from public, anon;
revoke all on function private.current_app_role() from public, anon;
revoke all on function private.current_app_actions() from public, anon;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.current_app_actions() to authenticated;
revoke all on function private.request_guest_organization_id() from public, authenticated;
grant execute on function private.request_guest_organization_id() to anon;

create or replace function public.app_current_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_role(); $$;

create or replace function public.app_current_actions()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_actions(); $$;

create or replace function public.app_can_write()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_role() in ('admin', 'operador'); $$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_role() = 'admin'; $$;

create or replace function public.app_can_action(module_key text, action_key text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_role text := private.current_app_role();
  module_actions jsonb := private.current_app_actions() -> module_key;
begin
  if current_role = 'admin' then return true; end if;
  if module_actions is null then
    if current_role = 'operador' then
      return action_key in ('view', 'create', 'edit');
    end if;
    return action_key = 'view';
  end if;
  return module_actions ? action_key;
end;
$$;

grant execute on function public.app_current_role() to authenticated;
grant execute on function public.app_current_actions() to authenticated;
grant execute on function public.app_can_write() to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_can_action(text, text) to authenticated;

do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'app_user_roles', 'guest_access_links', 'audit_log',
    'campos', 'sectores', 'bloques', 'plantaciones', 'plantacion_abonos',
    'cultivos', 'abonos', 'productos', 'categorias_producto',
    'operarios', 'asistencia', 'adelantos', 'asistencia_notas_dia',
    'cosechas', 'ventas', 'costos', 'compradores',
    'fumigaciones', 'fumigacion_productos', 'fumigacion_bloques',
    'fertilizaciones', 'fertilizacion_planes', 'fertilizacion_plan_aplicaciones',
    'plan_nutricional_registros', 'tareas', 'notas_modulo',
    'vivero_lotes', 'vivero_tratamientos',
    'inventario_movimientos', 'alertas_gestion',
    'contabilidad_movimientos', 'contabilidad_facturas',
    'proveedores_credito', 'proveedor_movimientos',
    'fotos_bloque', 'muertes_plantas'
  ];
begin
  foreach table_name in array tenant_tables loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format(
      'alter table public.%I alter column organizacion_id set default private.current_organization_id()',
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_organization_guard on public.%I', table_name);
    execute format(
      'create policy tenant_organization_guard on public.%I as restrictive for all to authenticated using (organizacion_id = (select private.current_organization_id())) with check (organizacion_id = (select private.current_organization_id()))',
      table_name
    );
    execute format('drop policy if exists tenant_guest_organization_guard on public.%I', table_name);
    execute format(
      'create policy tenant_guest_organization_guard on public.%I as restrictive for select to anon using (organizacion_id = (select private.request_guest_organization_id()))',
      table_name
    );
  end loop;
end $$;

alter table public.organizaciones enable row level security;
grant select, update on public.organizaciones to authenticated;
revoke insert, delete on public.organizaciones from authenticated, anon;
drop policy if exists organizations_member_select on public.organizaciones;
drop policy if exists organizations_admin_update on public.organizaciones;
create policy organizations_member_select on public.organizaciones
  for select to authenticated
  using (id = (select private.current_organization_id()));
create policy organizations_admin_update on public.organizaciones
  for update to authenticated
  using (id = (select private.current_organization_id()) and (select public.app_is_admin()))
  with check (id = (select private.current_organization_id()) and (select public.app_is_admin()));

create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.platform_admins from public, anon, authenticated;
insert into private.platform_admins (user_id)
select distinct user_id
from public.app_user_roles
where user_id is not null and rol = 'admin' and activo = true
on conflict (user_id) do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.platform_admins p
    where p.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.provision_organization(
  p_nombre text,
  p_owner_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org public.organizaciones%rowtype;
  clean_name text := trim(coalesce(p_nombre, ''));
  clean_email text := lower(trim(coalesce(p_owner_email, '')));
  generated_slug text;
begin
  if not exists (
    select 1 from private.platform_admins p
    where p.user_id = (select auth.uid())
  ) then
    raise exception 'Solo un administrador de plataforma puede crear empresas';
  end if;
  if char_length(clean_name) < 2 or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Nombre o email invalido';
  end if;
  if exists (select 1 from public.app_user_roles r where lower(r.email) = clean_email) then
    raise exception 'El email ya pertenece a una empresa';
  end if;

  generated_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.organizaciones (nombre, slug)
  values (clean_name, generated_slug)
  returning * into new_org;

  insert into public.app_user_roles (
    email, nombre, rol, activo, permisos, acciones, organizacion_id
  ) values (
    clean_email, clean_name, 'admin', true, null, null, new_org.id
  );

  return jsonb_build_object(
    'ok', true,
    'organizacion_id', new_org.id,
    'nombre', new_org.nombre,
    'owner_email', clean_email
  );
end;
$$;
revoke all on function public.provision_organization(text, text) from public, anon;
grant execute on function public.provision_organization(text, text) to authenticated;

create or replace function public.create_guest_access_link_v3(
  p_nombre text,
  p_campo_id_text text default '',
  p_dias_text text default '30',
  p_permisos_json text default ''
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  current_org uuid := private.current_organization_id();
  raw_token text;
  new_id uuid;
  campo_uuid uuid;
  dias_int integer;
  permisos_value jsonb;
  vencimiento timestamptz;
begin
  if current_org is null or not public.app_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  if nullif(trim(p_nombre), '') is null then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;
  if nullif(trim(coalesce(p_campo_id_text, '')), '') is not null then
    campo_uuid := trim(p_campo_id_text)::uuid;
    if not exists (
      select 1 from public.campos c
      where c.id = campo_uuid and c.organizacion_id = current_org
    ) then
      return jsonb_build_object('ok', false, 'error', 'campo_no_pertenece_a_la_empresa');
    end if;
  end if;
  dias_int := nullif(trim(coalesce(p_dias_text, '')), '')::integer;
  permisos_value := nullif(trim(coalesce(p_permisos_json, '')), '')::jsonb;
  raw_token := md5(random()::text || clock_timestamp()::text || txid_current()::text)
    || md5(random()::text || clock_timestamp()::text || p_nombre || current_org::text);
  vencimiento := case when dias_int is null or dias_int <= 0 then null else now() + (dias_int || ' days')::interval end;

  insert into public.guest_access_links (
    nombre, campo_id, token_hash, expires_at, permisos, activo, organizacion_id
  ) values (
    trim(p_nombre), campo_uuid, raw_token, vencimiento, permisos_value, true, current_org
  ) returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'token', raw_token, 'expires_at', vencimiento);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;
revoke all on function public.create_guest_access_link_v3(text, text, text, text) from public, anon;
grant execute on function public.create_guest_access_link_v3(text, text, text, text) to authenticated;

create or replace function public.get_guest_access_snapshot(access_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  link_row public.guest_access_links%rowtype;
  campo_json jsonb;
  org_json jsonb;
  mes_desde date := date_trunc('month', now())::date;
begin
  if access_token is null or length(access_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'token_invalido');
  end if;
  select * into link_row
  from public.guest_access_links
  where token_hash = access_token and activo = true
    and (expires_at is null or expires_at > now())
  order by created_at desc limit 1;
  if link_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'link_no_valido');
  end if;

  select jsonb_build_object('id', o.id, 'nombre', o.nombre, 'logo_url', o.logo_url)
  into org_json from public.organizaciones o
  where o.id = link_row.organizacion_id and o.activo = true;

  if link_row.campo_id is null then
    campo_json := jsonb_build_object('id', null, 'nombre', 'Todos los campos');
  else
    select jsonb_build_object('id', c.id, 'nombre', c.nombre)
    into campo_json from public.campos c
    where c.id = link_row.campo_id and c.organizacion_id = link_row.organizacion_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'nombre', link_row.nombre,
    'organizacion', coalesce(org_json, jsonb_build_object('nombre', 'AgroBloque')),
    'campo', coalesce(campo_json, jsonb_build_object('id', null, 'nombre', 'Vista de invitado')),
    'permisos', coalesce(link_row.permisos, '[]'::jsonb),
    'stats', jsonb_build_object(
      'bloques_total', (select count(*) from public.bloques b where b.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or b.campo_id = link_row.campo_id)),
      'bloques_activos', (select count(*) from public.bloques b where b.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or b.campo_id = link_row.campo_id) and coalesce(b.activo, true)),
      'plantaciones_activas', (select count(*) from public.plantaciones p join public.bloques b on b.id = p.bloque_id where p.organizacion_id = link_row.organizacion_id and b.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or b.campo_id = link_row.campo_id) and coalesce(p.activa, false)),
      'operarios', (select count(*) from public.operarios o where o.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or o.campo_id = link_row.campo_id)),
      'tareas_pendientes', (select count(*) from public.tareas t where t.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or t.campo_id = link_row.campo_id) and not coalesce(t.completada, false))
    ),
    'finanzas', jsonb_build_object(
      'ingresos', coalesce((select sum(coalesce(v.total, coalesce(v.kg_total, 0) * coalesce(v.precio_kg, 0))) from public.ventas v left join public.bloques b on b.id = v.bloque_id where v.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or b.campo_id = link_row.campo_id) and v.fecha >= mes_desde), 0),
      'costos', coalesce((select sum(coalesce(c.monto, 0)) from public.costos c where c.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or c.campo_id = link_row.campo_id) and c.fecha >= mes_desde), 0)
    ),
    'plantaciones', coalesce((select jsonb_agg(row_to_json(x)::jsonb) from (select p.id, b.codigo bloque_codigo, cu.nombre cultivo, p.fecha_siembra, p.densidad_plantas_m2 cantidad_plantas from public.plantaciones p join public.bloques b on b.id = p.bloque_id left join public.cultivos cu on cu.id = p.cultivo_id where p.organizacion_id = link_row.organizacion_id and b.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or b.campo_id = link_row.campo_id) and coalesce(p.activa, false) order by p.fecha_siembra desc nulls last limit 30) x), '[]'::jsonb),
    'tareas', coalesce((select jsonb_agg(row_to_json(x)::jsonb) from (select t.id, t.descripcion, t.fecha_programada, b.codigo bloque_codigo from public.tareas t left join public.bloques b on b.id = t.bloque_id where t.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or t.campo_id = link_row.campo_id) and not coalesce(t.completada, false) order by t.fecha_programada asc nulls last limit 30) x), '[]'::jsonb),
    'cosechas', coalesce((select jsonb_agg(row_to_json(x)::jsonb) from (select c.id, b.codigo bloque_codigo, c.fecha, c.kg_total, c.precio_kg from public.cosechas c left join public.bloques b on b.id = c.bloque_id where c.organizacion_id = link_row.organizacion_id and (link_row.campo_id is null or b.campo_id = link_row.campo_id) order by c.fecha desc nulls last limit 30) x), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(row_to_json(x)::jsonb) from (select p.id, p.nombre, cp.nombre categoria, p.stock_actual from public.productos p left join public.categorias_producto cp on cp.id = p.categoria_id where p.organizacion_id = link_row.organizacion_id and coalesce(p.activo, true) order by p.nombre limit 40) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_guest_access_snapshot(text) from public;
grant execute on function public.get_guest_access_snapshot(text) to anon, authenticated;

create or replace function public.touch_organization_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists organizaciones_touch_updated_at on public.organizaciones;
create trigger organizaciones_touch_updated_at
before update on public.organizaciones
for each row execute function public.touch_organization_updated_at();

notify pgrst, 'reload schema';
commit;
