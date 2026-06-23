-- AgroBloque: fix v2 para crear y validar links de invitado.
-- Ejecutar en Supabase SQL Editor.
-- Esta version usa parametros de texto para evitar fallas de RPC con uuid/jsonb/null.

create extension if not exists pgcrypto;

alter table if exists public.guest_access_links
  add column if not exists permisos jsonb;

create or replace function public.create_guest_access_link_v2(
  p_nombre text,
  p_campo_id_text text default '',
  p_dias_text text default '30',
  p_permisos_json text default ''
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  raw_token text;
  digest_hex text;
  new_id uuid;
  campo_uuid uuid;
  dias_int integer;
  permisos_value jsonb;
  vencimiento timestamptz;
begin
  if nullif(trim(p_nombre), '') is null then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;

  if nullif(trim(coalesce(p_campo_id_text, '')), '') is not null then
    campo_uuid := trim(p_campo_id_text)::uuid;
  else
    campo_uuid := null;
  end if;

  if nullif(trim(coalesce(p_dias_text, '')), '') is null then
    dias_int := null;
  else
    dias_int := trim(p_dias_text)::integer;
  end if;

  if nullif(trim(coalesce(p_permisos_json, '')), '') is null then
    permisos_value := null;
  else
    permisos_value := p_permisos_json::jsonb;
  end if;

  raw_token := encode(gen_random_bytes(24), 'hex');
  digest_hex := encode(digest(raw_token, 'sha256'), 'hex');

  if dias_int is null or dias_int <= 0 then
    vencimiento := null;
  else
    vencimiento := now() + (dias_int || ' days')::interval;
  end if;

  insert into public.guest_access_links (
    nombre,
    campo_id,
    token_hash,
    expires_at,
    permisos,
    activo
  )
  values (
    trim(p_nombre),
    campo_uuid,
    digest_hex,
    vencimiento,
    permisos_value,
    true
  )
  returning id into new_id;

  return jsonb_build_object(
    'ok', true,
    'id', new_id,
    'token', raw_token,
    'expires_at', vencimiento
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.create_guest_access_link_v2(text, text, text, text) to authenticated;

create or replace function public.get_guest_access_snapshot(access_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  digest_hex text;
  link_row public.guest_access_links%rowtype;
  campo_json jsonb;
  mes_desde date := date_trunc('month', now())::date;
begin
  if access_token is null or length(access_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'token_invalido');
  end if;

  digest_hex := encode(digest(access_token, 'sha256'), 'hex');

  select *
  into link_row
  from public.guest_access_links
  where token_hash = digest_hex
    and activo = true
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if link_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'link_no_valido');
  end if;

  if link_row.campo_id is null then
    campo_json := jsonb_build_object('id', null, 'nombre', 'Todos los campos');
  else
    select jsonb_build_object('id', c.id, 'nombre', c.nombre)
    into campo_json
    from public.campos c
    where c.id = link_row.campo_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'nombre', link_row.nombre,
    'campo', coalesce(campo_json, jsonb_build_object('id', null, 'nombre', 'Vista de invitado')),
    'permisos', coalesce(link_row.permisos, '[]'::jsonb),
    'stats', jsonb_build_object(
      'bloques_total', (
        select count(*) from public.bloques b
        where link_row.campo_id is null or b.campo_id = link_row.campo_id
      ),
      'bloques_activos', (
        select count(*) from public.bloques b
        where (link_row.campo_id is null or b.campo_id = link_row.campo_id)
          and coalesce(b.activo, true) = true
      ),
      'plantaciones_activas', (
        select count(*)
        from public.plantaciones p
        join public.bloques b on b.id = p.bloque_id
        where (link_row.campo_id is null or b.campo_id = link_row.campo_id)
          and coalesce(p.activa, false) = true
      ),
      'operarios', (
        select count(*) from public.operarios o
        where link_row.campo_id is null or o.campo_id = link_row.campo_id
      ),
      'tareas_pendientes', (
        select count(*) from public.tareas t
        where (link_row.campo_id is null or t.campo_id = link_row.campo_id)
          and coalesce(t.completada, false) = false
      )
    ),
    'finanzas', jsonb_build_object(
      'ingresos', coalesce((
        select sum(coalesce(v.total, coalesce(v.kg_total, 0) * coalesce(v.precio_kg, 0)))
        from public.ventas v
        left join public.bloques b on b.id = v.bloque_id
        where (link_row.campo_id is null or b.campo_id = link_row.campo_id)
          and v.fecha >= mes_desde
      ), 0),
      'costos', coalesce((
        select sum(coalesce(c.monto, 0))
        from public.costos c
        where (link_row.campo_id is null or c.campo_id = link_row.campo_id)
          and c.fecha >= mes_desde
      ), 0)
    ),
    'plantaciones', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select p.id, b.codigo as bloque_codigo, cu.nombre as cultivo,
               p.fecha_siembra, p.densidad_plantas_m2 as cantidad_plantas
        from public.plantaciones p
        join public.bloques b on b.id = p.bloque_id
        left join public.cultivos cu on cu.id = p.cultivo_id
        where (link_row.campo_id is null or b.campo_id = link_row.campo_id)
          and coalesce(p.activa, false) = true
        order by p.fecha_siembra desc nulls last, p.created_at desc nulls last
        limit 30
      ) x
    ), '[]'::jsonb),
    'tareas', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select t.id, t.descripcion, t.fecha_programada, b.codigo as bloque_codigo
        from public.tareas t
        left join public.bloques b on b.id = t.bloque_id
        where (link_row.campo_id is null or t.campo_id = link_row.campo_id)
          and coalesce(t.completada, false) = false
        order by t.fecha_programada asc nulls last, t.created_at desc nulls last
        limit 30
      ) x
    ), '[]'::jsonb),
    'cosechas', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select c.id, b.codigo as bloque_codigo, c.fecha, c.kg_total, c.precio_kg
        from public.cosechas c
        left join public.bloques b on b.id = c.bloque_id
        where link_row.campo_id is null or b.campo_id = link_row.campo_id
        order by c.fecha desc nulls last, c.created_at desc nulls last
        limit 30
      ) x
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select p.id, p.nombre, cp.nombre as categoria, p.stock_actual
        from public.productos p
        left join public.categorias_producto cp on cp.id = p.categoria_id
        where coalesce(p.activo, true) = true
        order by p.nombre
        limit 40
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_guest_access_snapshot(text) to anon, authenticated;

notify pgrst, 'reload schema';
