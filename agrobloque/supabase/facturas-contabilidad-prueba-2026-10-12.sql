-- AgroBloque: bandeja privada de facturas para prueba controlada.
-- Ejecutar manualmente una sola vez en Supabase SQL Editor ANTES de publicar la app.
-- No borra ni modifica movimientos existentes.

create extension if not exists pgcrypto;

create table if not exists public.contabilidad_facturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  origen text not null default 'carga_manual' check (origen in ('carga_manual', 'correo')),
  archivo_nombre text not null,
  archivo_path text not null unique,
  fecha_factura date not null,
  proveedor text not null,
  ruc text,
  comprobante text,
  total numeric not null check (total > 0),
  moneda text not null default 'PYG' check (moneda in ('PYG', 'USD')),
  categoria text,
  descripcion text not null,
  notas text,
  confianza_lectura integer not null default 0 check (confianza_lectura between 0 and 100),
  texto_extraido text,
  movimiento_id uuid references public.contabilidad_movimientos(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contabilidad_facturas_usuario_estado_idx
  on public.contabilidad_facturas(usuario_id, estado, created_at desc);

create unique index if not exists contabilidad_facturas_no_duplicadas_idx
  on public.contabilidad_facturas(usuario_id, ruc, comprobante)
  where nullif(trim(ruc), '') is not null and nullif(trim(comprobante), '') is not null;

alter table public.contabilidad_facturas enable row level security;
grant select, insert, update on public.contabilidad_facturas to authenticated;

drop policy if exists contabilidad_facturas_propias_select on public.contabilidad_facturas;
drop policy if exists contabilidad_facturas_propias_insert on public.contabilidad_facturas;
drop policy if exists contabilidad_facturas_propias_update on public.contabilidad_facturas;

create policy contabilidad_facturas_propias_select on public.contabilidad_facturas
  for select to authenticated using (usuario_id = auth.uid());
create policy contabilidad_facturas_propias_insert on public.contabilidad_facturas
  for insert to authenticated with check (usuario_id = auth.uid());
create policy contabilidad_facturas_propias_update on public.contabilidad_facturas
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas-contabilidad', 'facturas-contabilidad', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists facturas_archivos_propios_select on storage.objects;
drop policy if exists facturas_archivos_propios_insert on storage.objects;
drop policy if exists facturas_archivos_propios_delete on storage.objects;

create policy facturas_archivos_propios_select on storage.objects
  for select to authenticated
  using (bucket_id = 'facturas-contabilidad' and (storage.foldername(name))[1] = auth.uid()::text);
create policy facturas_archivos_propios_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'facturas-contabilidad' and (storage.foldername(name))[1] = auth.uid()::text);
create policy facturas_archivos_propios_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'facturas-contabilidad' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.aprobar_factura_contabilidad(p_factura_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  factura public.contabilidad_facturas%rowtype;
  nuevo_movimiento uuid;
begin
  select * into factura
  from public.contabilidad_facturas
  where id = p_factura_id and usuario_id = auth.uid()
  for update;

  if not found then raise exception 'Factura no encontrada o sin permiso'; end if;
  if factura.estado <> 'pendiente' then raise exception 'La factura ya fue procesada'; end if;
  if factura.moneda <> 'PYG' then raise exception 'Las facturas en USD deben convertirse manualmente antes de aprobar'; end if;

  insert into public.contabilidad_movimientos
    (fecha, tipo, descripcion, categoria, contraparte, medio_pago, comprobante, monto, notas)
  values
    (factura.fecha_factura, 'compra', factura.descripcion, factura.categoria, factura.proveedor,
     'Otro', factura.comprobante, factura.total,
     concat_ws(' · ', factura.notas, 'Importada desde PDF: ' || factura.archivo_nombre))
  returning id into nuevo_movimiento;

  update public.contabilidad_facturas
  set estado = 'aprobada', movimiento_id = nuevo_movimiento, updated_at = now()
  where id = factura.id;

  return nuevo_movimiento;
end;
$$;

grant execute on function public.aprobar_factura_contabilidad(uuid) to authenticated;
