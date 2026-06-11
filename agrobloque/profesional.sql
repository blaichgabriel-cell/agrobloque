alter table public.plantacion_abonos
  add column if not exists unidad text not null default 'kg',
  add column if not exists alcance text not null default 'total';

alter table public.plantacion_abonos
  drop constraint if exists plantacion_abonos_unidad_check,
  add constraint plantacion_abonos_unidad_check
    check (unidad in ('kg', 'g', 'ton'));

alter table public.plantacion_abonos
  drop constraint if exists plantacion_abonos_alcance_check,
  add constraint plantacion_abonos_alcance_check
    check (alcance in ('total', 'por_tablon'));

update public.plantacion_abonos
set unidad = 'kg'
where unidad is null or unidad = '';

update public.plantacion_abonos
set alcance = 'total'
where alcance is null or alcance = '';
