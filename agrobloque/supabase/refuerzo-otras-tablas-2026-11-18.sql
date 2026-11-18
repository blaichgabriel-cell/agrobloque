-- AgroBloque: refuerzo de permisos en las ultimas tablas con escritura abierta (2026-11-18).
--
-- POR QUE
--   Seis tablas tenian solo el filtro por empresa y politicas permisivas que NO miran el rol ni los permisos
--   por accion. Un usuario de solo lectura (o un operador con el modulo en "solo ver") de la misma empresa
--   podia escribir hablando directo con la API; la pantalla le oculta los botones, la base no lo frenaba:
--     proveedores_credito, proveedor_movimientos   politica "..._authenticated_all" (ALL, true)
--     plan_nutricional_registros                   politicas "plan_nutricional_auth_*" (true)
--     asistencia_notas_dia                         politicas "asistencia_notas_*" (true)
--     contabilidad_facturas                        insert/update solo miran empresa y dueno de la factura
--     inventario_movimientos                       insert abierto a cualquier usuario autenticado
--   El resto de las tablas del negocio ya tiene estas dos capas (app_write_* y app_action_*).
--
-- QUE HACE (mismos nombres y patron que permisos-acciones.sql, refuerzo-compras y refuerzo-ventas)
--   app_write_<accion>_<tabla>    RESTRICTIVAS: solo admin u operador (public.app_can_write()).
--   app_action_<accion>_<tabla>   RESTRICTIVAS: permiso por accion del modulo de cada tabla:
--       proveedores_credito, proveedor_movimientos -> modulo "cuentas_pagar" (crear/editar/borrar)
--       plan_nutricional_registros                 -> modulo "plan_nutricional" (crear/editar/borrar)
--       asistencia_notas_dia                       -> modulo "asistencia" (crear/editar/borrar)
--       contabilidad_facturas                      -> modulo "contabilidad" (crear/editar; esta tabla no se borra)
--       inventario_movimientos                     -> modulo "inventario": solo insert, permitido a quien pueda
--                                                     crear, editar o borrar en inventario (lo escriben las
--                                                     funciones de compras, consumos y ajustes de stock, que
--                                                     corren con los derechos de quien las llama)
--   No toca las politicas existentes: siguen como capa base y las nuevas restricciones se suman encima.
--
-- COMO QUEDA CADA ROL (con los permisos por defecto)
--   admin     todo.
--   operador  ver, crear y editar en cada modulo; NO borrar. (Asistencia, Contabilidad y Cuentas a pagar
--             siguen siendo solo-lectura para quien no es admin por sus politicas "solo_admin_lee_*".)
--   lectura   solo ver.
--   Si a una persona se le dieron acciones a medida, se respetan.
--
-- NO CAMBIA: la lectura, el aislamiento entre empresas, el modo soporte (las seis tablas ya estan protegidas
-- con soporte_no_* y soporte_solo_lectura) ni ningun dato. No toca funciones ni triggers.
--
-- ANTES DE EJECUTAR
--   1. Hacer un respaldo (el plan Free no tiene respaldos automaticos).
--   2. Ensayarlo: cambiar el "commit;" del final por "rollback;" y ejecutar. Si no da error, no cambia nada.
--   3. Ejecutarlo UNA vez, completo, con "commit;". Es repetible.
--   4. Para deshacerlo: refuerzo-otras-tablas-2026-11-18-deshacer.sql
--
-- No toca datos: solo politicas. No declara ninguna variable llamada current_role (error del 2026-11-04).

begin;

-- ---------------------------------------------------------------------------------------------
-- Comprobaciones previas: si falta algo, se aborta antes de cambiar nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if to_regprocedure('public.app_can_write()') is null or to_regprocedure('public.app_can_action(text,text)') is null then
    raise exception 'Faltan las funciones de permisos (app_can_write / app_can_action).';
  end if;
  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'app_can_action declara la variable current_role: aplicar antes permisos-acciones-multiempresa-fix-2026-11-04.sql.';
  end if;
  foreach t in array array['proveedores_credito', 'proveedor_movimientos', 'plan_nutricional_registros',
                           'asistencia_notas_dia', 'contabilidad_facturas', 'inventario_movimientos'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'No existe public.%.', t;
    end if;
    -- El modo soporte ya debe proteger cada tabla; si no, algo anda mal y no se debe seguir.
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'soporte_no_insert')
       or not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'soporte_solo_lectura' and not g.tgisinternal) then
      raise exception 'public.% no tiene la proteccion del modo soporte. Aplicar antes modo-soporte-2026-11-11.sql.', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos por rol y por accion
--   par = {tabla, modulo, acciones}; acciones: i = crear, u = editar, d = borrar
-- ---------------------------------------------------------------------------------------------
do $$
declare
  par text[];
  pares text[][] := array[
    array['proveedores_credito',       'cuentas_pagar',    'iud'],
    array['proveedor_movimientos',     'cuentas_pagar',    'iud'],
    array['plan_nutricional_registros','plan_nutricional', 'iud'],
    array['asistencia_notas_dia',      'asistencia',       'iud'],
    array['contabilidad_facturas',     'contabilidad',     'iu']
  ];
begin
  foreach par slice 1 in array pares loop
    execute format('drop policy if exists %I on public.%I', 'app_write_insert_' || par[1], par[1]);
    execute format('drop policy if exists %I on public.%I', 'app_write_update_' || par[1], par[1]);
    execute format('drop policy if exists %I on public.%I', 'app_write_delete_' || par[1], par[1]);
    execute format('drop policy if exists %I on public.%I', 'app_action_insert_' || par[1], par[1]);
    execute format('drop policy if exists %I on public.%I', 'app_action_update_' || par[1], par[1]);
    execute format('drop policy if exists %I on public.%I', 'app_action_delete_' || par[1], par[1]);

    if position('i' in par[3]) > 0 then
      execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_can_write())',
        'app_write_insert_' || par[1], par[1]);
      execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_can_action(%L, %L))',
        'app_action_insert_' || par[1], par[1], par[2], 'create');
    end if;
    if position('u' in par[3]) > 0 then
      execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.app_can_write()) with check (public.app_can_write())',
        'app_write_update_' || par[1], par[1]);
      execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.app_can_action(%L, %L)) with check (public.app_can_action(%L, %L))',
        'app_action_update_' || par[1], par[1], par[2], 'edit', par[2], 'edit');
    end if;
    if position('d' in par[3]) > 0 then
      execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.app_can_write())',
        'app_write_delete_' || par[1], par[1]);
      execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.app_can_action(%L, %L))',
        'app_action_delete_' || par[1], par[1], par[2], 'delete');
    end if;
  end loop;
end $$;

-- Movimientos de inventario: solo se insertan (desde las funciones de compras, consumos y ajustes de stock).
drop policy if exists app_write_insert_inventario_movimientos on public.inventario_movimientos;
drop policy if exists app_action_insert_inventario_movimientos on public.inventario_movimientos;

create policy app_write_insert_inventario_movimientos on public.inventario_movimientos as restrictive
  for insert to authenticated with check (public.app_can_write());
create policy app_action_insert_inventario_movimientos on public.inventario_movimientos as restrictive
  for insert to authenticated with check (
    public.app_can_action('inventario', 'create')
    or public.app_can_action('inventario', 'edit')
    or public.app_can_action('inventario', 'delete')
  );

-- ---------------------------------------------------------------------------------------------
-- Verificacion final: si algo no quedo como se espera, se aborta y no se aplica nada.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  falta text;
begin
  select string_agg(n, ', ') into falta
  from unnest(array[
    'proveedores_credito.app_write_insert_proveedores_credito', 'proveedores_credito.app_write_update_proveedores_credito', 'proveedores_credito.app_write_delete_proveedores_credito',
    'proveedores_credito.app_action_insert_proveedores_credito', 'proveedores_credito.app_action_update_proveedores_credito', 'proveedores_credito.app_action_delete_proveedores_credito',
    'proveedor_movimientos.app_write_insert_proveedor_movimientos', 'proveedor_movimientos.app_write_update_proveedor_movimientos', 'proveedor_movimientos.app_write_delete_proveedor_movimientos',
    'proveedor_movimientos.app_action_insert_proveedor_movimientos', 'proveedor_movimientos.app_action_update_proveedor_movimientos', 'proveedor_movimientos.app_action_delete_proveedor_movimientos',
    'plan_nutricional_registros.app_write_insert_plan_nutricional_registros', 'plan_nutricional_registros.app_write_update_plan_nutricional_registros', 'plan_nutricional_registros.app_write_delete_plan_nutricional_registros',
    'plan_nutricional_registros.app_action_insert_plan_nutricional_registros', 'plan_nutricional_registros.app_action_update_plan_nutricional_registros', 'plan_nutricional_registros.app_action_delete_plan_nutricional_registros',
    'asistencia_notas_dia.app_write_insert_asistencia_notas_dia', 'asistencia_notas_dia.app_write_update_asistencia_notas_dia', 'asistencia_notas_dia.app_write_delete_asistencia_notas_dia',
    'asistencia_notas_dia.app_action_insert_asistencia_notas_dia', 'asistencia_notas_dia.app_action_update_asistencia_notas_dia', 'asistencia_notas_dia.app_action_delete_asistencia_notas_dia',
    'contabilidad_facturas.app_write_insert_contabilidad_facturas', 'contabilidad_facturas.app_write_update_contabilidad_facturas',
    'contabilidad_facturas.app_action_insert_contabilidad_facturas', 'contabilidad_facturas.app_action_update_contabilidad_facturas',
    'inventario_movimientos.app_write_insert_inventario_movimientos', 'inventario_movimientos.app_action_insert_inventario_movimientos'
  ]) n
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = split_part(n, '.', 1) and p.policyname = split_part(n, '.', 2) and p.permissive = 'RESTRICTIVE'
  );
  if falta is not null then
    raise exception 'Faltan politicas restrictivas: %', falta;
  end if;

  if lower(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure)) like '%current_role text%' then
    raise exception 'Regresion detectada: app_can_action declara current_role text.';
  end if;
end $$;

commit;
