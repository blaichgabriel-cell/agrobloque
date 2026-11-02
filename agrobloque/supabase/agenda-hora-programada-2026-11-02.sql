-- Ejecutar una vez en Supabase > SQL Editor.
-- Es compatible con los registros existentes y no borra datos.

alter table public.tareas
  add column if not exists hora_programada time;

comment on column public.tareas.hora_programada is
  'Hora objetivo opcional para avisos de agenda en AgroBloque';
