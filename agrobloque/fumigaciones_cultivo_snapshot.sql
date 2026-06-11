alter table public.fumigaciones
  add column if not exists tanques_cantidad numeric,
  add column if not exists tanque_litros numeric;

alter table public.fumigacion_productos
  add column if not exists cantidad numeric,
  add column if not exists unidad_uso text,
  add column if not exists descuento_stock numeric;
