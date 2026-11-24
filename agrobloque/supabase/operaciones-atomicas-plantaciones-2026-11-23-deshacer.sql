-- Deshacer las plantaciones atomicas (operaciones-atomicas-plantaciones-2026-11-23.sql).
-- Quita las tres funciones publicas y la ayuda privada. No toca tablas, politicas ni datos.
--
-- Despues de esto la pantalla vuelve sola al camino anterior (guardar en varios pasos), que es el que usa cuando estas
-- funciones no existen. Las plantaciones ya guardadas no se ven afectadas.
--
-- Es repetible.

begin;

drop function if exists public.registrar_plantacion(jsonb);
drop function if exists public.editar_plantacion(uuid, jsonb);
drop function if exists public.eliminar_plantacion(uuid, boolean);
drop function if exists private.abonos_normalizados(jsonb);

commit;
