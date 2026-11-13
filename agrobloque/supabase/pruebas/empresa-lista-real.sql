-- Pruebas de empresa lista contra una COPIA TEMPORAL restaurada.
-- Requiere haber aplicado supabase/empresa-lista-2026-11-13.sql.
-- Todo se deshace al final. No contiene correos ni datos reales.

begin;

create function pg_temp.chk(cond boolean, texto text) returns integer language plpgsql as $$
begin
  if coalesce(cond, false) then raise notice 'ok     %', texto; return 0; end if;
  raise notice 'FALLA  %', texto; return 1;
end $$;

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
  org uuid := gen_random_uuid();
  org_fallo uuid := gen_random_uuid();
  owner_uid uuid := gen_random_uuid();
  operador_uid uuid := gen_random_uuid();
  fallo_uid uuid := gen_random_uuid();
  owner_mail text := 'empresa-vacia-admin-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.test';
  operador_mail text := 'empresa-vacia-operador-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.test';
  fallo_mail text := 'empresa-rollback-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.test';
  plataforma_uid uuid;
  plataforma_mail text;
  resultado jsonb;
  item jsonb;
  msg text;
  n bigint;
  antes bigint;
  ingreso_esperado timestamptz := '2026-11-13 09:30:00+00';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (owner_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', owner_mail, '', now(), ingreso_esperado, '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (operador_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', operador_mail, '', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (fallo_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', fallo_mail, '', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

  insert into public.organizaciones (id, nombre, slug, activo)
  values
    (org, 'Empresa completamente vacia', 'empresa-vacia-' || substr(org::text, 1, 8), true),
    (org_fallo, 'Empresa para rollback', 'empresa-rollback-' || substr(org_fallo::text, 1, 8), true);

  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id)
  values
    (owner_mail, 'Administrador de prueba', 'admin', true, owner_uid, org),
    (operador_mail, 'Operador de prueba', 'operador', true, operador_uid, org);

  fallos := fallos + pg_temp.chk(
    (select count(*) from public.campos where organizacion_id = org) = 0
    and (select count(*) from public.bloques where organizacion_id = org) = 0
    and (select count(*) from public.categorias_producto where organizacion_id = org) = 0
    and (select preparada_en from public.organizaciones where id = org) is null,
    'la organizacion de prueba parte completamente vacia'
  );

  perform pg_temp.como(owner_uid, owner_mail);
  resultado := public.completar_onboarding_empresa('Empresa Lista', '+595 981 000000', 'Campo Principal', 4, 'invernadero');
  reset role;

  fallos := fallos + pg_temp.chk(resultado ->> 'ok' = 'true' and resultado ->> 'ya_preparada' = 'false', 'el onboarding devuelve exito nuevo');
  fallos := fallos + pg_temp.chk((select preparada_en from public.organizaciones where id = org) is not null, 'marca preparada_en al final');
  fallos := fallos + pg_temp.chk((select count(*) from public.campos where organizacion_id = org) = 1, 'crea exactamente un campo');
  fallos := fallos + pg_temp.chk((select count(*) from public.bloques where organizacion_id = org) = 4, 'crea exactamente cuatro bloques');
  fallos := fallos + pg_temp.chk((select count(*) from public.categorias_producto where organizacion_id = org) = 12, 'crea las doce categorias iniciales');
  perform pg_temp.como(owner_uid, owner_mail);
  select count(*) into n from public.categorias_producto;
  reset role;
  fallos := fallos + pg_temp.chk(n = 12, 'el administrador solo ve las categorias de su organizacion');

  select count(*) into antes from public.categorias_producto where organizacion_id = org;
  perform private.preparar_empresa_catalogos(org);
  perform private.preparar_empresa_catalogos(org);
  select count(*) into n from public.categorias_producto where organizacion_id = org;
  fallos := fallos + pg_temp.chk(n = antes and n = 12, 'la preparacion de catalogos es idempotente');

  perform pg_temp.como(owner_uid, owner_mail);
  resultado := public.completar_onboarding_empresa('Nombre que no debe duplicar', null, 'Otro campo', 8, 'campo_abierto');
  reset role;
  fallos := fallos + pg_temp.chk(resultado ->> 'ya_preparada' = 'true', 'un reintento informa que ya estaba preparada');
  fallos := fallos + pg_temp.chk((select count(*) from public.campos where organizacion_id = org) = 1 and (select count(*) from public.bloques where organizacion_id = org) = 4, 'el reintento no duplica campo ni bloques');

  perform pg_temp.como(operador_uid, operador_mail);
  begin
    perform public.completar_onboarding_empresa('No permitido', null, 'Campo operador', 1, 'invernadero');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  reset role;
  fallos := fallos + pg_temp.chk(msg is not null, 'un operador no puede completar el onboarding');

  -- Fuerza un error en el ultimo paso de datos y comprueba que la sentencia
  -- completa se revierte: empresa, categorias, campo, bloques y marca.
  insert into public.app_user_roles (email, nombre, rol, activo, user_id, organizacion_id)
  values (fallo_mail, 'Admin rollback', 'admin', true, fallo_uid, org_fallo);
  create function pg_temp.fallar_bloques() returns trigger language plpgsql as $f$
  begin
    if new.organizacion_id = current_setting('agrobloque.org_fallo', true)::uuid then
      raise exception 'fallo de prueba';
    end if;
    return new;
  end $f$;
  perform set_config('agrobloque.org_fallo', org_fallo::text, true);
  create trigger prueba_fallo_onboarding before insert on public.bloques for each row execute function pg_temp.fallar_bloques();

  perform pg_temp.como(fallo_uid, fallo_mail);
  begin
    perform public.completar_onboarding_empresa('Empresa Fallida', null, 'Campo Fallido', 2, 'invernadero');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  reset role;
  drop trigger prueba_fallo_onboarding on public.bloques;

  fallos := fallos + pg_temp.chk(msg like '%fallo de prueba%', 'el error forzado llega al llamador');
  fallos := fallos + pg_temp.chk(
    (select count(*) from public.campos where organizacion_id = org_fallo) = 0
    and (select count(*) from public.bloques where organizacion_id = org_fallo) = 0
    and (select count(*) from public.categorias_producto where organizacion_id = org_fallo) = 0
    and (select preparada_en from public.organizaciones where id = org_fallo) is null
    and (select nombre from public.organizaciones where id = org_fallo) = 'Empresa para rollback',
    'un fallo revierte todo el onboarding sin dejar datos parciales'
  );

  select p.user_id, u.email into plataforma_uid, plataforma_mail
  from private.platform_admins p
  join auth.users u on u.id = p.user_id
  order by p.created_at
  limit 1;
  fallos := fallos + pg_temp.chk(plataforma_uid is not null, 'la copia temporal tiene administrador de plataforma');

  if plataforma_uid is not null then
    perform pg_temp.como(plataforma_uid, plataforma_mail);
    select elemento into item
    from jsonb_array_elements(public.plataforma_empresas()) elemento
    where elemento ->> 'id' = org::text;
    reset role;
    fallos := fallos + pg_temp.chk(item ? 'preparada_en' and item ->> 'preparada_en' is not null, 'plataforma_empresas devuelve preparada_en');
    fallos := fallos + pg_temp.chk((item ->> 'ultimo_ingreso_dueno')::timestamptz = ingreso_esperado, 'plataforma_empresas devuelve el ultimo ingreso del dueno');
  end if;

  fallos := fallos + pg_temp.chk(not has_function_privilege('anon', 'public.completar_onboarding_empresa(text,text,text,integer,text)', 'EXECUTE'), 'anon no puede ejecutar onboarding');
  fallos := fallos + pg_temp.chk(has_function_privilege('authenticated', 'public.completar_onboarding_empresa(text,text,text,integer,text)', 'EXECUTE'), 'authenticated tiene el grant necesario');
  fallos := fallos + pg_temp.chk(not has_function_privilege('authenticated', 'private.preparar_empresa_catalogos(uuid)', 'EXECUTE'), 'authenticated no puede llamar la funcion privada de preparacion');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%', 'app_can_action no usa current_role');
  fallos := fallos + pg_temp.chk(pg_get_functiondef('public.completar_onboarding_empresa(text,text,text,integer,text)'::regprocedure) not ilike '%current_role text%', 'onboarding no usa current_role');
  fallos := fallos + pg_temp.chk(not exists (
    select 1 from private.empresa_preparacion_categorias r
    join public.organizaciones o on o.id = r.organizacion_id
    where lower(trim(o.nombre)) = 'el sembrador'
  ), 'el relleno no registro ni modifico categorias de El Sembrador');

  raise notice '';
  if fallos = 0 then
    raise notice 'TODO OK: empresa lista funciona desde una organizacion vacia y revierte fallos completos.';
  else
    raise notice '% FALLO(S): revisar las lineas FALLA.', fallos;
  end if;
end $$;

rollback;
