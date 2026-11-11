-- AgroBloque: Panel de plataforma y modo soporte autorizado, solo lectura.
-- REVISION: no ejecutar todavia. Requiere respaldo nuevo y aprobacion expresa de Jean.
-- Orden de prueba: PGlite -> proyecto temporal restaurado -> produccion.
-- En el proyecto temporal usar exclusivamente la empresa "Prueba A".
--
-- Decisiones de seguridad:
--   * NO modifica private.current_organization_id().
--   * La empresa de soporte se obtiene de una sesion explicita guardada en la base.
--   * expira_en > now() se comprueba en cada lectura; el estado no necesita actualizarse.
--   * Las politicas ALL que comparan current_organization_id() se dividen por comando.
--   * En soporte, toda escritura queda bloqueada por politicas RESTRICTIVE adicionales.

begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create table if not exists public.soporte_accesos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  solicitado_por uuid not null references auth.users(id) on delete restrict,
  aprobado_por uuid references auth.users(id) on delete restrict,
  motivo text not null check (char_length(trim(motivo)) between 5 and 1000),
  modo text not null default 'solo_lectura' check (modo = 'solo_lectura'),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'revocado', 'cancelado')),
  solicitado_en timestamptz not null default now(),
  aprobado_en timestamptz,
  expira_en timestamptz,
  rechazado_en timestamptz,
  cancelado_en timestamptz,
  revocado_en timestamptz,
  revocado_por uuid references auth.users(id) on delete restrict,
  constraint soporte_aprobacion_coherente check (
    (estado = 'pendiente' and aprobado_en is null and expira_en is null and rechazado_en is null and revocado_en is null)
    or (estado = 'aprobado' and aprobado_por is not null and aprobado_en is not null and expira_en > aprobado_en and rechazado_en is null)
    or (estado = 'rechazado' and rechazado_en is not null and aprobado_en is null and expira_en is null and cancelado_en is null)
    or (estado = 'cancelado' and cancelado_en is not null and aprobado_en is null and expira_en is null and rechazado_en is null)
    or (estado = 'revocado' and aprobado_por is not null and aprobado_en is not null and expira_en is not null and revocado_en is not null)
  )
);

-- Mantiene la migracion idempotente si una revision anterior creo la tabla.
alter table public.soporte_accesos add column if not exists cancelado_en timestamptz;
alter table public.soporte_accesos drop constraint if exists soporte_accesos_estado_check;
alter table public.soporte_accesos add constraint soporte_accesos_estado_check
  check (estado in ('pendiente', 'aprobado', 'rechazado', 'revocado', 'cancelado'));
alter table public.soporte_accesos drop constraint if exists soporte_aprobacion_coherente;
alter table public.soporte_accesos add constraint soporte_aprobacion_coherente check (
  (estado = 'pendiente' and aprobado_en is null and expira_en is null and rechazado_en is null and revocado_en is null and cancelado_en is null)
  or (estado = 'aprobado' and aprobado_por is not null and aprobado_en is not null and expira_en > aprobado_en and rechazado_en is null and cancelado_en is null)
  or (estado = 'rechazado' and rechazado_en is not null and aprobado_en is null and expira_en is null and cancelado_en is null)
  or (estado = 'cancelado' and cancelado_en is not null and aprobado_en is null and expira_en is null and rechazado_en is null)
  or (estado = 'revocado' and aprobado_por is not null and aprobado_en is not null and expira_en is not null and revocado_en is not null and cancelado_en is null)
);

create unique index if not exists soporte_una_solicitud_pendiente_idx
  on public.soporte_accesos (organizacion_id, solicitado_por)
  where estado = 'pendiente';

-- Los intervalos historicos pueden convivir si no se superponen. Una concesion vencida
-- no bloquea otra cuyo aprobado_en sea posterior a su expira_en.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'soporte_sin_concesiones_superpuestas'
      and conrelid = 'public.soporte_accesos'::regclass
  ) then
    alter table public.soporte_accesos
      add constraint soporte_sin_concesiones_superpuestas
      exclude using gist (
        organizacion_id with =,
        solicitado_por with =,
        tstzrange(aprobado_en, expira_en, '[)') with &&
      ) where (estado = 'aprobado' and revocado_en is null);
  end if;
end;
$$;

create table if not exists private.soporte_sesiones (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  acceso_id uuid not null references public.soporte_accesos(id) on delete cascade,
  iniciada_en timestamptz not null default now()
);

create table if not exists public.soporte_auditoria (
  id bigint generated always as identity primary key,
  acceso_id uuid references public.soporte_accesos(id) on delete restrict,
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  evento text not null check (evento in ('solicitada', 'aprobada', 'rechazada', 'cancelada', 'inicio', 'fin', 'revocada')),
  motivo text,
  detalle jsonb not null default '{}'::jsonb,
  ocurrido_en timestamptz not null default now()
);

alter table public.soporte_auditoria drop constraint if exists soporte_auditoria_evento_check;
alter table public.soporte_auditoria add constraint soporte_auditoria_evento_check
  check (evento in ('solicitada', 'aprobada', 'rechazada', 'cancelada', 'inicio', 'fin', 'revocada'));

create index if not exists soporte_accesos_empresa_fecha_idx
  on public.soporte_accesos (organizacion_id, solicitado_en desc);
create index if not exists soporte_auditoria_empresa_fecha_idx
  on public.soporte_auditoria (organizacion_id, ocurrido_en desc);

alter table public.soporte_accesos enable row level security;
alter table public.soporte_auditoria enable row level security;
revoke all on public.soporte_accesos, public.soporte_auditoria from public, anon, authenticated;
revoke all on private.soporte_sesiones from public, anon, authenticated;

create or replace function private.soporte_bloquear_cambios_auditoria()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'El historial de soporte es inmutable.' using errcode = '42501';
end;
$$;

drop trigger if exists soporte_auditoria_inmutable on public.soporte_auditoria;
create trigger soporte_auditoria_inmutable
  before update or delete on public.soporte_auditoria
  for each row execute function private.soporte_bloquear_cambios_auditoria();

create or replace function private.soporte_registrar(
  p_acceso_id uuid,
  p_organizacion_id uuid,
  p_evento text,
  p_motivo text default null,
  p_detalle jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.soporte_auditoria (
    acceso_id, organizacion_id, actor_id, evento, motivo, detalle
  ) values (
    p_acceso_id, p_organizacion_id, (select auth.uid()), p_evento, p_motivo, coalesce(p_detalle, '{}'::jsonb)
  );
$$;

create or replace function private.active_support_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.organizacion_id
  from private.soporte_sesiones s
  join public.soporte_accesos a on a.id = s.acceso_id
  join private.platform_admins p on p.user_id = s.usuario_id
  where s.usuario_id = (select auth.uid())
    and a.solicitado_por = s.usuario_id
    and a.estado = 'aprobado'
    and a.revocado_en is null
    and a.aprobado_en is not null
    and a.expira_en > now()
  limit 1;
$$;

create or replace function private.support_mode_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.active_support_organization_id()) is not null;
$$;

create or replace function private.read_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.active_support_organization_id()),
    (select private.current_organization_id())
  );
$$;

revoke all on function private.soporte_registrar(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.active_support_organization_id() from public, anon;
revoke all on function private.support_mode_active() from public, anon;
revoke all on function private.read_organization_id() from public, anon;
grant execute on function private.active_support_organization_id() to authenticated;
grant execute on function private.support_mode_active() to authenticated;
grant execute on function private.read_organization_id() to authenticated;

-- Tercera barrera: tambien bloquea escrituras hechas por RPC SECURITY DEFINER, que pueden
-- saltarse RLS. El SQL Editor y tareas sin auth.uid() no quedan afectados.
create or replace function private.soporte_bloquear_escritura()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select private.support_mode_active()) then
    raise exception 'El modo soporte es de solo lectura.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- En modo soporte la identidad normal conserva su rol para lectura, pero ninguna accion
-- de escritura es autorizada. Las politicas RESTRICTIVE de mas abajo son la segunda barrera.
create or replace function public.app_can_write()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not (select private.support_mode_active())
    and private.current_app_role() in ('admin', 'operador');
$$;

create or replace function public.app_current_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case when (select private.support_mode_active()) then 'admin' else private.current_app_role() end;
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select private.support_mode_active()) or private.current_app_role() = 'admin';
$$;

create or replace function public.app_can_action(module_key text, action_key text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  app_role_value text := private.current_app_role();
  module_actions jsonb := private.current_app_actions() -> module_key;
begin
  if (select private.support_mode_active()) then
    return action_key = 'view';
  end if;
  if app_role_value = 'admin' then return true; end if;
  if module_actions is null then
    if app_role_value = 'operador' then
      return action_key in ('view', 'create', 'edit');
    end if;
    return action_key = 'view';
  end if;
  return module_actions ? action_key;
end;
$$;

-- La funcion de Costos necesita leer la empresa autorizada cuando hay soporte.
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
    and a.organizacion_id = (select private.read_organization_id())
    and o.organizacion_id = (select private.read_organization_id())
    and public.app_can_action('costos', 'view')
  group by o.campo_id;
$$;

-- Respaldo de las politicas transformadas. Permite que el archivo de deshacer restaure
-- exactamente las expresiones encontradas en el proyecto donde se ejecuto.
create table if not exists private.soporte_policy_backup (
  migration_key text not null,
  schemaname text not null,
  tablename text not null,
  policyname text not null,
  permissive text not null,
  roles name[] not null,
  cmd text not null,
  qual text,
  with_check text,
  primary key (migration_key, schemaname, tablename, policyname)
);
revoke all on private.soporte_policy_backup from public, anon, authenticated;

insert into private.soporte_policy_backup (
  migration_key, schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
)
select
  'modo-soporte-2026-11-11', schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and cmd in ('ALL', 'SELECT')
  and coalesce(qual, '') like '%private.current_organization_id()%'
on conflict do nothing;

-- Adapta TODAS las politicas de lectura desplegadas que comparan la empresa, no solo
-- tenant_organization_guard. Las ALL se dividen en SELECT/INSERT/UPDATE/DELETE.
do $$
declare
  p record;
  role_list text;
  read_qual text;
  write_qual text;
  write_check text;
  base_hash text;
  n_select text;
  n_insert text;
  n_update text;
  n_delete text;
begin
  for p in
    select * from private.soporte_policy_backup
    where migration_key = 'modo-soporte-2026-11-11'
  loop
    select string_agg(case when r::text = 'public' then 'public' else quote_ident(r::text) end, ', ')
      into role_list from unnest(p.roles) r;
    read_qual := replace(coalesce(p.qual, 'true'), 'private.current_organization_id()', 'private.read_organization_id()');
    write_qual := coalesce(p.qual, 'true');
    write_check := coalesce(p.with_check, p.qual, 'true');
    base_hash := substr(md5(p.schemaname || '.' || p.tablename || '.' || p.policyname), 1, 8);
    n_select := left(p.policyname, 40) || '_sp_sel_' || base_hash;
    n_insert := left(p.policyname, 40) || '_sp_ins_' || base_hash;
    n_update := left(p.policyname, 40) || '_sp_upd_' || base_hash;
    n_delete := left(p.policyname, 40) || '_sp_del_' || base_hash;

    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('drop policy if exists %I on %I.%I', n_select, p.schemaname, p.tablename);
    execute format('drop policy if exists %I on %I.%I', n_insert, p.schemaname, p.tablename);
    execute format('drop policy if exists %I on %I.%I', n_update, p.schemaname, p.tablename);
    execute format('drop policy if exists %I on %I.%I', n_delete, p.schemaname, p.tablename);

    if p.cmd = 'SELECT' then
      execute format(
        'create policy %I on %I.%I as %s for select to %s using (%s)',
        p.policyname, p.schemaname, p.tablename, p.permissive, role_list, read_qual
      );
    else
      execute format(
        'create policy %I on %I.%I as %s for select to %s using (%s)',
        n_select, p.schemaname, p.tablename, p.permissive, role_list, read_qual
      );
      execute format(
        'create policy %I on %I.%I as %s for insert to %s with check (%s)',
        n_insert, p.schemaname, p.tablename, p.permissive, role_list, write_check
      );
      execute format(
        'create policy %I on %I.%I as %s for update to %s using (%s) with check (%s)',
        n_update, p.schemaname, p.tablename, p.permissive, role_list, write_qual, write_check
      );
      execute format(
        'create policy %I on %I.%I as %s for delete to %s using (%s)',
        n_delete, p.schemaname, p.tablename, p.permissive, role_list, write_qual
      );
    end if;
  end loop;
end;
$$;

-- Bloqueo global de escritura en modo soporte para toda tabla publica con organizacion_id.
do $$
declare
  t record;
begin
  for t in
    select n.nspname as schemaname, c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and a.attname = 'organizacion_id' and not a.attisdropped
      and c.relname not in ('soporte_accesos', 'soporte_auditoria')
  loop
    execute format('drop policy if exists soporte_no_insert on %I.%I', t.schemaname, t.tablename);
    execute format('drop policy if exists soporte_no_update on %I.%I', t.schemaname, t.tablename);
    execute format('drop policy if exists soporte_no_delete on %I.%I', t.schemaname, t.tablename);
    execute format(
      'create policy soporte_no_insert on %I.%I as restrictive for insert to authenticated with check (not (select private.support_mode_active()))',
      t.schemaname, t.tablename
    );
    execute format(
      'create policy soporte_no_update on %I.%I as restrictive for update to authenticated using (not (select private.support_mode_active())) with check (not (select private.support_mode_active()))',
      t.schemaname, t.tablename
    );
    execute format(
      'create policy soporte_no_delete on %I.%I as restrictive for delete to authenticated using (not (select private.support_mode_active()))',
      t.schemaname, t.tablename
    );
    execute format('drop trigger if exists soporte_solo_lectura on %I.%I', t.schemaname, t.tablename);
    execute format(
      'create trigger soporte_solo_lectura before insert or update or delete on %I.%I for each statement execute function private.soporte_bloquear_escritura()',
      t.schemaname, t.tablename
    );
  end loop;
end;
$$;

-- Organizaciones no tiene organizacion_id: lectura propia o de soporte; escritura solo propia.
drop policy if exists organizations_member_select on public.organizaciones;
create policy organizations_member_select on public.organizaciones
  for select to authenticated
  using (id = (select private.read_organization_id()));

drop policy if exists organizations_admin_update on public.organizaciones;
create policy organizations_admin_update on public.organizaciones
  for update to authenticated
  using (
    id = (select private.current_organization_id())
    and (select public.app_is_admin())
    and not (select private.support_mode_active())
  )
  with check (
    id = (select private.current_organization_id())
    and (select public.app_is_admin())
    and not (select private.support_mode_active())
  );

-- Storage: agrega solo SELECT para la carpeta de la empresa autorizada. No se agrega ninguna
-- politica de INSERT/UPDATE/DELETE y las existentes siguen apuntando a la empresa propia.
drop policy if exists soporte_facturas_solo_lectura on storage.objects;
create policy soporte_facturas_solo_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'facturas-contabilidad'
    and (select private.support_mode_active())
    and (storage.foldername(name))[1] = (select private.active_support_organization_id())::text
  );

-- RPC: contexto para el front. El estado vencido se deriva de expira_en.
create or replace function public.soporte_contexto()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.id is null then jsonb_build_object('activo', false)
    else jsonb_build_object(
      'activo', true,
      'acceso_id', a.id,
      'organizacion_id', a.organizacion_id,
      'organizacion_nombre', o.nombre,
      'expira_en', a.expira_en,
      'solo_lectura', true
    )
  end
  from (select 1) x
  left join private.soporte_sesiones s on s.usuario_id = (select auth.uid())
  left join public.soporte_accesos a on a.id = s.acceso_id
    and a.estado = 'aprobado' and a.revocado_en is null and a.expira_en > now()
  left join public.organizaciones o on o.id = a.organizacion_id;
$$;

create or replace function public.plataforma_empresas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede consultar este panel.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'nombre'), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', o.id,
      'nombre', o.nombre,
      'creada_en', o.created_at,
      'email', o.email,
      'admin_email', (select r.email from public.app_user_roles r where r.organizacion_id = o.id and r.rol = 'admin' and r.activo order by r.created_at limit 1),
      'usuarios_activos', (select count(*) from public.app_user_roles r where r.organizacion_id = o.id and r.activo),
      'campos', (select count(*) from public.campos c where c.organizacion_id = o.id),
      'bloques', (select count(*) from public.bloques b where b.organizacion_id = o.id),
      'ultima_actividad', (select max(a.created_at) from public.audit_log a where a.organizacion_id = o.id),
      'soporte', coalesce((
        select jsonb_build_object(
          'estado', case when s.revocado_en is not null then 'revocada' when s.expira_en <= now() then 'vencida' else s.estado end,
          'expira_en', s.expira_en,
          'acceso_id', s.id
        )
        from public.soporte_accesos s
        where s.organizacion_id = o.id and s.solicitado_por = (select auth.uid())
        order by s.solicitado_en desc limit 1
      ), jsonb_build_object('estado', 'sin_acceso'))
    ) as item
    from public.organizaciones o
    where o.activo
  ) q;
  return result;
end;
$$;

create or replace function public.soporte_solicitar(p_organizacion_id uuid, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizaciones o where o.id = p_organizacion_id and o.activo) then
    raise exception 'La empresa no existe o no esta activa.' using errcode = '22023';
  end if;
  if p_organizacion_id = (select private.current_organization_id()) then
    raise exception 'No se solicita soporte para la empresa propia.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.soporte_accesos a
    where a.organizacion_id = p_organizacion_id
      and a.solicitado_por = (select auth.uid())
      and a.estado = 'pendiente'
  ) then
    raise exception 'Ya tienes una solicitud de soporte pendiente para esta empresa.' using errcode = 'P0001';
  end if;
  insert into public.soporte_accesos (organizacion_id, solicitado_por, motivo)
  values (p_organizacion_id, (select auth.uid()), trim(p_motivo))
  returning id into new_id;
  perform private.soporte_registrar(new_id, p_organizacion_id, 'solicitada', trim(p_motivo));
  return new_id;
exception
  when unique_violation then
    raise exception 'Ya tienes una solicitud de soporte pendiente para esta empresa.' using errcode = 'P0001';
end;
$$;

create or replace function public.soporte_cancelar(p_acceso_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  access_row public.soporte_accesos%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Sin permiso.' using errcode = '42501'; end if;
  select * into access_row from public.soporte_accesos where id = p_acceso_id for update;
  if access_row.id is null or access_row.solicitado_por <> (select auth.uid()) then
    raise exception 'La solicitud no pertenece al usuario actual.' using errcode = '42501';
  end if;
  if access_row.estado <> 'pendiente' then
    raise exception 'Solo se puede cancelar una solicitud pendiente.' using errcode = '22023';
  end if;
  update public.soporte_accesos set estado = 'cancelado', cancelado_en = now() where id = p_acceso_id;
  perform private.soporte_registrar(p_acceso_id, access_row.organizacion_id, 'cancelada', access_row.motivo);
end;
$$;

create or replace function public.soporte_responder(p_acceso_id uuid, p_aprobar boolean, p_horas integer default 1)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.soporte_accesos%rowtype;
  current_org uuid := (select private.current_organization_id());
begin
  select * into a from public.soporte_accesos where id = p_acceso_id for update;
  if a.id is null or a.organizacion_id is distinct from current_org or not public.app_is_admin() then
    raise exception 'Solo un administrador de esta empresa puede responder.' using errcode = '42501';
  end if;
  if a.solicitado_por = (select auth.uid()) or public.is_platform_admin() then
    raise exception 'El solicitante no puede aprobar su propio acceso.' using errcode = '42501';
  end if;
  if a.estado <> 'pendiente' then raise exception 'La solicitud ya fue respondida.'; end if;
  if p_aprobar and (p_horas not in (1, 4, 24) and (p_horas < 1 or p_horas > 72)) then
    raise exception 'La duracion debe estar entre 1 y 72 horas.' using errcode = '22023';
  end if;
  if p_aprobar then
    update public.soporte_accesos set
      estado = 'aprobado', aprobado_por = (select auth.uid()), aprobado_en = now(),
      expira_en = now() + make_interval(hours => p_horas)
    where id = p_acceso_id;
    perform private.soporte_registrar(p_acceso_id, a.organizacion_id, 'aprobada', a.motivo, jsonb_build_object('horas', p_horas));
  else
    update public.soporte_accesos set estado = 'rechazado', rechazado_en = now() where id = p_acceso_id;
    perform private.soporte_registrar(p_acceso_id, a.organizacion_id, 'rechazada', a.motivo);
  end if;
end;
$$;

create or replace function public.soporte_entrar(p_acceso_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.soporte_accesos%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Sin permiso.' using errcode = '42501'; end if;
  select * into a from public.soporte_accesos where id = p_acceso_id;
  if a.id is null or a.solicitado_por <> (select auth.uid()) or a.estado <> 'aprobado'
     or a.revocado_en is not null or a.expira_en <= now() then
    raise exception 'La concesion no esta vigente.' using errcode = '42501';
  end if;
  insert into private.soporte_sesiones (usuario_id, acceso_id, iniciada_en)
  values ((select auth.uid()), p_acceso_id, now())
  on conflict (usuario_id) do update set acceso_id = excluded.acceso_id, iniciada_en = excluded.iniciada_en;
  perform private.soporte_registrar(p_acceso_id, a.organizacion_id, 'inicio', a.motivo);
end;
$$;

create or replace function public.soporte_salir()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  access_row public.soporte_accesos%rowtype;
begin
  select access_data.* into access_row
  from private.soporte_sesiones s
  join public.soporte_accesos access_data on access_data.id = s.acceso_id
  where s.usuario_id = (select auth.uid());
  delete from private.soporte_sesiones where usuario_id = (select auth.uid());
  if access_row.id is not null then
    perform private.soporte_registrar(access_row.id, access_row.organizacion_id, 'fin', access_row.motivo);
  end if;
end;
$$;

create or replace function public.soporte_revocar(p_acceso_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.soporte_accesos%rowtype;
begin
  select * into a from public.soporte_accesos where id = p_acceso_id for update;
  if a.id is null or a.organizacion_id <> (select private.current_organization_id()) or not public.app_is_admin() then
    raise exception 'Solo un administrador de esta empresa puede revocar.' using errcode = '42501';
  end if;
  if a.estado <> 'aprobado' or a.revocado_en is not null then return; end if;
  update public.soporte_accesos set estado = 'revocado', revocado_en = now(), revocado_por = (select auth.uid()) where id = p_acceso_id;
  delete from private.soporte_sesiones where acceso_id = p_acceso_id;
  perform private.soporte_registrar(p_acceso_id, a.organizacion_id, 'revocada', a.motivo);
end;
$$;

create or replace function public.soporte_empresa_estado()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'solicitado_en', a.solicitado_en, 'motivo', a.motivo,
      'solicitante', coalesce(u.raw_user_meta_data ->> 'nombre', u.email)
    ) order by a.solicitado_en desc)
      from public.soporte_accesos a left join auth.users u on u.id = a.solicitado_por
      where a.organizacion_id = (select private.current_organization_id()) and a.estado = 'pendiente'), '[]'::jsonb),
    'vigentes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'expira_en', a.expira_en, 'motivo', a.motivo
    ) order by a.expira_en)
      from public.soporte_accesos a
      where a.organizacion_id = (select private.current_organization_id())
        and a.estado = 'aprobado' and a.revocado_en is null and a.expira_en > now()), '[]'::jsonb)
  )
  where public.app_is_admin() and not public.is_platform_admin();
$$;

-- Banner visible para cualquier usuario de la empresa. No expone motivo ni identidad.
create or replace function public.soporte_banner()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'activo', true,
      'acceso_id', a.id,
      'expira_en', a.expira_en,
      'puede_revocar', (select public.app_is_admin()) and not (select public.is_platform_admin())
    )
    from public.soporte_accesos a
    where a.organizacion_id = (select private.current_organization_id())
      and a.estado = 'aprobado' and a.revocado_en is null and a.expira_en > now()
    order by a.expira_en desc limit 1
  ), jsonb_build_object('activo', false));
$$;

create or replace function public.soporte_historial()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.app_is_admin() and not public.is_platform_admin() then
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'acceso_id', h.acceso_id,
        'evento', h.evento,
        'motivo', h.motivo,
        'ocurrido_en', h.ocurrido_en,
        'detalle', h.detalle
      ) order by h.ocurrido_en desc)
      from (
        select sa.id::text as id, sa.acceso_id, sa.evento, sa.motivo, sa.ocurrido_en, sa.detalle
        from public.soporte_auditoria sa
        where sa.organizacion_id = (select private.current_organization_id())
        union all
        select 'vencida-' || a.id::text, a.id, 'vencida', a.motivo, a.expira_en,
          jsonb_build_object('expira_en', a.expira_en)
        from public.soporte_accesos a
        where a.organizacion_id = (select private.current_organization_id())
          and a.estado = 'aprobado' and a.revocado_en is null and a.expira_en <= now()
      ) h
    ), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    'public.soporte_contexto()'::regprocedure,
    'public.plataforma_empresas()'::regprocedure,
    'public.soporte_solicitar(uuid,text)'::regprocedure,
    'public.soporte_cancelar(uuid)'::regprocedure,
    'public.soporte_responder(uuid,boolean,integer)'::regprocedure,
    'public.soporte_entrar(uuid)'::regprocedure,
    'public.soporte_salir()'::regprocedure,
    'public.soporte_revocar(uuid)'::regprocedure,
    'public.soporte_empresa_estado()'::regprocedure,
    'public.soporte_banner()'::regprocedure,
    'public.soporte_historial()'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- Prueba anti-regresion del error corregido el 2026-11-04. Debe abortar la migracion
-- si alguien vuelve a declarar la variable reservada `current_role text`.
do $$
begin
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action vuelve a declarar current_role text.';
  end if;
end;
$$;

-- Auditoria defensiva de dependencias. Estas funciones usan current_organization_id() a
-- proposito para identidad, escritura o administracion de la empresa propia:
-- current_organization_id, current_app_role, current_app_actions, crear_guest_access,
-- app_* y las RPC de soporte de aprobacion/historial. jornales_por_campo ya fue adaptada.
-- Cualquier otra funcion/vista encontrada hace fallar la migracion completa para revision.
do $$
declare
  pendientes text;
begin
  select string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into pendientes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prokind in ('f', 'p')
    and pg_get_functiondef(p.oid) like '%private.current_organization_id()%'
    and p.proname not in (
      'current_organization_id', 'current_app_role', 'current_app_actions',
      'app_current_role', 'app_current_actions', 'app_can_write', 'app_is_admin', 'app_can_action',
      'create_guest_access_link_v3', 'provision_organization', 'read_organization_id',
      'jornales_por_campo', 'soporte_responder', 'soporte_revocar',
      'soporte_solicitar', 'soporte_empresa_estado', 'soporte_banner', 'soporte_historial'
    );
  if pendientes is not null then
    raise exception 'Funciones que requieren revision antes de activar soporte: %', pendientes;
  end if;

  select string_agg(schemaname || '.' || viewname, ', ')
  into pendientes
  from pg_views
  where schemaname in ('public', 'private')
    and definition like '%private.current_organization_id()%';
  if pendientes is not null then
    raise exception 'Vistas que requieren revision antes de activar soporte: %', pendientes;
  end if;
end;
$$;

commit;

-- Consultas de revision posteriores (solo lectura):
-- select * from private.soporte_policy_backup where migration_key = 'modo-soporte-2026-11-11';
-- select schemaname, tablename, policyname, permissive, cmd, qual, with_check
-- from pg_policies where policyname like '%soporte%' or policyname like '%_sp_%';
