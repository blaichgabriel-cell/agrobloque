-- AgroBloque: descripción opcional para las fotos de cada bloque.
-- Cambio seguro: no elimina ni transforma fotos existentes.

alter table public.fotos_bloque
  add column if not exists descripcion text;

comment on column public.fotos_bloque.descripcion is
  'Descripción opcional escrita por el usuario para explicar el contenido de la foto.';
