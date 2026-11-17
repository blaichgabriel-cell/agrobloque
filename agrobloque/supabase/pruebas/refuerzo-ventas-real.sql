-- Pruebas del refuerzo de ventas contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/refuerzo-ventas-2026-11-17.sql.
-- Crea empresas, personas, compradores y ventas temporales; todo se deshace con rollback al final.
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
  u_ver uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_socio uuid := gen_random_uuid();
  m_admin text := 'refuerzo-v-admin-' || suf || '@example.test';
  m_oper text := 'refuerzo-v-operador-' || suf || '@example.test';
  m_borra text := 'refuerzo-v-borra-' || suf || '@example.test';
  m_lect text := 'refuerzo-v-lectura-' || suf || '@example.test';
  m_ver text := 'refuerzo-v-solover-' || suf || '@example.test';
  m_admin_b text := 'refuerzo-v-adminb-' || suf || '@example.test';
  m_socio text := 'refuerzo-v-socio-' || suf || '@example.test';
  comp_a uuid;
  comp_b uuid;
  venta_a uuid;
  venta_b uuid;
  venta_op uuid;
  acceso uuid;
  n bigint;
  msg text;
  tbl text;
begin
  -- ---- Personas, empresas, compradores y ventas temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_borra, m_borra), (u_lect, m_lect), (u_ver, m_ver), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);

  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A refuerzo ventas', 'refuerzo-va-' || suf, true),
    (org_b, 'Empresa B refuerzo ventas', 'refuerzo-vb-' || suf, true),
    (org_s, 'Empresa socio refuerzo ventas', 'refuerzo-vs-' || suf, true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_borra, 'Operador que borra A', 'operador', true, u_borra, org_a, '{"ventas":["view","create","edit","delete"]}'::jsonb),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_ver, 'Operador solo ver A', 'operador', true, u_ver, org_a, '{"ventas":["view"]}'::jsonb),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);

  insert into private.platform_admins (user_id) values (u_socio);

  insert into public.compradores (nombre, organizacion_id) values ('Comprador A ' || suf, org_a) returning id into comp_a;
  insert into public.compradores (nombre, organizacion_id) values ('Comprador B ' || suf, org_b) returning id into comp_b;
  insert into public.ventas (comprador_id, producto, kg_total, precio_kg, total, organizacion_id)
  values (comp_a, 'Tomate', 100, 4500, 450000, org_a) returning id into venta_a;
  insert into public.ventas (comprador_id, producto, kg_total, precio_kg, total, organizacion_id)
  values (comp_b, 'Tomate', 50, 4500, 225000, org_b) returning id into venta_b;

  -- ---- 1. Estructura
  foreach tbl in array array['app_write_insert_ventas', 'app_write_update_ventas', 'app_write_delete_ventas', 'app_action_insert_ventas', 'app_action_update_ventas', 'app_action_delete_ventas'] loop
    fallos := fallos + pg_temp.chk(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname = tbl and permissive = 'RESTRICTIVE'), 'ventas: existe la politica restrictiva ' || tbl);
  end loop;
  fallos := fallos + pg_temp.chk(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas' and policyname = 'soporte_no_insert')
    and exists (select 1 from pg_trigger g where g.tgrelid = 'public.ventas'::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal), 'ventas: sigue con la proteccion del modo soporte');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Administrador: todo
  perform pg_temp.como(u_admin, m_admin);
  begin
    insert into public.ventas (comprador_id, producto, kg_total, precio_kg, total, organizacion_id)
    values (comp_a, 'Locote', 10, 8000, 80000, org_a);
    update public.ventas set estado_cobro = 'cobrado', monto_cobrado = 450000 where id = venta_a;
    get diagnostics n = row_count;
    msg := null;
  exception when others then msg := sqlerrm; n := -1; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null and n = 1, 'admin crea y cobra una venta' || coalesce(': ' || msg, ''));

  -- ---- 3. Operador por defecto: crea y cobra, pero NO borra
  perform pg_temp.como(u_oper, m_oper);
  begin
    insert into public.ventas (comprador_id, producto, kg_total, precio_kg, total, organizacion_id)
    values (comp_a, 'Lechuga', 20, 3000, 60000, org_a) returning id into venta_op;
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null and venta_op is not null, 'operador registra una venta' || coalesce(': ' || msg, ''));

  perform pg_temp.como(u_oper, m_oper);
  update public.ventas set estado_cobro = 'cobrado', monto_cobrado = 60000 where id = venta_op;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 1, 'operador cobra una venta (editar)');

  perform pg_temp.como(u_oper, m_oper);
  delete from public.ventas where id = venta_op;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0 and exists (select 1 from public.ventas where id = venta_op), 'operador NO borra una venta (' || n || ' filas)');

  -- ---- 4. Operador al que se le dio "delete": se respeta
  perform pg_temp.como(u_borra, m_borra);
  delete from public.ventas where id = venta_op;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 1 and not exists (select 1 from public.ventas where id = venta_op), 'operador con permiso delete a medida SI borra');

  -- ---- 5. Solo lectura: ve, no escribe
  perform pg_temp.como(u_lect, m_lect);
  select count(*) into n from public.ventas;
  reset role;
  fallos := fallos + pg_temp.chk(n >= 2, 'lectura ve las ventas de su empresa (' || n || ')');

  perform pg_temp.como(u_lect, m_lect);
  begin
    insert into public.ventas (comprador_id, producto, kg_total, organizacion_id) values (comp_a, 'No deberia', 1, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'lectura NO puede crear una venta: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_lect, m_lect);
  update public.ventas set total = 1 where id = venta_a;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0 and (select total from public.ventas where id = venta_a) = 450000, 'lectura NO puede editar una venta (' || n || ' filas)');

  perform pg_temp.como(u_lect, m_lect);
  delete from public.ventas where id = venta_a;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0 and exists (select 1 from public.ventas where id = venta_a), 'lectura NO puede borrar una venta (' || n || ' filas)');

  -- ---- 6. Operador con Ventas solo "ver": tampoco escribe
  perform pg_temp.como(u_ver, m_ver);
  begin
    insert into public.ventas (comprador_id, producto, kg_total, organizacion_id) values (comp_a, 'No deberia', 1, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'operador con ventas solo ver NO crea: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_ver, m_ver);
  update public.ventas set total = 1 where id = venta_a;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'operador con ventas solo ver NO edita (' || n || ' filas)');

  -- ---- 7. Aislamiento entre empresas
  perform pg_temp.como(u_admin_b, m_admin_b);
  select count(*) into n from public.ventas where id = venta_a;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'admin de otra empresa no ve las ventas de A');

  perform pg_temp.como(u_admin_b, m_admin_b);
  begin
    insert into public.ventas (comprador_id, producto, kg_total, organizacion_id) values (comp_b, 'No deberia', 1, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'admin de otra empresa NO crea una venta a nombre de A: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_admin_b, m_admin_b);
  update public.ventas set total = 1 where id = venta_a;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'admin de otra empresa NO edita ventas de A (' || n || ' filas)');

  -- ---- 8. Modo soporte: sin concesion no ve; con concesion lee, pero no escribe
  perform pg_temp.como(u_socio, m_socio);
  select count(*) into n from public.ventas;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'socio sin concesion no ve las ventas de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  acceso := public.soporte_solicitar(org_a, 'Prueba del refuerzo de ventas');
  reset role;
  perform pg_temp.como(u_admin, m_admin);
  perform public.soporte_responder(acceso, true, 1);
  reset role;

  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_entrar(acceso);
  select count(*) into n from public.ventas;
  reset role;
  fallos := fallos + pg_temp.chk(n >= 2, 'en soporte el socio LEE las ventas de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  begin
    insert into public.ventas (comprador_id, producto, kg_total, organizacion_id) values (comp_a, 'No deberia', 1, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'en soporte NO se crea una venta: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  begin
    update public.ventas set total = 1 where id = venta_a;
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg ilike '%solo lectura%', 'en soporte NO se edita una venta: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  begin
    delete from public.ventas where id = venta_a;
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg ilike '%solo lectura%', 'en soporte NO se borra una venta: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_salir();
  select count(*) into n from public.ventas;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'al salir de soporte vuelve a no ver las ventas (' || n || ')');

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: el refuerzo de ventas respeta roles, acciones, empresas y modo soporte.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
