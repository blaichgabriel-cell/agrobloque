-- AgroBloque: links de invitado para ver la app real en solo lectura.
-- Ejecutar una sola vez en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.guest_access_links (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  token_hash text not null unique,
  campo_id uuid references public.campos(id) on delete set null,
  activo boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guest_access_links_token_hash_idx
  on public.guest_access_links (token_hash);

alter table public.guest_access_links enable row level security;

grant select, insert, update, delete on public.guest_access_links to authenticated;

drop policy if exists guest_access_links_authenticated_select on public.guest_access_links;
drop policy if exists guest_access_links_authenticated_insert on public.guest_access_links;
drop policy if exists guest_access_links_authenticated_update on public.guest_access_links;
drop policy if exists guest_access_links_authenticated_delete on public.guest_access_links;

create policy guest_access_links_authenticated_select on public.guest_access_links
  for select to authenticated using (true);
create policy guest_access_links_authenticated_insert on public.guest_access_links
  for insert to authenticated with check (true);
create policy guest_access_links_authenticated_update on public.guest_access_links
  for update to authenticated using (true) with check (true);
create policy guest_access_links_authenticated_delete on public.guest_access_links
  for delete to authenticated using (true);

create or replace function public.guest_allows_campo(target_campo_id uuid default null)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  headers jsonb;
  token text;
  digest_hex text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := '{}'::jsonb;
  end;

  token := headers->>'x-guest-token';
  if token is null or length(token) < 20 then
    return false;
  end if;

  digest_hex := encode(digest(token, 'sha256'), 'hex');

  return exists (
    select 1
    from public.guest_access_links g
    where g.token_hash = digest_hex
      and g.activo = true
      and (g.expires_at is null or g.expires_at > now())
      and (g.campo_id is null or target_campo_id is null or g.campo_id = target_campo_id)
  );
end;
$$;

grant execute on function public.guest_allows_campo(uuid) to anon, authenticated;

-- Tablas visibles para invitados. Solo SELECT. No se habilitan escrituras para anon.
grant select on
  public.campos,
  public.bloques,
  public.plantaciones,
  public.cultivos,
  public.abonos,
  public.plantacion_abonos,
  public.productos,
  public.categorias_producto,
  public.cosechas,
  public.costos,
  public.tareas,
  public.fumigaciones,
  public.fumigacion_productos,
  public.fumigacion_bloques,
  public.fotos_bloque,
  public.muertes_plantas,
  public.fertilizaciones,
  public.compradores,
  public.notas_modulo,
  public.vivero_lotes,
  public.vivero_tratamientos,
  public.contabilidad_movimientos
to anon;

alter table public.campos enable row level security;
alter table public.bloques enable row level security;
alter table public.plantaciones enable row level security;
alter table public.cultivos enable row level security;
alter table public.abonos enable row level security;
alter table public.plantacion_abonos enable row level security;
alter table public.productos enable row level security;
alter table public.categorias_producto enable row level security;
alter table public.cosechas enable row level security;
alter table public.costos enable row level security;
alter table public.tareas enable row level security;
alter table public.fumigaciones enable row level security;
alter table public.fumigacion_productos enable row level security;
alter table public.fumigacion_bloques enable row level security;
alter table public.fotos_bloque enable row level security;
alter table public.muertes_plantas enable row level security;
alter table public.fertilizaciones enable row level security;
alter table public.compradores enable row level security;
alter table public.notas_modulo enable row level security;
alter table public.vivero_lotes enable row level security;
alter table public.vivero_tratamientos enable row level security;
alter table public.contabilidad_movimientos enable row level security;

drop policy if exists guest_select_campos on public.campos;
create policy guest_select_campos on public.campos
  for select to anon using (public.guest_allows_campo(id));

drop policy if exists guest_select_bloques on public.bloques;
create policy guest_select_bloques on public.bloques
  for select to anon using (public.guest_allows_campo(campo_id));

drop policy if exists guest_select_plantaciones on public.plantaciones;
create policy guest_select_plantaciones on public.plantaciones
  for select to anon using (
    exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id))
  );

drop policy if exists guest_select_cultivos on public.cultivos;
create policy guest_select_cultivos on public.cultivos
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_abonos on public.abonos;
create policy guest_select_abonos on public.abonos
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_plantacion_abonos on public.plantacion_abonos;
create policy guest_select_plantacion_abonos on public.plantacion_abonos
  for select to anon using (
    exists (
      select 1
      from public.plantaciones p
      join public.bloques b on b.id = p.bloque_id
      where p.id = plantacion_id and public.guest_allows_campo(b.campo_id)
    )
  );

drop policy if exists guest_select_productos on public.productos;
create policy guest_select_productos on public.productos
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_categorias_producto on public.categorias_producto;
create policy guest_select_categorias_producto on public.categorias_producto
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_cosechas on public.cosechas;
create policy guest_select_cosechas on public.cosechas
  for select to anon using (
    exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id))
  );

drop policy if exists guest_select_costos on public.costos;
create policy guest_select_costos on public.costos
  for select to anon using (public.guest_allows_campo(campo_id));

drop policy if exists guest_select_tareas on public.tareas;
create policy guest_select_tareas on public.tareas
  for select to anon using (public.guest_allows_campo(campo_id));

drop policy if exists guest_select_fumigaciones on public.fumigaciones;
create policy guest_select_fumigaciones on public.fumigaciones
  for select to anon using (public.guest_allows_campo(campo_id));

drop policy if exists guest_select_fumigacion_productos on public.fumigacion_productos;
create policy guest_select_fumigacion_productos on public.fumigacion_productos
  for select to anon using (
    exists (
      select 1 from public.fumigaciones f
      where f.id = fumigacion_id and public.guest_allows_campo(f.campo_id)
    )
  );

drop policy if exists guest_select_fumigacion_bloques on public.fumigacion_bloques;
create policy guest_select_fumigacion_bloques on public.fumigacion_bloques
  for select to anon using (
    exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id))
  );

drop policy if exists guest_select_fotos_bloque on public.fotos_bloque;
create policy guest_select_fotos_bloque on public.fotos_bloque
  for select to anon using (
    exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id))
  );

drop policy if exists guest_select_muertes_plantas on public.muertes_plantas;
create policy guest_select_muertes_plantas on public.muertes_plantas
  for select to anon using (
    exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id))
  );

drop policy if exists guest_select_fertilizaciones on public.fertilizaciones;
create policy guest_select_fertilizaciones on public.fertilizaciones
  for select to anon using (
    exists (select 1 from public.bloques b where b.id = bloque_id and public.guest_allows_campo(b.campo_id))
  );

drop policy if exists guest_select_compradores on public.compradores;
create policy guest_select_compradores on public.compradores
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_notas_modulo on public.notas_modulo;
create policy guest_select_notas_modulo on public.notas_modulo
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_vivero_lotes on public.vivero_lotes;
create policy guest_select_vivero_lotes on public.vivero_lotes
  for select to anon using (public.guest_allows_campo(null));

drop policy if exists guest_select_vivero_tratamientos on public.vivero_tratamientos;
create policy guest_select_vivero_tratamientos on public.vivero_tratamientos
  for select to anon using (
    exists (select 1 from public.vivero_lotes l where l.id = lote_id and public.guest_allows_campo(null))
  );

drop policy if exists guest_select_contabilidad_movimientos on public.contabilidad_movimientos;
create policy guest_select_contabilidad_movimientos on public.contabilidad_movimientos
  for select to anon using (public.guest_allows_campo(null));
