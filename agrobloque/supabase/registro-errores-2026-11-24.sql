-- AgroBloque: registro de errores de la app (2026-11-24).
--
-- POR QUE
--   Hoy, si algo falla en el telefono o el computador de un cliente (una pantalla que no abre, un guardado que da error
--   de servidor, un error de JavaScript), nadie se entera salvo que el cliente avise. La app solo escribe el error en
--   la consola de ese navegador. Este registro permite ver, desde el Panel de plataforma, que esta fallando y a quien
--   (a que empresa), sin depender de servicios de terceros.
--
-- QUE HACE
--   * Tabla private.errores_app: un renglon por error distinto y empresa; si el mismo error se repite, solo sube el
--     contador. Esta en el esquema private: la API publica NO la expone y ni siquiera un administrador de empresa
--     puede leerla.
--   * public.registrar_error_app(p jsonb): la llama la app (cualquier usuario con sesion) para anotar un error. La
--     empresa y el usuario los pone el SERVIDOR (no se pueden falsificar desde la app). Limpia y recorta el texto, y
--     tiene limite por usuario (100 errores distintos por hora) para que un fallo en bucle no llene la base.
--   * public.plataforma_errores(p_dias): lista los errores. Solo los administradores generales (is_platform_admin()).
--     No devuelve correos ni nombres de usuario.
--   * public.plataforma_errores_descartar(p_huella): borra un error ya resuelto. Solo administradores generales.
--   * Retencion: se borran solos los errores cuya ultima aparicion fue hace mas de 30 dias.
--
-- PRIVACIDAD
--   La app NO envia datos de negocio: solo mensaje, ruta (con los ids reemplazados), origen, version y navegador, y
--   quita correos y tokens del texto antes de enviarlo. Este SQL no escribe en ninguna tabla existente.
--
-- NO CAMBIA: tablas, politicas ni datos existentes. Solo agrega una tabla privada y funciones. Es repetible.
-- La pantalla seguira funcionando como hoy si este SQL no esta aplicado (los avisos de error simplemente se descartan).
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayarlo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   3. Ejecutarlo UNA vez, completo, con "commit;". Es repetible.
--   4. Para deshacerlo: registro-errores-2026-11-24-deshacer.sql (borra la tabla y sus datos).
--
-- No declara ninguna variable llamada current_role (error del 2026-11-04).

begin;

-- ---------------------------------------------------------------------------------------------
-- Comprobaciones previas: si falta algo, se aborta antes de cambiar nada.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_platform_admin()') is null then
    raise exception 'Falta public.is_platform_admin() (multiempresa-organizaciones-2026-11-02.sql).';
  end if;
  if to_regprocedure('private.current_organization_id()') is null then
    raise exception 'Falta private.current_organization_id() (multiempresa-organizaciones-2026-11-02.sql).';
  end if;
  if to_regclass('public.organizaciones') is null then
    raise exception 'No existe public.organizaciones.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Tabla privada
-- ---------------------------------------------------------------------------------------------
create table if not exists private.errores_app (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,                 -- huella + empresa: un renglon por error distinto y empresa
  huella text not null,
  empresa_id uuid,
  usuario_id uuid,                            -- ultimo usuario al que le paso (solo para contar, no se muestra)
  origen text,
  ruta text,
  mensaje text,
  detalle text,
  version text,
  agente text,
  repeticiones integer not null default 1,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now()
);
create index if not exists errores_app_ultima_vez_idx on private.errores_app (ultima_vez desc);
create index if not exists errores_app_usuario_idx on private.errores_app (usuario_id, ultima_vez desc);

-- Nadie entra a la tabla por la API: solo las funciones de abajo (que corren con los derechos del dueno).
alter table private.errores_app enable row level security;
revoke all on private.errores_app from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Retencion: borra lo que no se repite hace mas de 30 dias
-- ---------------------------------------------------------------------------------------------
create or replace function private.purgar_errores_app() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from private.errores_app where ultima_vez < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.purgar_errores_app() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Anotar un error (la llama la app)
--   p: { "huella", "origen", "ruta", "mensaje", "detalle", "version", "agente" }
--   La empresa y el usuario NO vienen en p: los pone el servidor.
-- ---------------------------------------------------------------------------------------------
create or replace function public.registrar_error_app(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_empresa uuid;
  v_huella text := left(coalesce(nullif(btrim(p ->> 'huella'), ''), md5(coalesce(p ->> 'mensaje', ''))), 64);
  v_recientes integer;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesion.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or nullif(btrim(p ->> 'mensaje'), '') is null then
    return jsonb_build_object('registrado', false, 'motivo', 'sin_mensaje');
  end if;

  v_empresa := (select private.current_organization_id());

  -- Limite por usuario: un fallo en bucle no debe llenar la base.
  select count(*) into v_recientes from private.errores_app where usuario_id = v_uid and ultima_vez > now() - interval '1 hour';
  if v_recientes >= 100
     and not exists (select 1 from private.errores_app where clave = v_huella || '|' || coalesce(v_empresa::text, '-')) then
    return jsonb_build_object('registrado', false, 'motivo', 'limite');
  end if;

  insert into private.errores_app (clave, huella, empresa_id, usuario_id, origen, ruta, mensaje, detalle, version, agente)
  values (v_huella || '|' || coalesce(v_empresa::text, '-'), v_huella, v_empresa, v_uid,
          left(coalesce(p ->> 'origen', ''), 30), left(coalesce(p ->> 'ruta', ''), 200), left(p ->> 'mensaje', 500),
          left(coalesce(p ->> 'detalle', ''), 3000), left(coalesce(p ->> 'version', ''), 40), left(coalesce(p ->> 'agente', ''), 200))
  on conflict (clave) do update
    set repeticiones = private.errores_app.repeticiones + 1, ultima_vez = now(), usuario_id = excluded.usuario_id,
        version = excluded.version, ruta = excluded.ruta;

  -- Limpieza ocasional (2 de cada 100 llamadas).
  if random() < 0.02 then perform private.purgar_errores_app(); end if;

  return jsonb_build_object('registrado', true);
end $$;
revoke all on function public.registrar_error_app(jsonb) from public, anon;
grant execute on function public.registrar_error_app(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ver los errores (solo administradores generales)
-- ---------------------------------------------------------------------------------------------
create or replace function public.plataforma_errores(p_dias integer default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(f.fila order by f.ultima_vez desc)
    from (
      select e.ultima_vez, jsonb_build_object(
        'id', e.id, 'huella', e.huella, 'empresa', coalesce(o.nombre, 'Sin empresa'), 'origen', e.origen, 'ruta', e.ruta,
        'mensaje', e.mensaje, 'detalle', e.detalle, 'version', e.version, 'agente', e.agente,
        'repeticiones', e.repeticiones, 'primera_vez', e.primera_vez, 'ultima_vez', e.ultima_vez) as fila
      from private.errores_app e
      left join public.organizaciones o on o.id = e.empresa_id
      where e.ultima_vez >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 14), 90)))
      order by e.ultima_vez desc
      limit 300
    ) f
  ), '[]'::jsonb);
end $$;
revoke all on function public.plataforma_errores(integer) from public, anon;
grant execute on function public.plataforma_errores(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Descartar un error ya resuelto (borra ese error en todas las empresas)
-- ---------------------------------------------------------------------------------------------
create or replace function public.plataforma_errores_descartar(p_huella text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  delete from private.errores_app where huella = p_huella;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.plataforma_errores_descartar(text) from public, anon;
grant execute on function public.plataforma_errores_descartar(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Verificacion final: si algo no quedo como se espera, se aborta y no se aplica nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  falta text;
  mal text;
begin
  select string_agg(n, ', ') into falta
  from unnest(array['public.registrar_error_app(jsonb)', 'public.plataforma_errores(integer)', 'public.plataforma_errores_descartar(text)', 'private.purgar_errores_app()']) n
  where to_regprocedure(n) is null;
  if falta is not null then raise exception 'Faltan funciones: %', falta; end if;
  if to_regclass('private.errores_app') is null then raise exception 'No existe private.errores_app.'; end if;

  -- Las funciones con SECURITY DEFINER deben fijar el search_path vacio (evita suplantar funciones).
  select string_agg(p.proname, ', ') into mal
  from pg_proc p
  where p.proname in ('registrar_error_app', 'plataforma_errores', 'plataforma_errores_descartar', 'purgar_errores_app')
    and (not p.prosecdef or not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']);
  if mal is not null then raise exception 'Funciones sin SECURITY DEFINER o sin search_path vacio: %', mal; end if;

  if not (select relrowsecurity from pg_class where oid = 'private.errores_app'::regclass) then
    raise exception 'private.errores_app no tiene RLS activado.';
  end if;
  if has_table_privilege('authenticated', 'private.errores_app', 'select') or has_table_privilege('anon', 'private.errores_app', 'select') then
    raise exception 'private.errores_app es legible por la API.';
  end if;
  if has_function_privilege('anon', 'public.registrar_error_app(jsonb)', 'execute') or has_function_privilege('anon', 'public.plataforma_errores(integer)', 'execute') then
    raise exception 'anon puede ejecutar funciones del registro de errores.';
  end if;
end $$;

commit;
