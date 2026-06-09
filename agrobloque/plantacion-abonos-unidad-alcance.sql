create table if not exists public.asistencia_notas_dia (
  id uuid primary key default gen_random_uuid(),
  campo_id uuid not null references public.campos(id) on delete cascade,
  fecha date not null,
  dia_semana text,
  trabajos text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.asistencia_notas_dia add column if not exists dia_semana text;
alter table public.asistencia_notas_dia add column if not exists trabajos text default '';
alter table public.asistencia_notas_dia add column if not exists created_at timestamptz default now();
alter table public.asistencia_notas_dia add column if not exists updated_at timestamptz default now();

delete from public.asistencia_notas_dia a
using public.asistencia_notas_dia b
where a.campo_id = b.campo_id
  and a.fecha = b.fecha
  and a.created_at < b.created_at;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'asistencia_notas_dia_campo_fecha_unique'
  ) then
    alter table public.asistencia_notas_dia
      add constraint asistencia_notas_dia_campo_fecha_unique unique (campo_id, fecha);
  end if;
end $$;

alter table public.asistencia_notas_dia enable row level security;

grant select, insert, update, delete on public.asistencia_notas_dia to authenticated;

drop policy if exists "asistencia_notas_dia_authenticated_select" on public.asistencia_notas_dia;
drop policy if exists "asistencia_notas_dia_authenticated_insert" on public.asistencia_notas_dia;
drop policy if exists "asistencia_notas_dia_authenticated_update" on public.asistencia_notas_dia;
drop policy if exists "asistencia_notas_dia_authenticated_delete" on public.asistencia_notas_dia;

create policy "asistencia_notas_dia_authenticated_select"
on public.asistencia_notas_dia
for select
to authenticated
using (true);

create policy "asistencia_notas_dia_authenticated_insert"
on public.asistencia_notas_dia
for insert
to authenticated
with check (true);

create policy "asistencia_notas_dia_authenticated_update"
on public.asistencia_notas_dia
for update
to authenticated
using (true)
with check (true);

create policy "asistencia_notas_dia_authenticated_delete"
on public.asistencia_notas_dia
for delete
to authenticated
using (true);
