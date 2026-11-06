-- AgroBloque: proteger las tablas que quedaron sin RLS (3 alertas criticas del Security Advisor).
-- Tablas: public.observaciones, public.variedades, public.qr_bloques.
--
-- Estado antes (revisado el 2026-11-06): RLS desactivado, sin organizacion_id y con todos los
-- permisos para el rol anon. La clave anon esta en el repositorio publico, asi que cualquiera
-- podia leer, insertar o borrar filas de esas tablas.
-- La app NO usa estas tablas hoy (no hay llamadas en src/), por eso este cambio no afecta a la app.
--
-- Que hace:
--   1) Agrega organizacion_id (tomado del bloque o del cultivo padre; si no tiene, de la organizacion inicial).
--   2) Activa RLS y replica las politicas del resto de las tablas multiempresa
--      (guarda por organizacion + acceso autenticado + escritura solo admin/operador).
--   3) Retira todos los permisos del rol anon sobre estas tres tablas.
--
-- Es idempotente: se puede ejecutar mas de una vez. Hacer el respaldo antes.
-- Ejecutar DESPUES de multiempresa-organizaciones-2026-11-02.sql.

begin;

do $$
declare
  default_org uuid;
  item record;
  constraint_name text;
begin
  select id into default_org
  from public.organizaciones
  order by created_at, id
  limit 1;

  if default_org is null then
    raise exception 'No hay organizaciones: ejecutar antes multiempresa-organizaciones-2026-11-02.sql';
  end if;

  for item in
    select * from (values
      ('observaciones', 'bloques',  'bloque_id'),
      ('qr_bloques',    'bloques',  'bloque_id'),
      ('variedades',    'cultivos', 'cultivo_id')
    ) as v(tabla, padre, columna_padre)
  loop
    -- 1) organizacion_id: columna, relleno desde el padre, relleno final y restricciones.
    execute format('alter table public.%I add column if not exists organizacion_id uuid', item.tabla);

    execute format(
      'update public.%I t set organizacion_id = p.organizacion_id
         from public.%I p
        where p.id = t.%I and t.organizacion_id is null',
      item.tabla, item.padre, item.columna_padre
    );
    execute format(
      'update public.%I set organizacion_id = $1 where organizacion_id is null',
      item.tabla
    ) using default_org;

    constraint_name := left(item.tabla || '_organizacion_id_fkey', 63);
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = to_regclass('public.' || item.tabla)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organizacion_id)
           references public.organizaciones(id) on delete restrict',
        item.tabla, constraint_name
      );
    end if;

    execute format('alter table public.%I alter column organizacion_id set not null', item.tabla);
    -- El valor por defecto va al final: asi las filas nuevas toman la organizacion del usuario que guarda.
    execute format(
      'alter table public.%I alter column organizacion_id set default private.current_organization_id()',
      item.tabla
    );
    execute format(
      'create index if not exists %I on public.%I (organizacion_id)',
      left(item.tabla || '_organizacion_id_idx', 63), item.tabla
    );

    -- 2) RLS y politicas (mismo esquema que el resto de las tablas).
    execute format('alter table public.%I enable row level security', item.tabla);

    execute format('drop policy if exists tenant_organization_guard on public.%I', item.tabla);
    execute format(
      'create policy tenant_organization_guard on public.%I
         as restrictive for all to authenticated
         using (organizacion_id = (select private.current_organization_id()))
         with check (organizacion_id = (select private.current_organization_id()))',
      item.tabla
    );

    execute format('drop policy if exists %I on public.%I', 'app_base_select_' || item.tabla, item.tabla);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
      'app_base_select_' || item.tabla, item.tabla);

    execute format('drop policy if exists %I on public.%I', 'app_base_insert_' || item.tabla, item.tabla);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)',
      'app_base_insert_' || item.tabla, item.tabla);

    execute format('drop policy if exists %I on public.%I', 'app_base_update_' || item.tabla, item.tabla);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
      'app_base_update_' || item.tabla, item.tabla);

    execute format('drop policy if exists %I on public.%I', 'app_base_delete_' || item.tabla, item.tabla);
    execute format('create policy %I on public.%I for delete to authenticated using (true)',
      'app_base_delete_' || item.tabla, item.tabla);

    -- Solo admin y operador pueden escribir (el rol de solo lectura no).
    execute format('drop policy if exists %I on public.%I', 'app_write_insert_' || item.tabla, item.tabla);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (app_can_write())',
      'app_write_insert_' || item.tabla, item.tabla);

    execute format('drop policy if exists %I on public.%I', 'app_write_update_' || item.tabla, item.tabla);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (app_can_write()) with check (app_can_write())',
      'app_write_update_' || item.tabla, item.tabla);

    execute format('drop policy if exists %I on public.%I', 'app_write_delete_' || item.tabla, item.tabla);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (app_can_write())',
      'app_write_delete_' || item.tabla, item.tabla);

    -- 3) El rol anon (clave publica) no necesita nada en estas tablas.
    execute format('revoke all on table public.%I from anon', item.tabla);
  end loop;
end
$$;

commit;

-- ================================================================
-- VERIFICACION (solo SELECT; no modifica datos)
-- ================================================================

-- Debe mostrar rls = true, 8 politicas por tabla, 0 filas sin organizacion
-- y ningun permiso para anon (anon_permisos vacio).
select
  c.relname as tabla,
  c.relrowsecurity as rls,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
  (select count(*) from information_schema.columns k
    where k.table_schema = 'public' and k.table_name = c.relname
      and k.column_name = 'organizacion_id' and k.is_nullable = 'NO') as organizacion_obligatoria,
  (select string_agg(g.privilege_type, ',')
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'anon') as anon_permisos
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('observaciones', 'variedades', 'qr_bloques')
order by c.relname;

-- Ninguna tabla de public deberia quedar sin RLS: esta consulta debe devolver 0 filas.
select c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
