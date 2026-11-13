-- AgroBloque: empresa lista para usar desde el primer ingreso.
-- REVISION: no ejecutar en produccion sin respaldo nuevo y aprobacion de Jean.
-- Orden: ensayo con rollback -> proyecto temporal restaurado -> produccion aprobada.

begin;

alter table public.organizaciones
  add column if not exists preparada_en timestamptz;

comment on column public.organizaciones.preparada_en is
  'Fecha en que el onboarding transaccional dejo la empresa lista para operar.';

-- Registra exclusivamente las categorias que agrega esta migracion. Permite que
-- el deshacer no borre categorias preexistentes ni datos creados por un cliente.
create table if not exists private.empresa_preparacion_categorias (
  categoria_id uuid primary key references public.categorias_producto(id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  creada_en timestamptz not null default now()
);

revoke all on table private.empresa_preparacion_categorias from public, anon, authenticated;

create or replace function private.preparar_empresa_catalogos(p_organizacion_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  categoria text;
  categoria_id_nueva uuid;
  total integer;
  categorias_iniciales constant text[] := array[
    'Semillas', 'Plantines', 'Fungicida', 'Insecticida', 'Herbicida',
    'Coadyuvante', 'Fertilizante', 'Foliar', 'Hidrosoluble',
    'Abono de base', 'Herramientas', 'Otro'
  ];
begin
  if p_organizacion_id is null then
    raise exception 'La empresa es obligatoria.' using errcode = '22004';
  end if;

  -- Serializa dos preparaciones simultaneas de la misma empresa.
  perform 1
  from public.organizaciones o
  where o.id = p_organizacion_id and o.activo
  for update;

  if not found then
    raise exception 'La empresa no existe o esta inactiva.' using errcode = 'P0002';
  end if;

  foreach categoria in array categorias_iniciales loop
    if not exists (
      select 1
      from public.categorias_producto c
      where c.organizacion_id = p_organizacion_id
        and lower(trim(c.nombre)) = lower(categoria)
    ) then
      insert into public.categorias_producto (nombre, organizacion_id)
      values (categoria, p_organizacion_id)
      returning id into categoria_id_nueva;

      insert into private.empresa_preparacion_categorias (categoria_id, organizacion_id)
      values (categoria_id_nueva, p_organizacion_id)
      on conflict (categoria_id) do nothing;
    end if;
  end loop;

  select count(*)::integer into total
  from public.categorias_producto c
  where c.organizacion_id = p_organizacion_id;

  return total;
end;
$$;

revoke all on function private.preparar_empresa_catalogos(uuid) from public, anon, authenticated;

-- Rellena solo empresas sin ninguna categoria. El Sembrador queda excluido de
-- toda escritura de datos, tal como se acordo para las pruebas y el despliegue.
do $$
declare
  empresa record;
begin
  for empresa in
    select o.id
    from public.organizaciones o
    where o.activo
      and lower(trim(o.nombre)) <> 'el sembrador'
      and not exists (
        select 1 from public.categorias_producto c
        where c.organizacion_id = o.id
      )
    order by o.created_at, o.id
  loop
    perform private.preparar_empresa_catalogos(empresa.id);
  end loop;

  -- Las empresas existentes que ya tienen al menos un campo se consideran
  -- preparadas. No se actualiza ninguna fila de El Sembrador.
  update public.organizaciones o
  set preparada_en = coalesce(o.preparada_en, now())
  where o.activo
    and lower(trim(o.nombre)) <> 'el sembrador'
    and o.preparada_en is null
    and exists (select 1 from public.campos c where c.organizacion_id = o.id);
end;
$$;

create or replace function public.completar_onboarding_empresa(
  p_empresa text,
  p_telefono text,
  p_campo text,
  p_bloques integer default 0,
  p_tipo text default 'invernadero'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  organizacion_id_actual uuid := private.current_organization_id();
  organizacion public.organizaciones%rowtype;
  campo_nuevo public.campos%rowtype;
  nombre_empresa text := trim(coalesce(p_empresa, ''));
  telefono_limpio text := nullif(trim(coalesce(p_telefono, '')), '');
  nombre_campo text := trim(coalesce(p_campo, ''));
  cantidad_bloques integer := coalesce(p_bloques, 0);
  tipo_bloque text := trim(coalesce(p_tipo, ''));
  categorias_total integer;
begin
  if organizacion_id_actual is null or not public.app_is_admin() then
    raise exception 'Solo el administrador de la empresa puede completar el onboarding.' using errcode = '42501';
  end if;
  if not public.app_can_action('configuracion', 'edit') then
    raise exception 'La sesion actual es de solo lectura.' using errcode = '42501';
  end if;
  if char_length(nombre_empresa) < 2 or char_length(nombre_empresa) > 100 then
    raise exception 'El nombre de la empresa debe tener entre 2 y 100 caracteres.' using errcode = '22023';
  end if;
  if char_length(nombre_campo) < 2 or char_length(nombre_campo) > 100 then
    raise exception 'El nombre del campo debe tener entre 2 y 100 caracteres.' using errcode = '22023';
  end if;
  if telefono_limpio is not null and char_length(telefono_limpio) > 50 then
    raise exception 'El telefono no puede superar 50 caracteres.' using errcode = '22023';
  end if;
  if cantidad_bloques < 0 or cantidad_bloques > 24 then
    raise exception 'La cantidad de bloques debe estar entre 0 y 24.' using errcode = '22023';
  end if;
  if tipo_bloque not in ('invernadero', 'campo_abierto') then
    raise exception 'El tipo de bloque no es valido.' using errcode = '22023';
  end if;

  select o.* into organizacion
  from public.organizaciones o
  where o.id = organizacion_id_actual and o.activo
  for update;

  if not found then
    raise exception 'La empresa no existe o esta inactiva.' using errcode = 'P0002';
  end if;

  -- Una repeticion por reintento de red devuelve el resultado existente y no
  -- duplica campos, bloques ni categorias.
  if organizacion.preparada_en is not null then
    select c.* into campo_nuevo
    from public.campos c
    where c.organizacion_id = organizacion.id
    order by c.id
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'ya_preparada', true,
      'organizacion', to_jsonb(organizacion),
      'campo', case when campo_nuevo.id is null then null else to_jsonb(campo_nuevo) end,
      'bloques', case when campo_nuevo.id is null then 0 else (
        select count(*) from public.bloques b where b.campo_id = campo_nuevo.id
      ) end,
      'categorias', (
        select count(*) from public.categorias_producto c where c.organizacion_id = organizacion.id
      )
    );
  end if;

  if exists (select 1 from public.campos c where c.organizacion_id = organizacion.id) then
    raise exception 'La empresa ya tiene campos pero no esta marcada como preparada. Requiere revision administrativa para evitar duplicados.' using errcode = '23505';
  end if;

  update public.organizaciones o
  set nombre = nombre_empresa,
      telefono = telefono_limpio
  where o.id = organizacion.id
  returning * into organizacion;

  categorias_total := private.preparar_empresa_catalogos(organizacion.id);

  insert into public.campos (nombre, organizacion_id)
  values (nombre_campo, organizacion.id)
  returning * into campo_nuevo;

  if cantidad_bloques > 0 then
    insert into public.bloques (campo_id, codigo, tipo, activo, organizacion_id)
    select campo_nuevo.id, 'A-' || serie::text, tipo_bloque, true, organizacion.id
    from generate_series(1, cantidad_bloques) serie;
  end if;

  update public.organizaciones o
  set preparada_en = now()
  where o.id = organizacion.id
  returning * into organizacion;

  return jsonb_build_object(
    'ok', true,
    'ya_preparada', false,
    'organizacion', to_jsonb(organizacion),
    'campo', to_jsonb(campo_nuevo),
    'bloques', cantidad_bloques,
    'categorias', categorias_total
  );
end;
$$;

revoke all on function public.completar_onboarding_empresa(text, text, text, integer, text) from public, anon;
grant execute on function public.completar_onboarding_empresa(text, text, text, integer, text) to authenticated;

-- Se conserva la firma usada por el front; solo se agregan preparada_en y
-- ultimo_ingreso_dueno al JSON de cada empresa.
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
      'preparada_en', o.preparada_en,
      'email', o.email,
      'admin_email', (select r.email from public.app_user_roles r where r.organizacion_id = o.id and r.rol = 'admin' and r.activo order by r.created_at limit 1),
      'ultimo_ingreso_dueno', (
        select u.last_sign_in_at
        from public.app_user_roles r
        left join auth.users u
          on u.id = r.user_id
          or (r.user_id is null and lower(u.email) = lower(r.email))
        where r.organizacion_id = o.id and r.rol = 'admin' and r.activo
        order by r.created_at, r.id
        limit 1
      ),
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

-- Regresiones que deben abortar la migracion completa.
do $$
begin
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
  if lower(pg_get_functiondef('public.completar_onboarding_empresa(text,text,text,integer,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: onboarding declara current_role text.';
  end if;
end;
$$;

commit;
