-- Ajustes de auditoria AgroBloque
-- Ejecutar en Supabase SQL Editor despues de subir los archivos y esperar Vercel Ready.

-- 1) Permitir los tipos de bloque que usa la aplicacion al agregar bloques nuevos.
alter table public.bloques
  drop constraint if exists bloques_tipo_check;

alter table public.bloques
  add constraint bloques_tipo_check
  check (
    tipo is null
    or tipo in ('invernadero', 'campo_abierto', 'campo', 'tunel', 'media_sombra')
  );

-- 2) Agregar cultivos habituales que faltaban en el selector de nueva plantacion.
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
