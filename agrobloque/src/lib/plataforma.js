import { supabase } from './supabase'

// Capa de datos del Panel de plataforma y del modo soporte.
// Habla con las funciones de la base definidas en supabase/modo-soporte-2026-11-11.sql.
// Mientras esas funciones no existan (PGRST202), el panel muestra datos de EJEMPLO ficticios para
// poder ver y probar el diseño; en ese modo ninguna acción toca la base.

const funcionAusente = error => Boolean(error) && (
  error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message || '')
)

const minutos = n => new Date(Date.now() + n * 60000).toISOString()
const dias = n => minutos(n * 60 * 24)

// ---------------------------------------------------------------------------------------------
// Datos de ejemplo (empresas y personas ficticias)
// ---------------------------------------------------------------------------------------------
const demo = {
  activo: false,
  contexto: { activo: false },
  empresas: [
    {
      id: 'demo-1', nombre: 'Agrícola Los Aromos', admin_email: 'admin@losaromos.example', creada_en: dias(-120), usuarios_activos: 6, campos: 2, bloques: 34, ultima_actividad: minutos(-25),
      campos_lista: [{ id: 'c1', nombre: 'Campo Norte', bloques: 22 }, { id: 'c2', nombre: 'Invernadero Central', bloques: 12 }],
      plan: { nombre: 'Profesional', estado: 'activa', limite_bloques: 60, limite_usuarios: 12, limite_campos: 4, vence_en: dias(210) },
      soporte: { estado: 'sin_acceso' },
    },
    {
      id: 'demo-2', nombre: 'Hortalizas Santa Rita', admin_email: 'gerencia@santarita.example', creada_en: dias(-45), usuarios_activos: 3, campos: 1, bloques: 18, ultima_actividad: minutos(-60 * 5),
      campos_lista: [{ id: 'c3', nombre: 'Lote Principal', bloques: 18 }],
      plan: { nombre: 'Demo', estado: 'demo', limite_bloques: 20, limite_usuarios: 4, limite_campos: 1, vence_en: dias(9) },
      soporte: { estado: 'pendiente', acceso_id: 'demo-a1', motivo: 'Ayuda con la carga de las cosechas de la semana.', solicitado_en: minutos(-18) },
    },
    {
      id: 'demo-3', nombre: 'Cooperativa Río Verde', admin_email: 'coordinacion@rioverde.example', creada_en: dias(-200), usuarios_activos: 11, campos: 3, bloques: 52, ultima_actividad: minutos(-4),
      campos_lista: [{ id: 'c4', nombre: 'Campo Norte', bloques: 30 }, { id: 'c5', nombre: 'Invernadero Central', bloques: 14 }, { id: 'c6', nombre: 'Vivero Sur', bloques: 8 }],
      plan: { nombre: 'Profesional', estado: 'activa', limite_bloques: 80, limite_usuarios: 20, limite_campos: 5, vence_en: dias(160) },
      soporte: { estado: 'aprobado', acceso_id: 'demo-a2', expira_en: minutos(95), motivo: 'Revisión de costos del trimestre.' },
    },
    {
      id: 'demo-4', nombre: 'Finca La Esperanza', admin_email: 'dueno@laesperanza.example', creada_en: dias(-12), usuarios_activos: 2, campos: 1, bloques: 9, ultima_actividad: minutos(-60 * 30),
      campos_lista: [{ id: 'c7', nombre: 'Finca única', bloques: 9 }],
      plan: { nombre: 'Básico', estado: 'vencida', limite_bloques: 30, limite_usuarios: 5, limite_campos: 1, vence_en: dias(-3) },
      soporte: { estado: 'vencida', acceso_id: 'demo-a3', expira_en: minutos(-60 * 3) },
    },
    {
      id: 'demo-5', nombre: 'Finca Demo (propia)', admin_email: 'demo@agrobloque.example', creada_en: dias(-300), usuarios_activos: 2, campos: 2, bloques: 10, ultima_actividad: minutos(-60 * 2),
      campos_lista: [{ id: 'c8', nombre: 'Invernadero Central', bloques: 6 }, { id: 'c9', nombre: 'Campo Norte', bloques: 4 }],
      plan: { nombre: 'Profesional', estado: 'activa', limite_bloques: 80, limite_usuarios: 20, limite_campos: 5, vence_en: dias(365) },
      soporte: { estado: 'propia' },
    },
  ],
  historial: [
    { id: 'h1', evento: 'solicitada', motivo: 'Ayuda con la carga de las cosechas de la semana.', ocurrido_en: minutos(-18), acceso_id: 'demo-a1' },
    { id: 'h2', evento: 'vencida', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6), acceso_id: 'demo-h', empresa_nombre: 'Agrícola Los Aromos' },
    { id: 'h3', evento: 'fin', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 42), acceso_id: 'demo-h', empresa_nombre: 'Agrícola Los Aromos' },
    { id: 'h4', evento: 'inicio', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 118), acceso_id: 'demo-h', empresa_nombre: 'Agrícola Los Aromos' },
    { id: 'h5', evento: 'aprobada', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 125), acceso_id: 'demo-h', empresa_nombre: 'Agrícola Los Aromos', detalle: { horas: 2 } },
    { id: 'h6', evento: 'solicitada', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 140), acceso_id: 'demo-h', empresa_nombre: 'Agrícola Los Aromos' },
  ],
}

const oyentes = new Set()
export const suscribirPlataforma = fn => { oyentes.add(fn); return () => oyentes.delete(fn) }
const avisar = () => oyentes.forEach(fn => fn())
export const enModoDemo = () => demo.activo

const empresaDemo = id => demo.empresas.find(e => e.id === id)
const accesoDemo = id => demo.empresas.find(e => e.soporte?.acceso_id === id)
let contadorDemo = 10
const registrarDemo = (evento, accesoId, extra = {}) => {
  const e = accesoDemo(accesoId)
  demo.historial.unshift({ id: `h${++contadorDemo}`, evento, motivo: e?.soporte?.motivo || '', ocurrido_en: minutos(0), acceso_id: accesoId, ...extra })
}

// ---------------------------------------------------------------------------------------------
// Administradores generales
// ---------------------------------------------------------------------------------------------
export async function esAdministradorGeneral() {
  const { data, error } = await supabase.rpc('is_platform_admin')
  return !error && data === true
}

export async function listarEmpresas() {
  const { data, error } = await supabase.rpc('plataforma_empresas')
  if (funcionAusente(error)) { demo.activo = true; return { demo: true, empresas: demo.empresas } }
  if (error) throw new Error(error.message || 'No se pudo cargar el panel.')
  demo.activo = false
  return { demo: false, empresas: Array.isArray(data) ? data : [] }
}

// Historial de soporte de los administradores generales. La base todavía no lo entrega en modo real.
export async function historialPlataforma() {
  if (!demo.activo) return []
  return demo.historial.map(h => ({ ...h, empresa: h.empresa_nombre || accesoDemo(h.acceso_id)?.nombre || '' }))
}

// Contexto de inmersión: si hay una empresa abierta en modo soporte (o en demostración).
export async function contextoSoporte() {
  if (demo.activo) {
    if (demo.contexto?.activo && demo.contexto.expira_en && new Date(demo.contexto.expira_en) <= new Date()) demo.contexto = { activo: false }
    return demo.contexto
  }
  const { data, error } = await supabase.rpc('soporte_contexto')
  if (error || !data) return { activo: false }
  return data
}

export async function solicitarSoporte(organizacionId, motivo) {
  const texto = String(motivo || '').trim()
  if (texto.length < 5) throw new Error('Cuéntale al cliente por qué necesitas entrar (mínimo 5 letras).')
  if (demo.activo) {
    const e = empresaDemo(organizacionId)
    e.soporte = { estado: 'pendiente', acceso_id: `demo-a${++contadorDemo}`, motivo: texto, solicitado_en: minutos(0) }
    registrarDemo('solicitada', e.soporte.acceso_id)
    avisar(); return e.soporte.acceso_id
  }
  const { data, error } = await supabase.rpc('soporte_solicitar', { p_organizacion_id: organizacionId, p_motivo: texto })
  if (error) throw new Error(error.message)
  return data
}

export async function cancelarSolicitud(accesoId) {
  if (demo.activo) {
    const e = accesoDemo(accesoId)
    registrarDemo('cancelada', accesoId)
    if (e) e.soporte = { estado: 'sin_acceso' }
    avisar(); return
  }
  const { error } = await supabase.rpc('soporte_cancelar', { p_acceso_id: accesoId })
  if (error) throw new Error(error.message)
}

// Entra a una empresa con acceso autorizado. `campoNombre` solo se usa en la demostración.
export async function entrarSoporte(accesoId, campoNombre = '') {
  if (demo.activo) {
    const e = accesoDemo(accesoId)
    demo.contexto = { activo: true, demo: true, acceso_id: accesoId, organizacion_id: e.id, organizacion_nombre: e.nombre, campo_nombre: campoNombre || e.campos_lista?.[0]?.nombre || '', expira_en: e.soporte.expira_en, solo_lectura: true }
    registrarDemo('inicio', accesoId)
    avisar(); return
  }
  const { error } = await supabase.rpc('soporte_entrar', { p_acceso_id: accesoId })
  if (error) throw new Error(error.message)
}

// Solo demostración: entra a la empresa de ejemplo "propia" (sin cuenta regresiva).
export async function entrarEmpresaPropia(empresaId, campoNombre = '') {
  const e = empresaDemo(empresaId)
  demo.contexto = { activo: true, demo: true, propia: true, organizacion_id: e.id, organizacion_nombre: e.nombre, campo_nombre: campoNombre || e.campos_lista?.[0]?.nombre || '', expira_en: null, solo_lectura: false }
  avisar()
}

export async function salirSoporte() {
  if (demo.activo) {
    if (demo.contexto?.activo && demo.contexto.acceso_id) registrarDemo('fin', demo.contexto.acceso_id)
    demo.contexto = { activo: false }; avisar(); return
  }
  const { error } = await supabase.rpc('soporte_salir')
  if (error) throw new Error(error.message)
}

export async function crearEmpresa(nombre, ownerEmail) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Tu sesión venció. Volvé a ingresar e intentá otra vez.')
  const response = await fetch('/api/crear-empresa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nombre, owner_email: ownerEmail }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'No se pudo crear la empresa')
  return result
}

// Manda otra vez el correo para crear la contraseña (el mismo que usa «¿Olvidaste tu contraseña?»).
export async function reenviarInvitacion(correo) {
  const email = String(correo || '').trim().toLowerCase()
  if (!email) throw new Error('Esta empresa no tiene un correo de administrador.')
  if (demo.activo) return
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?auth_action=set-password` })
  if (error) throw new Error(/rate limit/i.test(error.message || '') ? 'Se alcanzó el límite de correos por hora. Espera un rato e inténtalo de nuevo.' : 'No se pudo enviar el correo. Verifica que el correo esté bien escrito.')
}

// ---------------------------------------------------------------------------------------------
// Administrador de la empresa cliente: aprobar, rechazar y revocar
// ---------------------------------------------------------------------------------------------
export const apiCliente = {
  async estado() {
    const { data, error } = await supabase.rpc('soporte_empresa_estado')
    if (error || !data) return null
    return data
  },
  async responder(accesoId, aprobar, horas) {
    const { error } = await supabase.rpc('soporte_responder', { p_acceso_id: accesoId, p_aprobar: aprobar, p_horas: horas })
    if (error) throw new Error(error.message)
  },
  async revocar(accesoId) {
    const { error } = await supabase.rpc('soporte_revocar', { p_acceso_id: accesoId })
    if (error) throw new Error(error.message)
  },
  async historial() {
    const { data, error } = await supabase.rpc('soporte_historial')
    if (error || !Array.isArray(data)) return []
    return data
  },
  async banner() {
    const { data, error } = await supabase.rpc('soporte_banner')
    if (error || !data) return { activo: false }
    return data
  },
}

// Versión de demostración: es lo que ve el administrador de una empresa de ejemplo.
export const apiClienteDemo = empresaId => ({
  async estado() {
    const e = empresaDemo(empresaId); const s = e?.soporte || {}
    return {
      pendientes: s.estado === 'pendiente' ? [{ id: s.acceso_id, solicitado_en: s.solicitado_en, motivo: s.motivo, solicitante: 'Soporte AgroBloque' }] : [],
      vigentes: s.estado === 'aprobado' && new Date(s.expira_en) > new Date() ? [{ id: s.acceso_id, expira_en: s.expira_en, motivo: s.motivo }] : [],
    }
  },
  async responder(accesoId, aprobar, horas) {
    const e = accesoDemo(accesoId); if (!e) return
    if (aprobar) {
      e.soporte = { ...e.soporte, estado: 'aprobado', expira_en: minutos(horas * 60) }
      registrarDemo('aprobada', accesoId, { detalle: { horas } })
    } else {
      registrarDemo('rechazada', accesoId)
      e.soporte = { estado: 'rechazado' }
    }
    avisar()
  },
  async revocar(accesoId) {
    const e = accesoDemo(accesoId); if (!e) return
    registrarDemo('revocada', accesoId)
    e.soporte = { estado: 'revocada' }
    if (demo.contexto?.acceso_id === accesoId) demo.contexto = { activo: false }
    avisar()
  },
  async historial() { return demo.historial.filter(h => !h.empresa_nombre || h.empresa_nombre === empresaDemo(empresaId)?.nombre || accesoDemo(h.acceso_id)?.id === empresaId) },
  async banner() {
    const s = empresaDemo(empresaId)?.soporte
    return s?.estado === 'aprobado' && new Date(s.expira_en) > new Date() ? { activo: true, acceso_id: s.acceso_id, expira_en: s.expira_en, puede_revocar: true } : { activo: false }
  },
})

// ---------------------------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------------------------
export const textoHace = iso => {
  if (!iso) return 'Sin actividad'
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'Ahora mismo'
  if (min < 60) return `Hace ${min} min`
  if (min < 60 * 24) return `Hace ${Math.round(min / 60)} h`
  const d = Math.round(min / 60 / 24)
  return d === 1 ? 'Ayer' : `Hace ${d} días`
}

export const textoRestante = iso => {
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'vencido'
  const min = Math.ceil(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export const horaCorta = iso => iso ? new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : ''
export const fechaLarga = iso => iso ? new Date(iso).toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
export const fechaHora = iso => iso ? `${new Date(iso).toLocaleDateString('es-PY', { day: 'numeric', month: 'short' })} · ${horaCorta(iso)}` : ''

// Estado visible de una empresa respecto del soporte (un acceso "aprobado" que ya pasó su hora se muestra vencido).
export const estadoVisible = soporte => {
  const s = soporte || { estado: 'sin_acceso' }
  if (s.estado === 'aprobado' && s.expira_en && new Date(s.expira_en) <= new Date()) return 'vencida'
  return s.estado || 'sin_acceso'
}
