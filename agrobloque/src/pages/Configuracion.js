import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '../components/UI'
import { useNavigate } from 'react-router-dom'
import { createProvisioningAuthClient, forceLocalSignOut, supabase } from '../lib/supabase'
import { descargarJson } from '../lib/exporters'
import { ACTIONS, DISABLED_MODULES } from '../lib/permissions'
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
  { key: 'configuracion', label: 'Configuracion' },
].filter(m => !DISABLED_MODULES.includes(m.key))

const crearContrasenaTemporal = () => {
  const bytes = new Uint8Array(24)
  window.crypto.getRandomValues(bytes)
  return `Agb!${Array.from(bytes, value => value.toString(36)).join('')}`
}

const ABONO_BASE_CATEGORIA = 'Abono de base'
const FOTO_PERFIL_KEY = 'agrobloque-foto-perfil'
const BACKUP_KEY = 'agrobloque-ultimo-backup'

const normalizarNombre = (valor) => String(valor || '').trim().toLowerCase()
const esDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1100

function PermisosSelector({ permisos, onChange, ayuda }) {
  return (
    <div className="ui-2bd9c0">
      <div className="ui-704136">Modulos permitidos</div>
      {ayuda && <div className="ui-a3bdd9">{ayuda}</div>}
      <div className="ui-ffec37">
        {PERMISOS_MODULOS.map(m => {
          const checked = !Array.isArray(permisos) || permisos.length === 0 || permisos.includes(m.key)
          return (
            <label className="ui-9d30ce" key={m.key}>
              <input
                type="checkbox"
                checked={checked}
                onChange={e => {
                  const actual = Array.isArray(permisos) && permisos.length > 0
                    ? permisos
                    : PERMISOS_MODULOS.map(x => x.key)
                  onChange(e.target.checked
                    ? [...new Set([...actual, m.key])]
                    : actual.filter(k => k !== m.key)
                  )
                }}
              />
              <span>{m.label}</span>
            </label>
          )
        })}
      </div>
      <div className="ui-3421f7">Si desmarcas un modulo, no aparece en el menu ni en accesos.</div>
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
    <div className="ag-surface ui-91fc48">
      <div className="ui-704136">Acciones permitidas</div>
      <div className="ui-a3bdd9">Define si este usuario puede ver, crear, editar o borrar en cada modulo permitido.</div>
      <div className="ui-36396b">
        {modulosActivos.map(m => {
          const actuales = Array.isArray(acciones?.[m.key]) ? acciones[m.key] : defaults
          return (
            <div className="ui-006580" key={m.key}>
              <strong className="ui-cfbe51">{m.label}</strong>
              {ACTIONS.map(a => (
                <label className="ui-d74de0" key={a.key}>
                  <input
                    type="checkbox"
                    checked={actuales.includes(a.key)}
                    disabled={a.key === 'view'}
                    onChange={e => {
                      const base = Array.isArray(acciones?.[m.key]) ? acciones[m.key] : defaults
                      const nuevo = e.target.checked
                        ? [...new Set([...base, a.key, 'view'])]
                        : base.filter(k => k !== a.key)
                      onChange({ ...(acciones || {}), [m.key]: nuevo })
                    }}
                  />
                  {a.label}
                </label>
              ))}
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

export default function Configuracion({ role, organization = { nombre:'AgroBloque' }, onOrganizationUpdate, theme = 'light', onThemeToggle }) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) { setError('Ingresá un email válido para el dueño'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      const { data, error } = await supabase.rpc('provision_organization', {
        p_nombre: nombre,
        p_owner_email: ownerEmail,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'No se pudo crear la empresa')

      const authClient = createProvisioningAuthClient()
      const redirectTo = `${window.location.origin}/?auth_action=set-password`
      const { data: signupData, error: signupError } = await authClient.auth.signUp({
        email: ownerEmail,
        password: crearContrasenaTemporal(),
        options: {
          emailRedirectTo: redirectTo,
          data: { nombre, rol: 'admin', organizacion_id: data.organizacion_id },
        },
      })
      const yaRegistrado = /already|registered|exists|existe|registrad/i.test(signupError?.message || '') || signupData?.user?.identities?.length === 0
      if (signupError && !yaRegistrado) throw signupError
      if (yaRegistrado) {
        const { error: resetError } = await authClient.auth.resetPasswordForEmail(ownerEmail, { redirectTo })
        if (resetError) throw resetError
      }

      setForm({ nombre:'', owner_email:'' })
      setSuccess(`Empresa creada. Enviamos la invitación a ${ownerEmail}.`)
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

  const guardarCultivo = async () => {
    if (!form.nombre) return; setLoading(true); setError('')
    try {
      if (form.id) await supabase.from('cultivos').update({ nombre: form.nombre }).eq('id', form.id)
      else await supabase.from('cultivos').insert({ nombre: form.nombre })
      await fetchAll(); abrir('cultivos')
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const guardarOperario = async () => {
    if (!form.nombre) return; setLoading(true); setError('')
    try {
      if (form.id) await supabase.from('operarios').update({ nombre: form.nombre }).eq('id', form.id)
      else await supabase.from('operarios').insert({ nombre: form.nombre, campo_id: form.campo_id })
      await fetchAll(); abrir('operarios')
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const guardarAbono = async () => {
    if (!form.nombre) return; setLoading(true); setError('')
    try {
      const nombre = form.nombre.trim()
      const anterior = form.id ? abonos.find(a => a.id === form.id)?.nombre : ''
      if (form.id) await supabase.from('abonos').update({ nombre }).eq('id', form.id)
      else await supabase.from('abonos').insert({ nombre })
      await sincronizarProductoAbono(nombre, anterior)
      await fetchAll(); abrir('abonos')
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const guardarBloque = async () => {
    if (!form.id) return; setLoading(true); setError('')
    try {
      await supabase.from('bloques').update({ tipo: form.tipo }).eq('id', form.id)
      await fetchAll(); abrir('bloques')
    } catch (e) { setError('Error: ' + e.message) }
    setLoading(false)
  }

  const eliminar = async (tabla, id, volver) => {
    await supabase.from(tabla).delete().eq('id', id)
    await fetchAll(); abrir(volver)
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

  const listItem = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:"1px solid #f6f8f7" }
  const addBtn = { width:'100%', padding:12, borderRadius:'var(--ag-radius)', border:'1px dashed #d4b89a', background:'#eeeeee', fontSize:13, color:"#124e38", cursor:'pointer', marginTop:8, fontWeight:500 }

  const menuItems = [
    { icon:'ti-user', title:'Cuenta', sub: perfil.nombre || perfil.email, action: () => abrir('cuenta', { nombre: perfil.nombre, email: perfil.email }) },
    { icon:'ti-building-community', title:'Empresa', sub: organization?.nombre || 'Configurar identidad', color:'#176a45', bg:'#edf6ec', action: () => abrir('empresa', { ...organization }) },
    { icon:'ti-building', title:'Campos', sub: campos.length + ' campos', action: () => abrir('campos') },
    { icon:'ti-seeding', title:'Cultivos', sub: cultivos.length + ' cultivos', color:"#124e38", bg:'#eeeeee', action: () => abrir('cultivos') },
    { icon:'ti-users', title:'Operarios', sub: operarios.length + ' personas', action: () => abrir('operarios') },
    { icon:'ti-leaf', title:'Abonos de base', sub: abonos.length + ' abonos', color:"#124e38", bg:'#eeeeee', action: () => abrir('abonos') },
    { icon:'ti-map', title:'Tipo de bloques', sub: 'Invernadero / campo abierto', color:"#124e38", bg:'#eeeeee', action: () => abrir('bloques') },
    { icon:'ti-building-store', title:'Compradores', sub: compradores.length + ' compradores', color:'#185fa5', bg:'#e6f1fb', action: () => navigate('/compradores') },
    { icon:'ti-receipt-2', title:'Cuentas a pagar', sub:'Creditos con proveedores', color:"#08603f", bg:'#edf6ec', action: () => navigate('/cuentas-pagar') },
    { icon:'ti-link', title:'Invitados', sub: invitados.filter(i => i.activo).length + ' activos', color:"#08603f", bg:'#edf6ec', action: () => abrir('invitados', { nombre:'', campo_id:'', dias:'30', permisos: [] }) },
    { icon:'ti-shield-lock', title:'Usuarios y permisos', sub: roles.length + ' registrados', color:"#08603f", bg:'#edf6ec', action: () => abrir('roles', { email:'', nombre:'', rol:'operador', activo:true, notas:'', permisos: [], acciones: {}, password:'', password_confirm:'', mostrar_password:false }) },
    { icon:'ti-history', title:'Auditoria', sub: 'Ver movimientos', color:"#124e38", bg:'#eeeeee', action: () => navigate('/auditoria') },
    { icon:'ti-download', title:'Backup de datos', sub: ultimoBackup ? `Ultimo: ${String(ultimoBackup).slice(0,10)}${backupVencido() ? ' - recomendado' : ''}` : 'Recomendado ahora', color: backupVencido() ? '#e07b00' : '#176a25', bg: backupVencido() ? '#fff4e8' : '#edf6ec', action: descargarBackup },
    { icon:'ti-building-plus', title:'Nueva empresa', sub:'Dar de alta un nuevo cliente', color:'#176a45', bg:'#edf6ec', platformOnly:true, action: () => abrir('nuevaEmpresa', { nombre:'', owner_email:'' }) },
    { icon:'ti-presentation', title:'Vista nuevo cliente', sub:'Probar el primer ingreso sin guardar datos', color:'#176a45', bg:'#edf6ec', platformOnly:true, action: () => navigate('/primeros-pasos') },
  ].filter((item, index) => (esAdmin || index === 0) && (!item.platformOnly || isPlatformAdmin))

  return (
    <div className="ag-page ui-c1c124">
      <input className="ui-cb4589" type="file" accept="image/*" ref={fotoRef} onChange={subirFotoPerfil} />

      <div className="ui-327143">
        <div className="ui-476525">Sistema</div>
        <div className="ag-page-title ui-83e514">Configuracion</div>
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
        <button type="button" className="ag-surface ag-theme-setting" onClick={onThemeToggle} role="switch" aria-checked={theme === 'dark'}>
          <span className="ag-theme-setting__icon" aria-hidden="true"><i className={`ti ${theme === 'dark' ? 'ti-moon-stars' : 'ti-sun'}`} /></span>
          <span className="ag-theme-setting__copy"><strong>Apariencia</strong><small>{theme === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado'}</small></span>
          <span className="ag-theme-toggle__track" aria-hidden="true"><span className="ag-theme-toggle__thumb" /></span>
        </button>
        {menuItems.map((it, i) => (
          <div className="ag-surface ui-f40337" key={i} onClick={it.action}>
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
        <div className="ag-surface ui-4000ee" onClick={() => forceLocalSignOut()}>
          <div className="ui-fce2c6">Cerrar sesion</div>
        </div>
      </div>

      {modal && (
        <Modal busy={loading} onClose={cerrar} label="Configuracion" style={{
          position:'fixed',
          top:0,
          left:0,
          right:0,
          bottom:0,
          background:'rgba(0,0,0,0.4)',
          zIndex:100,
          display:'flex',
          alignItems: esDesktop() ? 'center' : 'flex-end',
          justifyContent:'center',
          padding: esDesktop() ? 24 : 0,
          boxSizing:'border-box',
        }}>
          <div className="ag-config-modal-card ui-70723f" style={{ borderRadius: esDesktop() ? 24 : '24px 24px 0 0', maxWidth: esDesktop() ? 620 : 480, maxHeight: esDesktop() ? '82vh' : '88vh', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none', boxShadow: esDesktop() ? '0 28px 70px rgba(0,0,0,0.28)' : 'none' }}>

            <div className="ag-config-modal-toolbar">
              <button
                type="button"
                className="ag-config-modal-close ag-close-btn"
                onClick={cerrar}
                disabled={loading}
                aria-label="Cerrar configuracion"
                title="Cerrar"
              >
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>

            {error && <div className="ui-e136cb">{error}</div>}
            {success && <div className="ui-c90154">{success}</div>}

            {modal === 'empresa' && <>
              <div className="ui-c7b1b6">Identidad de la empresa</div>
              <div className="ui-7d5827">Este nombre aparece en la barra lateral y en el acceso de invitados. AgroBloque sigue siendo la marca del producto.</div>
              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">Nombre comercial
                  <input className="bl-input" value={form.nombre || ''} maxLength="100" onChange={e => setForm(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Horticultura San José" />
                </label>
                <label className="ag-field-label ui-486335">Email de la empresa
                  <input className="bl-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email:e.target.value }))} placeholder="contacto@empresa.com" />
                </label>
                <label className="ag-field-label ui-486335">Teléfono
                  <input className="bl-input" type="tel" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono:e.target.value }))} placeholder="+595 ..." />
                </label>
                <label className="ag-field-label ui-486335">URL del logotipo (opcional)
                  <input className="bl-input" type="url" value={form.logo_url || ''} onChange={e => setForm(f => ({ ...f, logo_url:e.target.value }))} placeholder="https://..." />
                </label>
                <label className="ag-field-label ui-486335">Color principal
                  <div className="organization-color-field">
                    <input type="color" value={form.color_primario || '#0F3923'} onChange={e => setForm(f => ({ ...f, color_primario:e.target.value }))} aria-label="Color principal de la empresa" />
                    <input className="bl-input" style={{ marginBottom:0 }} value={form.color_primario || '#0F3923'} onChange={e => setForm(f => ({ ...f, color_primario:e.target.value }))} pattern="#[0-9A-Fa-f]{6}" placeholder="#0F3923" />
                  </div>
                </label>
                <button className="bl-btn bl-btn--primary" onClick={guardarEmpresa} disabled={loading}>{loading ? 'Guardando...' : 'Guardar empresa'}</button>
              </div>
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'nuevaEmpresa' && <>
              <div className="ui-c7b1b6">Nueva empresa cliente</div>
              <div className="ui-7d5827">Crea un espacio de datos aislado y envía al dueño un correo para definir su contraseña.</div>
              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">Nombre comercial
                  <input className="bl-input" value={form.nombre || ''} maxLength="100" onChange={e => setForm(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Horticultura San José" />
                </label>
                <label className="ag-field-label ui-486335">Email del dueño
                  <input className="bl-input" type="email" value={form.owner_email || ''} onChange={e => setForm(f => ({ ...f, owner_email:e.target.value }))} placeholder="dueno@empresa.com" />
                </label>
                <div className="ui-ca26cd" role="note">
                  <i className="ti ti-shield-lock ui-6f7515" aria-hidden="true" />
                  <span>La nueva empresa no podrá ver datos de otros clientes. Su dueño será administrador únicamente de ese espacio.</span>
                </div>
                <button className="bl-btn bl-btn--primary" onClick={crearEmpresaCliente} disabled={loading}>{loading ? 'Creando...' : 'Crear empresa y enviar invitación'}</button>
              </div>
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'invitados' && <>
              <div className="ui-8decf3">Invitados de solo lectura</div>
              <div className="ui-7d5827">El invitado entra con un link y no puede editar ni borrar datos.</div>

              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">Crear link
                <input className="bl-input" value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del invitado"/></label>
                <label className="ag-field-label ui-13e1ed">Campo permitido
                <select className="bl-input" value={form.campo_id||''} onChange={e=>setForm(f=>({...f,campo_id:e.target.value}))}>
                  <option value="">Todos los campos</option>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select></label>
                <select className="bl-input" value={form.dias||'30'} onChange={e=>setForm(f=>({...f,dias:e.target.value}))}>
                  <option value="7">Vence en 7 dias</option>
                  <option value="30">Vence en 30 dias</option>
                  <option value="90">Vence en 90 dias</option>
                  <option value="">Sin vencimiento</option>
                </select>
                <PermisosSelector
                  permisos={form.permisos}
                  ayuda="Elegí exactamente a que apartados puede entrar este invitado."
                  onChange={permisos => setForm(f => ({ ...f, permisos }))}
                />
                <button className="bl-btn bl-btn--primary" onClick={crearInvitado} disabled={loading}>{loading ? 'Creando...' : 'Crear acceso invitado'}</button>
              </div>

              {linkInvitado && (
                <div className="ui-b7f0a4">
                  <div className="ui-db4b65">Link creado</div>
                  <div className="ui-3164c8">{linkInvitado}</div>
                  <button className="bl-btn bl-btn--primary" onClick={copiarLinkInvitado}>Copiar link</button>
                </div>
              )}

              <div className="ag-surface ui-9a7f69">
                <div className="ui-486335">Links creados</div>
                {invitados.length === 0 ? (
                  <div className="ui-9a291f">Sin invitados creados.</div>
                ) : invitados.map(inv => (
                  <div key={inv.id} style={listItem}>
                    <div>
                      <div className="ui-1d6b4b">{inv.nombre}</div>
                      <div className="ui-a8f171">
                        {inv.campos?.nombre || 'Todos los campos'}  -  {inv.activo ? 'Activo' : 'Desactivado'}{inv.expires_at ? `  -  vence ${String(inv.expires_at).slice(0,10)}` : ''}
                      </div>
                    </div>
                    {inv.activo && (
                      <button className="ag-small-action ui-77d570" onClick={() => desactivarInvitado(inv.id)}
                       >
                        Desactivar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>}

            {/* -- CUENTA -- */}
            {modal === 'roles' && <>
              <div className="ui-8decf3">Usuarios y permisos</div>
              <div className="ui-7d5827">Definí el correo y una contraseña inicial. Compartí esos datos con la persona por un canal privado.</div>

              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">{form.id ? 'Editar usuario' : 'Agregar usuario'}
                <input className="bl-input" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="correo@empresa.com"/></label>
                <input className="bl-input" value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre"/>
                <select className="bl-input" value={form.rol||'operador'} onChange={e=>setForm(f=>({...f,rol:e.target.value}))}>
                  <option value="admin">Admin</option>
                  <option value="operador">Operador</option>
                  <option value="lectura">Solo lectura</option>
                </select>
                <label className="ag-field-label ui-486335">{form.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                  <input className="bl-input" type={form.mostrar_password ? 'text' : 'password'} value={form.password||''} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Mínimo 8 caracteres" minLength="8" autoComplete="new-password"/>
                </label>
                <label className="ag-field-label ui-486335">{form.id ? 'Repetir nueva contraseña' : 'Repetir contraseña'}
                  <input className="bl-input" type={form.mostrar_password ? 'text' : 'password'} value={form.password_confirm||''} onChange={e=>setForm(f=>({...f,password_confirm:e.target.value}))} placeholder="Escribila nuevamente" minLength="8" autoComplete="new-password"/>
                </label>
                <label className="ui-fc5f0c">
                  <input type="checkbox" checked={Boolean(form.mostrar_password)} onChange={e=>setForm(f=>({...f,mostrar_password:e.target.checked}))}/>
                  Mostrar contraseña
                </label>
                <PermisosSelector
                  permisos={form.permisos}
                  ayuda="Elegí exactamente a que apartados puede entrar este usuario."
                  onChange={permisos => setForm(f => ({ ...f, permisos }))}
                />
                <AccionesSelector
                  permisos={form.permisos}
                  acciones={form.acciones}
                  rol={form.rol || 'operador'}
                  onChange={acciones => setForm(f => ({ ...f, acciones }))}
                />
                <div className="ui-ca26cd" role="note">
                  <i className="ti ti-shield-lock ui-6f7515" aria-hidden="true" />
                  <span>AgroBloque no guarda esta contraseña en sus tablas. Supabase la protege y después no podrá mostrarse nuevamente.</span>
                </div>
                <textarea className="ui-d303ae bl-input"  value={form.notas||''} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas internas"/>
                <button className="bl-btn bl-btn--primary" onClick={guardarRol} disabled={loading}>{loading ? 'Guardando...' : (form.id ? ((form.password || form.password_confirm) ? 'Guardar y actualizar acceso' : 'Guardar cambios') : 'Crear usuario')}</button>
              </div>

              <div className="ag-surface ui-9a7f69">
                <div className="ui-486335">Registrados</div>
                {roles.length === 0 ? (
                  <div className="ui-9a291f">Sin usuarios registrados.</div>
                ) : roles.map(r => (
                  <div key={r.id} style={listItem}>
                    <div className="ui-3f9f96">
                      <div className="ui-1d6b4b">{r.nombre || r.email}</div>
                      <div className="ui-2f9f8e">{r.email} - {r.rol}</div>
                    </div>
                    <div className="ui-52e666">
                      <button className="ag-small-action ui-1283df" onClick={() => setForm({ ...r, permisos: Array.isArray(r.permisos) ? r.permisos : [], acciones: r.acciones || {}, password:'', password_confirm:'', mostrar_password:false })}>Editar</button>
                      <button className="ag-small-action ui-0a7db6" onClick={() => eliminarRol(r.id)}>Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'cuenta' && <>
              <div className="ui-c7b1b6">Mi cuenta</div>

              {/* Foto */}
              <div className="ui-080f90">
                <div className="ui-ecfc6a">
                  {perfil.foto ? (
                    <img className="ui-e97dd4" src={perfil.foto} alt="perfil"
                     />
                  ) : (
                    <div className="ui-f2a366">
                      <i className="ti ti-user ui-64b5eb" aria-hidden="true"></i>
                    </div>
                  )}
                  <button className="ui-46e341" aria-label="Cambiar foto" onClick={() => fotoRef.current?.click()}
                   >
                    <i className="ti ti-camera ui-6a3571" aria-hidden="true"></i>
                  </button>
                </div>
                <span className="ui-93a7e1">Toca la camara para cambiar la foto</span>
              </div>

              {/* Nombre */}
              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">Nombre
                <input className="ui-d51702 bl-input"  value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Tu nombre"/></label>
                <button className="bl-btn bl-btn--primary" onClick={guardarNombre} disabled={loading}>{loading?'Guardando...':'Guardar nombre'}</button>
              </div>

              {/* Email */}
              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">Email
                <input className="ui-d51702 bl-input"  type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="nuevo@email.com"/></label>
                <div className="ui-51eea9">Si cambias el email, recibiras un link de confirmacion</div>
                <button className="bl-btn bl-btn--primary" onClick={guardarEmail} disabled={loading}>{loading?'Guardando...':'Cambiar email'}</button>
              </div>

              {/* Contraseña */}
              <div className="ag-surface ui-e446b2">
                <label className="ag-field-label ui-486335">Contraseña
                <input className="ui-d51702 bl-input"  type="password" value={form.nueva||''} onChange={e=>setForm(f=>({...f,nueva:e.target.value}))} placeholder="Nueva contraseña"/></label>
                <input className="ui-d51702 bl-input"  type="password" value={form.repetir||''} onChange={e=>setForm(f=>({...f,repetir:e.target.value}))} placeholder="Repetir contraseña"/>
                <button className="bl-btn bl-btn--danger" onClick={guardarContrasena} disabled={loading}>{loading?'Guardando...':'Cambiar contraseña'}</button>
              </div>

              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {/* -- CAMPOS -- */}
            {modal === 'campos' && <>
              <div className="ui-c7b1b6">Campos</div>
              {campos.map(c => (<div key={c.id} style={listItem}><div className="ui-0aae41">{c.nombre}</div></div>))}
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {/* -- CULTIVOS -- */}
            {modal === 'cultivos' && <>
              <div className="ui-c7b1b6">Cultivos</div>
              {cultivos.map(c => (
                <div key={c.id} style={listItem}>
                  <div className="ui-0aae41">{c.nombre}</div>
                  <div className="ui-91294d">
                    <button className="ag-small-action ui-387856" onClick={() => abrir('editarCultivo',{id:c.id,nombre:c.nombre})}>Editar</button>
                    <button className="ag-small-action ui-14c146" onClick={() => eliminar('cultivos',c.id,'cultivos')}>Eliminar</button>
                  </div>
                </div>
              ))}
              <button style={addBtn} onClick={() => abrir('editarCultivo',{})}>+ Agregar cultivo</button>
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarCultivo' && <>
              <div className="ui-c7b1b6">{form.id?'Editar cultivo':'Nuevo cultivo'}</div>
              <div className="ui-74cc19">Nombre</div>
              <input className="bl-input" value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Morron"/>
              <button className="bl-btn bl-btn--primary" onClick={guardarCultivo} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => abrir('cultivos')}>Volver</button>
            </>}

            {/* -- OPERARIOS -- */}
            {modal === 'operarios' && <>
              <div className="ui-c7b1b6">Operarios</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div className="ui-269365">{campo.nombre}</div>
                  {operarios.filter(o => o.campo_id === campo.id).map(o => (
                    <div key={o.id} style={listItem}>
                      <div className="ui-0aae41">{o.nombre}</div>
                      <div className="ui-91294d">
                        <button className="ag-small-action ui-387856" onClick={() => abrir('editarOperario',{id:o.id,nombre:o.nombre,campo_id:o.campo_id})}>Editar</button>
                        <button className="ag-small-action ui-14c146" onClick={() => eliminar('operarios',o.id,'operarios')}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                  <button style={addBtn} onClick={() => abrir('editarOperario',{campo_id:campo.id})}>+ Agregar a {campo.nombre}</button>
                </div>
              ))}
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarOperario' && <>
              <div className="ui-c7b1b6">{form.id?'Editar operario':'Nuevo operario'}</div>
              <div className="ui-74cc19">Nombre</div>
              <input className="bl-input" value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del operario"/>
              <button className="bl-btn bl-btn--primary" onClick={guardarOperario} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => abrir('operarios')}>Volver</button>
            </>}

            {/* -- ABONOS -- */}
            {modal === 'abonos' && <>
              <div className="ui-c7b1b6">Abonos de base</div>
              {abonos.map(a => (
                <div key={a.id} style={listItem}>
                  <div className="ui-0aae41">{a.nombre}</div>
                  <div className="ui-91294d">
                    <button className="ag-small-action ui-387856" onClick={() => abrir('editarAbono',{id:a.id,nombre:a.nombre})}>Editar</button>
                    <button className="ag-small-action ui-14c146" onClick={() => eliminar('abonos',a.id,'abonos')}>Eliminar</button>
                  </div>
                </div>
              ))}
              <button style={addBtn} onClick={() => abrir('editarAbono',{})}>+ Agregar abono</button>
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarAbono' && <>
              <div className="ui-c7b1b6">{form.id?'Editar abono':'Nuevo abono'}</div>
              <div className="ui-74cc19">Nombre</div>
              <input className="bl-input" value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: 15-15-15"/>
              <button className="bl-btn bl-btn--primary" onClick={guardarAbono} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => abrir('abonos')}>Volver</button>
            </>}

            {/* -- BLOQUES -- */}
            {modal === 'bloques' && <>
              <div className="ui-0c9a57">Tipo de bloques</div>
              <div className="ui-fe1408">Toca un bloque para cambiar si es invernadero o campo abierto</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div className="ui-269365">{campo.nombre}</div>
                  <div className="ui-c4905b">
                    {bloques.filter(b => b.campo_id === campo.id).map(b => (
                      <div className="ui-6a9e69" key={b.id} onClick={() => abrir('editarBloque', { id:b.id, codigo:b.codigo, tipo:b.tipo })}
                        style={{ background: b.tipo === 'invernadero' ? '#eeeeee' : '#f2f1ef', color: b.tipo === 'invernadero' ? '#212121' : '#555' }}>
                        {b.codigo}  -  {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button className="bl-btn bl-btn--ghost" onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarBloque' && <>
              <div className="ui-0c9a57">Bloque {form.codigo}</div>
              <div className="ui-fe1408">Selecciona el tipo de este bloque</div>
              <div className="ui-248550">
                {['invernadero','campo_abierto'].map(t => (
                  <button className="ag-small-action ui-86faf0" key={t} onClick={() => setForm(f=>({...f,tipo:t}))} style={{ background: form.tipo===t ? '#212121' : '#fff', color: form.tipo===t ? '#fff' : '#555' }}>
                    {t === 'invernadero' ? 'Invernadero' : 'Campo abierto'}
                  </button>
                ))}
              </div>
              <button className="bl-btn bl-btn--primary" onClick={guardarBloque} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => abrir('bloques')}>Volver</button>
            </>}

          </div>
        </Modal>
      )}
    </div>
  )
}

