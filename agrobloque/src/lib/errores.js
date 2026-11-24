import { supabase } from './supabase'

// Registro de errores de la app. Anota en la base (si tiene registro-errores-2026-11-24.sql) los fallos que le pasan a
// las personas para verlos en el Panel de plataforma. NUNCA debe romper la app: todo va dentro de try/catch y, si la base
// no tiene la función o no hay sesión, simplemente se descarta.
//
// Privacidad: solo se envía mensaje, ruta (con los ids reemplazados), origen, versión y navegador, y se quitan correos,
// tokens y claves del texto. La empresa y el usuario los pone la base, no esta función.

const VERSION = String(process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)
const MAX_POR_SESION = 25

// Fallos que no son de la app: conexión del usuario, pantallas viejas tras un despliegue (ya las maneja ErrorBoundary), etc.
const IGNORAR = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Loading chunk|ChunkLoadError|dynamically imported module/i,
  /Failed to fetch|NetworkError|Load failed|network request failed|The network connection was lost/i,
  /AbortError|The operation was aborted/i,
  /Non-Error promise rejection captured/i,
]

const enviados = new Set()
let total = 0
let desactivado = false
let iniciado = false

export const limpiarTexto = (texto, max) => String(texto ?? '')
  .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[correo]')
  .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  .replace(/(apikey|authorization|bearer|password|contrase[ñn]a|clave|token)(\s*[:=]\s*|\s+)[^\s,;'"]+/gi, '$1=[oculto]')
  .slice(0, max)

// Huella corta y estable del error (mismo mensaje, origen y ruta = mismo error).
export const huellaDe = (...partes) => {
  let h = 5381
  for (const ch of partes.join('|')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0')
}

const rutaActual = () => {
  try { return limpiarTexto(window.location.pathname, 200) } catch (e) { return '' }
}

export function reportarError({ origen = 'js', mensaje, detalle = '' } = {}) {
  try {
    if (desactivado || total >= MAX_POR_SESION) return
    const texto = limpiarTexto(mensaje, 500)
    if (!texto || IGNORAR.some(r => r.test(texto))) return
    const ruta = rutaActual()
    const huella = huellaDe(origen, texto, ruta)
    if (enviados.has(huella)) return
    enviados.add(huella)
    total += 1
    supabase.rpc('registrar_error_app', { p: {
      huella, origen, ruta, mensaje: texto, detalle: limpiarTexto(detalle, 3000), version: VERSION,
      agente: limpiarTexto(typeof navigator !== 'undefined' ? navigator.userAgent : '', 200),
    } }).then(({ error }) => {
      // Si la base todavía no tiene el registro (o no hay sesión), no se vuelve a intentar en esta sesión.
      if (error && (error.code === 'PGRST202' || error.code === '42883' || error.code === '42501' || error.status === 404)) desactivado = true
    }, () => {})
  } catch (e) { /* el registro de errores nunca debe romper la app */ }
}

// Engancha los errores que nadie atrapó. Se llama una sola vez al arrancar la app.
export function iniciarRegistroErrores() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  window.addEventListener('error', (evento) => {
    // Errores al cargar imágenes o scripts (el objetivo no es la ventana) no son fallos de la app.
    if (evento.target && evento.target !== window) return
    reportarError({ origen: 'js', mensaje: evento.message || evento.error?.message, detalle: evento.error?.stack || `${evento.filename || ''}:${evento.lineno || 0}:${evento.colno || 0}` })
  })
  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason
    reportarError({ origen: 'promesa', mensaje: motivo?.message || (typeof motivo === 'string' ? motivo : 'Promesa rechazada'), detalle: motivo?.stack || '' })
  })
  // writeGuard avisa por evento (así no se importan entre sí) cuando un guardado falla por un error del servidor.
  window.addEventListener('agrobloque:error-guardado', (evento) => {
    reportarError({ origen: 'guardado', mensaje: evento.detail?.mensaje, detalle: evento.detail?.detalle })
  })
}
