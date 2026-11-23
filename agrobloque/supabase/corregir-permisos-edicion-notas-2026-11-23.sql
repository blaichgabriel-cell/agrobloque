-- AgroBloque: alinea las notas con el permiso que usa su pantalla (Agenda).
-- No modifica, mueve ni elimina ninguna nota existente.

drop policy if exists app_action_insert_notas_modulo on public.notas_modulo;
drop policy if exists app_action_update_notas_modulo on public.notas_modulo;
drop policy if exists app_action_delete_notas_modulo on public.notas_modulo;

create policy app_action_insert_notas_modulo on public.notas_modulo
  as restrictive for insert to authenticated
  with check (public.app_can_action('agenda', 'create'));

create policy app_action_update_notas_modulo on public.notas_modulo
  as restrictive for update to authenticated
  using (public.app_can_action('agenda', 'edit'))
  with check (public.app_can_action('agenda', 'edit'));

create policy app_action_delete_notas_modulo on public.notas_modulo
  as restrictive for delete to authenticated
  using (public.app_can_action('agenda', 'delete'));
