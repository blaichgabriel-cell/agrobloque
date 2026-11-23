-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer de las fertilizaciones atomicas.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
begin
  if to_regprocedure('public.registrar_fertilizacion(jsonb)') is null
     and to_regprocedure('public.editar_fertilizacion(uuid[],uuid,jsonb,jsonb)') is null
     and to_regprocedure('public.anular_fertilizacion(uuid[],uuid,text,jsonb)') is null
  then raise notice 'ok     ya no existen las tres funciones publicas';
  else raise notice 'FALLA  quedan funciones publicas'; fallos := fallos + 1; end if;

  if to_regprocedure('private.guardar_fertilizacion(jsonb)') is null
     and to_regprocedure('private.devolver_stock_fertilizacion(uuid,jsonb,text)') is null
  then raise notice 'ok     ya no existen las dos ayudas privadas';
  else raise notice 'FALLA  quedan ayudas privadas'; fallos := fallos + 1; end if;

  if to_regprocedure('private.consumir_stock_con_faltante(uuid,numeric,text,text,uuid,uuid,uuid,date,text)') is not null
     and to_regprocedure('public.registrar_fumigaciones(jsonb)') is not null
  then raise notice 'ok     la fase 1 (fumigaciones atomicas) sigue intacta';
  else raise notice 'FALLA  se perdio algo de la fase 1'; fallos := fallos + 1; end if;

  if to_regprocedure('public.ajustar_stock_producto(uuid,numeric,text,text,text,text)') is not null
     and to_regprocedure('public.revertir_consumos_valorizados(text,uuid)') is not null
  then raise notice 'ok     las funciones de stock que ya existian siguen intactas';
  else raise notice 'FALLA  se perdio una funcion de stock existente'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer de las fertilizaciones atomicas deja todo como estaba.';
  else raise notice '% FALLO(S) en el deshacer de las fertilizaciones atomicas.', fallos; end if;
end $$;
