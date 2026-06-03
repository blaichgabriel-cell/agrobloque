export const MODULES = [
  { key: 'buscar', label: 'Buscar', path: '/buscar' },
  { key: 'alertas', label: 'Alertas', path: '/alertas' },
  { key: 'historial', label: 'Historial', path: '/historial' },
  { key: 'mapa', label: 'Mapa', path: '/mapa' },
  { key: 'agenda', label: 'Agenda', path: '/agenda' },
  { key: 'vivero', label: 'Vivero', path: '/vivero' },
  { key: 'asistencia', label: 'Asistencia', path: '/asistencia', sensitive: true },
  { key: 'cosecha', label: 'Cosecha', path: '/cosecha' },
  { key: 'inventario', label: 'Inventario', path: '/inventario' },
  { key: 'fumigaciones', label: 'Fumigaciones', path: '/fumigaciones' },
  { key: 'plan_nutricional', label: 'Plan Nutricional', path: '/plan-nutricional' },
  { key: 'costos', label: 'Costos', path: '/costos' },
  { key: 'contabilidad', label: 'Contabilidad', path: '/contabilidad' },
  { key: 'reportes', label: 'Reportes', path: '/reportes' },
  { key: 'compradores', label: 'Compradores', path: '/compradores' },
  { key: 'auditoria', label: 'Auditoria', path: '/auditoria', adminOnly: true },
  { key: 'configuracion', label: 'Configuracion', path: '/configuracion', adminOnly: true },
]

const ALL_KEYS = MODULES.map(m => m.key)
const OPERADOR_KEYS = ALL_KEYS.filter(key => !['configuracion', 'auditoria'].includes(key))
const LECTURA_KEYS = ALL_KEYS.filter(key => !['asistencia', 'configuracion', 'auditoria'].includes(key))

export const ROLE_LABELS = {
  admin: 'Administrador',
  operador: 'Operador',
  lectura: 'Solo lectura',
}

export const DEFAULT_ROLE = {
  rol: 'admin',
  permisos: ALL_KEYS,
  canWrite: true,
  label: ROLE_LABELS.admin,
}

export const normalizeRole = (roleRow, fallbackEmail = '') => {
  const rol = roleRow?.activo === false ? 'lectura' : (roleRow?.rol || 'admin')
  const base = rol === 'admin' ? ALL_KEYS : rol === 'operador' ? OPERADOR_KEYS : LECTURA_KEYS
  const custom = Array.isArray(roleRow?.permisos) ? roleRow.permisos : null
  const permisos = custom && custom.length > 0 ? custom.filter(k => ALL_KEYS.includes(k)) : base

  return {
    id: roleRow?.id || null,
    email: (roleRow?.email || fallbackEmail || '').toLowerCase(),
    nombre: roleRow?.nombre || '',
    rol,
    permisos,
    canWrite: rol !== 'lectura',
    label: ROLE_LABELS[rol] || ROLE_LABELS.admin,
  }
}

export const moduleForPath = (path = '/') => {
  if (path === '/' || path === '') return 'inicio'
  if (path.startsWith('/bloque/')) return 'mapa'
  return MODULES.find(m => path === m.path || path.startsWith(`${m.path}/`))?.key || 'inicio'
}

export const canAccessModule = (role, moduleKey) => {
  if (!moduleKey || moduleKey === 'inicio') return true
  if (!role) return true
  if (role.rol === 'admin') return true
  return role.permisos.includes(moduleKey)
}

export const filterTabsByRole = (tabs, role, isGuest = false) => {
  return tabs.filter(tab => {
    const moduleKey = moduleForPath(tab.path)
    if (isGuest && ['asistencia', 'configuracion', 'auditoria'].includes(moduleKey)) return false
    return canAccessModule(role, moduleKey)
  })
}
