-- AgroBloque: precio unitario para costos y rentabilidad.
-- Seguro para ejecutar mas de una vez.

begin;

alter table public.productos
  add column if not exists precio_unitario numeric(14, 2) not null default 0;

comment on column public.productos.precio_unitario is
  'Costo de una unidad del producto, usado para calcular fumigaciones, fertilizaciones y rentabilidad.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_precio_unitario_no_negativo'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_precio_unitario_no_negativo
      check (precio_unitario >= 0);
  end if;
end
$$;

commit;

-- Verificacion (solo lectura): debe devolver precio_unitario / numeric.
select column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'productos'
  and column_name = 'precio_unitario';
