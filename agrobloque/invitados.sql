alter table public.fumigacion_bloques
add column if not exists cultivo_snapshot text;

alter table public.fumigacion_bloques
add column if not exists plantacion_id_snapshot uuid references public.plantaciones(id) on delete set null;

update public.fumigacion_bloques fb
set
  cultivo_snapshot = c.nombre,
  plantacion_id_snapshot = p.id
from public.plantaciones p
join public.cultivos c on c.id = p.cultivo_id
where p.bloque_id = fb.bloque_id
  and p.activa = true
  and fb.cultivo_snapshot is null;
