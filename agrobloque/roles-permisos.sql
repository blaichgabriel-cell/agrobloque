-- Harden AgroBloque tables so anonymous visitors cannot read or modify farm data.
-- This keeps the current app model: any logged-in Supabase user can use the app.
-- Review before running in Supabase SQL Editor.

do $$
declare
  tbl text;
  pol record;
  tables text[] := array[
    'campos',
    'sectores',
    'bloques',
    'plantaciones',
    'cultivos',
    'abonos',
    'plantacion_abonos',
    'cosechas',
    'compradores',
    'fumigaciones',
    'fumigacion_bloques',
    'fumigacion_productos',
    'fotos_bloque',
    'muertes_plantas',
    'fertilizaciones',
    'tareas',
    'operarios',
    'asistencia',
    'adelantos',
    'productos',
    'categorias_producto',
    'costos'
  ];
begin
  foreach tbl in array tables loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format('alter table public.%I enable row level security', tbl);

      for pol in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;

      execute format(
        'create policy %I on public.%I for select to authenticated using (true)',
        tbl || '_authenticated_select',
        tbl
      );

      execute format(
        'create policy %I on public.%I for insert to authenticated with check (true)',
        tbl || '_authenticated_insert',
        tbl
      );

      execute format(
        'create policy %I on public.%I for update to authenticated using (true) with check (true)',
        tbl || '_authenticated_update',
        tbl
      );

      execute format(
        'create policy %I on public.%I for delete to authenticated using (true)',
        tbl || '_authenticated_delete',
        tbl
      );
    end if;
  end loop;
end $$;
