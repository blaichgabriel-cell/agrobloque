import { supabase } from './supabase'

// Capa de datos del Panel de plataforma y del modo soporte.
// Habla con las funciones de la base definidas en supabase/modo-soporte-2026-11-11.sql.
// Mientras esas funciones no existan (PGRST202), el panel muestra datos de EJEMPLO ficticios para
// poder ver y probar el diseño; en ese modo ninguna acción toca la base.

const funcionAusente = error => Boolean(error) && (
  error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message || '')
)

const minutos = n => new Date(Date.now() + n * 60000).toISOString()

// ---------------------------------------------------------------------------------------------
// Datos de ejemplo (empresas y personas ficticias)
// ---------------------------------------------------------------------------------------------
const demo = {
  activo: false,
  contexto: { activo: false },
  empresas: [
    { id: 'demo-1', nombre: 'Agrícola Los Aromos', admin_email: 'admin@losaromos.example', creada_en: minutos(-60 * 24 * 120), usuarios_activos: 6, campos: 2, bloques: 34, ultima_actividad: minutos(-25), soporte: { estado: 'sin_acceso' } },
    { id: 'demo-2', nombre: 'Hortalizas Santa Rita', admin_email: 'gerencia@santarita.example', creada_en: minutos(-60 * 24 * 45), usuarios_activos: 3, campos: 1, bloques: 18, ultima_actividad: minutos(-60 * 5), soporte: { estado: 'pendiente', acceso_id: 'demo-a1', motivo: 'Ayuda con la carga de las cosechas de la semana.', solicitado_en: minutos(-18) } },
    { id: 'demo-3', nombre: 'Cooperativa Río Verde', admin_email: 'coordinacion@rioverde.example', creada_en: minutos(-60 * 24 * 200), usuarios_activos: 11, campos: 3, bloques: 52, ultima_actividad: minutos(-4), soporte: { estado: 'aprobado', acceso_id: 'demo-a2', expira_en: minutos(95), motivo: 'Revisión de costos del trimestre.' } },
    { id: 'demo-4', nombre: 'Finca La Esperanza', admin_email: 'dueno@laesperanza.example', creada_en: minutos(-60 * 24 * 12), usuarios_activos: 2, campos: 1, bloques: 9, ultima_actividad: minutos(-60 * 30), soporte: { estado: 'vencida', acceso_id: 'demo-a3', expira_en: minutos(-60 * 3) } },
  ],
  historial: [
    { id: 'h1', evento: 'solicitada', motivo: 'Ayuda con la carga de las cosechas de la semana.', ocurrido_en: minutos(-18), acceso_id: 'demo-a1' },
    { id: 'h2', evento: 'vencida', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6), acceso_id: 'demo-h' },
    { id: 'h3', evento: 'fin', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 42), acceso_id: 'demo-h' },
    { id: 'h4', evento: 'inicio', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 118), acceso_id: 'demo-h' },
    { id: 'h5', evento: 'aprobada', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 125), acceso_id: 'demo-h', detalle: { horas: 2 } },
    { id: 'h6', evento: 'solicitada', motivo: 'Revisión de inventario.', ocurrido_en: minutos(-60 * 24 * 6 - 140), acceso_id: 'demo-h' },
  ],
}

const oyentes = new Set()
export const suscribirPlataforma = fn => { oyentes.add(fn); return () => oyentes.delete(fn) }
const avisar = () => oyentes.forEach(fn => fn())
export const enModoDemo = () => demo.activo

const empresaDemo = id => demo.empresas.find(e => e.id === id)
const accesoDemo = id => demo.empresas.find(e => e.soporte?.acceso_id === id)
let contadorDemo = 10

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

export async function contextoSoporte() {
  if (demo.activo) return demo.contexto
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
    demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'solicitada', motivo: texto, ocurrido_en: minutos(0), acceso_id: e.soporte.acceso_id })
    avisar(); return e.soporte.acceso_id
  }
  const { data, error } = await supabase.rpc('soporte_solicitar', { p_organizacion_id: organizacionId, p_motivo: texto })
  if (error) throw new Error(error.message)
  return data
}

export async function cancelarSolicitud(accesoId) {
  if (demo.activo) {
    const e = accesoDemo(accesoId); if (e) e.soporte = { estado: 'sin_acceso' }
    demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'cancelada', motivo: '', ocurrido_en: minutos(0), acceso_id: accesoId })
    avisar(); return
  }
  const { error } = await supabase.rpc('soporte_cancelar', { p_acceso_id: accesoId })
  if (error) throw new Error(error.message)
}

export async function entrarSoporte(accesoId) {
  if (demo.activo) {
    const e = accesoDemo(accesoId)
    demo.contexto = { activo: true, acceso_id: accesoId, organizacion_id: e.id, organizacion_nombre: e.nombre, expira_en: e.soporte.expira_en, solo_lectura: true }
    demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'inicio', motivo: e.soporte.motivo || '', ocurrido_en: minutos(0), acceso_id: accesoId })
    avisar(); return
  }
  const { error } = await supabase.rpc('soporte_entrar', { p_acceso_id: accesoId })
  if (error) throw new Error(error.message)
}

export async function salirSoporte() {
  if (demo.activo) {
    if (demo.contexto?.activo) demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'fin', motivo: '', ocurrido_en: minutos(0), acceso_id: demo.contexto.acceso_id })
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

// ---------------------------------------------------------------------------------------------
// Administrador de la empresa cliente: aprobar, rechazar y revocar
// ---------------------------------------------------------------------------------------------
// `empresaDemoId` (solo en la vista de demostración) indica desde qué empresa de ejemplo se mira.
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
      demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'aprobada', motivo: e.soporte.motivo, ocurrido_en: minutos(0), acceso_id: accesoId, detalle: { horas } })
    } else {
      e.soporte = { estado: 'rechazado' }
      demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'rechazada', motivo: '', ocurrido_en: minutos(0), acceso_id: accesoId })
    }
    avisar()
  },
  async revocar(accesoId) {
    const e = accesoDemo(accesoId); if (!e) return
    e.soporte = { estado: 'revocada' }
    if (demo.contexto?.acceso_id === accesoId) demo.contexto = { activo: false }
    demo.historial.unshift({ id: `h${++contadorDemo}`, evento: 'revocada', motivo: '', ocurrido_en: minutos(0), acceso_id: accesoId })
    avisar()
  },
  async historial() { return demo.historial },
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
  const dias = Math.round(min / 60 / 24)
  return dias === 1 ? 'Ayer' : `Hace ${dias} días`
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
