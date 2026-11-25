-- Pruebas de las plantaciones atomicas contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/operaciones-atomicas-plantaciones-2026-11-23.sql.
-- Crea empresas, personas, un campo, bloques, abonos y plantaciones temporales; todo se deshace con rollback al final.
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

do $$
declare
  fallos integer := 0;
  suf text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  org_s uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_oper uuid := gen_random_uuid();
  u_borra uuid := gen_random_uuid();
  u_lect uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_socio uuid := gen_random_uuid();
  m_admin text := 'atomica-p-admin-' || suf || '@example.test';
  m_oper text := 'atomica-p-operador-' || suf || '@example.test';
  m_borra text := 'atomica-p-borra-' || suf || '@example.test';
  m_lect text := 'atomica-p-lectura-' || suf || '@example.test';
  m_admin_b text := 'atomica-p-adminb-' || suf || '@example.test';
  m_socio text := 'atomica-p-socio-' || suf || '@example.test';
  campo_a uuid;
  cultivo_1 uuid;
  cultivo_2 uuid;
  bloque_1 uuid;
  bloque_2 uuid;
  ab1 uuid;
  ab2 uuid;
  ab3 uuid;
  p_vieja uuid;
  p_hist uuid;
  p_nueva uuid;
  r jsonb;
  carga text;
  n integer;
  n2 integer;
  acceso uuid;
  tbl text;
begin
  -- ---- Personas, empresas, campo, bloques, abonos y plantaciones temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_borra, m_borra), (u_lect, m_lect), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);

  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A plantaciones atomicas', 'atomica-pa-' || suf, true),
    (org_b, 'Empresa B plantaciones atomicas', 'atomica-pb-' || suf, true),
    (org_s, 'Empresa socio plantaciones atomicas', 'atomica-ps-' || suf, true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_borra, 'Operador que borra A', 'operador', true, u_borra, org_a, '{"mapa":["view","create","edit","delete"]}'::jsonb),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);
  insert into private.platform_admins (user_id) values (u_socio);

  insert into public.campos (nombre, organizacion_id) values ('Campo prueba A ' || suf, org_a) returning id into campo_a;
  insert into public.cultivos (nombre, organizacion_id) values ('Cultivo 1 ' || suf, org_a) returning id into cultivo_1;
  insert into public.cultivos (nombre, organizacion_id) values ('Cultivo 2 ' || suf, org_a) returning id into cultivo_2;
  insert into public.bloques (campo_id, codigo, organizacion_id) values (campo_a, 'PL-1-' || suf, org_a) returning id into bloque_1;
  insert into public.bloques (campo_id, codigo, organizacion_id) values (campo_a, 'PL-2-' || suf, org_a) returning id into bloque_2;
  insert into public.abonos (nombre, organizacion_id) values ('Abono 1 ' || suf, org_a) returning id into ab1;
  insert into public.abonos (nombre, organizacion_id) values ('Abono 2 ' || suf, org_a) returning id into ab2;
  insert into public.abonos (nombre, organizacion_id) values ('Abono 3 ' || suf, org_a) returning id into ab3;
  -- Plantacion activa anterior del bloque 1 (con un abono) y un ciclo del historial en el bloque 2 (con abono y muerte)
  insert into public.plantaciones (bloque_id, cultivo_id, fecha_siembra, activa, cantidad_plantas, organizacion_id) values (bloque_1, cultivo_1, current_date - 60, true, 500, org_a) returning id into p_vieja;
  insert into public.plantacion_abonos (plantacion_id, abono_id, cantidad, unidad, alcance, organizacion_id) values (p_vieja, ab1, '1', 'kg', 'total', org_a);
  insert into public.plantaciones (bloque_id, cultivo_id, fecha_siembra, activa, cantidad_plantas, organizacion_id) values (bloque_2, cultivo_1, current_date - 200, false, 300, org_a) returning id into p_hist;
  insert into public.plantacion_abonos (plantacion_id, abono_id, cantidad, unidad, alcance, organizacion_id) values (p_hist, ab1, '2', 'kg', 'total', org_a);
  insert into public.muertes_plantas (bloque_id, plantacion_id, cantidad, causa, fecha, organizacion_id) values (bloque_2, p_hist, 3, 'Enfermedad', current_date - 150, org_a);

  -- ---- 1. Estructura
  foreach tbl in array array['public.registrar_plantacion(jsonb)', 'public.editar_plantacion(uuid,jsonb)', 'public.eliminar_plantacion(uuid,boolean)', 'private.abonos_normalizados(jsonb)'] loop
    fallos := fallos + pg_temp.chk(to_regprocedure(tbl) is not null, 'existe ' || tbl);
  end loop;
  fallos := fallos + pg_temp.chk(not exists (select 1 from pg_proc where prosecdef and proname in ('registrar_plantacion', 'editar_plantacion', 'eliminar_plantacion', 'abonos_normalizados')),
    'ninguna funcion es SECURITY DEFINER (respetan los permisos de quien las llama)');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Administrador crea una plantacion nueva en el bloque 1: cierra la vieja, crea la nueva y sus abonos
  carga := jsonb_build_object('bloque_id', bloque_1, 'cultivo_id', cultivo_2, 'fecha_siembra', current_date, 'cantidad_plantas', 1000, 'notas', 'Variedad: prueba',
    'abonos', jsonb_build_array(jsonb_build_object('abono_id', ab2, 'cantidad', '5', 'unidad', 'kg', 'alcance', 'total'),
                                jsonb_build_object('abono_id', ab3, 'cantidad', '2', 'unidad', 'kg', 'alcance', 'por_planta')))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_plantacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'id' and (r ->> 'cerradas')::integer = 1, 'admin crea la plantacion nueva y cierra la anterior' || coalesce(': ' || (r ->> 'error'), ''));
  p_nueva := (r ->> 'id')::uuid;
  fallos := fallos + pg_temp.chk(not (select activa from public.plantaciones where id = p_vieja) and (select activa from public.plantaciones where id = p_nueva), 'la anterior quedo cerrada (historial) y la nueva activa');
  fallos := fallos + pg_temp.chk((select count(*) from public.plantaciones where bloque_id = bloque_1 and activa) = 1, 'el bloque tiene UNA sola plantacion activa');
  fallos := fallos + pg_temp.chk((select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 2 and (select count(*) from public.plantacion_abonos where plantacion_id = p_vieja) = 1, 'la nueva tiene sus 2 abonos y la vieja conserva el suyo');

  -- ---- 3. Atomicidad: si falla un abono (no existe), NO queda cerrada la vieja ni creada la nueva
  select count(*) into n from public.plantaciones where bloque_id = bloque_1;
  carga := jsonb_build_object('bloque_id', bloque_1, 'cultivo_id', cultivo_1, 'fecha_siembra', current_date, 'cantidad_plantas', 10,
    'abonos', jsonb_build_array(jsonb_build_object('abono_id', gen_random_uuid(), 'cantidad', '1', 'unidad', 'kg', 'alcance', 'total')))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_plantacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'error', 'si un abono falla la funcion da error: ' || coalesce(left(r ->> 'error', 60), 'NO DIO ERROR'));
  fallos := fallos + pg_temp.chk((select count(*) from public.plantaciones where bloque_id = bloque_1) = n and (select activa from public.plantaciones where id = p_nueva)
    and (select count(*) from public.plantaciones where bloque_id = bloque_1 and activa) = 1, 'no quedo NADA a medias: mismas plantaciones y la activa sigue siendo la misma');

  -- ---- 4. Administrador edita la plantacion y cambia sus abonos: se reemplazan, sin duplicar
  carga := jsonb_build_object('cultivo_id', cultivo_1, 'fecha_siembra', current_date - 1, 'cantidad_plantas', 1200, 'notas', 'Variedad: editada',
    'abonos', jsonb_build_array(jsonb_build_object('abono_id', ab1, 'cantidad', '3', 'unidad', 'kg', 'alcance', 'total')))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ? 'id' and (r ->> 'abonos_reemplazados')::boolean, 'admin edita y reemplaza los abonos' || coalesce(': ' || (r ->> 'error'), ''));
  fallos := fallos + pg_temp.chk((select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 1 and (select cultivo_id from public.plantaciones where id = p_nueva) = cultivo_1
    and (select cantidad_plantas from public.plantaciones where id = p_nueva) = 1200, 'quedo 1 abono (sin duplicar) y los datos actualizados');

  -- ---- 5. Operador edita SIN cambiar los abonos: funciona con solo "editar" (no hace falta borrar nada)
  carga := jsonb_build_object('cultivo_id', cultivo_1, 'fecha_siembra', current_date - 1, 'cantidad_plantas', 1300, 'notas', 'Variedad: editada por operador',
    'abonos', jsonb_build_array(jsonb_build_object('abono_id', ab1, 'cantidad', '3', 'unidad', 'kg', 'alcance', 'total')))::text;
  r := pg_temp.llamar(u_oper, m_oper, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ? 'id' and not (r ->> 'abonos_reemplazados')::boolean, 'operador edita sin cambiar abonos (no se borra nada)' || coalesce(': ' || (r ->> 'error'), ''));
  fallos := fallos + pg_temp.chk((select cantidad_plantas from public.plantaciones where id = p_nueva) = 1300 and (select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 1, 'se actualizaron las plantas (1300) y el abono sigue siendo 1');

  -- ---- 6. Operador cambia los abonos: sin "eliminar" falla ENTERO (no duplica ni cambia los otros datos)
  carga := jsonb_build_object('cultivo_id', cultivo_2, 'fecha_siembra', current_date - 5, 'cantidad_plantas', 9999, 'notas', 'no debe guardarse',
    'abonos', jsonb_build_array(jsonb_build_object('abono_id', ab2, 'cantidad', '9', 'unidad', 'kg', 'alcance', 'total')))::text;
  r := pg_temp.llamar(u_oper, m_oper, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ->> 'estado' = '42501', 'operador no puede reemplazar abonos: error claro (' || coalesce(left(r ->> 'error', 70), 'NO DIO ERROR') || ')');
  fallos := fallos + pg_temp.chk((select cantidad_plantas from public.plantaciones where id = p_nueva) = 1300 and (select cultivo_id from public.plantaciones where id = p_nueva) = cultivo_1
    and (select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 1 and (select abono_id from public.plantacion_abonos where plantacion_id = p_nueva) = ab1,
    'el intento fallido no cambio nada: ni los datos ni los abonos');
  r := pg_temp.llamar(u_borra, m_borra, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ? 'id' and (r ->> 'abonos_reemplazados')::boolean and (select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 1
    and (select abono_id from public.plantacion_abonos where plantacion_id = p_nueva) = ab2, 'con "eliminar" a medida SI reemplaza los abonos' || coalesce(': ' || (r ->> 'error'), ''));

  -- ---- 7. Solo lectura: no crea, edita ni elimina
  select count(*) into n from public.plantaciones where organizacion_id = org_a;
  carga := jsonb_build_object('bloque_id', bloque_1, 'cultivo_id', cultivo_1, 'fecha_siembra', current_date, 'abonos', jsonb_build_array())::text;
  r := pg_temp.llamar(u_lect, m_lect, format('select public.registrar_plantacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'error' and (select count(*) from public.plantaciones where organizacion_id = org_a) = n and (select activa from public.plantaciones where id = p_nueva),
    'lectura NO crea (y no cierra la activa): ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_lect, m_lect, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ? 'error', 'lectura NO edita: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_lect, m_lect, format('select public.eliminar_plantacion(%L, true)', p_nueva));
  fallos := fallos + pg_temp.chk(r ? 'error' and exists (select 1 from public.plantaciones where id = p_nueva), 'lectura NO elimina: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));

  -- ---- 8. Aislamiento entre empresas
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ? 'error', 'admin de otra empresa NO edita plantaciones de A: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.eliminar_plantacion(%L, true)', p_nueva));
  fallos := fallos + pg_temp.chk(r ? 'error' and exists (select 1 from public.plantaciones where id = p_nueva), 'admin de otra empresa NO elimina plantaciones de A');

  -- ---- 9. Modo soporte: el socio con concesion no puede crear, editar ni eliminar
  perform pg_temp.como(u_socio, m_socio);
  acceso := public.soporte_solicitar(org_a, 'Prueba de plantaciones atomicas');
  reset role;
  perform pg_temp.como(u_admin, m_admin);
  perform public.soporte_responder(acceso, true, 1);
  reset role;
  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_entrar(acceso);
  reset role;
  r := pg_temp.llamar(u_socio, m_socio, format('select public.registrar_plantacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se crea: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_socio, m_socio, format('select public.editar_plantacion(%L, %L::jsonb)', p_nueva, carga));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se edita: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_socio, m_socio, format('select public.eliminar_plantacion(%L, true)', p_nueva));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se elimina: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_salir();
  reset role;

  -- ---- 10. Eliminar la plantacion activa (con sus muertes): el operador no puede; con "eliminar" a medida si
  insert into public.muertes_plantas (bloque_id, plantacion_id, cantidad, causa, fecha, organizacion_id) values (bloque_1, p_nueva, 5, 'Plaga', current_date, org_a);
  r := pg_temp.llamar(u_oper, m_oper, format('select public.eliminar_plantacion(%L, true)', p_nueva));
  fallos := fallos + pg_temp.chk(r ->> 'estado' = '42501', 'el operador NO elimina: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  fallos := fallos + pg_temp.chk(exists (select 1 from public.plantaciones where id = p_nueva) and (select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 1
    and exists (select 1 from public.muertes_plantas where plantacion_id = p_nueva),
    'el intento fallido no borro NADA (ni la plantacion, ni los abonos, ni las muertes)');
  r := pg_temp.llamar(u_borra, m_borra, format('select public.eliminar_plantacion(%L, true)', p_nueva));
  fallos := fallos + pg_temp.chk(r ? 'id' and (r ->> 'muertes')::integer = 1, 'con "eliminar" a medida SI elimina (1 muerte)' || coalesce(': ' || (r ->> 'error'), ''));
  fallos := fallos + pg_temp.chk(not exists (select 1 from public.plantaciones where id = p_nueva) and (select count(*) from public.plantacion_abonos where plantacion_id = p_nueva) = 0
    and not exists (select 1 from public.muertes_plantas where plantacion_id = p_nueva),
    'se borro la plantacion con sus abonos y muertes');

  -- ---- 11. Eliminar un ciclo del historial: borra la plantacion y sus abonos; las muertes quedan sin plantacion (como hoy)
  r := pg_temp.llamar(u_admin, m_admin, format('select public.eliminar_plantacion(%L, false)', p_hist));
  fallos := fallos + pg_temp.chk(r ? 'id', 'admin elimina un ciclo del historial' || coalesce(': ' || (r ->> 'error'), ''));
  fallos := fallos + pg_temp.chk(not exists (select 1 from public.plantaciones where id = p_hist) and (select count(*) from public.plantacion_abonos where plantacion_id = p_hist) = 0
    and (select count(*) from public.muertes_plantas where bloque_id = bloque_2 and plantacion_id is null) = 1, 'sus abonos se borraron y la muerte quedo sin plantacion (no se perdio)');
  r := pg_temp.llamar(u_admin, m_admin, format('select public.eliminar_plantacion(%L, false)', p_hist));
  fallos := fallos + pg_temp.chk(r ? 'error', 'eliminar una plantacion que ya no existe da error claro');

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: las plantaciones atomicas guardan todo o nada y respetan roles, permisos, empresas y modo soporte.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
