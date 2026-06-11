-- AgroBloque - modulo Ventas
-- Ejecutar en Supabase SQL Editor antes de usar el nuevo apartado Ventas.
-- No borra ni modifica datos existentes de cosechas.

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  comprador_id uuid not null references public.compradores(id) on delete restrict,
  bloque_id uuid null references public.bloques(id) on delete set null,
  cosecha_id uuid null references public.cosechas(id) on delete set null,
  producto text not null,
  kg_total numeric not null check (kg_total > 0),
  precio_kg numeric not null default 0 check (precio_kg >= 0),
  total numeric not null default 0 check (total >= 0),
  estado_cobro text not null default 'pagado' check (estado_cobro in ('pagado', 'pendiente', 'parcial')),
  monto_cobrado numeric not null default 0 check (monto_cobrado >= 0),
  forma_pago text null,
  notas text null,
  created_at timestamptz not null default now()
);

create index if not exists ventas_fecha_idx on public.ventas(fecha desc);
create index if not exists ventas_comprador_id_idx on public.ventas(comprador_id);
create index if not exists ventas_bloque_id_idx on public.ventas(bloque_id);
create index if not exists ventas_estado_cobro_idx on public.ventas(estado_cobro);

alter table public.ventas enable row level security;

drop policy if exists ventas_authenticated_select on public.ventas;
create policy ventas_authenticated_select
on public.ventas for select
to authenticated
using (true);

drop policy if exists ventas_authenticated_insert on public.ventas;
create policy ventas_authenticated_insert
on public.ventas for insert
to authenticated
with check (true);

drop policy if exists ventas_authenticated_update on public.ventas;
create policy ventas_authenticated_update
on public.ventas for update
to authenticated
using (true)
with check (true);

drop policy if exists ventas_authenticated_delete on public.ventas;
create policy ventas_authenticated_delete
on public.ventas for delete
to authenticated
using (true);

-- Permisos de la app: si existen roles personalizados, sumar ventas a quienes ya veian cosecha.
do $$
begin
  if to_regclass('public.app_user_roles') is not null then
    update public.app_user_roles
    set permisos = coalesce(permisos, '[]'::jsonb) || '["ventas"]'::jsonb
    where coalesce(permisos, '[]'::jsonb) ? 'cosecha'
      and not (coalesce(permisos, '[]'::jsonb) ? 'ventas');
  end if;
end $$;
