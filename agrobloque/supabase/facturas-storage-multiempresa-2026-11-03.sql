-- AgroBloque: compatibilidad segura de Storage para facturas multiempresa.
-- Ejecutar DESPUES de:
--   1) multiempresa-organizaciones-2026-11-02.sql
--   2) permisos-acciones-multiempresa-fix-2026-11-04.sql
--
-- Acepta sin mover archivos:
--   Nueva:  organizacion_id/usuario_id/archivo.pdf
--   Legado: usuario_id/archivo.pdf
--
-- No modifica contabilidad_facturas, archivo_path, objetos ni datos existentes.
-- Es idempotente: reemplaza solamente las politicas de este bucket.

begin;

-- Retirar todas las variantes conocidas para que no quede una politica antigua
-- mas permisiva combinada con las nuevas politicas.
drop policy if exists facturas_archivos_propios_select on storage.objects;
drop policy if exists facturas_archivos_propios_insert on storage.objects;
drop policy if exists facturas_archivos_propios_update on storage.objects;
drop policy if exists facturas_archivos_propios_delete on storage.objects;
drop policy if exists facturas_archivos_organizacion_select on storage.objects;
drop policy if exists facturas_archivos_organizacion_insert on storage.objects;
drop policy if exists facturas_archivos_organizacion_update on storage.objects;
drop policy if exists facturas_archivos_organizacion_delete on storage.objects;
drop policy if exists facturas_archivos_compat_select on storage.objects;
drop policy if exists facturas_archivos_compat_insert on storage.objects;
drop policy if exists facturas_archivos_compat_update on storage.objects;
drop policy if exists facturas_archivos_compat_delete on storage.objects;

create policy facturas_archivos_compat_select
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'facturas-contabilidad'
    and (
      (
        (storage.foldername(name))[1] = (select private.current_organization_id())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy facturas_archivos_compat_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'facturas-contabilidad'
    and (
      (
        (storage.foldername(name))[1] = (select private.current_organization_id())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy facturas_archivos_compat_update
  on storage.objects
  for update to authenticated
  using (
    bucket_id = 'facturas-contabilidad'
    and (
      (
        (storage.foldername(name))[1] = (select private.current_organization_id())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
  with check (
    bucket_id = 'facturas-contabilidad'
    and (
      (
        (storage.foldername(name))[1] = (select private.current_organization_id())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy facturas_archivos_compat_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'facturas-contabilidad'
    and (
      (
        (storage.foldername(name))[1] = (select private.current_organization_id())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

commit;

-- ================================================================
-- VERIFICACION (solo SELECT; no modifica datos)
-- ================================================================

-- Debe devolver exactamente cuatro filas compat_*: SELECT, INSERT,
-- UPDATE y DELETE, todas para authenticated.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'facturas_archivos_%'
order by policyname;

-- Confirma que la funcion multiempresa existe y que authenticated puede usarla.
select
  to_regprocedure('private.current_organization_id()') is not null as funcion_multiempresa_existe,
  has_function_privilege('authenticated', 'private.current_organization_id()', 'EXECUTE') as authenticated_puede_ejecutarla;

-- Prueba logica de aislamiento con dos membresias reales de organizaciones
-- distintas. No cambia la sesion ni crea usuarios. Todos los resultados
-- *_puede_acceder_* deben ser FALSE. Si no hay dos organizaciones con usuario,
-- estado indicara que faltan datos para hacer la prueba.
with membresias as (
  select user_id, organizacion_id,
    row_number() over (order by organizacion_id, user_id) as posicion
  from (
    select distinct user_id, organizacion_id
    from public.app_user_roles
    where activo = true and user_id is not null and organizacion_id is not null
  ) m
),
empresa_a as (
  select * from membresias where posicion = 1
),
empresa_b as (
  select b.* from membresias b cross join empresa_a a
  where b.organizacion_id <> a.organizacion_id
  order by b.posicion limit 1
),
rutas as (
  select
    a.user_id as usuario_a,
    a.organizacion_id as organizacion_a,
    b.user_id as usuario_b,
    b.organizacion_id as organizacion_b,
    b.organizacion_id::text || '/' || b.user_id::text || '/prueba.pdf' as ruta_nueva_b,
    b.user_id::text || '/prueba.pdf' as ruta_legada_b
  from empresa_a a cross join empresa_b b
)
select
  case when exists (select 1 from rutas)
    then 'dos_organizaciones_encontradas'
    else 'faltan_dos_organizaciones_con_usuario'
  end as estado,
  coalesce(
    (select (storage.foldername(ruta_nueva_b))[1] = organizacion_a::text
      and (storage.foldername(ruta_nueva_b))[2] = usuario_a::text from rutas),
    false
  ) as usuario_a_puede_acceder_ruta_nueva_b,
  coalesce(
    (select (storage.foldername(ruta_legada_b))[1] = usuario_a::text from rutas),
    false
  ) as usuario_a_puede_acceder_ruta_legada_b;
