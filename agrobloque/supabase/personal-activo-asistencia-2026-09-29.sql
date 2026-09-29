-- AgroBloque: altas y bajas seguras de personal desde Asistencia.
-- Ejecutar una sola vez en Supabase > SQL Editor antes de publicar la app.
-- No borra operarios ni sus historiales de asistencia, adelantos o pagos.

alter table public.operarios
  add column if not exists activo boolean not null default true;

update public.operarios
set activo = true
where activo is null;

create index if not exists operarios_campo_activo_orden_idx
  on public.operarios (campo_id, activo, orden);

comment on column public.operarios.activo is
  'Indica si la persona aparece en la lista actual de asistencia. Los registros historicos se conservan.';
