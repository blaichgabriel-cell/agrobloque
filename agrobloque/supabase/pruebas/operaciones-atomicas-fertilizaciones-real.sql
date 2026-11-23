-- Pruebas de las fertilizaciones atomicas contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/operaciones-atomicas-fumigaciones-2026-11-18.sql y
-- supabase/operaciones-atomicas-fertilizaciones-2026-11-23.sql.
-- Crea empresas, personas, un campo, bloques, productos, un plan y fertilizaciones temporales; todo se deshace con rollback al final.
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
  m_admin text := 'atomica-z-admin-' || suf || '@example.test';
  m_oper text := 'atomica-z-operador-' || suf || '@example.test';
  m_borra text := 'atomica-z-borra-' || suf || '@example.test';
  m_lect text := 'atomica-z-lectura-' || suf || '@example.test';
  m_admin_b text := 'atomica-z-adminb-' || suf || '@example.test';
  m_socio text := 'atomica-z-socio-' || suf || '@example.test';
  campo_a uuid;
  cultivo_a uuid;
  bloque_1 uuid;
  bloque_2 uuid;
  plant_1 uuid;
  prod_a uuid;
  prod_b uuid;
  plan_a uuid;
  g1 uuid := gen_random_uuid();
  g2 uuid := gen_random_uuid();
  g3 uuid := gen_random_uuid();
  g_op uuid := gen_random_uuid();
  g_viejo uuid := gen_random_uuid();
  g_nuevo uuid := gen_random_uuid();
  ids1 uuid[];
  ids2 uuid[];
  ids_op uuid[];
  ids_viejo uuid[];
  ids_nuevo uuid[];
  r jsonb;
  carga text;
  carga_reg text;
  stock numeric;
  stock2 numeric;
  f_cant integer;
  s_cant integer;
  acceso uuid;
begin
  -- ---- Personas, empresas, campo, bloques, productos y plan temporales
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values (u_admin, m_admin), (u_oper, m_oper), (u_borra, m_borra), (u_lect, m_lect), (u_admin_b, m_admin_b), (u_socio, m_socio)) as u(id, mail);

  insert into public.organizaciones (id, nombre, slug, activo) values
    (org_a, 'Empresa A fertilizaciones atomicas', 'atomica-za-' || suf, true),
    (org_b, 'Empresa B fertilizaciones atomicas', 'atomica-zb-' || suf, true),
    (org_s, 'Empresa socio fertilizaciones atomicas', 'atomica-zs-' || suf, true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id, acciones) values
    (m_admin, 'Admin A', 'admin', true, u_admin, org_a, null),
    (m_oper, 'Operador A', 'operador', true, u_oper, org_a, null),
    (m_borra, 'Operador que borra A', 'operador', true, u_borra, org_a, '{"plan_nutricional":["view","create","edit","delete"]}'::jsonb),
    (m_lect, 'Lectura A', 'lectura', true, u_lect, org_a, null),
    (m_admin_b, 'Admin B', 'admin', true, u_admin_b, org_b, null),
    (m_socio, 'Socio', 'admin', true, u_socio, org_s, null);
  insert into private.platform_admins (user_id) values (u_socio);

  insert into public.campos (nombre, organizacion_id) values ('Campo prueba A ' || suf, org_a) returning id into campo_a;
  insert into public.cultivos (nombre, organizacion_id) values ('Cultivo prueba ' || suf, org_a) returning id into cultivo_a;
  insert into public.bloques (campo_id, codigo, organizacion_id) values (campo_a, 'ZA-1-' || suf, org_a) returning id into bloque_1;
  insert into public.bloques (campo_id, codigo, organizacion_id) values (campo_a, 'ZA-2-' || suf, org_a) returning id into bloque_2;
  insert into public.plantaciones (bloque_id, cultivo_id, fecha_siembra, activa, organizacion_id) values (bloque_1, cultivo_a, current_date - 30, true, org_a) returning id into plant_1;
  insert into public.productos (nombre, unidad, stock_actual, stock_valorizado, valor_stock, stock_sin_valor, organizacion_id)
  values ('Fertilizante prueba A ' || suf, 'kg', 100, 100, 1000000, 0, org_a) returning id into prod_a;
  insert into public.productos (nombre, unidad, stock_actual, stock_valorizado, valor_stock, stock_sin_valor, organizacion_id)
  values ('Fertilizante escaso ' || suf, 'kg', 3, 0, 0, 3, org_a) returning id into prod_b;
  insert into public.fertilizacion_planes (bloque_id, nombre, organizacion_id) values (bloque_1, 'Plan prueba ' || suf, org_a) returning id into plan_a;
  insert into public.tareas (tipo, descripcion, fecha_programada, completada, origen_tipo, origen_id, organizacion_id)
  values ('fertiriego', 'Tarea del plan de prueba', current_date, false, 'fertilizacion_plan', plan_a, org_a);

  -- ---- 1. Estructura
  foreach carga in array array['public.registrar_fertilizacion(jsonb)', 'public.editar_fertilizacion(uuid[],uuid,jsonb,jsonb)', 'public.anular_fertilizacion(uuid[],uuid,text,jsonb)',
      'private.guardar_fertilizacion(jsonb)', 'private.devolver_stock_fertilizacion(uuid,jsonb,text)'] loop
    fallos := fallos + pg_temp.chk(to_regprocedure(carga) is not null, 'existe ' || carga);
  end loop;
  fallos := fallos + pg_temp.chk(not exists (select 1 from pg_proc where prosecdef and proname in ('registrar_fertilizacion', 'editar_fertilizacion', 'anular_fertilizacion',
      'guardar_fertilizacion', 'devolver_stock_fertilizacion')), 'ninguna funcion es SECURITY DEFINER (respetan los permisos de quien las llama)');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');

  -- ---- 2. Administrador registra una aplicacion en 2 bloques (uno con cultivo activo, otro sin) con seguimiento del plan
  carga := jsonb_build_object('grupo_id', g1, 'fecha', current_date, 'planes_completar', jsonb_build_array(plan_a),
    'aplicaciones', jsonb_build_array(
      jsonb_build_object('bloque_id', bloque_1, 'plantacion_id', plant_1, 'plan_id', plan_a, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
        'notas', 'prueba atomica', 'soluciones', jsonb_build_array(jsonb_build_object('nombre', 'A')), 'detalle', 'Bloque ZA-1',
        'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 10))),
      jsonb_build_object('bloque_id', bloque_2, 'plantacion_id', null, 'plan_id', null, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
        'notas', 'prueba atomica', 'soluciones', jsonb_build_array(jsonb_build_object('nombre', 'A')), 'detalle', 'Bloque ZA-2',
        'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 10)))),
    'seguimiento', jsonb_build_array(jsonb_build_object('plan_id', plan_a, 'bloque_id', bloque_1, 'plantacion_id', plant_1, 'litros_aplicados', 200, 'tanques_aplicados', 1,
      'estado', 'completa', 'productos', jsonb_build_array(), 'notas', null))
  )::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'ids' and jsonb_array_length(r -> 'ids') = 2 and jsonb_array_length(r -> 'faltantes') = 0, 'admin registra una aplicacion en 2 bloques, sin faltantes' || coalesce(': ' || (r ->> 'error'), ''));
  ids1 := array(select jsonb_array_elements_text(r -> 'ids')::uuid);
  select stock_actual into stock from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock = 80, 'el stock bajo de 100 a 80: ' || stock);
  fallos := fallos + pg_temp.chk((select count(*) from public.fertilizaciones where grupo_id = g1) = 2, 'quedaron las 2 filas del grupo');
  fallos := fallos + pg_temp.chk((select count(*) from public.consumos_valorizados where origen_id = g1) = 1, 'solo el bloque con cultivo activo tiene consumo valorizado (costo)');
  fallos := fallos + pg_temp.chk((select count(*) from public.fertilizacion_plan_aplicaciones where plan_id = plan_a) = 1, 'se guardo el seguimiento del plan');
  fallos := fallos + pg_temp.chk((select completada from public.tareas where origen_id = plan_a), 'la tarea del plan quedo completada');

  -- ---- 3. Atomicidad: un fallo al final (seguimiento con un plan que no existe) deshace TODO, incluido el stock ya descontado
  select count(*) into f_cant from public.fertilizaciones where organizacion_id = org_a;
  select count(*) into s_cant from public.fertilizacion_plan_aplicaciones where plan_id = plan_a;
  carga := jsonb_build_object('grupo_id', g2, 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_1, 'plantacion_id', plant_1, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
      'soluciones', jsonb_build_array(), 'detalle', 'Bloque ZA-1', 'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 7)))),
    'seguimiento', jsonb_build_array(jsonb_build_object('plan_id', gen_random_uuid(), 'bloque_id', bloque_1, 'litros_aplicados', 1, 'tanques_aplicados', 1, 'estado', 'completa')))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'error', 'si el ultimo paso falla la funcion da error: ' || coalesce(left(r ->> 'error', 60), 'NO DIO ERROR'));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk((select count(*) from public.fertilizaciones where organizacion_id = org_a) = f_cant
    and (select count(*) from public.fertilizacion_plan_aplicaciones where plan_id = plan_a) = s_cant and stock2 = stock,
    'no quedo NADA a medias: mismas filas, mismo seguimiento y mismo stock (' || stock2 || ')');

  -- ---- 4. Stock insuficiente: se guarda igual, descuenta lo que hay y avisa del faltante
  carga := jsonb_build_object('grupo_id', g3, 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
      'soluciones', jsonb_build_array(), 'detalle', 'Bloque ZA-2', 'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_b, 'cantidad', 5)))))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'ids' and jsonb_array_length(r -> 'faltantes') = 1 and (r -> 'faltantes' -> 0 ->> 'faltante')::numeric = 2
    and (r -> 'faltantes' -> 0 ->> 'disponible')::numeric = 3, 'con stock insuficiente se guarda y devuelve el faltante (2 de 5, habia 3)' || coalesce(': ' || (r ->> 'error'), ''));
  select stock_actual into stock2 from public.productos where id = prod_b;
  fallos := fallos + pg_temp.chk(stock2 = 0, 'el stock del producto escaso quedo en 0');
  fallos := fallos + pg_temp.chk(exists (select 1 from public.inventario_movimientos where producto_id = prod_b and detalle ilike '%faltaron 2%'), 'el movimiento de inventario anota "faltaron 2"');
  ids2 := array(select jsonb_array_elements_text(r -> 'ids')::uuid);

  -- ---- 5. Anular el grupo con un bloque valorizado y otro sin cultivo activo: se devuelve TODO (antes solo el valorizado)
  select stock_actual into stock from public.productos where id = prod_a;   -- 80
  r := pg_temp.llamar(u_admin, m_admin, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', ids1, g1, 'prueba'));
  fallos := fallos + pg_temp.chk(r ? 'ids', 'admin anula la aplicacion' || coalesce(': ' || (r ->> 'error'), ''));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock2 = stock + 20, 'se devolvieron los 20 (10 valorizados + 10 del bloque sin cultivo): stock ' || stock || ' -> ' || stock2);
  fallos := fallos + pg_temp.chk((select count(*) from public.fertilizaciones where grupo_id = g1 and anulada) = 2, 'las 2 filas quedaron anuladas');
  r := pg_temp.llamar(u_admin, m_admin, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', ids1, g1, 'otra vez'));
  select stock_actual into stock from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(r ? 'error' and stock = stock2, 'anular dos veces da error y no devuelve stock dos veces');

  -- ---- 6. Editar: anula la aplicacion vieja, devuelve su stock y crea la nueva (otro grupo)
  carga := jsonb_build_object('grupo_id', g_op, 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
      'soluciones', jsonb_build_array(), 'detalle', 'Bloque ZA-2', 'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 12)))))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  ids_op := array(select jsonb_array_elements_text(r -> 'ids')::uuid);
  select stock_actual into stock from public.productos where id = prod_a;     -- 100 - 12 = 88
  carga_reg := jsonb_build_object('grupo_id', g2, 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'tanque_litros', 200, 'tanques_cantidad', 2, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
      'soluciones', jsonb_build_array(), 'detalle', 'Bloque ZA-2', 'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 30)))))::text;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.editar_fertilizacion(%L::uuid[], %L, null, %L::jsonb)', ids_op, g_op, carga_reg));
  fallos := fallos + pg_temp.chk(r ? 'ids' and jsonb_array_length(r -> 'ids') = 1, 'admin edita una aplicacion' || coalesce(': ' || (r ->> 'error'), ''));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(stock2 = stock + 12 - 30, 'editar devolvio 12 y descuento 30: stock ' || stock || ' -> ' || stock2);
  fallos := fallos + pg_temp.chk((select count(*) from public.fertilizaciones where id = any(ids_op) and anulada and anulada_motivo = 'Reemplazada por edición') = 1
    and (select count(*) from public.fertilizaciones where grupo_id = g2 and not anulada) = 1, 'la vieja quedo anulada ("Reemplazada por edición") y la nueva esta activa');

  -- ---- 7. Editar una aplicacion que no existe / ya anulada: error y no cambia nada
  select stock_actual into stock from public.productos where id = prod_a;
  r := pg_temp.llamar(u_admin, m_admin, format('select public.editar_fertilizacion(%L::uuid[], %L, null, %L::jsonb)', ids_op, g_op, carga_reg));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(r ? 'error' and stock2 = stock, 'editar una aplicacion ya reemplazada da error y no toca el stock');

  -- ---- 8. Operador: registra y EDITA (reemplazar es parte de editar: el trigger lo permite); NO anula (hace falta "eliminar"); con "eliminar" a medida SI
  carga := jsonb_build_object('grupo_id', g_viejo, 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
      'soluciones', jsonb_build_array(), 'detalle', 'Bloque ZA-2', 'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 4)))))::text;
  select stock_actual into stock from public.productos where id = prod_a;
  r := pg_temp.llamar(u_oper, m_oper, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'ids', 'operador registra una aplicacion' || coalesce(': ' || (r ->> 'error'), ''));
  ids_viejo := array(select jsonb_array_elements_text(r -> 'ids')::uuid);
  r := pg_temp.llamar(u_oper, m_oper, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', ids_viejo, g_viejo, 'no'));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(r ? 'error' and stock2 = stock - 4 and not (select anulada from public.fertilizaciones where id = ids_viejo[1]),
    'el operador NO anula: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO') || ' (sin devolver stock)');
  carga_reg := jsonb_build_object('grupo_id', g_nuevo, 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'tanque_litros', 200, 'tanques_cantidad', 1, 'estado', 'completa', 'dosis_alcance', 'por_tanque',
      'soluciones', jsonb_build_array(), 'detalle', 'Bloque ZA-2', 'descuentos', jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 6)))))::text;
  r := pg_temp.llamar(u_oper, m_oper, format('select public.editar_fertilizacion(%L::uuid[], %L, null, %L::jsonb)', ids_viejo, g_viejo, carga_reg));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(r ? 'ids' and stock2 = stock - 6, 'el operador SI edita (devolvio 4 y descuento 6): stock ' || stock || ' -> ' || stock2 || coalesce(': ' || (r ->> 'error'), ''));
  ids_nuevo := array(select jsonb_array_elements_text(r -> 'ids')::uuid);
  fallos := fallos + pg_temp.chk((select count(*) from public.fertilizaciones where id = ids_viejo[1] and anulada) = 1 and (select count(*) from public.fertilizaciones where id = any(ids_nuevo) and not anulada) = 1,
    'al editar, la aplicacion vieja quedo reemplazada y la nueva esta activa');
  r := pg_temp.llamar(u_borra, m_borra, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', ids_nuevo, g_nuevo, 'con permiso'));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(r ? 'ids' and stock2 = stock, 'el operador con "eliminar" a medida SI anula y devuelve su stock (' || stock2 || ')' || coalesce(': ' || (r ->> 'error'), ''));

  -- ---- 9. Aplicaciones antiguas SIN movimientos: se usa la lista que calcula la pantalla (y solo si no hay movimientos)
  insert into public.fertilizaciones (id, bloque_id, grupo_id, fecha, organizacion_id) values (gen_random_uuid(), bloque_2, g_viejo, current_date - 400, org_a);
  select array_agg(id) into ids_viejo from public.fertilizaciones where grupo_id = g_viejo and fecha = current_date - 400;
  insert into public.fertilizaciones (id, bloque_id, grupo_id, fecha, organizacion_id) values (gen_random_uuid(), bloque_2, gen_random_uuid(), current_date - 401, org_a);
  select stock_actual into stock from public.productos where id = prod_a;
  -- grupo_id nuevo sin movimientos
  ids_viejo := array(select id from public.fertilizaciones where fecha = current_date - 401 and organizacion_id = org_a);
  r := pg_temp.llamar(u_admin, m_admin, format('select public.anular_fertilizacion(%L::uuid[], null, %L, %L::jsonb)', ids_viejo, 'antigua',
    jsonb_build_array(jsonb_build_object('producto_id', prod_a, 'cantidad', 6))::text));
  select stock_actual into stock2 from public.productos where id = prod_a;
  fallos := fallos + pg_temp.chk(r ? 'ids' and stock2 = stock + 6, 'aplicacion antigua sin movimientos: se devuelve lo que calcula la pantalla (+6): ' || stock || ' -> ' || stock2 || coalesce(' ' || (r ->> 'error'), ''));

  -- ---- 10. Solo lectura: no registra, edita ni anula
  select count(*) into f_cant from public.fertilizaciones where organizacion_id = org_a;
  carga := jsonb_build_object('grupo_id', gen_random_uuid(), 'fecha', current_date,
    'aplicaciones', jsonb_build_array(jsonb_build_object('bloque_id', bloque_2, 'estado', 'completa', 'descuentos', jsonb_build_array())))::text;
  r := pg_temp.llamar(u_lect, m_lect, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ? 'error' and (select count(*) from public.fertilizaciones where organizacion_id = org_a) = f_cant, 'lectura NO registra: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_lect, m_lect, format('select public.editar_fertilizacion(%L::uuid[], %L, null, %L::jsonb)', array(select id from public.fertilizaciones where grupo_id = g2 and not anulada), g2, carga_reg));
  fallos := fallos + pg_temp.chk(r ? 'error', 'lectura NO edita: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));
  r := pg_temp.llamar(u_lect, m_lect, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', array(select id from public.fertilizaciones where grupo_id = g2 and not anulada), g2, 'no'));
  fallos := fallos + pg_temp.chk(r ? 'error' and exists (select 1 from public.fertilizaciones where grupo_id = g2 and not anulada), 'lectura NO anula: ' || coalesce(left(r ->> 'error', 60), 'SE PERMITIO'));

  -- ---- 11. Aislamiento entre empresas
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', array(select id from public.fertilizaciones where grupo_id = g2 and not anulada), g2, 'no'));
  fallos := fallos + pg_temp.chk(r ? 'error' and exists (select 1 from public.fertilizaciones where grupo_id = g2 and not anulada), 'admin de otra empresa NO anula aplicaciones de A: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_admin_b, m_admin_b, format('select public.editar_fertilizacion(%L::uuid[], %L, null, %L::jsonb)', array(select id from public.fertilizaciones where grupo_id = g2 and not anulada), g2, carga_reg));
  fallos := fallos + pg_temp.chk(r ? 'error', 'admin de otra empresa NO edita aplicaciones de A: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));

  -- ---- 12. Modo soporte: el socio con concesion no puede registrar, editar ni anular
  perform pg_temp.como(u_socio, m_socio);
  acceso := public.soporte_solicitar(org_a, 'Prueba de fertilizaciones atomicas');
  reset role;
  perform pg_temp.como(u_admin, m_admin);
  perform public.soporte_responder(acceso, true, 1);
  reset role;
  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_entrar(acceso);
  reset role;
  r := pg_temp.llamar(u_socio, m_socio, format('select public.registrar_fertilizacion(%L::jsonb)', carga));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se registra: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  r := pg_temp.llamar(u_socio, m_socio, format('select public.anular_fertilizacion(%L::uuid[], %L, %L, null)', array(select id from public.fertilizaciones where grupo_id = g2 and not anulada), g2, 'no'));
  fallos := fallos + pg_temp.chk(r ->> 'error' ilike '%solo lectura%', 'en soporte NO se anula: ' || coalesce(left(r ->> 'error', 70), 'SE PERMITIO'));
  perform pg_temp.como(u_socio, m_socio);
  perform public.soporte_salir();
  reset role;

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: las fertilizaciones atomicas guardan todo o nada y respetan roles, permisos, empresas y modo soporte.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
