-- Pruebas del refuerzo de las otras tablas contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/refuerzo-otras-tablas-2026-11-18.sql.
-- Crea empresas, personas y filas temporales; todo se deshace con rollback al final.
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

-- Ejecuta una sentencia como esa persona. Devuelve 'N' (filas afectadas) o 'ERR: mensaje'.
create function pg_temp.ejecutar(p_uid uuid, p_mail text, p_sql text) returns text language plpgsql as $$
declare
  n bigint;
  res text;
begin
  perform pg_temp.como(p_uid, p_mail);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    res := n::text;
  exception when others then res := 'ERR: ' || sqlerrm;
  end;
  execute 'reset role';
  return res;
end $$;

-- Comprueba que la sentencia se permite (al menos una fila) o se bloquea (error o cero filas).
create function pg_temp.prueba(p_texto text, p_permite boolean, p_uid uuid, p_mail text, p_sql text) returns integer language plpgsql as $$
declare
  res text := pg_temp.ejecutar(p_uid, p_mail, p_sql);
  permitido boolean := res !~ '^ERR' and res::bigint > 0;
begin
  return pg_temp.chk(permitido = p_permite, p_texto || ' -> ' || case when permitido then 'permitido' else 'bloqueado (' || left(res, 60) || ')' end);
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
  u_edita uuid := gen_random_uuid();
  u_lect uuid := gen_random_uuid();
  u_ver uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_socio uuid := gen_random_uuid();
  m_admin text := 'refuerzo-o-admin-' || suf || '@example.test';
  m_oper text := 'refuerzo-o-operador-' || suf || '@example.test';
  m_borra text := 'refuerzo-o-borra-' || suf || '@example.test';
  m_edita text := 'refuerzo-o-edita-' || suf || '@example.test';
  m_lect text := 'refuerzo-o-lectura-' || suf || '@example.test';
  m_ver text := 'refuerzo-o-solover-' || suf || '@example.test';
  m_admin_b text := 'refuerzo-o-adminb-' || suf || '@example.test';
  m_socio text := 'refuerzo-o-socio-' || suf || '@example.test';
  campo_a uuid;
  prov_a uuid;
  prov_a2 uuid;
  prod_a uuid;
  plan_a uuid;
  plan_b uuid;
  plan_del uuid;
  nota_del uuid;
  fact_a uuid;
  mov_a uuid;
  pm_del uuid;
  acceso uuid;
  n bigint;
  msg text;
  tbl text;
begin
  -- ---- Personas, empresas y filas temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_borra, m_borra), (u_edita, m_edita), (u_lect, m_lect), (u_ver, m_ver), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);

  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A refuerzo otras', 'refuerzo-oa-' || suf, true),
    (org_b, 'Empresa B refuerzo otras', 'refuerzo-ob-' || suf, true),
    (org_s, 'Empresa socio refuerzo otras', 'refuerzo-os-' || suf, true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_borra, 'Operador que borra A', 'operador', true, u_borra, org_a,
      '{"plan_nutricional":["view","create","edit","delete"],"inventario":["view","delete"]}'::jsonb),
    (m_edita, 'Operador solo edita inventario A', 'operador', true, u_edita, org_a, '{"inventario":["view","edit"]}'::jsonb),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_ver, 'Operador solo ver A', 'operador', true, u_ver, org_a,
      '{"cuentas_pagar":["view"],"plan_nutricional":["view"],"asistencia":["view"],"contabilidad":["view"],"inventario":["view"]}'::jsonb),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);

  insert into private.platform_admins (user_id) values (u_socio);

  insert into public.campos (nombre, organizacion_id) values ('Campo prueba A ' || suf, org_a) returning id into campo_a;
  insert into public.proveedores_credito (nombre, organizacion_id) values ('Proveedor prueba A ' || suf, org_a) returning id into prov_a;
  insert into public.proveedores_credito (nombre, organizacion_id) values ('Proveedor borrable A ' || suf, org_a) returning id into prov_a2;
  insert into public.proveedor_movimientos (proveedor_id, tipo, concepto, monto, organizacion_id) values (prov_a, 'compra', 'Compra de prueba', 1000, org_a) returning id into pm_del;
  insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (campo_a, current_date, 'Plan A', org_a) returning id into plan_a;
  insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (campo_a, current_date, 'Plan borrable', org_a) returning id into plan_del;
  insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (campo_a, current_date, 'Plan B', org_a) returning id into plan_b;
  insert into public.asistencia_notas_dia (campo_id, fecha, trabajos, organizacion_id) values (campo_a, current_date - 3, 'Nota borrable', org_a) returning id into nota_del;
  insert into public.contabilidad_facturas (usuario_id, archivo_nombre, archivo_path, fecha_factura, proveedor, total, descripcion, organizacion_id)
  values (u_admin, 'f.pdf', org_a::text || '/' || u_admin::text || '/f.pdf', current_date, 'Proveedor', 1000, 'Factura de prueba', org_a) returning id into fact_a;
  insert into public.productos (nombre, unidad, stock_actual, organizacion_id) values ('Producto prueba A ' || suf, 'kg', 100, org_a) returning id into prod_a;
  insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (prod_a, 1, 100, 101, 'ajuste', org_a) returning id into mov_a;

  -- ---- 1. Estructura: las 30 politicas restrictivas y el modo soporte intacto
  select count(*) into n from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
    and tablename in ('proveedores_credito', 'proveedor_movimientos', 'plan_nutricional_registros', 'asistencia_notas_dia', 'contabilidad_facturas', 'inventario_movimientos')
    and (policyname like 'app_write_%' or policyname like 'app_action_%');
  fallos := fallos + pg_temp.chk(n = 30, 'existen las 30 politicas restrictivas del refuerzo (hay ' || n || ')');
  foreach tbl in array array['proveedores_credito', 'proveedor_movimientos', 'plan_nutricional_registros', 'asistencia_notas_dia', 'contabilidad_facturas', 'inventario_movimientos'] loop
    fallos := fallos + pg_temp.chk(exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = 'soporte_no_insert')
      and exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || tbl)::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal), tbl || ': sigue con la proteccion del modo soporte');
  end loop;
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Administrador: todo
  fallos := fallos + pg_temp.prueba('admin crea un proveedor', true, u_admin, m_admin, format('insert into public.proveedores_credito (nombre, organizacion_id) values (%L, %L)', 'Nuevo ' || suf, org_a));
  fallos := fallos + pg_temp.prueba('admin edita un proveedor', true, u_admin, m_admin, format('update public.proveedores_credito set notas = %L where id = %L', 'x', prov_a));
  fallos := fallos + pg_temp.prueba('admin borra un proveedor', true, u_admin, m_admin, format('delete from public.proveedores_credito where id = %L', prov_a2));
  fallos := fallos + pg_temp.prueba('admin crea un movimiento de proveedor', true, u_admin, m_admin, format('insert into public.proveedor_movimientos (proveedor_id, tipo, concepto, monto, organizacion_id) values (%L, %L, %L, 500, %L)', prov_a, 'compra', 'Otra compra', org_a));
  fallos := fallos + pg_temp.prueba('admin borra un movimiento de proveedor', true, u_admin, m_admin, format('delete from public.proveedor_movimientos where id = %L', pm_del));
  fallos := fallos + pg_temp.prueba('admin crea un registro del plan nutricional', true, u_admin, m_admin, format('insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (%L, current_date, %L, %L)', campo_a, 'Nuevo', org_a));
  fallos := fallos + pg_temp.prueba('admin edita un registro del plan nutricional', true, u_admin, m_admin, format('update public.plan_nutricional_registros set notas = %L where id = %L', 'x', plan_a));
  fallos := fallos + pg_temp.prueba('admin borra un registro del plan nutricional', true, u_admin, m_admin, format('delete from public.plan_nutricional_registros where id = %L', plan_del));
  fallos := fallos + pg_temp.prueba('admin crea una nota de asistencia', true, u_admin, m_admin, format('insert into public.asistencia_notas_dia (campo_id, fecha, trabajos, organizacion_id) values (%L, current_date - 1, %L, %L)', campo_a, 'Nota', org_a));
  fallos := fallos + pg_temp.prueba('admin borra una nota de asistencia', true, u_admin, m_admin, format('delete from public.asistencia_notas_dia where id = %L', nota_del));
  fallos := fallos + pg_temp.prueba('admin sube una factura', true, u_admin, m_admin, format('insert into public.contabilidad_facturas (usuario_id, archivo_nombre, archivo_path, fecha_factura, proveedor, total, descripcion, organizacion_id) values (%L, %L, %L, current_date, %L, 10, %L, %L)', u_admin, 'g.pdf', org_a::text || '/' || u_admin::text || '/g.pdf', 'P', 'Otra', org_a));
  fallos := fallos + pg_temp.prueba('admin rechaza una factura', true, u_admin, m_admin, format('update public.contabilidad_facturas set estado = %L where id = %L', 'rechazada', fact_a));
  fallos := fallos + pg_temp.prueba('admin ajusta stock (movimiento de inventario)', true, u_admin, m_admin, format('select public.ajustar_stock_producto(%L, 1, %L, %L, null, null)', prod_a, 'ajuste', 'inventario'));

  -- ---- 3. Operador por defecto: crea y edita, NO borra
  fallos := fallos + pg_temp.prueba('operador registra en el plan nutricional', true, u_oper, m_oper, format('insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (%L, current_date, %L, %L)', campo_a, 'Del operador', org_a));
  fallos := fallos + pg_temp.prueba('operador edita el plan nutricional', true, u_oper, m_oper, format('update public.plan_nutricional_registros set notas = %L where id = %L', 'op', plan_a));
  fallos := fallos + pg_temp.prueba('operador NO borra del plan nutricional', false, u_oper, m_oper, format('delete from public.plan_nutricional_registros where id = %L', plan_a));
  fallos := fallos + pg_temp.chk(exists (select 1 from public.plan_nutricional_registros where id = plan_a), 'el registro del plan sigue existiendo');
  fallos := fallos + pg_temp.prueba('operador registra una nota de asistencia', true, u_oper, m_oper, format('insert into public.asistencia_notas_dia (campo_id, fecha, trabajos, organizacion_id) values (%L, current_date - 2, %L, %L)', campo_a, 'Nota op', org_a));
  fallos := fallos + pg_temp.prueba('operador crea un proveedor (modulo reservado: la lectura sigue siendo del admin)', true, u_oper, m_oper, format('insert into public.proveedores_credito (nombre, organizacion_id) values (%L, %L)', 'Del operador ' || suf, org_a));
  fallos := fallos + pg_temp.prueba('operador ajusta stock (movimiento de inventario)', true, u_oper, m_oper, format('select public.ajustar_stock_producto(%L, 1, %L, %L, null, null)', prod_a, 'ajuste', 'inventario'));

  -- ---- 4. Personas con acciones a medida
  fallos := fallos + pg_temp.prueba('operador con delete a medida SI borra del plan nutricional', true, u_borra, m_borra, format('delete from public.plan_nutricional_registros where id = %L', plan_b));
  fallos := fallos + pg_temp.prueba('operador con inventario "editar" inserta un movimiento', true, u_edita, m_edita, format('insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (%L, 1, 100, 101, %L, %L)', prod_a, 'ajuste', org_a));
  fallos := fallos + pg_temp.prueba('operador con inventario "borrar" inserta un movimiento (anulaciones)', true, u_borra, m_borra, format('insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (%L, 1, 100, 101, %L, %L)', prod_a, 'ajuste', org_a));

  -- ---- 5. Solo lectura: no escribe en ninguna de las seis
  fallos := fallos + pg_temp.prueba('lectura NO crea un proveedor', false, u_lect, m_lect, format('insert into public.proveedores_credito (nombre, organizacion_id) values (%L, %L)', 'No ' || suf, org_a));
  fallos := fallos + pg_temp.prueba('lectura NO crea un movimiento de proveedor', false, u_lect, m_lect, format('insert into public.proveedor_movimientos (proveedor_id, tipo, concepto, monto, organizacion_id) values (%L, %L, %L, 1, %L)', prov_a, 'compra', 'No', org_a));
  fallos := fallos + pg_temp.prueba('lectura NO crea un registro del plan nutricional', false, u_lect, m_lect, format('insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (%L, current_date, %L, %L)', campo_a, 'No', org_a));
  fallos := fallos + pg_temp.prueba('lectura NO edita el plan nutricional', false, u_lect, m_lect, format('update public.plan_nutricional_registros set notas = %L where id = %L', 'no', plan_a));
  fallos := fallos + pg_temp.prueba('lectura NO borra del plan nutricional', false, u_lect, m_lect, format('delete from public.plan_nutricional_registros where id = %L', plan_a));
  fallos := fallos + pg_temp.prueba('lectura NO crea una nota de asistencia', false, u_lect, m_lect, format('insert into public.asistencia_notas_dia (campo_id, fecha, trabajos, organizacion_id) values (%L, current_date - 5, %L, %L)', campo_a, 'No', org_a));
  fallos := fallos + pg_temp.prueba('lectura NO sube una factura', false, u_lect, m_lect, format('insert into public.contabilidad_facturas (usuario_id, archivo_nombre, archivo_path, fecha_factura, proveedor, total, descripcion, organizacion_id) values (%L, %L, %L, current_date, %L, 10, %L, %L)', u_lect, 'h.pdf', org_a::text || '/' || u_lect::text || '/h.pdf', 'P', 'No', org_a));
  fallos := fallos + pg_temp.prueba('lectura NO inserta un movimiento de inventario', false, u_lect, m_lect, format('insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (%L, 1, 100, 101, %L, %L)', prod_a, 'ajuste', org_a));
  fallos := fallos + pg_temp.prueba('lectura NO ajusta stock', false, u_lect, m_lect, format('select public.ajustar_stock_producto(%L, 1, %L, %L, null, null)', prod_a, 'ajuste', 'inventario'));

  -- ---- 6. Operador con los modulos solo en "ver": tampoco escribe
  fallos := fallos + pg_temp.prueba('solo ver: NO crea un proveedor', false, u_ver, m_ver, format('insert into public.proveedores_credito (nombre, organizacion_id) values (%L, %L)', 'No ' || suf, org_a));
  fallos := fallos + pg_temp.prueba('solo ver: NO crea un movimiento de proveedor', false, u_ver, m_ver, format('insert into public.proveedor_movimientos (proveedor_id, tipo, concepto, monto, organizacion_id) values (%L, %L, %L, 1, %L)', prov_a, 'compra', 'No', org_a));
  fallos := fallos + pg_temp.prueba('solo ver: NO crea en el plan nutricional', false, u_ver, m_ver, format('insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (%L, current_date, %L, %L)', campo_a, 'No', org_a));
  fallos := fallos + pg_temp.prueba('solo ver: NO edita el plan nutricional', false, u_ver, m_ver, format('update public.plan_nutricional_registros set notas = %L where id = %L', 'no', plan_a));
  fallos := fallos + pg_temp.prueba('solo ver: NO crea una nota de asistencia', false, u_ver, m_ver, format('insert into public.asistencia_notas_dia (campo_id, fecha, trabajos, organizacion_id) values (%L, current_date - 6, %L, %L)', campo_a, 'No', org_a));
  fallos := fallos + pg_temp.prueba('solo ver: NO sube una factura', false, u_ver, m_ver, format('insert into public.contabilidad_facturas (usuario_id, archivo_nombre, archivo_path, fecha_factura, proveedor, total, descripcion, organizacion_id) values (%L, %L, %L, current_date, %L, 10, %L, %L)', u_ver, 'i.pdf', org_a::text || '/' || u_ver::text || '/i.pdf', 'P', 'No', org_a));
  fallos := fallos + pg_temp.prueba('solo ver: NO inserta un movimiento de inventario', false, u_ver, m_ver, format('insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (%L, 1, 100, 101, %L, %L)', prod_a, 'ajuste', org_a));

  -- ---- 7. Aislamiento entre empresas
  fallos := fallos + pg_temp.prueba('admin de otra empresa NO crea un proveedor a nombre de A', false, u_admin_b, m_admin_b, format('insert into public.proveedores_credito (nombre, organizacion_id) values (%L, %L)', 'No ' || suf, org_a));
  fallos := fallos + pg_temp.prueba('admin de otra empresa NO crea en el plan nutricional de A', false, u_admin_b, m_admin_b, format('insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (%L, current_date, %L, %L)', campo_a, 'No', org_a));
  fallos := fallos + pg_temp.prueba('admin de otra empresa NO edita el plan nutricional de A', false, u_admin_b, m_admin_b, format('update public.plan_nutricional_registros set notas = %L where id = %L', 'no', plan_a));
  fallos := fallos + pg_temp.prueba('admin de otra empresa NO inserta movimientos de A', false, u_admin_b, m_admin_b, format('insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (%L, 1, 100, 101, %L, %L)', prod_a, 'ajuste', org_a));

  -- ---- 8. Modo soporte: sin concesion no ve; con concesion lee, pero no escribe
  perform pg_temp.como(u_socio, m_socio);
  select count(*) into n from public.plan_nutricional_registros;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'socio sin concesion no ve el plan nutricional de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  acceso := public.soporte_solicitar(org_a, 'Prueba del refuerzo de las otras tablas');
  reset role;
  perform pg_temp.como(u_admin, m_admin);
  perform public.soporte_responder(acceso, true, 1);
  reset role;

  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_entrar(acceso);
  select count(*) into n from public.plan_nutricional_registros;
  reset role;
  fallos := fallos + pg_temp.chk(n >= 1, 'en soporte el socio LEE el plan nutricional de A (' || n || ')');

  perform pg_temp.como(u_socio, m_socio);
  begin
    insert into public.plan_nutricional_registros (campo_id, fecha, objetivo, organizacion_id) values (campo_a, current_date, 'No deberia', org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'en soporte NO se crea en el plan nutricional: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  begin
    insert into public.inventario_movimientos (producto_id, cantidad, stock_anterior, stock_nuevo, tipo, organizacion_id) values (prod_a, 1, 100, 101, 'ajuste', org_a);
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'en soporte NO se inserta un movimiento de inventario: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  begin
    update public.plan_nutricional_registros set notas = 'no' where id = plan_a;
    msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg ilike '%solo lectura%', 'en soporte NO se edita el plan nutricional: ' || coalesce(left(msg, 70), 'SE PERMITIO'));

  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_salir();
  select count(*) into n from public.plan_nutricional_registros;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'al salir de soporte vuelve a no ver el plan nutricional de A (' || n || ')');

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: el refuerzo de las otras tablas respeta roles, acciones, empresas y modo soporte.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
