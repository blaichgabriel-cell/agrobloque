-- Pruebas del refuerzo de compras contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/refuerzo-compras-2026-11-17.sql.
-- Crea empresas, personas y productos temporales; todo se deshace con rollback al final.
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
  u_lect uuid := gen_random_uuid();
  u_ver uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_socio uuid := gen_random_uuid();
  m_admin text := 'refuerzo-admin-' || suf || '@example.test';
  m_oper text := 'refuerzo-operador-' || suf || '@example.test';
  m_lect text := 'refuerzo-lectura-' || suf || '@example.test';
  m_ver text := 'refuerzo-solover-' || suf || '@example.test';
  m_admin_b text := 'refuerzo-adminb-' || suf || '@example.test';
  m_socio text := 'refuerzo-socio-' || suf || '@example.test';
  prod_a uuid;
  prod_b uuid;
  compra uuid;
  compra_op uuid;
  acceso uuid;
  n bigint;
  antes bigint;
  msg text;
  t text;
  nombre_guardia text;
begin
  -- ---- Personas, empresas y productos temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_lect, m_lect), (u_ver, m_ver), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);

  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A refuerzo compras', 'refuerzo-a-' || suf, true),
    (org_b, 'Empresa B refuerzo compras', 'refuerzo-b-' || suf, true),
    (org_s, 'Empresa socio refuerzo compras', 'refuerzo-s-' || suf, true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_ver, 'Operador solo ver A', 'operador', true, u_ver, org_a, '{"inventario":["view"]}'::jsonb),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);

  insert into private.platform_admins (user_id) values (u_socio);

  insert into public.productos (nombre, unidad, stock_actual, organizacion_id)
  values ('Producto prueba A ' || suf, 'kg', 100, org_a) returning id into prod_a;
  insert into public.productos (nombre, unidad, stock_actual, organizacion_id)
  values ('Producto prueba B ' || suf, 'kg', 100, org_b) returning id into prod_b;

  -- ---- 1. Estructura
  foreach t in array array['inventario_compras', 'consumos_valorizados'] loop
    nombre_guardia := 'tenant_organization_guard_sp_sel_' || substr(md5('public.' || t || '.tenant_organization_guard'), 1, 8);
    fallos := fallos + pg_temp.chk(exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = nombre_guardia and cmd = 'SELECT'), t || ': la lectura usa la guardia dividida (empresa propia o de soporte)');
    fallos := fallos + pg_temp.chk((select count(*) from pg_policies where schemaname = 'public' and tablename = t and policyname like 'tenant_organization_guard_sp_%') = 4, t || ': la guardia por empresa esta dividida en 4 politicas');
    fallos := fallos + pg_temp.chk(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and (policyname in ('tenant_organization_guard', t || '_authenticated') or (cmd = 'ALL' and coalesce(qual, '') in ('true', '')))), t || ': ya no quedan politicas abiertas ni sin dividir');
    fallos := fallos + pg_temp.chk((select count(*) from pg_policies where schemaname = 'public' and tablename = t and policyname like 'app_action_%') = 3, t || ': tiene las 3 politicas por accion');
    fallos := fallos + pg_temp.chk((select count(*) from pg_policies where schemaname = 'public' and tablename = t and policyname like 'app_write_%') = 3, t || ': tiene las 3 politicas por rol');
    fallos := fallos + pg_temp.chk((select count(*) from pg_policies where schemaname = 'public' and tablename = t and policyname like 'soporte_no_%') = 3, t || ': tiene las 3 politicas del modo soporte');
    fallos := fallos + pg_temp.chk(exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal), t || ': tiene el trigger de solo lectura de soporte');
  end loop;
  fallos := fallos + pg_temp.chk(exists (select 1 from pg_trigger g where g.tgrelid = 'public.inventario_compras'::regclass and g.tgname = 'proteger_borrado_logico' and not g.tgisinternal), 'inventario_compras: anular exige el permiso delete');
  fallos := fallos + pg_temp.chk(exists (select 1 from pg_trigger g where g.tgrelid = 'public.costos'::regclass and g.tgname = 'proteger_borrado_logico' and not g.tgisinternal), 'costos: anular exige el permiso delete');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Administrador: compra, consume y ve todo
  perform pg_temp.como(u_admin, m_admin);
  compra := public.registrar_compra_inventario(prod_a, current_date, 10, 'kg', 10, 50000, 'prueba admin');
  select count(*) into n from public.inventario_compras;
  reset role;
  fallos := fallos + pg_temp.chk(compra is not null and n = 1, 'admin registra una compra y la ve');

  perform pg_temp.como(u_admin, m_admin);
  begin
    perform public.consumir_stock_valorizado(prod_a, 1, 'fumigacion', gen_random_uuid(), null, null, current_date, 'prueba admin');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null, 'admin consume stock valorizado' || coalesce(': ' || msg, ''));

  -- ---- 3. Operador por defecto: compra y consume, pero no anula
  perform pg_temp.como(u_oper, m_oper);
  begin
    compra_op := public.registrar_compra_inventario(prod_a, current_date, 5, 'kg', 5, 20000, 'prueba operador');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null and compra_op is not null, 'operador registra una compra (ver, crear y editar)' || coalesce(': ' || msg, ''));

  perform pg_temp.como(u_oper, m_oper);
  begin
    perform public.consumir_stock_valorizado(prod_a, 1, 'fumigacion', gen_random_uuid(), null, null, current_date, 'prueba operador');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null, 'operador consume stock valorizado' || coalesce(': ' || msg, ''));

  perform pg_temp.como(u_oper, m_oper);
  begin
    perform public.anular_compra_inventario(compra);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg ilike '%No tienes permiso%', 'operador NO puede anular una compra: ' || coalesce(left(msg, 70), 'sin error'));

  perform pg_temp.como(u_oper, m_oper);
  begin
    update public.costos set anulada = true where organizacion_id = org_a;
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg ilike '%No tienes permiso%', 'operador NO puede anular un costo directamente: ' || coalesce(left(msg, 70), 'sin error'));

  -- ---- 4. Solo lectura: ve, pero no escribe (ni por funcion ni directo)
  perform pg_temp.como(u_lect, m_lect);
  select count(*) into n from public.inventario_compras;
  reset role;
  fallos := fallos + pg_temp.chk(n = 2, 'lectura ve las compras de su empresa (' || n || ')');

  perform pg_temp.como(u_lect, m_lect);
  begin
    insert into public.inventario_compras (producto_id, cantidad, unidad, cantidad_stock, precio_total, costo_unitario, organizacion_id)
    values (prod_a, 1, 'kg', 1, 1000, 1000, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'lectura NO puede insertar una compra directo: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_lect, m_lect);
  begin
    insert into public.consumos_valorizados (producto_id, cantidad_stock, origen_tipo, origen_id, organizacion_id)
    values (prod_a, 1, 'fumigacion', gen_random_uuid(), org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'lectura NO puede insertar un consumo directo: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_lect, m_lect);
  update public.inventario_compras set anulada = true where organizacion_id = org_a;
  get diagnostics n = row_count;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'lectura NO puede anular compras directo (' || n || ' filas)');

  perform pg_temp.como(u_lect, m_lect);
  begin
    perform public.registrar_compra_inventario(prod_a, current_date, 1, 'kg', 1, 1000, 'no deberia');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'lectura NO puede registrar una compra por la funcion: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  -- ---- 5. Operador con inventario solo "ver": tampoco escribe
  perform pg_temp.como(u_ver, m_ver);
  begin
    perform public.registrar_compra_inventario(prod_a, current_date, 1, 'kg', 1, 1000, 'no deberia');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'operador con inventario solo ver NO compra: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_ver, m_ver);
  begin
    perform public.consumir_stock_valorizado(prod_a, 1, 'fumigacion', gen_random_uuid(), null, null, current_date, 'no deberia');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'operador con inventario solo ver NO consume: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  -- ---- 6. Administrador anula: sigue funcionando
  perform pg_temp.como(u_admin, m_admin);
  begin
    perform public.anular_compra_inventario(compra_op);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null, 'admin anula una compra' || coalesce(': ' || msg, ''));

  -- ---- 7. Aislamiento entre empresas
  perform pg_temp.como(u_admin_b, m_admin_b);
  select count(*) into n from public.inventario_compras;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'admin de otra empresa no ve las compras de A (' || n || ')');

  perform pg_temp.como(u_admin_b, m_admin_b);
  begin
    insert into public.inventario_compras (producto_id, cantidad, unidad, cantidad_stock, precio_total, costo_unitario, organizacion_id)
    values (prod_b, 1, 'kg', 1, 1000, 1000, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'admin de otra empresa NO inserta una compra a nombre de A: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  -- ---- 8. Modo soporte: sin concesion no ve; con concesion lee, pero no escribe
  perform pg_temp.como(u_socio, m_socio);
  select count(*) into n from public.inventario_compras;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'socio sin concesion no ve las compras de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  acceso := public.soporte_solicitar(org_a, 'Prueba del refuerzo de compras');
  reset role;
  perform pg_temp.como(u_admin, m_admin);
  perform public.soporte_responder(acceso, true, 1);
  reset role;

  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_entrar(acceso);
  select count(*) into n from public.inventario_compras;
  reset role;
  fallos := fallos + pg_temp.chk(n = 2, 'en soporte el socio LEE las compras de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  select count(*) into n from public.consumos_valorizados;
  reset role;
  fallos := fallos + pg_temp.chk(n = 2, 'en soporte el socio LEE los consumos de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  begin
    insert into public.inventario_compras (producto_id, cantidad, unidad, cantidad_stock, precio_total, costo_unitario, organizacion_id)
    values (prod_a, 1, 'kg', 1, 1000, 1000, org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'en soporte NO se inserta una compra: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  begin
    update public.inventario_compras set notas = 'tocado en soporte' where organizacion_id = org_a;
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg ilike '%solo lectura%', 'en soporte NO se edita una compra: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  begin
    perform public.registrar_compra_inventario(prod_a, current_date, 1, 'kg', 1, 1000, 'no deberia');
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'en soporte NO se registra una compra por la funcion: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_salir();
  select count(*) into n from public.inventario_compras;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'al salir de soporte vuelve a no ver las compras (' || n || ')');

  -- ---- 9. Nada de datos reales tocado
  fallos := fallos + pg_temp.chk((select count(*) from public.inventario_compras where organizacion_id not in (org_a, org_b)) >= 0, 'las pruebas solo escribieron en empresas temporales');

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: el refuerzo de compras respeta roles, acciones, empresas y modo soporte.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
