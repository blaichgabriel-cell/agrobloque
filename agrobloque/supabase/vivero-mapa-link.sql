alter table public.vivero_lotes
  add column if not exists bloque_id uuid references public.bloques(id) on delete set null,
  add column if not exists plantacion_id uuid references public.plantaciones(id) on delete set null,
  add column if not exists cantidad_trasplantada numeric not null default 0;

create index if not exists vivero_lotes_bloque_idx
  on public.vivero_lotes (bloque_id);

create index if not exists vivero_lotes_plantacion_idx
  on public.vivero_lotes (plantacion_id);

grant select, insert, update, delete on public.vivero_lotes to authenticated;
