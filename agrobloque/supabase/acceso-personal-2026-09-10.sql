-- Ejecutar en SQL Editor de AgroBloque. Solo restringe a Toni.
-- No cambia los permisos de las otras dos cuentas ni elimina datos.
begin;
alter table public.app_user_roles add column if not exists permisos jsonb;
alter table public.app_user_roles add column if not exists acciones jsonb;
do $$
declare toni_id uuid; t text;
begin
  select id into toni_id from auth.users where lower(email)='agrobloquetoni@gmail.com';
  if toni_id is null then raise exception 'No existe la cuenta de Toni'; end if;
  -- Se fija el identificador: cambiar el correo no elimina las restricciones.
  execute format(
    'create or replace function public.app_es_toni() returns boolean language sql stable set search_path=public as %L',
    format('select auth.uid() = %L::uuid', toni_id)
  );
  insert into public.app_user_roles(email,nombre,rol,activo,permisos,acciones)
  values('agrobloquetoni@gmail.com','Toni','operador',true,
    '["buscar","alertas","mapa","agenda","vivero","cosecha","inventario","fumigaciones","plan_nutricional","compradores"]'::jsonb,null)
  on conflict(email) do update set rol='operador',activo=true,permisos=excluded.permisos,acciones=null;
  foreach t in array array['asistencia','adelantos','asistencia_notas_dia','operarios','pagos','pagos_operarios','liquidaciones'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists toni_sin_acceso on public.%I',t);
      execute format('create policy toni_sin_acceso on public.%I as restrictive for all to authenticated using (not public.app_es_toni()) with check (not public.app_es_toni())',t);
    end if;
  end loop;
end $$;
create or replace function public.app_current_role()
returns text language sql stable security definer set search_path=public as $$
  select case when public.app_es_toni() then 'operador' else coalesce(
    (select rol from public.app_user_roles where lower(email)=lower(coalesce(auth.jwt()->>'email','')) and activo=true limit 1),
    'admin') end;
$$;
alter table public.app_user_roles enable row level security;
drop policy if exists toni_roles_lectura on public.app_user_roles;
create policy toni_roles_lectura on public.app_user_roles as restrictive for select to authenticated
  using (not public.app_es_toni() or lower(email)='agrobloquetoni@gmail.com');
drop policy if exists toni_roles_crear on public.app_user_roles;
create policy toni_roles_crear on public.app_user_roles as restrictive for insert to authenticated
  with check (not public.app_es_toni());
drop policy if exists toni_roles_editar on public.app_user_roles;
create policy toni_roles_editar on public.app_user_roles as restrictive for update to authenticated
  using (not public.app_es_toni()) with check (not public.app_es_toni());
drop policy if exists toni_roles_borrar on public.app_user_roles;
create policy toni_roles_borrar on public.app_user_roles as restrictive for delete to authenticated
  using (not public.app_es_toni());
commit;
