-- Deshacer quitar-fotos-2026-11-25.sql.
--
-- Recrea public.fotos_bloque (tabla, clave, indice, disparador de modo soporte, claves foraneas, RLS, 24 politicas y permisos,
-- copiados del respaldo de produccion del 2026-11-25), la columna public.vivero_lotes.fotos (vacia) y la version anterior de
-- public.eliminar_plantacion (la que tambien borraba fotos).
--
-- NO devuelve las fotos: la tabla queda VACIA. Las 3 fotos de El Sembrador estan en el respaldo del 2026-11-25
-- (volcado-2026-11-25-07-57/2-public.sql, bloque COPY public.fotos_bloque) y en la carpeta fotos-bloques-2026-11-25.
-- Esto solo tiene sentido si el front vuelve a usar fotos (el commit "Quita las fotos del producto" las elimina).
--
-- Es repetible: si la tabla ya existe, no la toca.

begin;

do $deshacer$
begin
  if to_regclass('public.fotos_bloque') is not null then
    raise notice 'public.fotos_bloque ya existe: no se recrea.';
    return;
  end if;
  execute $x$
CREATE TABLE public.fotos_bloque (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bloque_id uuid,
    plantacion_id uuid,
    url text NOT NULL,
    descripcion text,
    fecha timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    organizacion_id uuid DEFAULT private.current_organization_id() NOT NULL
);

ALTER TABLE ONLY public.fotos_bloque
    ADD CONSTRAINT fotos_bloque_pkey PRIMARY KEY (id);

CREATE INDEX fotos_bloque_organizacion_id_idx ON public.fotos_bloque USING btree (organizacion_id);

CREATE TRIGGER soporte_solo_lectura BEFORE INSERT OR DELETE OR UPDATE ON public.fotos_bloque FOR EACH STATEMENT EXECUTE FUNCTION private.soporte_bloquear_escritura();

ALTER TABLE ONLY public.fotos_bloque
    ADD CONSTRAINT fotos_bloque_bloque_id_fkey FOREIGN KEY (bloque_id) REFERENCES public.bloques(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fotos_bloque
    ADD CONSTRAINT fotos_bloque_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.fotos_bloque
    ADD CONSTRAINT fotos_bloque_plantacion_id_fkey FOREIGN KEY (plantacion_id) REFERENCES public.plantaciones(id) ON DELETE SET NULL;

ALTER TABLE public.fotos_bloque ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_action_delete_fotos_bloque ON public.fotos_bloque AS RESTRICTIVE FOR DELETE TO authenticated USING (public.app_can_action('mapa'::text, 'delete'::text));

CREATE POLICY app_action_insert_fotos_bloque ON public.fotos_bloque AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.app_can_action('mapa'::text, 'create'::text));

CREATE POLICY app_action_update_fotos_bloque ON public.fotos_bloque AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.app_can_action('mapa'::text, 'edit'::text)) WITH CHECK (public.app_can_action('mapa'::text, 'edit'::text));

CREATE POLICY app_base_delete_fotos_bloque ON public.fotos_bloque FOR DELETE TO authenticated USING (true);

CREATE POLICY app_base_insert_fotos_bloque ON public.fotos_bloque FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY app_base_select_fotos_bloque ON public.fotos_bloque FOR SELECT TO authenticated USING (true);

CREATE POLICY app_base_update_fotos_bloque ON public.fotos_bloque FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY app_write_delete_fotos_bloque ON public.fotos_bloque AS RESTRICTIVE FOR DELETE TO authenticated USING (public.app_can_write());

CREATE POLICY app_write_insert_fotos_bloque ON public.fotos_bloque AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.app_can_write());

CREATE POLICY app_write_update_fotos_bloque ON public.fotos_bloque AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.app_can_write()) WITH CHECK (public.app_can_write());

CREATE POLICY fotos_bloque_authenticated_delete ON public.fotos_bloque FOR DELETE TO authenticated USING (true);

CREATE POLICY fotos_bloque_authenticated_insert ON public.fotos_bloque FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY fotos_bloque_authenticated_select ON public.fotos_bloque FOR SELECT TO authenticated USING (true);

CREATE POLICY fotos_bloque_authenticated_update ON public.fotos_bloque FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY guest_read_fotos_bloque ON public.fotos_bloque FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.bloques b
  WHERE ((b.id = fotos_bloque.bloque_id) AND public.guest_allows_campo(b.campo_id)))));

CREATE POLICY guest_select_fotos_bloque ON public.fotos_bloque FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.bloques b
  WHERE ((b.id = fotos_bloque.bloque_id) AND public.guest_allows_campo(b.campo_id)))));

CREATE POLICY soporte_no_delete ON public.fotos_bloque AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT ( SELECT private.support_mode_active() AS support_mode_active)));

CREATE POLICY soporte_no_insert ON public.fotos_bloque AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT ( SELECT private.support_mode_active() AS support_mode_active)));

CREATE POLICY soporte_no_update ON public.fotos_bloque AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT ( SELECT private.support_mode_active() AS support_mode_active))) WITH CHECK ((NOT ( SELECT private.support_mode_active() AS support_mode_active)));

CREATE POLICY tenant_guest_organization_guard ON public.fotos_bloque AS RESTRICTIVE FOR SELECT TO anon USING ((organizacion_id = ( SELECT private.request_guest_organization_id() AS request_guest_organization_id)));

CREATE POLICY tenant_organization_guard_sp_del_98fe033a ON public.fotos_bloque AS RESTRICTIVE FOR DELETE TO authenticated USING ((organizacion_id = ( SELECT private.current_organization_id() AS current_organization_id)));

CREATE POLICY tenant_organization_guard_sp_ins_98fe033a ON public.fotos_bloque AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((organizacion_id = ( SELECT private.current_organization_id() AS current_organization_id)));

CREATE POLICY tenant_organization_guard_sp_sel_98fe033a ON public.fotos_bloque AS RESTRICTIVE FOR SELECT TO authenticated USING ((organizacion_id = ( SELECT private.read_organization_id() AS current_organization_id)));

CREATE POLICY tenant_organization_guard_sp_upd_98fe033a ON public.fotos_bloque AS RESTRICTIVE FOR UPDATE TO authenticated USING ((organizacion_id = ( SELECT private.current_organization_id() AS current_organization_id))) WITH CHECK ((organizacion_id = ( SELECT private.current_organization_id() AS current_organization_id)));
  $x$;
  execute $x$
GRANT ALL ON TABLE public.fotos_bloque TO anon;
GRANT ALL ON TABLE public.fotos_bloque TO authenticated;
GRANT ALL ON TABLE public.fotos_bloque TO service_role;
  $x$;
end $deshacer$;

alter table public.vivero_lotes add column if not exists fotos jsonb not null default '[]'::jsonb;
comment on column public.vivero_lotes.fotos is 'Lista JSON de fotos optimizadas: id, nombre, fecha y url.';

create or replace function public.eliminar_plantacion(p_id uuid, p_con_fotos_y_muertes boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'private'
    AS $$
declare
  n integer;
  v_fotos integer := 0;
  v_muertes integer := 0;
begin
  -- Sin "for update": en modo soporte la fila se puede leer pero no bloquear, y asi el aviso correcto es "solo lectura".
  if not exists (select 1 from public.plantaciones where id = p_id) then
    raise exception 'No se pudo eliminar la plantación: no existe o no tienes permiso.';
  end if;

  if p_con_fotos_y_muertes then
    delete from public.fotos_bloque where plantacion_id = p_id;
    get diagnostics v_fotos = row_count;
    delete from public.muertes_plantas where plantacion_id = p_id;
    get diagnostics v_muertes = row_count;
    if exists (select 1 from public.fotos_bloque where plantacion_id = p_id) or exists (select 1 from public.muertes_plantas where plantacion_id = p_id) then
      raise exception 'No tienes permiso para eliminar las fotos y muertes de esta plantación. No se eliminó nada.' using errcode = '42501';
    end if;
  end if;

  delete from public.plantacion_abonos where plantacion_id = p_id;
  if exists (select 1 from public.plantacion_abonos where plantacion_id = p_id) then
    raise exception 'No tienes permiso para eliminar los abonos de esta plantación. No se eliminó nada.' using errcode = '42501';
  end if;

  delete from public.plantaciones where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No tienes permiso para eliminar esta plantación. No se eliminó nada.' using errcode = '42501';
  end if;

  return jsonb_build_object('id', p_id, 'fotos', v_fotos, 'muertes', v_muertes);
end $$;

revoke all on function public.eliminar_plantacion(uuid, boolean) from public, anon;
grant execute on function public.eliminar_plantacion(uuid, boolean) to authenticated;

-- Verificacion final
do $$
declare
  n integer;
begin
  if to_regclass('public.fotos_bloque') is null then raise exception 'No se recreo fotos_bloque.'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.fotos_bloque'::regclass) then raise exception 'fotos_bloque sin RLS.'; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'fotos_bloque';
  if n <> 24 then raise exception 'Se esperaban 24 politicas en fotos_bloque y hay %.', n; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vivero_lotes' and column_name = 'fotos') then
    raise exception 'No se recreo vivero_lotes.fotos.';
  end if;
end $$;

commit;
