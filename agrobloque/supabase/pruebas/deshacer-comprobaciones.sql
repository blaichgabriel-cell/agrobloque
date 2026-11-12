-- Comprobaciones que se ejecutan DENTRO de la transaccion de modo-soporte-2026-11-11-deshacer.sql, justo antes de su
-- rollback (ver el parametro -Comprobar de scripts/respaldos/ensayar-sql.ps1). No tiene begin ni commit.
-- Verifica que, despues de deshacer, la base queda como estaba antes del modo soporte.
do $$
declare
  fallos int := 0;
  n bigint;
begin
  select count(*) into n from information_schema.tables where table_name like 'soporte\_%';
  if n = 0 then raise notice 'ok     no queda ninguna tabla de soporte'; else raise notice 'FALLA  quedan % tablas de soporte', n; fallos := fallos + 1; end if;

  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'private') and (p.proname like 'soporte\_%' or p.proname like 'plataforma\_%' or p.proname in ('read_organization_id', 'support_mode_active', 'active_support_organization_id'));
  if n = 0 then raise notice 'ok     no queda ninguna funcion de soporte ni del panel'; else raise notice 'FALLA  quedan % funciones', n; fallos := fallos + 1; end if;

  select count(*) into n from pg_policies where policyname like 'soporte\_%' or policyname like '%\_sp\_%';
  if n = 0 then raise notice 'ok     no queda ninguna politica de soporte'; else raise notice 'FALLA  quedan % politicas de soporte', n; fallos := fallos + 1; end if;

  select count(*) into n from pg_trigger where tgname = 'soporte_solo_lectura';
  if n = 0 then raise notice 'ok     no queda ningun trigger de solo lectura'; else raise notice 'FALLA  quedan % triggers', n; fallos := fallos + 1; end if;

  -- La base de produccion tenia 42 guardias ALL RESTRICTIVE + 2 SELECT y 2 UPDATE permisivas con la empresa actual.
  select count(*) into n from pg_policies where schemaname = 'public' and cmd = 'ALL' and permissive = 'RESTRICTIVE' and policyname = 'tenant_organization_guard' and qual like '%private.current_organization_id()%';
  if n = 42 then raise notice 'ok     las 42 guardias tenant_organization_guard vuelven a ser una politica ALL restrictiva'; else raise notice 'FALLA  hay % guardias ALL restrictivas (deben ser 42)', n; fallos := fallos + 1; end if;

  select count(*) into n from pg_policies where schemaname = 'public' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual like '%private.current_organization_id()%';
  if n = 2 then raise notice 'ok     las 2 politicas SELECT permisivas con la empresa actual vuelven a su forma original'; else raise notice 'FALLA  hay % politicas SELECT permisivas (deben ser 2)', n; fallos := fallos + 1; end if;

  select count(*) into n from pg_policies where schemaname = 'public' and qual like '%read_organization_id%';
  if n = 0 then raise notice 'ok     ninguna politica usa read_organization_id'; else raise notice 'FALLA  % politicas todavia usan read_organization_id', n; fallos := fallos + 1; end if;

  if pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%'
     and pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%support_mode_active%' then
    raise notice 'ok     app_can_action vuelve a la version sin soporte y sin el error current_role';
  else raise notice 'FALLA  app_can_action no quedo como antes'; fallos := fallos + 1; end if;

  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'facturas\_archivos\_organizacion\_%';
  if n = 3 then raise notice 'ok     las 3 politicas del bucket de facturas siguen intactas'; else raise notice 'FALLA  hay % politicas de facturas (deben ser 3)', n; fallos := fallos + 1; end if;

  select count(*) into n from information_schema.columns where table_name = 'soporte_accesos';
  if fallos = 0 then raise notice 'TODO OK: el deshacer deja la base como estaba.'; else raise notice '% FALLO(S) en el deshacer', fallos; end if;
end $$;
