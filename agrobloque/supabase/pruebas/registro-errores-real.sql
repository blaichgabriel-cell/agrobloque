-- Pruebas del registro de errores contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/registro-errores-2026-11-24.sql.
-- Crea empresas y personas temporales y anota errores de prueba; todo se deshace con rollback al final.
-- No lleva correos reales ni claves. Cada linea sale como "ok" o "FALLA"; al final debe decir TODO OK.

begin;

create function pg_temp.chk(cond boolean, texto text) returns integer language plpgsql as $$
begin
  if coalesce(cond, false) then raise notice 'ok     %', texto; return 0; end if;
  raise notice 'FALLA  %', texto; return 1;
end $$;

-- Pasa a actuar como esa persona con el rol authenticated (igual que la API de Supabase).
create function pg_temp.como(p_uid uuid, p_mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'email', p_mail, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.email', p_mail, true);
  execute 'set local role authenticated';
end $$;

-- Ejecuta una consulta que devuelve un jsonb como esa persona. Si falla, devuelve {"error": mensaje, "estado": sqlstate}.
create function pg_temp.llamar(p_uid uuid, p_mail text, p_sql text) returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  perform pg_temp.como(p_uid, p_mail);
  begin
    execute p_sql into res;
  exception when others then res := jsonb_build_object('error', sqlerrm, 'estado', sqlstate);
  end;
  execute 'reset role';
  return res;
end $$;

-- Igual, pero como visitante sin sesion (rol anon).
create function pg_temp.llamar_anon(p_sql text) returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    execute p_sql into res;
  exception when others then res := jsonb_build_object('error', sqlerrm, 'estado', sqlstate);
  end;
  execute 'reset role';
  return res;
end $$;

do $$
declare
  fallos integer := 0;
  suf text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  org_s uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_oper uuid := gen_random_uuid();
  u_lect uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_socio uuid := gen_random_uuid();
  m_admin text := 'errores-admin-' || suf || '@example.test';
  m_oper text := 'errores-operador-' || suf || '@example.test';
  m_lect text := 'errores-lectura-' || suf || '@example.test';
  m_admin_b text := 'errores-adminb-' || suf || '@example.test';
  m_socio text := 'errores-socio-' || suf || '@example.test';
  h1 text := 'h1-' || suf;
  h2 text := 'h2-' || suf;
  h3 text := 'h3-' || suf;
  r jsonb;
  n integer;
  fila jsonb;
  i integer;
begin
  -- ---- Personas y empresas temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_lect, m_lect), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);
  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A errores ' || suf, 'errores-a-' || suf, true),
    (org_b, 'Empresa B errores ' || suf, 'errores-b-' || suf, true),
    (org_s, 'Empresa socio errores ' || suf, 'errores-s-' || suf, true);
  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);
  insert into private.platform_admins (user_id) values (u_socio);

  -- ---- 1. Estructura y cerraduras
  fallos := fallos + pg_temp.chk(to_regclass('private.errores_app') is not null, 'existe private.errores_app');
  fallos := fallos + pg_temp.chk((select relrowsecurity from pg_class where oid = 'private.errores_app'::regclass), 'la tabla tiene RLS activado');
  fallos := fallos + pg_temp.chk(not has_table_privilege('authenticated', 'private.errores_app', 'select') and not has_table_privilege('anon', 'private.errores_app', 'select'),
    'ni authenticated ni anon pueden leer la tabla');
  fallos := fallos + pg_temp.chk(not has_function_privilege('anon', 'public.registrar_error_app(jsonb)', 'execute') and not has_function_privilege('anon', 'public.plataforma_errores(integer)', 'execute')
    and not has_function_privilege('anon', 'public.plataforma_errores_descartar(text)', 'execute'), 'anon no puede ejecutar ninguna funcion del registro');
  fallos := fallos + pg_temp.chk((select count(*) from pg_proc p where p.proname in ('registrar_error_app', 'plataforma_errores', 'plataforma_errores_descartar', 'purgar_errores_app')
    and p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']) = 4, 'las 4 funciones son SECURITY DEFINER con search_path vacio');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Cualquier usuario con sesion anota un error; empresa y usuario los pone el servidor (aunque intenten falsificarlos)
  r := pg_temp.llamar(u_oper, m_oper, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object(
    'huella', h1, 'origen', 'js', 'ruta', '/bloque/:id', 'mensaje', 'Cannot read properties of undefined', 'detalle', 'at Pantalla (main.js:1)',
    'version', 'abc1234', 'agente', 'Mozilla/5.0 (prueba)', 'empresa_id', org_b, 'usuario_id', u_admin_b)::text));
  fallos := fallos + pg_temp.chk((r ->> 'registrado')::boolean, 'el operador anota un error' || coalesce(': ' || (r ->> 'error'), ''));
  select count(*) into n from private.errores_app where huella = h1 and empresa_id = org_a and usuario_id = u_oper;
  fallos := fallos + pg_temp.chk(n = 1, 'quedo con SU empresa y SU usuario (el servidor ignora los que mande la app)');
  fallos := fallos + pg_temp.chk(not exists (select 1 from private.errores_app where huella = h1 and (empresa_id = org_b or usuario_id = u_admin_b)), 'no se pudo falsificar la empresa ni el usuario');

  -- ---- 3. El mismo error otra vez: no duplica, cuenta
  r := pg_temp.llamar(u_lect, m_lect, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', h1, 'origen', 'js', 'mensaje', 'Cannot read properties of undefined', 'version', 'abc1235')::text));
  select count(*) into n from private.errores_app where huella = h1 and empresa_id = org_a;
  fallos := fallos + pg_temp.chk(n = 1 and (select repeticiones from private.errores_app where huella = h1 and empresa_id = org_a) = 2, 'el mismo error en la misma empresa suma una repeticion (1 renglon, 2 veces)');
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', h1, 'origen', 'js', 'mensaje', 'Cannot read properties of undefined')::text));
  fallos := fallos + pg_temp.chk((select count(*) from private.errores_app where huella = h1) = 2, 'el mismo error en otra empresa es otro renglon (2 empresas)');

  -- ---- 4. Se recorta y se ignoran los vacios
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', h2, 'origen', repeat('o', 100), 'ruta', repeat('r', 1000), 'mensaje', repeat('m', 10000), 'detalle', repeat('d', 20000), 'version', repeat('v', 100), 'agente', repeat('a', 1000))::text));
  select * into fila from (select to_jsonb(e) from private.errores_app e where e.huella = h2) x(f);
  fallos := fallos + pg_temp.chk(length(fila ->> 'mensaje') = 500 and length(fila ->> 'detalle') = 3000 and length(fila ->> 'ruta') = 200 and length(fila ->> 'origen') = 30
    and length(fila ->> 'version') = 40 and length(fila ->> 'agente') = 200, 'los textos largos se recortan (mensaje 500, detalle 3000, ruta 200, origen 30, version 40, agente 200)');
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', h3, 'mensaje', '   ')::text));
  fallos := fallos + pg_temp.chk(not (r ->> 'registrado')::boolean and not exists (select 1 from private.errores_app where huella = h3), 'un aviso sin mensaje no se guarda');
  r := pg_temp.llamar(u_admin, m_admin, 'select public.registrar_error_app(''[]''::jsonb)');
  fallos := fallos + pg_temp.chk(not (r ->> 'registrado')::boolean, 'un aviso que no es un objeto no se guarda');

  -- ---- 5. Sin sesion no se puede anotar; nadie lee la tabla directo
  r := pg_temp.llamar_anon(format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('mensaje', 'x')::text));
  fallos := fallos + pg_temp.chk(r ? 'error', 'sin sesion NO se anota: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_admin, m_admin, 'select to_jsonb(count(*)) from private.errores_app');
  fallos := fallos + pg_temp.chk(r ? 'error', 'un administrador de empresa NO lee la tabla directo: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_admin, m_admin, 'select public.plataforma_errores(14)');
  fallos := fallos + pg_temp.chk(r ->> 'estado' = '42501', 'un administrador de empresa NO ve el listado de la plataforma: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_oper, m_oper, format('select to_jsonb(public.plataforma_errores_descartar(%L))', h1));
  fallos := fallos + pg_temp.chk(r ->> 'estado' = '42501' and exists (select 1 from private.errores_app where huella = h1), 'un operador NO descarta errores');

  -- ---- 6. El administrador general ve el listado, con el nombre de la empresa y sin datos de personas
  r := pg_temp.llamar(u_socio, m_socio, 'select public.plataforma_errores(14)');
  fallos := fallos + pg_temp.chk(jsonb_typeof(r) = 'array' and jsonb_array_length(r) >= 3, 'el administrador general ve el listado (' || coalesce(jsonb_array_length(r)::text, '?') || ' errores)' || coalesce(': ' || (r ->> 'error'), ''));
  fallos := fallos + pg_temp.chk(exists (select 1 from jsonb_array_elements(r) e where e ->> 'huella' = h1 and e ->> 'empresa' like 'Empresa A errores%' and (e ->> 'repeticiones')::integer = 2),
    'cada error trae el nombre de su empresa y su contador');
  fallos := fallos + pg_temp.chk(not exists (select 1 from jsonb_array_elements(r) e where e ? 'usuario_id' or e ? 'usuario' or e ? 'correo' or e::text like '%@example.test%'), 'el listado no trae usuarios ni correos');
  r := pg_temp.llamar(u_socio, m_socio, 'select public.plataforma_errores(1)');
  fallos := fallos + pg_temp.chk(jsonb_array_length(r) >= 3, 'el filtro de dias funciona (ultimo dia)');

  -- ---- 7. Descartar (solo administrador general)
  r := pg_temp.llamar(u_socio, m_socio, format('select to_jsonb(public.plataforma_errores_descartar(%L))', h1));
  fallos := fallos + pg_temp.chk((r #>> '{}')::integer = 2 and not exists (select 1 from private.errores_app where huella = h1), 'el administrador general descarta un error (borra sus 2 renglones)' || coalesce(': ' || (r ->> 'error'), ''));

  -- ---- 8. Limite por usuario: 100 errores distintos por hora
  for i in 1..105 loop
    perform pg_temp.llamar(u_lect, m_lect, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', 'lim-' || suf || '-' || i, 'mensaje', 'error ' || i)::text));
  end loop;
  select count(*) into n from private.errores_app where huella like 'lim-' || suf || '-%';
  fallos := fallos + pg_temp.chk(n <= 100 and n >= 95, 'el limite por usuario frena el bucle: ' || n || ' de 105 anotados (maximo 100 por hora)');
  r := pg_temp.llamar(u_lect, m_lect, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', 'lim-' || suf || '-1', 'mensaje', 'error 1')::text));
  fallos := fallos + pg_temp.chk((select repeticiones from private.errores_app where huella = 'lim-' || suf || '-1') >= 2, 'un error que ya existia sigue contando aunque se llegue al limite');
  r := pg_temp.llamar(u_oper, m_oper, format('select public.registrar_error_app(%L::jsonb)', jsonb_build_object('huella', 'otro-' || suf, 'mensaje', 'otro usuario')::text));
  fallos := fallos + pg_temp.chk((r ->> 'registrado')::boolean, 'el limite es por usuario: otra persona puede seguir anotando');

  -- ---- 9. Retencion: lo que no se repite hace mas de 30 dias se borra
  insert into private.errores_app (clave, huella, empresa_id, mensaje, ultima_vez) values ('viejo-' || suf, 'viejo-' || suf, org_a, 'error antiguo', now() - interval '31 days');
  insert into private.errores_app (clave, huella, empresa_id, mensaje, ultima_vez) values ('reciente-' || suf, 'reciente-' || suf, org_a, 'error reciente', now() - interval '29 days');
  n := private.purgar_errores_app();
  fallos := fallos + pg_temp.chk(not exists (select 1 from private.errores_app where huella = 'viejo-' || suf) and exists (select 1 from private.errores_app where huella = 'reciente-' || suf), 'la limpieza borra lo de hace mas de 30 dias y conserva lo reciente');

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: el registro de errores anota, cuenta y limita, y solo los administradores generales lo ven.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
