-- Permite registrar productos escritos manualmente en fumigaciones.
-- No elimina ni modifica datos existentes.
-- Los productos vinculados al inventario siguen usando producto_id y descontando stock.

begin;

alter table public.fumigacion_productos
  add column if not exists producto_nombre text;

alter table public.fumigacion_productos
  alter column producto_id drop not null;

commit;
