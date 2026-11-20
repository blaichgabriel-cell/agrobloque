-- Deshacer las fumigaciones atomicas (operaciones-atomicas-fumigaciones-2026-11-18.sql).
-- Quita las tres funciones publicas y las tres ayudas privadas. No toca tablas, politicas ni datos.
--
-- Despues de esto la pantalla vuelve sola al camino anterior (guardar en varios pasos), que es el que usa cuando estas
-- funciones no existen. Las fumigaciones ya guardadas no se ven afectadas.
--
-- Es repetible.

begin;

drop function if exists public.registrar_fumigaciones(jsonb);
drop function if exists public.editar_fumigacion(uuid, jsonb);
drop function if exists public.anular_fumigacion(uuid, text);
drop function if exists private.guardar_detalle_fumigacion(uuid, jsonb, date, text);
drop function if exists private.devolver_stock_fumigacion(uuid);
drop function if exists private.consumir_stock_con_faltante(uuid, numeric, text, text, uuid, uuid, uuid, date, text);

commit;
