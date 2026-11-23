-- Pruebas de las fumigaciones atomicas contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/operaciones-atomicas-fumigaciones-2026-11-18.sql.
-- Crea empresas, personas, un campo, bloques, productos y fumigaciones temporales; todo se deshace con rollback al final.
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

-- Ejecuta una sentencia suelta como esa persona y devuelve las filas afectadas (o -1 si dio error).
create function pg_temp.filas(p_uid uuid, p_mail text, p_sql text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  perform pg_temp.como(p_uid, p_mail);
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then n := -1;
  end;
  execute 'reset role';
  return n;
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
  m_admin text := 'atomica-f-admin-' || suf || '@example.test';
  m_oper text := 'atomica-f-operador-' || suf || '@example.test';
  m_borra text := 'atomica-f-borra-' || suf || '@example.test';
  m_lect text := 'atomica-f-lectura-' || suf || '@example.test';
  m_admin_b text := 'atomica-f-adminb-' || suf || '@example.test';
  m_socio text := 'atomica-f-socio-' || suf || '@example.test';
  campo_a uuid;
  cultivo_a uuid;
  bloque_1 uuid;
  bloque_2 uuid;
  plant_1 uuid;
  prod_a uuid;
  prod_b uuid;
  r jsonb;
  f1 uuid;
  f2 uuid;
  f_op uuid;
  f_cant integer;
  b_cant integer;
  p_cant integer;
  stock numeric;
  stock2 numeric;
  fecha_antes date;
  n bigint;
  acceso uuid;
  carga text;
  carga_reg text;
  carga_edit text;
  tbl text;
begin
  -- ---- Personas, empresas, campo, bloques y productos temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_borra, m_borra), (u_lect, m_lect), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);

  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A atomicas', 'atomica-fa-' || suf, true),
    (org_b, 'Empresa B atomicas', 'atomica-fb-' || suf, true),
    (org_s, 'Empresa socio atomicas', 'atomica-fs-' || suf, true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_borra, 'Operador que borra A', 'operador', true, u_borra, org_a, '{"fumigaciones":["view","create","edit","delete"]}'::jsonb),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);
  insert into private.platform_admins (user_id) values (u_socio);

  insert into public.campos (nombre, organizacion_id) values ('Campo prueba A ' || suf, org_a) returning id into campo_a;
  insert into public.cultivos (nombre, organizacion_id) values ('Cultivo prueba ' || suf, org_a) returning id into cultivo_a;
  insert into public.bloques (campo_id, codigo, organizacion_id) values (campo_a, 'PA-1-' || suf, org_a) returning id into bloque_1;
  insert into public.bloques (campo_id, codigo, organizacion_id) values (campo_a, 'PA-2-' || suf, org_a) returning id into bloque_2;
  insert into public.plantaciones (bloque_id, cultivo_id, fecha_siembra, activa, organizacion_id) values (bloque_1, cultivo_a, current_date - 30, true, org_a) returning id into plant_1;
  -- Producto con stock valorizado (100 kg a 10.000 c/u) y otro con poco stock
  insert into public.productos (nombre, unidad, stock_actual, stock_valorizado, valor_stock, stock_sin_valor, organizacion_id)
  values ('Producto prueba A ' || suf, 'kg', 100, 100, 1000000, 0, org_a) returning id into prod_a;
  insert into public.productos (nombre, unidad, stock_actual, stock_valorizado, valor_stock, stock_sin_valor, organizacion_id)
  values ('Producto escaso ' || suf, 'kg', 3, 0, 0, 3, org_a) returning id into prod_b;

  -- ---- 1. Estructura
  foreach tbl in array array['public.registrar_fumigaciones(jsonb)', 'public.editar_fumigacion(uuid,jsonb)', 'public.anular_fumigacion(uuid,text)',
      'private.consumir_stock_con_faltante(uuid,numeric,text,text,uuid,uuid,uuid,date,text)', 'private.devolver_stock_fumigacion(uuid)', 'private.guardar_detalle_fumigacion(uuid,jsonb,date,text)'] loop
    fallos := fallos + pg_temp.chk(to_regprocedure(tbl) is not null, 'existe ' || tbl);
  end loop;
  fallos := fallos + pg_temp.chk(not exists (select 1 from pg_proc where prosecdef and proname in ('registrar_fumigaciones', 'editar_fumigacion', 'anular_fumigacion',
      'consumir_stock_con_faltante', 'devolver_stock_fumigacion', 'guardar_detalle_fumigacion')), 'ninguna funcion es SECURITY DEFINER (respetan los permisos de quien las llama)');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Administrador registra dos aplicaciones (una con cultivo activo, otra sin) de una vez
  carga := jsonb_build_object(
    'campo_id', campo_a, 'tipo', 'fumigacion', 'fecha', current_date, 'operario', 'Prueba', 'notas', 'prueba atomica', 'tanque_litros', 200,
    'aplicaciones', jsonb_build_array(
      jsonb_build_object('tanques_cantidad', 2,
        'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_1, 'cultivo_snapshot', 'Cultivo prueba', 'plantacion_id', plant_1)),
        'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'dosis', '5 kg', 'cantidad', 5, 'unidad_uso', 'kg', 'descuento_stock', 10))),
      jsonb_build_object('tanques_cantidad', 1,
        'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'cultivo_snapshot', null, 'plantacion_id', null)),
        'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'dosis', '5 kg', 'cantidad', 5, 'unidad_uso', 'kg', 'descuento_stock', 10))))
  )::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fumigaciones(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'ids' and jsonb_array_length(r -> 'ids') = 2 and jsonb_array_length(r -> 'faltantes') = 0, 'admin registra 2 fumigaciones de una vez, sin faltantes' || coalesce(': ' || (r ->> 'error'), ''));
  f1 := (r -> 'ids' ->> 0)::uuid;
  f2 := (r -> 'ids' ->> 1)::uuid;
  select stock_actual into stock from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock = 80, 'el stock bajo de 100 a 80 (10 por aplicacion): ' || stock);
  fallos := fallos + pg_temp.chk((select count(*) from public.fumigacion_bloques where fumigacion_id in (f1, f2)) = 2
    and (select count(*) from public.fumigacion_productos where fumigacion_id in (f1, f2)) = 2, 'cada fumigacion quedo con su bloque y su producto');
  fallos := fallos + pg_temp.chk((select count(*) from public.consumos_valorizados where origen_id = f1) = 1 and (select count(*) from public.consumos_valorizados where origen_id = f2) = 0,
    'con cultivo activo se registro el consumo valorizado (costo); sin cultivo, solo el movimiento');
  fallos := fallos + pg_temp.chk((select count(*) from public.inventario_movimientos where origen_id in (f1, f2) or referencia_id in (f1::text, f2::text)) = 2, 'quedaron 2 movimientos de inventario');

  -- ---- 3. Atomicidad: si la segunda aplicacion falla, NO queda guardada la primera
  select count(*) into f_cant from public.fumigaciones where organizacion_id = org_a;
  select count(*) into b_cant from public.fumigacion_bloques where organizacion_id = org_a;
  carga := jsonb_build_object('campo_id', campo_a, 'tipo', 'fumigacion', 'fecha', current_date,
    'aplicaciones', jsonb_build_array(
      jsonb_build_object('tanques_cantidad', 1, 'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_1, 'plantacion_id', plant_1)),
        'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'dosis', '1 kg', 'cantidad', 1, 'unidad_uso', 'kg', 'descuento_stock', 7))),
      jsonb_build_object('tanques_cantidad', 1, 'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2)),
        'productos', jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'dosis', '1 kg', 'cantidad', 1, 'unidad_uso', 'kg', 'descuento_stock', 1)))))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fumigaciones(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'error', 'si una aplicacion falla la funcion da error: ' || coalesce(left(r ->> 'error', 60), 'NO DIO ERROR'));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk((select count(*) from public.fumigaciones where organizacion_id = org_a) = f_cant
    and (select count(*) from public.fumigacion_bloques where organizacion_id = org_a) = b_cant and stock2 = stock,
    'no quedo NADA a medias: mismas fumigaciones, mismos bloques y mismo stock (' || stock2 || ')');

  -- ---- 4. Stock insuficiente: se guarda igual, descuenta lo que hay y avisa del faltante
  carga := jsonb_build_object('campo_id', campo_a, 'tipo', 'foliar', 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('tanques_cantidad', 1, 'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2)),
      'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_b, 'dosis', '5 kg', 'cantidad', 5, 'unidad_uso', 'kg', 'descuento_stock', 5)))))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fumigaciones(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'ids' and jsonb_array_length(r -> 'faltantes') = 1 and (r -> 'faltantes' -> 0 ->> 'faltante')::numeric = 2
    and (r -> 'faltantes' -> 0 ->> 'disponible')::numeric = 3, 'con stock insuficiente se guarda y devuelve el faltante (2 de 5, habia 3)' || coalesce(': ' || (r ->> 'error'), ''));
  select stock_actual into stock2 from public.productos where id = prod_b;
  fallos := fallos + pg_temp.chk(stock2 = 0, 'el stock del producto escaso quedo en 0');
  fallos := fallos + pg_temp.chk((select descuento_stock from public.fumigacion_productos where fumigacion_id = (r -> 'ids' ->> 0)::uuid) = 3,
    'lo anotado en el producto es lo realmente descontado (3), para que una devolucion no invente stock');
  fallos := fallos + pg_temp.chk(exists (select 1 from public.inventario_movimientos where producto_id = prod_b and detalle ilike '%faltaron 2%'), 'el movimiento de inventario anota "faltaron 2"');

  -- ---- 5. Editar: devuelve el stock, reemplaza (sin duplicar) y descuenta de nuevo
  select stock_actual into stock from public.productos where id = prod_a;   -- 80
  carga := jsonb_build_object('campo_id', campo_a, 'tipo', 'foliar', 'fecha', current_date, 'tanques_cantidad', 3, 'tanque_litros', 200,
    'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_1, 'cultivo_snapshot', 'Cultivo prueba', 'plantacion_id', plant_1)),
    'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'dosis', '15 kg', 'cantidad', 15, 'unidad_uso', 'kg', 'descuento_stock', 30)))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.editar_fumigacion(%L, %L::jsonb)', f1, carga));
  fallos := fallos + pg_temp.chk(r ? 'id' and jsonb_array_length(r -> 'faltantes') = 0, 'admin edita una fumigacion' || coalesce(': ' || (r ->> 'error'), ''));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock2 = stock + 10 - 30, 'editar devolvio 10 y descuento 30: stock ' || stock || ' -> ' || stock2);
  select count(*) into b_cant from public.fumigacion_bloques where fumigacion_id = f1;
  select count(*) into p_cant from public.fumigacion_productos where fumigacion_id = f1;
  fallos := fallos + pg_temp.chk(b_cant = 1 and p_cant = 1, 'al editar NO se duplican bloques ni productos (bloques ' || b_cant || ', productos ' || p_cant || ')');
  fallos := fallos + pg_temp.chk((select tipo from public.fumigaciones where id = f1) = 'foliar' and (select tanques_cantidad from public.fumigaciones where id = f1) = 3, 'los datos de la fumigacion quedaron actualizados');

  -- ---- 6. Operador (sin "eliminar"): puede registrar; NO puede reemplazar el detalle al editar -> falla entera, sin duplicar
  carga_reg := jsonb_build_object('campo_id', campo_a, 'tipo', 'fumigacion', 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('tanques_cantidad', 1, 'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2)),
      'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'dosis', '1 kg', 'cantidad', 1, 'unidad_uso', 'kg', 'descuento_stock', 2)))))::text;
  r := pg_temp.llamar(u_oper, m_oper, format('select public.registrar_fumigaciones(%L::jsonb)', carga_reg));
  fallos := fallos + pg_temp.chk(r ? 'ids', 'operador registra una fumigacion' || coalesce(': ' || (r ->> 'error'), ''));
  f_op := (r -> 'ids' ->> 0)::uuid;

  -- La causa de fondo: sin "eliminar" borrar el detalle no hace nada (y la pantalla vieja lo ignoraba, duplicando)
  n := pg_temp.filas(u_oper, m_oper, format('delete from public.fumigacion_bloques where fumigacion_id = %L', f_op));
  fallos := fallos + pg_temp.chk(n = 0 and exists (select 1 from public.fumigacion_bloques where fumigacion_id = f_op), 'el operador NO puede borrar el detalle de una fumigacion (0 filas, sin error)');

  select stock_actual into stock from public.productos where id = prod_a;
  select fecha into fecha_antes from public.fumigaciones where id = f_op;
  carga_edit := jsonb_build_object('campo_id', campo_a, 'tipo', 'foliar', 'fecha', current_date - 1, 'tanques_cantidad', 1,
    'bloques', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2)),
    'productos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'dosis', '1 kg', 'cantidad', 1, 'unidad_uso', 'kg', 'descuento_stock', 4)))::text;
  r := pg_temp.llamar(u_oper, m_oper, format('select public.editar_fumigacion(%L, %L::jsonb)', f_op, carga_edit));
  fallos := fallos + pg_temp.chk(r ->> 'estado' = '42501', 'el operador no puede editar el detalle: da error claro (' || coalesce(left(r ->> 'error', 70), 'NO DIO ERROR') || ')');
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock2 = stock and (select fecha from public.fumigaciones where id = f_op) = fecha_antes
    and (select count(*) from public.fumigacion_bloques where fumigacion_id = f_op) = 1 and (select count(*) from public.fumigacion_productos where fumigacion_id = f_op) = 1,
    'el intento fallido no cambio nada: ni stock, ni fecha, ni duplico el detalle');

  -- ---- 7. Anular: el operador no puede (hace falta "eliminar"); con ese permiso o siendo admin si, y devuelve el stock
  r := pg_temp.llamar(u_oper, m_oper, format('select public.anular_fumigacion(%L, %L)', f_op, 'prueba'));
  fallos := fallos + pg_temp.chk(r ? 'error', 'el operador NO puede anular: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock2 = stock and not (select anulada from public.fumigaciones where id = f_op), 'el anular fallido no devolvio stock ni marco la fumigacion');

  r := pg_temp.llamar(u_borra, m_borra, format('select public.anular_fumigacion(%L, %L)', f_op, 'prueba con permiso'));
  fallos := fallos + pg_temp.chk(r ? 'id', 'el operador con "eliminar" a medida SI anula' || coalesce(': ' || (r ->> 'error'), ''));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock2 = stock + 2 and (select anulada from public.fumigaciones where id = f_op), 'anular devolvio su stock (+2) y la marco como anulada');
  r := pg_temp.llamar(u_admin, m_admin, format('select public.anular_fumigacion(%L, %L)', f_op, 'otra vez'));
  fallos := fallos + pg_temp.chk(r ? 'error', 'anular dos veces da error y no devuelve stock dos veces');
  select stock_actual into stock from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock = stock2, 'el stock no cambio con el segundo intento');

  -- ---- 8. Solo lectura: no puede registrar, editar ni anular, y no queda nada
  select count(*) into f_cant from public.fumigaciones where organizacion_id = org_a;
  r := pg_temp.llamar(u_lect, m_lect, format('select public.registrar_fumigaciones(%L::jsonb)', carga_reg));
  fallos := fallos + pg_temp.chk(r ? 'error' and (select count(*) from public.fumigaciones where organizacion_id = org_a) = f_cant, 'lectura NO registra: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_lect, m_lect, format('select public.editar_fumigacion(%L, %L::jsonb)', f1, carga_edit));
  fallos := fallos + pg_temp.chk(r ? 'error', 'lectura NO edita: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_lect, m_lect, format('select public.anular_fumigacion(%L, %L)', f1, 'no'));
  fallos := fallos + pg_temp.chk(r ? 'error' and not (select anulada from public.fumigaciones where id = f1), 'lectura NO anula: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));

  -- ---- 9. Aislamiento entre empresas
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.editar_fumigacion(%L, %L::jsonb)', f1, carga_edit));
  fallos := fallos + pg_temp.chk(r ? 'error', 'admin de otra empresa NO edita fumigaciones de A: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.anular_fumigacion(%L, %L)', f1, 'no'));
  fallos := fallos + pg_temp.chk(r ? 'error' and not (select anulada from public.fumigaciones where id = f1), 'admin de otra empresa NO anula fumigaciones de A');

  -- ---- 10. Modo soporte: el socio con concesion lee, pero no puede registrar, editar ni anular
  perform pg_temp.como(u_socio, m_socio);
  acceso := public.soporte_solicitar(org_a, 'Prueba de fumigaciones atomicas');
  reset role;
  perform pg_temp.como(u_admin, m_admin);
  perform public.soporte_responder(acceso, true, 1);
  reset role;
  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_entrar(acceso);
  reset role;
  r := pg_temp.llamar(u_socio, m_socio, format('select public.registrar_fumigaciones(%L::jsonb)', carga_reg));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se registra: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_socio, m_socio, format('select public.editar_fumigacion(%L, %L::jsonb)', f1, carga_edit));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se edita: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_socio, m_socio, format('select public.anular_fumigacion(%L, %L)', f1, 'no'));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se anula: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_salir();
  reset role;

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: las fumigaciones atomicas guardan todo o nada y respetan roles, permisos, empresas y modo soporte.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
