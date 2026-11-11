-- AgroBloque: deshacer Panel de plataforma y modo soporte.
-- REVISION: no ejecutar sin respaldo y aprobacion expresa.
-- Riesgo: elimina solicitudes e historial de soporte creados despues de la migracion.

begin;

drop policy if exists soporte_facturas_solo_lectura on storage.objects;

-- Quita el bloqueo de escritura de todas las tablas donde pudo instalarse.
do $$
declare
  t record;
begin
  for t in
    select n.nspname as schemaname, c.relname as tablename
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('drop policy if exists soporte_no_insert on %I.%I', t.schemaname, t.tablename);
    execute format('drop policy if exists soporte_no_update on %I.%I', t.schemaname, t.tablename);
    execute format('drop policy if exists soporte_no_delete on %I.%I', t.schemaname, t.tablename);
    execute format('drop trigger if exists soporte_solo_lectura on %I.%I', t.schemaname, t.tablename);
  end loop;
end;
$$;

-- Restaura exactamente las politicas guardadas por la migracion.
do $$
declare
  p record;
  role_list text;
  base_hash text;
  n_select text;
  n_insert text;
  n_update text;
  n_delete text;
  sql text;
begin
  if to_regclass('private.soporte_policy_backup') is null then return; end if;
  for p in
    select * from private.soporte_policy_backup
    where migration_key = 'modo-soporte-2026-11-11'
  loop
    select string_agg(case when r::text = 'public' then 'public' else quote_ident(r::text) end, ', ')
      into role_list from unnest(p.roles) r;
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

    sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, role_list
    );
    if p.qual is not null then sql := sql || format(' using (%s)', p.qual); end if;
    if p.with_check is not null then sql := sql || format(' with check (%s)', p.with_check); end if;
    execute sql;
  end loop;
end;
$$;

drop policy if exists organizations_member_select on public.organizaciones;
create policy organizations_member_select on public.organizaciones
  for select to authenticated
  using (id = (select private.current_organization_id()));

drop policy if exists organizations_admin_update on public.organizaciones;
create policy organizations_admin_update on public.organizaciones
  for update to authenticated
  using (id = (select private.current_organization_id()) and (select public.app_is_admin()))
  with check (id = (select private.current_organization_id()) and (select public.app_is_admin()));

create or replace function public.app_can_write()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_role() in ('admin', 'operador'); $$;

create or replace function public.app_current_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select private.current_app_role(); $$;

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
    if current_role = 'operador' then return action_key in ('view', 'create', 'edit'); end if;
    return action_key = 'view';
  end if;
  return module_actions ? action_key;
end;
$$;

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

drop function if exists public.soporte_contexto();
drop function if exists public.plataforma_empresas();
drop function if exists public.soporte_solicitar(uuid, text);
drop function if exists public.soporte_responder(uuid, boolean, integer);
drop function if exists public.soporte_entrar(uuid);
drop function if exists public.soporte_salir();
drop function if exists public.soporte_revocar(uuid);
drop function if exists public.soporte_empresa_estado();
drop function if exists public.soporte_banner();
drop function if exists public.soporte_historial();

drop function if exists private.soporte_bloquear_escritura();
drop function if exists private.read_organization_id();
drop function if exists private.support_mode_active();
drop function if exists private.active_support_organization_id();
drop function if exists private.soporte_registrar(uuid, uuid, text, text, jsonb);

drop trigger if exists soporte_auditoria_inmutable on public.soporte_auditoria;
drop function if exists private.soporte_bloquear_cambios_auditoria();

drop table if exists private.soporte_sesiones;
drop table if exists public.soporte_auditoria;
drop table if exists public.soporte_accesos;
delete from private.soporte_policy_backup where migration_key = 'modo-soporte-2026-11-11';
drop table if exists private.soporte_policy_backup;

commit;
