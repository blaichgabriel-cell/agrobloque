-- Se incluye con -Comprobar dentro de la transaccion del SQL de deshacer de las fumigaciones atomicas.
-- No lleva begin, commit ni rollback.

do $$
declare
  fallos integer := 0;
begin
  if to_regprocedure('public.registrar_fumigaciones(jsonb)') is null
     and to_regprocedure('public.editar_fumigacion(uuid,jsonb)') is null
     and to_regprocedure('public.anular_fumigacion(uuid,text)') is null
  then raise notice 'ok     ya no existen las tres funciones publicas';
  else raise notice 'FALLA  quedan funciones publicas'; fallos := fallos + 1; end if;

  if to_regprocedure('private.consumir_stock_con_faltante(uuid,numeric,text,text,uuid,uuid,uuid,date,text)') is null
     and to_regprocedure('private.devolver_stock_fumigacion(uuid)') is null
     and to_regprocedure('private.guardar_detalle_fumigacion(uuid,jsonb,date,text)') is null
  then raise notice 'ok     ya no existen las tres ayudas privadas';
  else raise notice 'FALLA  quedan ayudas privadas'; fallos := fallos + 1; end if;

  if to_regprocedure('public.ajustar_stock_producto(uuid,numeric,text,text,text,text)') is not null
     and to_regprocedure('public.consumir_stock_valorizado(uuid,numeric,text,uuid,uuid,uuid,date,text)') is not null
     and to_regprocedure('public.revertir_consumos_valorizados(text,uuid)') is not null
  then raise notice 'ok     las funciones de stock que ya existian siguen intactas';
  else raise notice 'FALLA  se perdio una funcion de stock existente'; fallos := fallos + 1; end if;

  if fallos = 0 then raise notice 'TODO OK: el deshacer de las fumigaciones atomicas deja todo como estaba.';
  else raise notice '% FALLO(S) en el deshacer de las fumigaciones atomicas.', fallos; end if;
end $$;
