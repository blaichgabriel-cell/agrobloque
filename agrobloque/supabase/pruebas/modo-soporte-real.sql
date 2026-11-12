-- Prueba del modo soporte contra una COPIA de produccion (proyecto temporal), despues de aplicar
-- supabase/modo-soporte-2026-11-11.sql. TODO se deshace con rollback al final: no deja nada.
-- No lleva correos ni claves: busca a las personas por su rol.
-- Ejecutar: powershell -ExecutionPolicy Bypass -File .\ensayar-sql.ps1 -Archivo ..\..\supabase\pruebas\modo-soporte-real.sql -SinCambios
-- Cada linea sale como "ok" o "FALLA"; al final debe decir TODO OK.

begin;

create function pg_temp.chk(cond boolean, texto text) returns int language plpgsql as $$
begin
  if coalesce(cond, false) then raise notice 'ok     %', texto; return 0; end if;
  raise notice 'FALLA  %', texto; return 1;
end $$;

-- Pasa a actuar como ese usuario con el rol authenticated (igual que la API de Supabase).
create function pg_temp.como(p_uid uuid, p_mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'email', p_mail, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.email', p_mail, true);
  execute 'set local role authenticated';
end $$;

do $$
declare
  fallos int := 0;
  socio uuid; socio_mail text; propia uuid;
  org uuid; org_nombre text;
  adm uuid; adm_mail text; op uuid; op_mail text;
  acceso uuid; n bigint; base bigint; t record; msg text; k int; ntablas int := 0;
  base_jor numeric; jor numeric;
begin
  -- ---- Personas y empresa de la copia
  select p.user_id, u.email into socio, socio_mail
    from private.platform_admins p join auth.users u on u.id = p.user_id order by p.created_at limit 1;
  select r.organizacion_id into propia from public.app_user_roles r
    join auth.users u on lower(u.email) = lower(r.email) where u.id = socio and r.activo limit 1;
  select o.id, o.nombre into org, org_nombre from public.organizaciones o
    where o.id <> propia order by (select count(*) from public.bloques b where b.organizacion_id = o.id) desc limit 1;
  select u.id, u.email into adm, adm_mail from public.app_user_roles r join auth.users u on lower(u.email) = lower(r.email)
    where r.organizacion_id = org and r.rol = 'admin' and r.activo limit 1;
  select u.id, u.email into op, op_mail from public.app_user_roles r join auth.users u on lower(u.email) = lower(r.email)
    where r.organizacion_id = org and r.rol = 'operador' and r.activo limit 1;

  fallos := fallos + pg_temp.chk(socio is not null and propia is not null, 'hay un administrador general con empresa propia');
  fallos := fallos + pg_temp.chk(org is not null and adm is not null and op is not null, 'hay una empresa cliente con administrador y operador (la de mas bloques)');
  fallos := fallos + pg_temp.chk((select count(*) from public.bloques where organizacion_id = org) > 0, 'la empresa cliente tiene bloques para comparar');

  select count(*) into k from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('soporte_accesos', 'soporte_auditoria')
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organizacion_id' and not a.attisdropped);
  fallos := fallos + pg_temp.chk((select count(*) from pg_policies where policyname like 'soporte\_no\_%') = k * 3, format('las %s tablas con organizacion_id tienen sus 3 politicas de bloqueo (hay %s)', k, (select count(*) from pg_policies where policyname like 'soporte\_no\_%')));
  fallos := fallos + pg_temp.chk((select count(*) from pg_trigger where tgname = 'soporte_solo_lectura') = k, 'las tablas con organizacion_id tienen el trigger de solo lectura');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action NO usa la variable current_role');

  -- ---- 1. Sin autorizacion: ninguna tabla deja ver datos del cliente
  perform pg_temp.como(socio, socio_mail);
  k := 0;
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('soporte_accesos', 'soporte_auditoria')
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organizacion_id' and not a.attisdropped)
  loop
    execute format('select count(*) from public.%I where organizacion_id = %L', t.relname, org) into n;
    if n <> 0 then k := k + 1; raise notice '       sin autorizacion el socio ve % filas en %', n, t.relname; end if;
  end loop;
  reset role;
  fallos := fallos + pg_temp.chk(k = 0, 'SIN autorizacion el socio no ve ninguna fila del cliente en ninguna tabla');

  -- ---- 2. Solicitud y aprobacion
  perform pg_temp.como(socio, socio_mail);
  acceso := public.soporte_solicitar(org, 'Prueba automatica del modo soporte');
  begin perform public.soporte_responder(acceso, true, 2); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'el socio NO puede aprobar su propia solicitud');

  perform pg_temp.como(op, op_mail);
  begin perform public.soporte_responder(acceso, true, 2); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'un operador del cliente NO puede aprobar');

  perform pg_temp.como(socio, socio_mail);
  begin perform public.soporte_entrar(acceso); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'no se puede entrar con la solicitud pendiente');

  perform pg_temp.como(adm, adm_mail);
  perform public.soporte_responder(acceso, true, 2);
  reset role;
  fallos := fallos + pg_temp.chk((select estado from public.soporte_accesos where id = acceso) = 'aprobado', 'el administrador del cliente aprueba por 2 horas');

  -- ---- 3. Con autorizacion: lee TODAS las tablas de ese cliente y nada mas
  perform pg_temp.como(socio, socio_mail);
  perform public.soporte_entrar(acceso);
  k := 0;
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('soporte_accesos', 'soporte_auditoria')
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organizacion_id' and not a.attisdropped)
  loop
    ntablas := ntablas + 1;
    execute format('select count(*) from public.%I where organizacion_id = %L', t.relname, org) into n;
    reset role;
    execute format('select count(*) from public.%I where organizacion_id = %L', t.relname, org) into base;
    perform pg_temp.como(socio, socio_mail);
    if n <> base then k := k + 1; raise notice '       %: el socio ve % de % filas', t.relname, n, base; end if;
    execute format('select count(*) from public.%I where organizacion_id <> %L', t.relname, org) into n;
    if n <> 0 then k := k + 1; raise notice '       %: el socio ve % filas de OTRAS empresas', t.relname, n; end if;
  end loop;
  reset role;
  fallos := fallos + pg_temp.chk(k = 0, format('en soporte ve exactamente las filas del cliente (y ninguna de otras empresas) en las %s tablas', ntablas));

  perform pg_temp.como(socio, socio_mail);
  select count(*) into n from public.organizaciones;
  reset role;
  fallos := fallos + pg_temp.chk(n = 1, 'en soporte ve una sola organizacion (la del cliente)');

  perform pg_temp.como(socio, socio_mail);
  select count(*) into n from storage.objects where bucket_id = 'facturas-contabilidad';
  reset role;
  select count(*) into base from storage.objects where bucket_id = 'facturas-contabilidad' and (storage.foldername(name))[1] = org::text;
  fallos := fallos + pg_temp.chk(n = base, format('en soporte lee solo las facturas del cliente (%s archivos)', base));

  select coalesce(sum(a.monto), 0) into base_jor from public.asistencia a join public.operarios o on o.id = a.operario_id
    where a.organizacion_id = org and o.organizacion_id = org and a.fecha >= current_date - 3650;
  perform pg_temp.como(socio, socio_mail);
  select coalesce(sum(total), 0) into jor from public.jornales_por_campo(current_date - 3650);
  reset role;
  fallos := fallos + pg_temp.chk(jor = base_jor, format('jornales_por_campo devuelve el costo del cliente (%s)', jor));

  -- ---- 4. Escrituras bloqueadas en TODAS las tablas
  perform pg_temp.como(socio, socio_mail);
  k := 0;
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('soporte_accesos', 'soporte_auditoria')
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organizacion_id' and not a.attisdropped)
  loop
    begin execute format('update public.%I set organizacion_id = organizacion_id where false', t.relname); msg := null; exception when others then msg := sqlerrm; end;
    if msg is null or msg not ilike '%solo lectura%' then k := k + 1; raise notice '       UPDATE permitido en %', t.relname; end if;
    begin execute format('delete from public.%I where false', t.relname); msg := null; exception when others then msg := sqlerrm; end;
    if msg is null or msg not ilike '%solo lectura%' then k := k + 1; raise notice '       DELETE permitido en %', t.relname; end if;
    begin execute format('insert into public.%I select * from public.%I where false', t.relname, t.relname); msg := null; exception when others then msg := sqlerrm; end;
    if msg is null or msg not ilike '%solo lectura%' then k := k + 1; raise notice '       INSERT permitido en %', t.relname; end if;
  end loop;
  reset role;
  fallos := fallos + pg_temp.chk(k = 0, format('en soporte NINGUN insert, update ni delete pasa en las %s tablas', ntablas));

  perform pg_temp.como(socio, socio_mail);
  begin update public.organizaciones set nombre = nombre where id = org; get diagnostics n = row_count; msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null or n = 0, 'en soporte no puede editar la organizacion del cliente');

  perform pg_temp.como(socio, socio_mail);
  begin insert into storage.objects (bucket_id, name) values ('facturas-contabilidad', org::text || '/prueba/f.pdf'); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'en soporte no puede subir facturas');

  -- ---- 5. El cliente sigue trabajando normal mientras dura el soporte
  perform pg_temp.como(op, op_mail);
  begin update public.bloques set codigo = codigo where organizacion_id = org; msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is null, 'el operador del cliente SIGUE pudiendo editar durante el soporte' || coalesce(' -> ' || msg, ''));
  perform pg_temp.como(op, op_mail);
  fallos := fallos + pg_temp.chk(public.app_can_action('productos', 'create'), 'el operador conserva el permiso de crear (app_can_action)');
  reset role;

  perform pg_temp.como(adm, adm_mail);
  select count(*) into n from public.bloques where organizacion_id = org;
  reset role;
  select count(*) into base from public.bloques where organizacion_id = org;
  fallos := fallos + pg_temp.chk(n = base and n > 0, 'el administrador del cliente sigue viendo sus bloques');

  -- ---- 6. Panel y funciones
  perform pg_temp.como(socio, socio_mail);
  select jsonb_array_length(public.plataforma_empresas()) into n;
  reset role;
  fallos := fallos + pg_temp.chk(n = (select count(*) from public.organizaciones where activo), format('el panel lista las %s empresas activas', n));

  perform pg_temp.como(adm, adm_mail);
  begin perform public.plataforma_empresas(); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'el administrador de un cliente NO puede usar el panel');

  -- ---- 7. Vencimiento: lo hace la base
  update public.soporte_accesos set aprobado_en = now() - interval '3 hours', expira_en = now() - interval '1 second' where id = acceso;
  perform pg_temp.como(socio, socio_mail);
  select count(*) into n from public.bloques where organizacion_id = org;
  reset role;
  fallos := fallos + pg_temp.chk(n = 0, 'al vencer la concesion, el socio deja de ver al cliente de inmediato');

  raise notice '';
  if fallos = 0 then raise notice 'TODO OK: el modo soporte se comporta bien contra la copia de produccion.';
  else raise notice '% FALLO(S) - revisar las lineas FALLA de arriba', fallos; end if;
end $$;

rollback;
