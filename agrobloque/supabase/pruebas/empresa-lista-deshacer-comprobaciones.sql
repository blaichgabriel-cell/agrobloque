-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
  n bigint;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'organizaciones' and column_name = 'preparada_en';
  if n = 0 then raise notice 'ok     preparada_en fue eliminada';
  else raise notice 'FALLA  preparada_en sigue presente'; fallos := fallos + 1; end if;

  select count(*) into n
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where (s.nspname = 'public' and p.proname = 'completar_onboarding_empresa')
     or (s.nspname = 'private' and p.proname = 'preparar_empresa_catalogos');
  if n = 0 then raise notice 'ok     no quedan funciones de empresa lista';
  else raise notice 'FALLA  quedan % funciones de empresa lista', n; fallos := fallos + 1; end if;

  select count(*) into n
  from information_schema.tables
  where table_schema = 'private' and table_name = 'empresa_preparacion_categorias';
  if n = 0 then raise notice 'ok     no queda la tabla privada de seguimiento';
  else raise notice 'FALLA  queda la tabla privada de seguimiento'; fallos := fallos + 1; end if;

  if pg_get_functiondef('public.plataforma_empresas()'::regprocedure) not ilike '%preparada_en%'
     and pg_get_functiondef('public.plataforma_empresas()'::regprocedure) not ilike '%ultimo_ingreso_dueno%'
  then raise notice 'ok     plataforma_empresas volvio a su contrato anterior';
  else raise notice 'FALLA  plataforma_empresas conserva campos nuevos'; fallos := fallos + 1; end if;

  if pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) not ilike '%current_role text%'
  then raise notice 'ok     app_can_action sigue sin current_role';
  else raise notice 'FALLA  app_can_action usa current_role'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer de empresa lista deja el esquema anterior.';
  else raise notice '% FALLO(S) en el deshacer de empresa lista.', fallos; end if;
end $$;
