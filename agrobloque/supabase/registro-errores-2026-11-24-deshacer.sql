-- Deshacer el registro de errores (registro-errores-2026-11-24.sql).
-- Quita las funciones y BORRA la tabla private.errores_app con todos los errores anotados.
--
-- Despues de esto la app sigue funcionando igual: los avisos de error simplemente se descartan, y el panel de
-- plataforma muestra que el registro no esta activo. No toca ninguna otra tabla ni dato.
--
-- Es repetible.

begin;

drop function if exists public.registrar_error_app(jsonb);
drop function if exists public.plataforma_errores(integer);
drop function if exists public.plataforma_errores_descartar(text);
drop function if exists private.purgar_errores_app();
drop table if exists private.errores_app;

commit;
