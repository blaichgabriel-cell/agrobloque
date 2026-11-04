-- Corrige los INSERT/UPDATE bloqueados para administradores y operadores.
-- Riesgo: reemplaza solamente la funcion de evaluacion de acciones; no toca datos.
-- Causa: el nombre local `current_role` colisionaba con CURRENT_ROLE de PostgreSQL.

begin;

create or replace function public.app_can_action(module_key text, action_key text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  app_role_value text := private.current_app_role();
  module_actions jsonb := private.current_app_actions() -> module_key;
begin
  if app_role_value = 'admin' then
    return true;
  end if;

  if module_actions is null then
    if app_role_value = 'operador' then
      return action_key in ('view', 'create', 'edit');
    end if;
    return action_key = 'view';
  end if;

  return module_actions ? action_key;
end;
$$;

grant execute on function public.app_can_action(text, text) to authenticated;

commit;
