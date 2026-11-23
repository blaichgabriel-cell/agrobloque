-- Deshacer las fertilizaciones atomicas (operaciones-atomicas-fertilizaciones-2026-11-23.sql).
-- Quita las tres funciones publicas y las dos ayudas privadas. No toca tablas, politicas, datos ni la fase 1
-- (fumigaciones atomicas), cuya ayuda private.consumir_stock_con_faltante se conserva.
--
-- Despues de esto la pantalla vuelve sola al camino anterior (guardar en varios pasos), que es el que usa cuando estas
-- funciones no existen. Las fertilizaciones ya guardadas no se ven afectadas.
--
-- Es repetible.

begin;

drop function if exists public.registrar_fertilizacion(jsonb);
drop function if exists public.editar_fertilizacion(uuid[], uuid, jsonb, jsonb);
drop function if exists public.anular_fertilizacion(uuid[], uuid, text, jsonb);
drop function if exists private.guardar_fertilizacion(jsonb);
drop function if exists private.devolver_stock_fertilizacion(uuid, jsonb, text);

commit;
