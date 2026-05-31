-- AgroBloque: modulo independiente de Contabilidad.
-- Ejecutar una sola vez en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.contabilidad_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('compra', 'venta')),
  descripcion text not null,
  categoria text,
  contraparte text,
  medio_pago text,
  comprobante text,
  monto numeric not null default 0 check (monto >= 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contabilidad_movimientos_fecha_idx
  on public.contabilidad_movimientos (fecha desc);

create index if not exists contabilidad_movimientos_tipo_fecha_idx
  on public.contabilidad_movimientos (tipo, fecha desc);

alter table public.contabilidad_movimientos enable row level security;

grant select, insert, update, delete on public.contabilidad_movimientos to authenticated;

drop policy if exists contabilidad_movimientos_authenticated_select on public.contabilidad_movimientos;
drop policy if exists contabilidad_movimientos_authenticated_insert on public.contabilidad_movimientos;
drop policy if exists contabilidad_movimientos_authenticated_update on public.contabilidad_movimientos;
drop policy if exists contabilidad_movimientos_authenticated_delete on public.contabilidad_movimientos;

create policy contabilidad_movimientos_authenticated_select on public.contabilidad_movimientos
  for select to authenticated using (true);

create policy contabilidad_movimientos_authenticated_insert on public.contabilidad_movimientos
  for insert to authenticated with check (true);

create policy contabilidad_movimientos_authenticated_update on public.contabilidad_movimientos
  for update to authenticated using (true) with check (true);

create policy contabilidad_movimientos_authenticated_delete on public.contabilidad_movimientos
  for delete to authenticated using (true);
