insert into public.cultivos (nombre)
select v.nombre
from (values
  ('Acelga'),
  ('Albahaca'),
  ('Apio'),
  ('Brocoli'),
  ('Cebolla'),
  ('Cebolla de verdeo'),
  ('Cebollita'),
  ('Chaucha'),
  ('Cilantro'),
  ('Coliflor'),
  ('Espinaca'),
  ('Lechuga crespa'),
  ('Lechuga repollo'),
  ('Maiz dulce'),
  ('Oregano'),
  ('Perejil'),
  ('Puerro'),
  ('Rabanito'),
  ('Remolacha'),
  ('Repollo'),
  ('Repollo morado'),
  ('Rucula'),
  ('Zanahoria'),
  ('Zapallo'),
  ('Zapallito')
) as v(nombre)
where not exists (
  select 1
  from public.cultivos c
  where lower(trim(c.nombre)) = lower(trim(v.nombre))
);
