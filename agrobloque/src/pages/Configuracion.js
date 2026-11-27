import React, { useState, useEffect, useRef } from 'react'
import { SoporteCliente } from '../components/Soporte'
import { SeguridadDosFactores } from '../components/DosFactores'
import { useNavigate } from 'react-router-dom'
import { forceLocalSignOut, supabase } from '../lib/supabase'
import { descargarJson } from '../lib/exporters'
import { ACTIONS, DISABLED_MODULES } from '../lib/permissions'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, ChoiceChips, resumenPie } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
const PERMISOS_MODULOS = [
  { key: 'buscar', label: 'Buscar' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'historial', label: 'Historial' },
  { key: 'mapa', label: 'Mapa' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'vivero', label: 'Vivero' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'cosecha', label: 'Cosecha' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'fumigaciones', label: 'Fumigaciones' },
  { key: 'plan_nutricional', label: 'Fertilizaciones' },
  { key: 'costos', label: 'Costos' },
  { key: 'contabilidad', label: 'Contabilidad' },
  { key: 'cuentas_pagar', label: 'Cuentas a pagar' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'compradores', label: 'Compradores' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'configuracion', label: 'Configuración' },
].filter(m => !DISABLED_MODULES.includes(m.key))

const ABONO_BASE_CATEGORIA = 'Abono de base'
const FOTO_PERFIL_KEY = 'agrobloque-foto-perfil'
const BACKUP_KEY = 'agrobloque-ultimo-backup'

const normalizarNombre = (valor) => String(valor || '').trim().toLowerCase()
const esDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1100

function PermisosSelector({ permisos, onChange, ayuda }) {
  const todos = !Array.isArray(permisos) || permisos.length === 0
  return (
    <div className="apple-field" role="group" aria-label="Módulos permitidos">
      {ayuda && <small className="apple-field__hint">{ayuda}</small>}
      <div className="apple-chips apple-chips--wrap">
        {PERMISOS_MODULOS.map(m => {
          const marcado = todos || permisos.includes(m.key)
          return (
            <button
              type="button"
              key={m.key}
              className="apple-chip apple-chip--lg"
              aria-pressed={marcado}
              onClick={() => {
                const actual = todos ? PERMISOS_MODULOS.map(x => x.key) : permisos
                onChange(marcado ? actual.filter(k => k !== m.key) : [...new Set([...actual, m.key])])
              }}
            >
              {marcado && <i className="ti ti-check" aria-hidden="true" />}<span>{m.label}</span>
            </button>
          )
        })}
      </div>
      <small className="apple-field__hint">Si desmarcás un módulo, no aparece en el menú ni en los accesos.</small>
    </div>
  )
}

function AccionesSelector({ permisos, acciones, rol, onChange }) {
  const modulosActivos = Array.isArray(permisos) && permisos.length > 0
    ? PERMISOS_MODULOS.filter(m => permisos.includes(m.key))
    : PERMISOS_MODULOS
  const defaults = rol === 'admin'
    ? ['view', 'create', 'edit', 'delete']
    : rol === 'operador'
      ? ['view', 'create', 'edit']
      : ['view']

  return (
    <div className="apple-field">
      <small className="apple-field__hint">Define si este usuario puede ver, crear, editar o borrar en cada módulo permitido.</small>
      <div className="apple-perms">
        {modulosActivos.map(m => {
          const actuales = Array.isArray(acciones?.[m.key]) ? acciones[m.key] : defaults
          return (
            <div className="apple-perm-row" key={m.key}>
              <strong>{m.label}</strong>
              <div className="apple-chips apple-chips--mini" role="group" aria-label={`Acciones en ${m.label}`}>
                {ACTIONS.map(a => (
                  <button
                    type="button"
                    key={a.key}
                    className="apple-chip"
                    aria-pressed={actuales.includes(a.key)}
                    disabled={a.key === 'view'}
                    onClick={() => {
                      const base = Array.isArray(acciones?.[m.key]) ? acciones[m.key] : defaults
                      const nuevo = base.includes(a.key)
                        ? base.filter(k => k !== a.key)
                        : [...new Set([...base, a.key, 'view'])]
                      onChange({ ...(acciones || {}), [m.key]: nuevo })
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const comprimirFotoPerfil = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('No se pudo leer la foto'))
  reader.onload = () => {
    const img = new Image()
    img.onerror = () => reject(new Error('No se pudo procesar la foto'))
    img.onload = () => {
      const max = 320
      const escala = Math.min(1, max / img.width, max / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * escala))
      canvas.height = Math.max(1, Math.round(img.height * escala))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.src = reader.result
  }
  reader.readAsDataURL(file)
})

export default function Configuracion({ role, organization = { nombre:'AgroBloque' }, onOrganizationUpdate, theme = 'light', themeMode = 'system', onThemeChange }) {
  const navigate = useNavigate()
  const fotoRef = useRef()
  const [modal, setModal] = useState(null)
  const [perfil, setPerfil] = useState({ nombre:'', email:'', foto:'' })
  const [campos, setCampos] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [abonos, setAbonos] = useState([])
  const [compradores, setCompradores] = useState([])
  const [bloques, setBloques] = useState([])
  const [invitados, setInvitados] = useState([])
  const [roles, setRoles] = useState([])
  const [linkInvitado, setLinkInvitado] = useState('')
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [ultimoBackup, setUltimoBackup] = useState('')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const esAdmin = role?.rol === 'admin'

  useEffect(() => {
    fetchAll()
    if (typeof window !== 'undefined') {
      setUltimoBackup(window.localStorage.getItem(BACKUP_KEY) || '')
    }
  }, [])

  // Los avisos de éxito con la ventana abierta salen como toast; sin ventana se muestran en la página.
  useEffect(() => {
    if (success && modal) { toast.success(success); setSuccess('') }
  }, [success, modal])

  const backupVencido = () => {
    if (!ultimoBackup) return true
    return Math.floor((Date.now() - new Date(ultimoBackup).getTime()) / 86400000) >= 7
  }

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setPerfil({
      nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || '',
      email: user.email,
      foto: typeof window !== 'undefined' ? (window.localStorage.getItem(FOTO_PERFIL_KEY) || '') : ''
    })
    if (user) {
      const { data: platformAdmin } = await supabase.rpc('is_platform_admin')
      setIsPlatformAdmin(platformAdmin === true)
    }
    if (!esAdmin) return
    const [{ data: c }, { data: cu }, { data: op }, { data: ab }, { data: comp }, { data: bl }, { data: inv }, { data: rolData }] = await Promise.all([
      supabase.from('campos').select('*').order('nombre'),
      supabase.from('cultivos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('abonos').select('*').order('nombre'),
      supabase.from('compradores').select('*').order('nombre'),
      supabase.from('bloques').select('*').order('codigo'),
      supabase.from('guest_access_links').select('*, campos(nombre)').order('created_at', { ascending:false }),
      supabase.from('app_user_roles').select('*').order('email'),
    ])
    setCampos(c||[]); setCultivos(cu||[]); setOperarios(op||[])
    setAbonos(ab||[]); setCompradores(comp||[]); setBloques(bl||[])
    setInvitados(inv||[])
    setRoles(rolData||[])
  }

  const abrir = (tipo, datos = {}) => { setForm(datos); setModal(tipo); setError(''); setSuccess('') }
  // Supabase no lanza una excepción cuando la base rechaza un cambio: devuelve { error }. Hay que revisarlo.
  const ejecutar = async consulta => { const { error: falla } = await consulta; if (falla) throw falla }
  const explicarFalla = (e, accion) => {
    const texto = `${e?.code || ''} ${e?.message || ''}`
    if (/23503|foreign key/i.test(texto)) return `No se puede ${accion}: está en uso en otros registros.`
    if (/23505|duplicate key/i.test(texto)) return `No se puede ${accion}: ya existe uno con ese nombre.`
    if (/42501|permission|row-level security|solo lectura/i.test(texto)) return `No se puede ${accion}: tu usuario no tiene permiso.`
    return `No se pudo ${accion}: ${e?.message || 'intentá nuevamente.'}`
  }
  const cerrar = () => { setModal(null); setForm({}); setError(''); setSuccess('') }

  const asegurarCategoriaProducto = async () => {
    const { data: existente } = await supabase
      .from('categorias_producto')
      .select('id')
      .eq('nombre', ABONO_BASE_CATEGORIA)
      .maybeSingle()

    if (existente?.id) return existente.id

    const { data: creada } = await supabase
      .from('categorias_producto')
      .insert({ nombre: ABONO_BASE_CATEGORIA })
      .select('id')
      .single()

    return creada?.id || null
  }

  const sincronizarProductoAbono = async (nombre, nombreAnterior = '') => {
    const nombreLimpio = String(nombre || '').trim()
    if (!nombreLimpio) return

    const categoriaId = await asegurarCategoriaProducto()
    if (!categoriaId) return

    const nombres = [nombreLimpio, nombreAnterior].filter(Boolean)
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre')
      .in('nombre', nombres)

    const producto = (productos || []).find(p =>
      normalizarNombre(p.nombre) === normalizarNombre(nombreAnterior) ||
      normalizarNombre(p.nombre) === normalizarNombre(nombreLimpio)
    )

    if (producto) {
      await supabase.from('productos').update({
        nombre: nombreLimpio,
        categoria_id: categoriaId,
        activo: true,
      }).eq('id', producto.id)
    } else {
      await supabase.from('productos').insert({
        nombre: nombreLimpio,
        categoria_id: categoriaId,
        unidad: 'kg',
        stock_actual: 0,
        stock_minimo: 0,
        carencia_dias: 0,
        activo: true,
      })
    }
  }

  // --- PERFIL

  const guardarNombre = async () => {
    setLoading(true); setError(''); setSuccess('')
    try {
      const nombre = form.nombre?.trim() || ''
      const { error } = await supabase.auth.updateUser({
        data: { nombre, full_name: nombre, name: nombre }
      })
      if (error) throw error
      setPerfil(p => ({ ...p, nombre }))
      setSuccess('Nombre actualizado')
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const guardarEmail = async () => {
    if (!form.email || form.email === perfil.email) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const { error } = await supabase.auth.updateUser({ email: form.email.trim() })
      if (error) throw error
      setSuccess('Revisa tu nuevo email para confirmar el cambio')
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const guardarContrasena = async () => {
    if (!form.nueva || form.nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (form.nueva !== form.repetir) { setError('Las contraseñas no coinciden'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      const { error } = await supabase.auth.updateUser({ password: form.nueva })
      if (error) throw error
      setSuccess('Contraseña actualizada correctamente')
      setForm({})
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const guardarEmpresa = async () => {
    const nombre = String(form.nombre || '').trim()
    if (nombre.length < 2) { setError('El nombre de la empresa debe tener al menos 2 caracteres'); return }
    if (!organization?.id) {
      setError('Primero ejecutá el SQL multiempresa-organizaciones-2026-11-02.sql en Supabase.')
      return
    }
    setLoading(true); setError(''); setSuccess('')
    try {
      const payload = {
        nombre,
        telefono: String(form.telefono || '').trim() || null,
        email: String(form.email || '').trim().toLowerCase() || null,
        logo_url: String(form.logo_url || '').trim() || null,
        color_primario: /^#[0-9a-f]{6}$/i.test(String(form.color_primario || '')) ? form.color_primario : '#0F3923',
      }
      const { data, error } = await supabase.from('organizaciones').update(payload).eq('id', organization.id).select('*').single()
      if (error) throw error
      onOrganizationUpdate?.(data)
      setForm(data)
      setSuccess('Identidad de la empresa actualizada')
    } catch (e) { setError('No se pudo guardar la empresa: ' + e.message) }
    setLoading(false)
  }

  const crearEmpresaCliente = async () => {
    const nombre = String(form.nombre || '').trim()
    const ownerEmail = String(form.owner_email || '').trim().toLowerCase()
    if (nombre.length < 2) { setError('Ingresá el nombre de la empresa'); return }
    if (!/^[^\s@.][^\s@]*@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || /\.@|\.\./.test(ownerEmail)) { setError('Ingresá un email válido para el dueño (sin punto antes de la @)'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      // La cuenta del dueño se crea en el servidor (el registro público está apagado).
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Tu sesión venció. Volvé a ingresar e intentá otra vez.')
      const response = await fetch('/api/crear-empresa', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ nombre, owner_email: ownerEmail }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'No se pudo crear la empresa')

      setForm({ nombre:'', owner_email:'' })
      if (result.correo_enviado === false) setSuccess(`Empresa creada, pero no se pudo enviar el correo (${result.correo_error === 'over_email_send_rate_limit' ? 'Supabase alcanzó su límite de correos por hora' : `motivo: ${result.correo_error || 'desconocido'}`}). Cuando se pueda, el dueño usa “Primera vez o ¿olvidaste tu contraseña?” en el login.`)
      else setSuccess(`Empresa creada. Enviamos la invitación a ${ownerEmail}.`)
    } catch (e) {
      setError('No se pudo crear la empresa: ' + (e.message || 'verificá la migración multiempresa'))
    }
    setLoading(false)
  }

  const subirFotoPerfil = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const fotoBase64 = await comprimirFotoPerfil(file)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(FOTO_PERFIL_KEY, fotoBase64)
      }
      setPerfil(p => ({ ...p, foto: fotoBase64 }))
      setSuccess('Foto actualizada en este dispositivo')
    } catch (e) { setError('Error al subir foto: ' + e.message) }
    setLoading(false)
    e.target.value = ''
  }

  // --- OTROS

  const guardarCampo = async () => {
    const nombre = String(form.nombre || '').trim()
    if (nombre.length < 2) { setError('El nombre del campo debe tener al menos 2 caracteres.'); return }
    const repetido = campos.some(c => c.id !== form.id && normalizarNombre(c.nombre) === normalizarNombre(nombre))
    if (repetido) { setError('Ya existe un campo con ese nombre.'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      const consulta = form.id
        ? supabase.from('campos').update({ nombre }).eq('id', form.id)
        : supabase.from('campos').insert({ nombre })
      const { error: campoError } = await consulta
      if (campoError) throw campoError
      await fetchAll()
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('agrobloque:campos-actualizados'))
      abrir('campos')
      setSuccess(form.id ? 'Campo actualizado correctamente.' : 'Campo creado correctamente. Ya podés agregarle bloques.')
    } catch (e) {
      setError('No se pudo guardar el campo: ' + (e.message || 'intentá nuevamente.'))
    }
    setLoading(false)
  }

  const guardarCultivo = async () => {
    const nombre = String(form.nombre || '').trim()
    if (!nombre) { setError('Escribí el nombre del cultivo.'); return }
    setLoading(true); setError('')
    try {
      if (form.id) await ejecutar(supabase.from('cultivos').update({ nombre }).eq('id', form.id))
      else await ejecutar(supabase.from('cultivos').insert({ nombre }))
      await fetchAll(); abrir('cultivos'); setSuccess('Cultivo guardado.')
    } catch (e) { setError(explicarFalla(e, 'guardar el cultivo')) }
    setLoading(false)
  }

  const guardarOperario = async () => {
    const nombre = String(form.nombre || '').trim()
    if (!nombre) { setError('Escribí el nombre del operario.'); return }
    setLoading(true); setError('')
    try {
      if (form.id) await ejecutar(supabase.from('operarios').update({ nombre }).eq('id', form.id))
      else await ejecutar(supabase.from('operarios').insert({ nombre, campo_id: form.campo_id }))
      await fetchAll(); abrir('operarios'); setSuccess('Operario guardado.')
    } catch (e) { setError(explicarFalla(e, 'guardar el operario')) }
    setLoading(false)
  }

  const guardarAbono = async () => {
    if (!form.nombre) return; setLoading(true); setError('')
    try {
      const nombre = form.nombre.trim()
      const anterior = form.id ? abonos.find(a => a.id === form.id)?.nombre : ''
      if (!nombre) { setError('Escribí el nombre del abono.'); setLoading(false); return }
      if (form.id) await ejecutar(supabase.from('abonos').update({ nombre }).eq('id', form.id))
      else await ejecutar(supabase.from('abonos').insert({ nombre }))
      await sincronizarProductoAbono(nombre, anterior)
      await fetchAll(); abrir('abonos'); setSuccess('Abono guardado.')
    } catch (e) { setError(explicarFalla(e, 'guardar el abono')) }
    setLoading(false)
  }

  const guardarBloque = async () => {
    if (!form.id) return; setLoading(true); setError('')
    try {
      await ejecutar(supabase.from('bloques').update({ tipo: form.tipo }).eq('id', form.id))
      await fetchAll(); abrir('bloques'); setSuccess('Bloque actualizado.')
    } catch (e) { setError(explicarFalla(e, 'actualizar el bloque')) }
    setLoading(false)
  }

  const eliminar = async (tabla, id, volver) => {
    const esOperario = tabla === 'operarios'
    const pregunta = esOperario
      ? '¿Desactivar este operario? Deja de aparecer en Asistencia, pero se conserva todo su historial de asistencia y adelantos.'
      : '¿Eliminar este registro? No se puede deshacer.'
    if (typeof window !== 'undefined' && !window.confirm(pregunta)) return
    setLoading(true); setError(''); setSuccess('')
    try {
      if (esOperario) await ejecutar(supabase.from('operarios').update({ activo: false }).eq('id', id))
      else await ejecutar(supabase.from(tabla).delete().eq('id', id))
      await fetchAll(); abrir(volver); setSuccess(esOperario ? 'Operario desactivado. Su historial se conserva.' : 'Registro eliminado.')
    } catch (e) { setError(explicarFalla(e, esOperario ? 'desactivar el operario' : 'eliminar el registro')) }
    setLoading(false)
  }

  const descargarBackup = async () => {
    setLoading(true); setError(''); setSuccess('')
    const tablas = [
      'campos', 'bloques', 'plantaciones', 'cultivos', 'abonos',
      'productos', 'categorias_producto', 'operarios', 'asistencia',
      'cosechas', 'ventas', 'costos', 'fumigaciones', 'fumigacion_productos',
      'fumigacion_bloques', 'fertilizaciones', 'fertilizacion_planes',
      'fertilizacion_plan_aplicaciones',
      'compradores', 'tareas', 'notas_modulo', 'vivero_lotes',
      'vivero_tratamientos', 'contabilidad_movimientos',
      'proveedores_credito', 'proveedor_movimientos',
      'asistencia_notas_dia', 'plan_nutricional_registros',
      'guest_access_links', 'app_user_roles', 'audit_log',
    ]

    const backup = {
      app: 'AgroBloque',
      generado_en: new Date().toISOString(),
      tablas: {},
      errores: {},
    }

    for (const tabla of tablas) {
      const { data, error } = await supabase.from(tabla).select('*')
      if (error) backup.errores[tabla] = error.message
      else backup.tablas[tabla] = data || []
    }

    descargarJson('agrobloque-backup', backup)
    const ahora = new Date().toISOString()
    if (typeof window !== 'undefined') window.localStorage.setItem(BACKUP_KEY, ahora)
    setUltimoBackup(ahora)
    setSuccess('Backup descargado')
    setLoading(false)
  }

  const crearInvitado = async () => {
    if (!form.nombre) return
    setLoading(true); setError(''); setSuccess(''); setLinkInvitado('')
    try {
      const { data, error } = await supabase.rpc('create_guest_access_link_v3', {
        p_nombre: form.nombre.trim(),
        p_campo_id_text: form.campo_id || '',
        p_dias_text: form.dias || '',
        p_permisos_json: Array.isArray(form.permisos) && form.permisos.length > 0 ? JSON.stringify(form.permisos) : '',
      })
      if (error) throw error
      if (!data?.ok || !data?.token) throw new Error(data?.error || 'No se pudo crear el token.')
      const token = data.token
      const url = `${window.location.origin}/invitado/${token}`
      setLinkInvitado(url)
      setSuccess('Link invitado creado. Copialo ahora.')
      setForm({ nombre:'', campo_id:'', dias:'30', permisos: [] })
      await fetchAll()
    } catch (e) {
      setError(`No se pudo crear el invitado. Ejecuta el SQL invitados_rpc_snapshot_2026_06_22_v3.sql. Detalle: ${e.message || 'sin detalle'}`)
    }
    setLoading(false)
  }

  const copiarLinkInvitado = async () => {
    if (!linkInvitado) return
    await navigator.clipboard.writeText(linkInvitado)
    setSuccess('Link copiado')
  }

  const desactivarInvitado = async (id) => {
    await supabase.from('guest_access_links').update({ activo:false }).eq('id', id)
    await fetchAll()
  }

  const guardarRol = async () => {
    if (!form.email || !form.rol) return
    const password = String(form.password || '')
    const passwordConfirm = String(form.password_confirm || '')
    const configuraAcceso = !form.id || Boolean(password || passwordConfirm)
    if (configuraAcceso && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (configuraAcceso && password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true); setError(''); setSuccess('')
    try {
      const payload = {
        email: form.email.trim().toLowerCase(),
        nombre: form.nombre || null,
        rol: form.rol,
        permisos: (Array.isArray(form.permisos) && form.permisos.length ? form.permisos : PERMISOS_MODULOS.map(m => m.key))
          .filter(key => !DISABLED_MODULES.includes(key) && (form.rol === 'admin' || !['asistencia', 'configuracion'].includes(key))),
        acciones: form.acciones && typeof form.acciones === 'object' ? form.acciones : null,
        activo: form.activo !== false,
        notas: form.notas || null,
        ...(organization?.id ? { organizacion_id: organization.id } : {}),
      }
      if (configuraAcceso) {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error('Tu sesión venció. Volvé a ingresar e intentá otra vez.')
        const response = await fetch('/api/invitar-usuario', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body: JSON.stringify({ ...payload, password }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'No se pudo crear la cuenta de acceso.')
      } else {
        const { error: roleError } = await supabase.from('app_user_roles').update(payload).eq('id', form.id)
        if (roleError) throw roleError
      }

      await fetchAll()
      abrir('roles', { email:'', nombre:'', rol:'operador', activo:true, notas:'', permisos: [], acciones: {}, password:'', password_confirm:'', mostrar_password:false })
      setSuccess(configuraAcceso ? 'Usuario habilitado. Ya puede ingresar con el correo y la contraseña que definiste.' : 'Permiso actualizado.')
    } catch (e) {
      setError('No se pudo guardar: ' + (e.message || 'Ejecuta primero el SQL profesional.'))
    }
    setLoading(false)
  }

  const eliminarRol = async (id) => {
    await supabase.from('app_user_roles').delete().eq('id', id)
    await fetchAll()
  }

  const menuItems = [
    { icon:'ti-user', title:'Cuenta', sub: perfil.nombre || perfil.email, action: () => abrir('cuenta', { nombre: perfil.nombre, email: perfil.email }) },
    { icon:'ti-building-community', title:'Empresa', sub: organization?.nombre || 'Configurar identidad', color:'#176a45', bg:'#edf6ec', action: () => abrir('empresa', { ...organization }) },
    { icon:'ti-building', title:'Campos', sub: campos.length + ' campos', action: () => abrir('campos') },
    { icon:'ti-seeding', title:'Cultivos', sub: cultivos.length + ' cultivos', color:"#124e38", bg:'#eeeeee', action: () => abrir('cultivos') },
    { icon:'ti-users', title:'Operarios', sub: operarios.length + ' personas', action: () => abrir('operarios') },
    { icon:'ti-leaf', title:'Abonos de base', sub: abonos.length + ' abonos', color:"#124e38", bg:'#eeeeee', action: () => abrir('abonos') },
    { icon:'ti-map', title:'Tipo de bloques', sub: 'Invernadero / campo abierto', color:"#124e38", bg:'#eeeeee', action: () => abrir('bloques') },
    { icon:'ti-building-store', title:'Compradores', sub: compradores.length + ' compradores', color:'#185fa5', bg:'#e6f1fb', action: () => navigate('/compradores') },
    { icon:'ti-receipt-2', title:'Cuentas a pagar', sub:'Créditos con proveedores', color:"#08603f", bg:'#edf6ec', action: () => navigate('/cuentas-pagar') },
    { icon:'ti-link', title:'Invitados', sub: invitados.filter(i => i.activo).length + ' activos', color:"#08603f", bg:'#edf6ec', action: () => abrir('invitados', { nombre:'', campo_id:'', dias:'30', permisos: [] }) },
    { icon:'ti-shield-lock', title:'Usuarios y permisos', sub: roles.length + ' registrados', color:"#08603f", bg:'#edf6ec', action: () => abrir('roles', { email:'', nombre:'', rol:'operador', activo:true, notas:'', permisos: [], acciones: {}, password:'', password_confirm:'', mostrar_password:false }) },
    { icon:'ti-history', title:'Auditoria', sub: 'Ver movimientos', color:"#124e38", bg:'#eeeeee', action: () => navigate('/auditoria') },
    { icon:'ti-download', title:'Backup de datos', sub: ultimoBackup ? `Último: ${String(ultimoBackup).slice(0,10)}${backupVencido() ? ' - recomendado' : ''}` : 'Recomendado ahora', color: backupVencido() ? '#e07b00' : '#176a25', bg: backupVencido() ? '#fff4e8' : '#edf6ec', action: descargarBackup },
    { icon:'ti-circle-plus', title:'Nueva empresa', sub:'Dar de alta un nuevo cliente', color:'#176a45', bg:'#edf6ec', platformOnly:true, action: () => abrir('nuevaEmpresa', { nombre:'', owner_email:'' }) },
    { icon:'ti-presentation', title:'Vista nuevo cliente', sub:'Probar el primer ingreso sin guardar datos', color:'#176a45', bg:'#edf6ec', platformOnly:true, action: () => navigate('/primeros-pasos') },
  ].filter((item, index) => (esAdmin || index === 0) && (!item.platformOnly || isPlatformAdmin))

  // --- Ventana unificada: cada «modal» es una vista con su título, cuerpo y acción principal.
  const fila = (clave, titulo, sub, acciones) => (
    <div className="apple-list__row" key={clave}>
      <div className="apple-list__main"><strong>{titulo}</strong>{sub ? <small>{sub}</small> : null}</div>
      {acciones ? <div className="apple-list__actions">{acciones}</div> : null}
    </div>
  )
  const mini = (texto, alPulsar, variante = '') => (
    <button type="button" className={`apple-mini-btn${variante ? ` apple-mini-btn--${variante}` : ''}`} onClick={alPulsar} disabled={loading}>{texto}</button>
  )
  const alInicio = () => document.querySelector('.apple-modal__body')?.scrollTo({ top: 0, behavior: 'smooth' })
  const campoNombre = (clave, etiqueta, placeholder, extra = {}) => (
    <ModalField label={etiqueta}>
      <input className="apple-control" data-autofocus value={form[clave] || ''} onChange={e => setForm(f => ({ ...f, [clave]: e.target.value }))} placeholder={placeholder} {...extra} />
    </ModalField>
  )
  const cantidad = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`

  let vista = null
  switch (modal) {
    case 'empresa':
      vista = {
        icon: 'ti-building-community', title: 'Identidad de la empresa',
        subtitle: 'Este nombre aparece en la barra lateral y en el acceso de invitados. AgroBloque sigue siendo la marca del producto.',
        submit: guardarEmpresa, submitLabel: 'Guardar empresa', summary: form.nombre || 'Nombre comercial de la empresa',
        body: <>
          <ModalSection title="Datos de la empresa" icon="ti-building-community">
            {campoNombre('nombre', 'Nombre comercial *', 'Ej: Horticultura San José', { maxLength: 100 })}
            <ModalGrid>
              <ModalField label="Email de la empresa"><input className="apple-control" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contacto@empresa.com" /></ModalField>
              <ModalField label="Teléfono"><input className="apple-control apple-control--num" type="tel" inputMode="tel" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+595 ..." /></ModalField>
            </ModalGrid>
            <ModalField label="URL del logotipo (opcional)"><input className="apple-control" type="url" value={form.logo_url || ''} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." /></ModalField>
            <ModalField label="Color principal">
              <div className="apple-colorfield">
                <input type="color" value={form.color_primario || '#0F3923'} onChange={e => setForm(f => ({ ...f, color_primario: e.target.value }))} aria-label="Color principal de la empresa" />
                <input className="apple-control apple-control--code" value={form.color_primario || '#0F3923'} onChange={e => setForm(f => ({ ...f, color_primario: e.target.value }))} pattern="#[0-9A-Fa-f]{6}" placeholder="#0F3923" />
              </div>
            </ModalField>
          </ModalSection>
        </>,
      }
      break
    case 'nuevaEmpresa':
      vista = {
        icon: 'ti-circle-plus', title: 'Nueva empresa cliente',
        subtitle: 'Crea un espacio de datos aislado y envía al dueño un correo para definir su contraseña.',
        submit: crearEmpresaCliente, submitLabel: 'Crear empresa y enviar invitación',
        summary: resumenPie([{ solo: String(form.nombre || '').trim() }, { solo: String(form.owner_email || '').trim() }]) || 'Nombre de la empresa y correo del dueño',
        body: <>
          <ModalSection title="Empresa y dueño" icon="ti-building-community">
            {campoNombre('nombre', 'Nombre comercial *', 'Ej: Horticultura San José', { maxLength: 100 })}
            <ModalField label="Email del dueño *"><input className="apple-control" type="email" value={form.owner_email || ''} onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))} placeholder="dueno@empresa.com" /></ModalField>
            <p className="apple-note" role="note"><i className="ti ti-shield-lock" aria-hidden="true" /> La nueva empresa no podrá ver datos de otros clientes. Su dueño será administrador únicamente de ese espacio.</p>
          </ModalSection>
        </>,
      }
      break
    case 'invitados':
      vista = {
        icon: 'ti-link', title: 'Invitados de solo lectura', subtitle: 'El invitado entra con un link y no puede editar ni borrar datos.',
        submit: crearInvitado, submitLabel: 'Crear acceso invitado',
        summary: resumenPie([{ n: invitados.filter(i => i.activo).length, texto: 'links activos', uno: 'link activo' }]) || 'Todavía no hay links activos',
        body: <>
          <ModalSection title="Nuevo acceso" icon="ti-link">
            {campoNombre('nombre', 'Nombre del invitado *', 'Ej: Contador, asesor técnico')}
            <ModalGrid>
              <ModalField label="Campo permitido">
                <select className="apple-control" value={form.campo_id || ''} onChange={e => setForm(f => ({ ...f, campo_id: e.target.value }))}>
                  <option value="">Todos los campos</option>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </ModalField>
              <ModalField label="Vencimiento">
                <select className="apple-control" value={form.dias || ''} onChange={e => setForm(f => ({ ...f, dias: e.target.value }))}>
                  <option value="7">Vence en 7 días</option>
                  <option value="30">Vence en 30 días</option>
                  <option value="90">Vence en 90 días</option>
                  <option value="">Sin vencimiento</option>
                </select>
              </ModalField>
            </ModalGrid>
          </ModalSection>
          <ModalSection title="Módulos permitidos" icon="ti-lock-open" collapsible defaultOpen={false} badge={Array.isArray(form.permisos) && form.permisos.length ? cantidad(form.permisos.length, 'módulo', 'módulos') : 'todos'}>
            <PermisosSelector permisos={form.permisos} ayuda="Elegí exactamente a qué apartados puede entrar este invitado." onChange={permisos => setForm(f => ({ ...f, permisos }))} />
          </ModalSection>
          {linkInvitado && (
            <div className="apple-linkbox">
              <strong>Link creado</strong>
              <code>{linkInvitado}</code>
              <button type="button" className="apple-btn apple-btn--primary" onClick={copiarLinkInvitado}><i className="ti ti-copy" aria-hidden="true" />Copiar link</button>
            </div>
          )}
          <ModalSection title="Links creados" icon="ti-list">
            {invitados.length === 0 ? <p className="apple-empty">Sin invitados creados.</p> : (
              <div className="apple-list">
                {invitados.map(inv => fila(
                  inv.id, inv.nombre,
                  `${inv.campos?.nombre || 'Todos los campos'} · ${inv.activo ? 'Activo' : 'Desactivado'}${inv.expires_at ? ` · vence ${String(inv.expires_at).slice(0, 10)}` : ''}`,
                  inv.activo ? mini('Desactivar', () => desactivarInvitado(inv.id), 'danger') : null,
                ))}
              </div>
            )}
          </ModalSection>
        </>,
      }
      break
    case 'roles':
      vista = {
        icon: 'ti-shield-lock', title: 'Usuarios y permisos',
        subtitle: 'Definí el correo y una contraseña inicial. Compartí esos datos con la persona por un canal privado.',
        submit: guardarRol,
        submitLabel: form.id ? ((form.password || form.password_confirm) ? 'Guardar y actualizar acceso' : 'Guardar cambios') : 'Crear usuario',
        summary: resumenPie([{ solo: form.email || '' }, { solo: { admin: 'Admin', operador: 'Operador', lectura: 'Solo lectura' }[form.rol || 'operador'] }]) || 'Correo y rol del usuario',
        body: <>
          <ModalSection title={form.id ? 'Editar usuario' : 'Agregar usuario'} icon="ti-user-plus">
            <ModalGrid>
              <ModalField label="Correo *"><input className="apple-control" data-autofocus type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@empresa.com" /></ModalField>
              <ModalField label="Nombre"><input className="apple-control" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" /></ModalField>
            </ModalGrid>
            <ModalGroup label="Rol">
              <ChoiceChips label="Rol del usuario" value={form.rol || 'operador'} onChange={rol => setForm(f => ({ ...f, rol }))} options={[{ value: 'admin', label: 'Admin', icon: 'ti-shield-check' }, { value: 'operador', label: 'Operador', icon: 'ti-user-cog' }, { value: 'lectura', label: 'Solo lectura', icon: 'ti-eye' }]} />
            </ModalGroup>
          </ModalSection>
          <ModalSection title="Contraseña" icon="ti-key">
            <ModalGrid>
              <ModalField label={form.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial *'}><input className="apple-control" type={form.mostrar_password ? 'text' : 'password'} value={form.password || ''} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" minLength="8" autoComplete="new-password" /></ModalField>
              <ModalField label={form.id ? 'Repetir nueva contraseña' : 'Repetir contraseña *'}><input className="apple-control" type={form.mostrar_password ? 'text' : 'password'} value={form.password_confirm || ''} onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))} placeholder="Escribila nuevamente" minLength="8" autoComplete="new-password" /></ModalField>
            </ModalGrid>
            <div className="apple-chips"><button type="button" className="apple-chip" aria-pressed={Boolean(form.mostrar_password)} onClick={() => setForm(f => ({ ...f, mostrar_password: !f.mostrar_password }))}><i className={`ti ${form.mostrar_password ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" />Mostrar contraseña</button></div>
            <p className="apple-note" role="note"><i className="ti ti-shield-lock" aria-hidden="true" /> AgroBloque no guarda esta contraseña en sus tablas. Supabase la protege y después no podrá mostrarse nuevamente.</p>
          </ModalSection>
          <ModalSection title="Módulos permitidos" icon="ti-lock-open" collapsible defaultOpen={false} badge={Array.isArray(form.permisos) && form.permisos.length ? cantidad(form.permisos.length, 'módulo', 'módulos') : 'todos'}>
            <PermisosSelector permisos={form.permisos} ayuda="Elegí exactamente a qué apartados puede entrar este usuario." onChange={permisos => setForm(f => ({ ...f, permisos }))} />
          </ModalSection>
          <ModalSection title="Acciones permitidas" icon="ti-adjustments" collapsible defaultOpen={false} badge="ver, crear, editar, borrar">
            <AccionesSelector permisos={form.permisos} acciones={form.acciones} rol={form.rol || 'operador'} onChange={acciones => setForm(f => ({ ...f, acciones }))} />
          </ModalSection>
          <ModalSection title="Notas internas" icon="ti-notes" collapsible defaultOpen={Boolean(form.notas)} badge={form.notas ? '' : 'opcional'}>
            <ModalField label="Notas"><textarea className="apple-control" value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Notas internas" /></ModalField>
          </ModalSection>
          <ModalSection title="Registrados" icon="ti-users">
            {roles.length === 0 ? <p className="apple-empty">Sin usuarios registrados.</p> : (
              <div className="apple-list">
                {roles.map(r => fila(r.id, r.nombre || r.email, `${r.email} · ${r.rol}`, <>
                  {mini('Editar', () => { setForm({ ...r, permisos: Array.isArray(r.permisos) ? r.permisos : [], acciones: r.acciones || {}, password: '', password_confirm: '', mostrar_password: false }); alInicio() })}
                  {mini('Borrar', () => eliminarRol(r.id), 'danger')}
                </>))}
              </div>
            )}
          </ModalSection>
        </>,
      }
      break
    case 'cuenta':
      vista = {
        icon: 'ti-user', title: 'Mi cuenta', subtitle: perfil.email, summary: perfil.nombre || perfil.email,
        body: <>
          <ModalSection title="Foto" icon="ti-camera">
            <div className="apple-avatar">
              <div className="apple-avatar__img">
                {perfil.foto ? <img src={perfil.foto} alt="Foto de perfil" /> : <span aria-hidden="true"><i className="ti ti-user" /></span>}
                <button type="button" aria-label="Cambiar foto" onClick={() => fotoRef.current?.click()}><i className="ti ti-camera" aria-hidden="true" /></button>
              </div>
              <small>Tocá la cámara para cambiar la foto. Se guarda solo en este dispositivo.</small>
            </div>
          </ModalSection>
          <ModalSection title="Nombre" icon="ti-id">
            <ModalField label="Nombre"><input className="apple-control" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Tu nombre" /></ModalField>
            <div className="apple-actionbar"><button type="button" className="apple-btn apple-btn--primary" onClick={guardarNombre} disabled={loading}>{loading ? 'Guardando…' : 'Guardar nombre'}</button></div>
          </ModalSection>
          <ModalSection title="Correo" icon="ti-mail">
            <ModalField label="Email" hint="Si cambiás el email, vas a recibir un link de confirmación."><input className="apple-control" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="nuevo@email.com" /></ModalField>
            <div className="apple-actionbar"><button type="button" className="apple-btn apple-btn--primary" onClick={guardarEmail} disabled={loading}>{loading ? 'Guardando…' : 'Cambiar email'}</button></div>
          </ModalSection>
          <ModalSection title="Contraseña" icon="ti-key">
            <ModalGrid>
              <ModalField label="Nueva contraseña"><input className="apple-control" type="password" autoComplete="new-password" value={form.nueva || ''} onChange={e => setForm(f => ({ ...f, nueva: e.target.value }))} placeholder="Mínimo 6 caracteres" /></ModalField>
              <ModalField label="Repetir contraseña"><input className="apple-control" type="password" autoComplete="new-password" value={form.repetir || ''} onChange={e => setForm(f => ({ ...f, repetir: e.target.value }))} placeholder="Repetir contraseña" /></ModalField>
            </ModalGrid>
            <div className="apple-actionbar"><button type="button" className="apple-btn apple-btn--danger" onClick={guardarContrasena} disabled={loading}>{loading ? 'Guardando…' : 'Cambiar contraseña'}</button></div>
          </ModalSection>
        </>,
      }
      break
    case 'campos':
      vista = {
        icon: 'ti-map-pin', title: 'Campos', subtitle: 'Organizá los espacios productivos de tu empresa. Cada campo puede tener sus propios bloques.',
        submit: () => abrir('editarCampo', { nombre: '' }), submitLabel: 'Crear campo', summary: cantidad(campos.length, 'campo registrado', 'campos registrados'),
        body: campos.length === 0
          ? <p className="apple-empty">Todavía no hay campos. Creá el primero para empezar a organizar tus bloques.</p>
          : <div className="apple-list">{campos.map(c => {
            const n = bloques.filter(b => b.campo_id === c.id).length
            return fila(c.id, c.nombre, cantidad(n, 'bloque', 'bloques'), mini('Editar', () => abrir('editarCampo', { id: c.id, nombre: c.nombre })))
          })}</div>,
      }
      break
    case 'editarCampo':
      vista = {
        icon: form.id ? 'ti-edit' : 'ti-map-plus', title: form.id ? 'Editar campo' : 'Nuevo campo',
        subtitle: form.id ? 'Cambiá el nombre sin afectar sus bloques ni registros.' : 'Después de crearlo podrás entrar en Bloques y cargar su distribución.',
        submit: guardarCampo, submitDisabled: String(form.nombre || '').trim().length < 2, submitLabel: form.id ? 'Guardar cambios' : 'Crear campo',
        cancelLabel: 'Volver', onCancel: () => abrir('campos'), summary: String(form.nombre || '').trim() || 'Nombre del campo',
        body: campoNombre('nombre', 'Nombre del campo *', 'Ej: Campo Norte', { maxLength: 100, onKeyDown: e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !loading) { e.preventDefault(); guardarCampo() } } }),
      }
      break
    case 'cultivos':
      vista = {
        icon: 'ti-seeding', title: 'Cultivos', submit: () => abrir('editarCultivo', {}), submitLabel: 'Agregar cultivo', summary: cantidad(cultivos.length, 'cultivo', 'cultivos'),
        body: cultivos.length === 0 ? <p className="apple-empty">Todavía no hay cultivos.</p> : <div className="apple-list">{cultivos.map(c => fila(c.id, c.nombre, null, <>
          {mini('Editar', () => abrir('editarCultivo', { id: c.id, nombre: c.nombre }))}
          {mini('Eliminar', () => eliminar('cultivos', c.id, 'cultivos'), 'danger')}
        </>))}</div>,
      }
      break
    case 'editarCultivo':
      vista = {
        icon: 'ti-seeding', title: form.id ? 'Editar cultivo' : 'Nuevo cultivo', submit: guardarCultivo, submitLabel: 'Guardar',
        cancelLabel: 'Volver', onCancel: () => abrir('cultivos'), summary: String(form.nombre || '').trim() || 'Nombre del cultivo',
        body: campoNombre('nombre', 'Nombre *', 'Ej: Morrón'),
      }
      break
    case 'operarios':
      vista = {
        icon: 'ti-users', title: 'Operarios', summary: cantidad(operarios.filter(o => o.activo !== false).length, 'persona', 'personas'),
        body: campos.length === 0 ? <p className="apple-empty">Primero creá un campo.</p> : <>{campos.map(campo => (
          <ModalSection title={campo.nombre} icon="ti-map-pin" key={campo.id}>
            {operarios.filter(o => o.campo_id === campo.id && o.activo !== false).length === 0 && <p className="apple-empty">Sin personal en este campo.</p>}
            <div className="apple-list">{operarios.filter(o => o.campo_id === campo.id && o.activo !== false).map(o => fila(o.id, o.nombre, null, <>
              {mini('Editar', () => abrir('editarOperario', { id: o.id, nombre: o.nombre, campo_id: o.campo_id }))}
              {mini('Desactivar', () => eliminar('operarios', o.id, 'operarios'), 'danger')}
            </>))}</div>
            <button type="button" className="apple-add" onClick={() => abrir('editarOperario', { campo_id: campo.id })}><i className="ti ti-plus" aria-hidden="true" />Agregar a {campo.nombre}</button>
          </ModalSection>
        ))}</>,
      }
      break
    case 'editarOperario':
      vista = {
        icon: 'ti-user', title: form.id ? 'Editar operario' : 'Nuevo operario', submit: guardarOperario, submitLabel: 'Guardar',
        cancelLabel: 'Volver', onCancel: () => abrir('operarios'), summary: String(form.nombre || '').trim() || 'Nombre del operario',
        body: campoNombre('nombre', 'Nombre *', 'Nombre del operario'),
      }
      break
    case 'abonos':
      vista = {
        icon: 'ti-leaf', title: 'Abonos de base', submit: () => abrir('editarAbono', {}), submitLabel: 'Agregar abono', summary: cantidad(abonos.length, 'abono', 'abonos'),
        body: abonos.length === 0 ? <p className="apple-empty">Todavía no hay abonos.</p> : <div className="apple-list">{abonos.map(a => fila(a.id, a.nombre, null, <>
          {mini('Editar', () => abrir('editarAbono', { id: a.id, nombre: a.nombre }))}
          {mini('Eliminar', () => eliminar('abonos', a.id, 'abonos'), 'danger')}
        </>))}</div>,
      }
      break
    case 'editarAbono':
      vista = {
        icon: 'ti-leaf', title: form.id ? 'Editar abono' : 'Nuevo abono', submit: guardarAbono, submitLabel: 'Guardar',
        cancelLabel: 'Volver', onCancel: () => abrir('abonos'), summary: String(form.nombre || '').trim() || 'Nombre del abono',
        body: campoNombre('nombre', 'Nombre *', 'Ej: 15-15-15'),
      }
      break
    case 'bloques':
      vista = {
        icon: 'ti-map', title: 'Tipo de bloques', subtitle: 'Tocá un bloque para cambiar si es invernadero o campo abierto.', summary: cantidad(bloques.length, 'bloque', 'bloques'),
        body: campos.length === 0 ? <p className="apple-empty">Primero creá un campo.</p> : <>{campos.map(campo => (
          <ModalSection title={campo.nombre} icon="ti-map-pin" key={campo.id}>
            <div className="apple-chips apple-chips--wrap">
              {bloques.filter(b => b.campo_id === campo.id).map(b => (
                <button type="button" key={b.id} className="apple-chip apple-chip--lg" aria-pressed={b.tipo === 'invernadero'} onClick={() => abrir('editarBloque', { id: b.id, codigo: b.codigo, tipo: b.tipo })}>
                  <span>{b.codigo} · {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}</span>
                </button>
              ))}
            </div>
          </ModalSection>
        ))}</>,
      }
      break
    case 'editarBloque':
      vista = {
        icon: 'ti-map', title: `Bloque ${form.codigo || ''}`, subtitle: 'Seleccioná el tipo de este bloque.', submit: guardarBloque, submitLabel: 'Guardar',
        cancelLabel: 'Volver', onCancel: () => abrir('bloques'), summary: form.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto',
        body: <ModalGroup label="Tipo de bloque"><ChoiceChips label="Tipo de bloque" value={form.tipo} onChange={tipo => setForm(f => ({ ...f, tipo }))} options={[{ value: 'invernadero', label: 'Invernadero', icon: 'ti-building-warehouse' }, { value: 'campo_abierto', label: 'Campo abierto', icon: 'ti-plant-2' }]} /></ModalGroup>,
      }
      break
    default:
      break
  }

  return (
    <div className="ag-page ui-c1c124">
      <input className="ui-cb4589" type="file" accept="image/*" ref={fotoRef} onChange={subirFotoPerfil} />

      <div className="ui-327143">
        <div className="ui-476525">Sistema</div>
        <div className="ag-page-title ui-83e514">Configuración</div>
        {error && !modal && <div className="ui-e136cb">{error}</div>}
        {success && !modal && <div className="ui-c90154">{success}</div>}

        {/* Tarjeta de perfil rapida */}
        <div className="ui-528a72">
          <div className="ui-e020d3">
            {perfil.foto ? (
              <img className="ui-ba97c6" src={perfil.foto} alt="perfil"
               />
            ) : (
              <div className="ui-cb1feb">
                <i className="ti ti-user ui-a1fcc8" aria-hidden="true"></i>
              </div>
            )}
            <button aria-label="Cambiar foto" className="ag-small-action ui-3b8eb9" onClick={() => fotoRef.current?.click()}
             >
              <i className="ti ti-camera ui-aa481a" aria-hidden="true"></i>
            </button>
          </div>
          <div className="ui-89bd09">
            <div className="ui-3eb7c1">
              {perfil.nombre || 'Sin nombre'}
            </div>
            <div className="ui-e571fd">{perfil.email}</div>
          </div>
          <button className="ag-small-action ui-6d9a58" onClick={() => abrir('cuenta', { nombre: perfil.nombre, email: perfil.email })}
           >
            Editar
          </button>
        </div>
      </div>

      <div className="ui-1a3247">
        <section className="ag-surface ag-appearance-setting" aria-labelledby="appearance-title">
          <div className="ag-appearance-setting__header">
            <span className="ag-theme-setting__icon" aria-hidden="true"><i className={`ti ${theme === 'dark' ? 'ti-moon-stars' : 'ti-sun'}`} /></span>
            <span className="ag-theme-setting__copy"><strong id="appearance-title">Apariencia</strong><small>Elegí cómo querés ver AgroBloque en este dispositivo</small></span>
          </div>
          <div className="ag-theme-options" role="radiogroup" aria-label="Tema de la aplicación">
            {[
              ['light', 'ti-sun', 'Claro'],
              ['dark', 'ti-moon-stars', 'Oscuro'],
              ['system', 'ti-device-desktop', 'Del dispositivo'],
            ].map(([value, icon, label]) => (
              <button type="button" key={value} className={themeMode === value ? 'is-selected' : ''} role="radio" aria-checked={themeMode === value} onClick={() => onThemeChange?.(value)}>
                <i className={`ti ${icon}`} aria-hidden="true" />
                <span>{label}</span>
                <i className={`ti ${themeMode === value ? 'ti-circle-check-filled' : 'ti-circle'}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
        {(esAdmin || isPlatformAdmin) && <SeguridadDosFactores obligatorio={isPlatformAdmin} />}
        {esAdmin && !isPlatformAdmin && <SoporteCliente />}
        {menuItems.map((it, i) => (
          <div className="ag-surface ui-f40337" role="button" tabIndex={0} key={i} onClick={it.action} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.action() } }}>
            <div className="ui-3044e7" style={{ background: it.bg || '#f2f1ef' }}>
              <i className={`${`ti ${it.icon}`} ui-bf83cf`} style={{ color: it.color || '#0a0a0a' }} aria-hidden="true"></i>
            </div>
            <div className="ui-da5cd6">
              <div className="ui-451b76">{it.title}</div>
              <div className="ui-2cf511">{it.sub}</div>
            </div>
            <i className="ti ti-chevron-right ui-d63ae8" aria-hidden="true"></i>
          </div>
        ))}
        <div className="ag-surface ui-4000ee" role="button" tabIndex={0} onClick={() => forceLocalSignOut()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); forceLocalSignOut() } }}>
          <div className="ui-fce2c6">Cerrar sesión</div>
        </div>
      </div>

      <UnifiedFormModal
        open={Boolean(vista)}
        tone="neutral"
        icon={vista?.icon}
        eyebrow="Configuración"
        title={vista?.title}
        subtitle={vista?.subtitle}
        label={vista?.title || 'Configuración'}
        busy={loading}
        onClose={cerrar}
        onCancel={vista?.onCancel}
        onSubmit={vista?.submit}
        submitDisabled={vista?.submitDisabled}
        submitLabel={vista ? (vista.submit ? vista.submitLabel : null) : undefined}
        cancelLabel={vista?.cancelLabel || 'Cerrar'}
        error={modal ? error : ''}
        summary={vista?.summary}
      >{() => vista?.body}</UnifiedFormModal>
    </div>
  )
}

