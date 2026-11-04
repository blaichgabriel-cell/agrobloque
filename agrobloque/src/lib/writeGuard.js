import { explicarError } from './errors'

// Supabase no lanza una excepcion cuando la base rechaza una escritura: devuelve
// `{ error }`, y varias pantallas no lo revisan. Esta capa avisa en pantalla de
// cualquier insert/update/delete que falle o que no cambie nada, sin tocar cada pantalla.

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
// La auditoria no debe molestar si falta su SQL; plantaciones reintenta sin columnas nuevas.
const IGNORED_TABLES = new Set(['audit_log'])
const isExpectedFallback = (table, code) => table === 'plantaciones' && code === 'PGRST204'

const parseTarget = (url) => {
  try {
    const parsed = new URL(url, 'http://localhost')
    const match = parsed.pathname.match(/\/rest\/v1\/([^/]+)$/)
    if (!match || match[1] === 'rpc') return null
    return { table: decodeURIComponent(match[1]), params: parsed.searchParams }
  } catch (_e) {
    return null
  }
}

// Un update/delete de un solo registro por id que no cambia nada es casi siempre un permiso
// denegado (la base no devuelve error en ese caso). Los filtros por otras columnas pueden
// no tener filas de forma legitima, asi que esos no se avisan.
const targetsSingleRecord = (params) => {
  const keys = [...params.keys()].filter(k => !['select', 'columns', 'on_conflict'].includes(k))
  return keys.length === 1 && keys[0] === 'id' && String(params.get('id')).startsWith('eq.')
}

const addCountPreference = (init) => {
  const headers = new Headers(init.headers || {})
  const prefer = headers.get('Prefer')
  if (!prefer || !/count=/.test(prefer)) headers.set('Prefer', prefer ? `${prefer},count=exact` : 'count=exact')
  return { ...init, headers }
}

const ACCIONES = { POST: 'guardar', PUT: 'guardar', PATCH: 'editar', DELETE: 'borrar' }

export const createWriteGuard = (baseFetch, notify) => async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url
  const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
  const target = MUTATIONS.has(method) ? parseTarget(url) : null
  if (!target || IGNORED_TABLES.has(target.table)) return baseFetch(input, init)

  const single = (method === 'PATCH' || method === 'DELETE') && targetsSingleRecord(target.params)
  const response = await baseFetch(input, single ? addCountPreference(init) : init)
  const accion = ACCIONES[method]

  try {
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}))
      if (isExpectedFallback(target.table, body?.code)) return response
      const info = explicarError({ message: body?.message || `Error ${response.status}` }, { modulo: target.table, accion })
      notify({
        kind: 'error',
        id: `${target.table}-${body?.code || response.status}`,
        title: `No se pudo ${accion} (${target.table}). ${info.tipo}`,
        description: `${info.consejo} Detalle: ${info.detalle}`,
      })
    } else if (single) {
      const total = (response.headers.get('content-range') || '').match(/\/(\d+)$/)
      if (total && Number(total[1]) === 0) {
        notify({
          kind: 'warning',
          id: `${target.table}-sin-cambios`,
          title: `No se aplico el cambio (${target.table})`,
          description: 'Es probable que tu usuario no tenga permiso para editar o borrar este dato, o que ya no exista. Pedi al administrador que revise tus permisos.',
        })
      }
    }
  } catch (_e) {
    // El aviso nunca debe romper la peticion original.
  }
  return response
}
