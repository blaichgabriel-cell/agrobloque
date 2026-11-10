import { createContext, useContext, useMemo } from 'react'
import { canPerformAction } from './permissions'

// Entrega el rol del usuario a cualquier pantalla sin pasarlo por props. Las pantallas usan
// useCan('modulo') para mostrar u ocultar Crear, Editar y Eliminar con las mismas reglas que
// aplica la base de datos (permissions.js). La base sigue siendo la que decide: esto solo evita
// mostrar botones que van a fallar.
export const RoleContext = createContext(null)

export const useCan = (moduleKey) => {
  const role = useContext(RoleContext)
  return useMemo(() => ({
    view: canPerformAction(role, moduleKey, 'view'),
    create: canPerformAction(role, moduleKey, 'create'),
    edit: canPerformAction(role, moduleKey, 'edit'),
    delete: canPerformAction(role, moduleKey, 'delete'),
  }), [role, moduleKey])
}
