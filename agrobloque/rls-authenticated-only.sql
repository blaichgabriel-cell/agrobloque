create table if not exists public.proveedores_credito (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text default 'Agropecuaria',
  contacto text,
  telefono text,
  direccion text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proveedor_movimientos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores_credito(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('compra_credito', 'pago', 'ajuste_suma', 'ajuste_resta')),
  concepto text not null,
  categoria text,
  medio_pago text,
  comprobante text,
  monto numeric(14,2) not null check (monto >= 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proveedor_movimientos_proveedor_id
  on public.proveedor_movimientos(proveedor_id);

create index if not exists idx_proveedor_movimientos_fecha
  on public.proveedor_movimientos(fecha desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists proveedores_credito_touch_updated_at on public.proveedores_credito;
create trigger proveedores_credito_touch_updated_at
before update on public.proveedores_credito
for each row execute function public.touch_updated_at();

drop trigger if exists proveedor_movimientos_touch_updated_at on public.proveedor_movimientos;
create trigger proveedor_movimientos_touch_updated_at
before update on public.proveedor_movimientos
for each row execute function public.touch_updated_at();

alter table public.proveedores_credito enable row level security;
alter table public.proveedor_movimientos enable row level security;

drop policy if exists "proveedores_credito_authenticated_all" on public.proveedores_credito;
create policy "proveedores_credito_authenticated_all"
on public.proveedores_credito
for all
to authenticated
using (true)
with check (true);

drop policy if exists "proveedor_movimientos_authenticated_all" on public.proveedor_movimientos;
create policy "proveedor_movimientos_authenticated_all"
on public.proveedor_movimientos
for all
to authenticated
using (true)
with check (true);

grant all on table public.proveedores_credito to authenticated;
grant all on table public.proveedor_movimientos to authenticated;
