-- AgroBloque: trazabilidad comercial y fotografica de lotes de vivero.
-- Ejecutar UNA VEZ en Supabase SQL Editor, despues de
-- multiempresa-organizaciones-2026-11-02.sql.
--
-- Riesgo: agrega columnas, pero no borra ni modifica datos existentes.
-- La tabla vivero_lotes ya esta aislada por organizacion; estas columnas
-- heredan las mismas politicas RLS multiempresa.

begin;

alter table public.vivero_lotes
  add column if not exists proveedor text,
  add column if not exists precio_compra numeric,
  add column if not exists fotos jsonb not null default '[]'::jsonb;

alter table public.vivero_lotes
  drop constraint if exists vivero_lotes_precio_compra_no_negativo;

alter table public.vivero_lotes
  add constraint vivero_lotes_precio_compra_no_negativo
  check (precio_compra is null or precio_compra >= 0);

comment on column public.vivero_lotes.proveedor is
  'Persona o empresa a la que se compro el lote, semilla o plantines.';
comment on column public.vivero_lotes.precio_compra is
  'Precio total de compra expresado en guaranies.';
comment on column public.vivero_lotes.fotos is
  'Lista JSON de fotos optimizadas: id, nombre, fecha y url.';

commit;
