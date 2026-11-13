-- Deshacer AgroBloque empresa lista.
-- No borra categorias que ya tengan productos asociados.
-- REVISION: ensayar primero con rollback en el proyecto temporal restaurado.

begin;

drop function if exists public.completar_onboarding_empresa(text, text, text, integer, text);

-- Restaura plataforma_empresas a la definicion previa a esta migracion.
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
      'campos_lista', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'nombre', c.nombre,
          'bloques', (select count(*) from public.bloques b where b.organizacion_id = o.id and b.campo_id = c.id)
        ) order by c.nombre)
        from public.campos c
        where c.organizacion_id = o.id
      ), '[]'::jsonb),
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

revoke all on function public.plataforma_empresas() from public, anon;
grant execute on function public.plataforma_empresas() to authenticated;

drop function if exists private.preparar_empresa_catalogos(uuid);

-- Solo elimina filas que esta migracion registro y que siguen sin uso.
delete from public.categorias_producto c
using private.empresa_preparacion_categorias r
where c.id = r.categoria_id
  and not exists (select 1 from public.productos p where p.categoria_id = c.id);

drop table if exists private.empresa_preparacion_categorias;

alter table public.organizaciones
  drop column if exists preparada_en;

do $$
begin
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end;
$$;

commit;
