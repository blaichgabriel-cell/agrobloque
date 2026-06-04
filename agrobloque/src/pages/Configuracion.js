import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { forceLocalSignOut, supabase } from '../lib/supabase'
import { descargarJson } from '../lib/exporters'
import { ACTIONS } from '../lib/permissions'
const PERMISOS_MODULOS = [
  { key: 'buscar', label: 'Buscar' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'historial', label: 'Historial' },
  { key: 'mapa', label: 'Mapa' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'vivero', label: 'Vivero' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'cosecha', label: 'Cosecha' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'fumigaciones', label: 'Fumigaciones' },
  { key: 'plan_nutricional', label: 'Plan Nutricional' },
  { key: 'costos', label: 'Costos' },
  { key: 'contabilidad', label: 'Contabilidad' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'compradores', label: 'Compradores' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'configuracion', label: 'Configuracion' },
]

const ABONO_BASE_CATEGORIA = 'Abono de base'
const FOTO_PERFIL_KEY = 'agrobloque-foto-perfil'
const BACKUP_KEY = 'agrobloque-ultimo-backup'

const normalizarNombre = (valor) => String(valor || '').trim().toLowerCase()
const esDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 768

function PermisosSelector({ permisos, onChange, ayuda }) {
  return (
    <div style={{ background:'#f7fbf5', border:'1px solid #cfe5c8', borderRadius:14, padding:12, marginBottom:12 }}>
      <div style={{ fontSize:12, fontWeight:900, color:'#176a25', marginBottom:4, textTransform:'uppercase' }}>Modulos permitidos</div>
      {ayuda && <div style={{ fontSize:11, color:'#687068', marginBottom:9, lineHeight:1.35 }}>{ayuda}</div>}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        {PERMISOS_MODULOS.map(m => {
          const checked = !Array.isArray(permisos) || permisos.length === 0 || permisos.includes(m.key)
          return (
            <label key={m.key} style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, color:'#1d241f', padding:'6px 4px' }}>
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
      <div style={{ fontSize:11, color:'#8b928b', marginTop:6 }}>Si desmarcas un modulo, no aparece en el menu ni en accesos.</div>
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
    <div style={{ background:'#fff', border:'1px solid #e8ece8', borderRadius:14, padding:12, marginBottom:12 }}>
      <div style={{ fontSize:12, fontWeight:900, color:'#176a25', marginBottom:4, textTransform:'uppercase' }}>Acciones permitidas</div>
      <div style={{ fontSize:11, color:'#687068', marginBottom:9, lineHeight:1.35 }}>Define si este usuario puede ver, crear, editar o borrar en cada modulo permitido.</div>
      <div style={{ display:'grid', gap:7, maxHeight:240, overflowY:'auto', paddingRight:4 }}>
        {modulosActivos.map(m => {
          const actuales = Array.isArray(acciones?.[m.key]) ? acciones[m.key] : defaults
          return (
            <div key={m.key} style={{ display:'grid', gridTemplateColumns:'115px repeat(4, 1fr)', gap:6, alignItems:'center', fontSize:11, borderBottom:'1px solid #f2f1ef', paddingBottom:6 }}>
              <strong style={{ color:'#1d241f' }}>{m.label}</strong>
              {ACTIONS.map(a => (
                <label key={a.key} style={{ display:'flex', alignItems:'center', gap:4, color:'#4d544e' }}>
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

export default function Configuracion() {
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
    if (!form.nueva || form.nueva.length < 6) { setError('La contrasena debe tener al menos 6 caracteres'); return }
    if (form.nueva !== form.repetir) { setError('Las contrasenas no coinciden'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      const { error } = await supabase.auth.updateUser({ password: form.nueva })
      if (error) throw error
      setSuccess('Contrasena actualizada correctamente')
      setForm({})
    } catch (e) { setError('Error: ' + e.message) }
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
      'cosechas', 'costos', 'fumigaciones', 'fumigacion_productos',
      'fumigacion_bloques', 'fertilizaciones', 'fertilizacion_planes',
      'fertilizacion_plan_aplicaciones',
      'compradores', 'tareas', 'notas_modulo', 'vivero_lotes',
      'vivero_tratamientos', 'contabilidad_movimientos',
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

  const generarToken = () => {
    const bytes = new Uint8Array(24)
    window.crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }

  const hashToken = async (token) => {
    const bytes = new TextEncoder().encode(token)
    const hash = await window.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
  }

  const crearInvitado = async () => {
    if (!form.nombre) return
    setLoading(true); setError(''); setSuccess(''); setLinkInvitado('')
    try {
      const token = generarToken()
      const token_hash = await hashToken(token)
      const vencimiento = form.dias && Number(form.dias) > 0
        ? new Date(Date.now() + Number(form.dias) * 24 * 60 * 60 * 1000).toISOString()
        : null
      const { error } = await supabase.from('guest_access_links').insert({
        nombre: form.nombre.trim(),
        campo_id: form.campo_id || null,
        token_hash,
        expires_at: vencimiento,
        permisos: Array.isArray(form.permisos) && form.permisos.length > 0 ? form.permisos : null,
        activo: true,
      })
      if (error) throw error
      const url = `${window.location.origin}/invitado/${token}`
      setLinkInvitado(url)
      setSuccess('Link invitado creado. Copialo ahora.')
      setForm({ nombre:'', campo_id:'', dias:'30', permisos: [] })
      await fetchAll()
    } catch (e) {
      setError('No se pudo crear el invitado. Ejecuta primero el SQL de invitados.')
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
    setLoading(true); setError(''); setSuccess('')
    try {
      const payload = {
        email: form.email.trim().toLowerCase(),
        nombre: form.nombre || null,
        rol: form.rol,
        permisos: Array.isArray(form.permisos) ? form.permisos : null,
        acciones: form.acciones && typeof form.acciones === 'object' ? form.acciones : null,
        activo: form.activo !== false,
        notas: form.notas || null,
      }
      const { error } = form.id
        ? await supabase.from('app_user_roles').update(payload).eq('id', form.id)
        : await supabase.from('app_user_roles').insert(payload)
      if (error) throw error

      if (form.invitar_real) {
        const { data: { session } } = await supabase.auth.getSession()
        const resp = await fetch('/api/invitar-usuario', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify(payload),
        })
        const result = await resp.json().catch(() => ({}))
        if (!resp.ok) throw new Error(result.error || 'No se pudo enviar la invitacion real.')
      }

      await fetchAll()
      abrir('roles', { email:'', nombre:'', rol:'operador', activo:true, notas:'', permisos: [], acciones: {}, invitar_real:false })
      setSuccess(form.invitar_real ? 'Usuario guardado e invitacion enviada.' : 'Permiso guardado.')
    } catch (e) {
      setError('No se pudo guardar: ' + (e.message || 'Ejecuta primero el SQL profesional.'))
    }
    setLoading(false)
  }

  const eliminarRol = async (id) => {
    await supabase.from('app_user_roles').delete().eq('id', id)
    await fetchAll()
  }

  const inp = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }
  const saveBtn = (color = '#212121') => ({ width:'100%', padding:14, borderRadius:14, background: color, border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' })
  const cancelBtn = { width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }
  const listItem = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #f2f1ef' }
  const addBtn = { width:'100%', padding:12, borderRadius:14, border:'1px dashed #d4b89a', background:'#eeeeee', fontSize:13, color:'#212121', cursor:'pointer', marginTop:8, fontWeight:500 }

  const menuItems = [
    { icon:'ti-user', title:'Cuenta', sub: perfil.nombre || perfil.email, action: () => abrir('cuenta', { nombre: perfil.nombre, email: perfil.email }) },
    { icon:'ti-building', title:'Campos', sub: campos.length + ' campos', action: () => abrir('campos') },
    { icon:'ti-seeding', title:'Cultivos', sub: cultivos.length + ' cultivos', color:'#212121', bg:'#eeeeee', action: () => abrir('cultivos') },
    { icon:'ti-users', title:'Operarios', sub: operarios.length + ' personas', action: () => abrir('operarios') },
    { icon:'ti-leaf', title:'Abonos de base', sub: abonos.length + ' abonos', color:'#212121', bg:'#eeeeee', action: () => abrir('abonos') },
    { icon:'ti-map', title:'Tipo de bloques', sub: 'Invernadero / campo abierto', color:'#212121', bg:'#eeeeee', action: () => abrir('bloques') },
    { icon:'ti-building-store', title:'Compradores', sub: compradores.length + ' compradores', color:'#185fa5', bg:'#e6f1fb', action: () => navigate('/compradores') },
    { icon:'ti-link', title:'Invitados', sub: invitados.filter(i => i.activo).length + ' activos', color:'#176a25', bg:'#edf6ec', action: () => abrir('invitados', { nombre:'', campo_id:'', dias:'30', permisos: [] }) },
    { icon:'ti-shield-lock', title:'Usuarios y permisos', sub: roles.length + ' registrados', color:'#176a25', bg:'#edf6ec', action: () => abrir('roles', { email:'', nombre:'', rol:'operador', activo:true, notas:'', permisos: [], acciones: {}, invitar_real:false }) },
    { icon:'ti-history', title:'Auditoria', sub: 'Ver movimientos', color:'#212121', bg:'#eeeeee', action: () => navigate('/auditoria') },
    { icon:'ti-download', title:'Backup de datos', sub: ultimoBackup ? `Ultimo: ${String(ultimoBackup).slice(0,10)}${backupVencido() ? ' - recomendado' : ''}` : 'Recomendado ahora', color: backupVencido() ? '#e07b00' : '#176a25', bg: backupVencido() ? '#fff4e8' : '#edf6ec', action: descargarBackup },
  ]

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <input type="file" accept="image/*" ref={fotoRef} style={{ display:'none' }} onChange={subirFotoPerfil} />

      <div style={{ padding:'24px 20px 16px' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Sistema</div>
        <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:20 }}>Configuracion</div>
        {error && !modal && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}
        {success && !modal && <div style={{ background:'#edfaf3', color:'#1a5c2e', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{success}</div>}

        {/* Tarjeta de perfil rapida */}
        <div style={{ background:'#212121', borderRadius:20, padding:'16px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            {perfil.foto ? (
              <img src={perfil.foto} alt="perfil"
                style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(255,255,255,0.2)' }}/>
            ) : (
              <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-user" style={{ fontSize:24, color:'rgba(255,255,255,0.6)' }} aria-hidden="true"></i>
              </div>
            )}
            <button onClick={() => fotoRef.current?.click()}
              style={{ position:'absolute', bottom:-2, right:-2, width:20, height:20, borderRadius:'50%', background:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
              <i className="ti ti-camera" style={{ fontSize:11, color:'#212121' }} aria-hidden="true"></i>
            </button>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {perfil.nombre || 'Sin nombre'}
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{perfil.email}</div>
          </div>
          <button onClick={() => abrir('cuenta', { nombre: perfil.nombre, email: perfil.email })}
            style={{ padding:'6px 12px', borderRadius:10, background:'rgba(255,255,255,0.12)', border:'none', fontSize:11, color:'rgba(255,255,255,0.8)', cursor:'pointer', flexShrink:0 }}>
            Editar
          </button>
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        {menuItems.map((it, i) => (
          <div key={i} onClick={it.action} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
            <div style={{ width:40, height:40, borderRadius:12, background: it.bg || '#f2f1ef', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <i className={`ti ${it.icon}`} style={{ fontSize:18, color: it.color || '#0a0a0a' }} aria-hidden="true"></i>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#0a0a0a' }}>{it.title}</div>
              <div style={{ fontSize:11, color:'#b0b0b0', marginTop:2 }}>{it.sub}</div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
          </div>
        ))}
        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginTop:8, cursor:'pointer' }} onClick={() => forceLocalSignOut()}>
          <div style={{ fontSize:14, fontWeight:600, color:'#c84040', textAlign:'center' }}>Cerrar sesion</div>
        </div>
      </div>

      {modal && (
        <div style={{
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
        }}
          onClick={e => e.target===e.currentTarget && cerrar()}>
          <div style={{
            background:'#f2f1ef',
            borderRadius: esDesktop() ? 24 : '24px 24px 0 0',
            width:'100%',
            maxWidth: esDesktop() ? 620 : 480,
            padding:'24px 20px 40px',
            maxHeight: esDesktop() ? '82vh' : '88vh',
            overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
            boxShadow: esDesktop() ? '0 28px 70px rgba(0,0,0,0.28)' : 'none',
          }}>

            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}
            {success && <div style={{ background:'#edfaf3', color:'#1a5c2e', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{success}</div>}

            {modal === 'invitados' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:8 }}>Invitados de solo lectura</div>
              <div style={{ fontSize:12, color:'#8b928b', marginBottom:16 }}>El invitado entra con un link y no puede editar ni borrar datos.</div>

              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Crear link</div>
                <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del invitado"/>
                <div style={{ fontSize:11, fontWeight:800, color:'#687068', margin:'2px 0 7px', textTransform:'uppercase' }}>Campo permitido</div>
                <select style={inp} value={form.campo_id||''} onChange={e=>setForm(f=>({...f,campo_id:e.target.value}))}>
                  <option value="">Todos los campos</option>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select style={inp} value={form.dias||'30'} onChange={e=>setForm(f=>({...f,dias:e.target.value}))}>
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
                <button style={saveBtn('#176a25')} onClick={crearInvitado} disabled={loading}>{loading ? 'Creando...' : 'Crear acceso invitado'}</button>
              </div>

              {linkInvitado && (
                <div style={{ background:'#edf6ec', border:'1px solid #cde6c8', borderRadius:16, padding:'12px 14px', marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'#176a25', fontWeight:800, marginBottom:6 }}>Link creado</div>
                  <div style={{ fontSize:12, color:'#1d261d', wordBreak:'break-all', lineHeight:1.4, marginBottom:10 }}>{linkInvitado}</div>
                  <button style={saveBtn('#212121')} onClick={copiarLinkInvitado}>Copiar link</button>
                </div>
              )}

              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Links creados</div>
                {invitados.length === 0 ? (
                  <div style={{ fontSize:12, color:'#9a9a9a', padding:'8px 0' }}>Sin invitados creados.</div>
                ) : invitados.map(inv => (
                  <div key={inv.id} style={listItem}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>{inv.nombre}</div>
                      <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>
                        {inv.campos?.nombre || 'Todos los campos'}  -  {inv.activo ? 'Activo' : 'Desactivado'}{inv.expires_at ? `  -  vence ${String(inv.expires_at).slice(0,10)}` : ''}
                      </div>
                    </div>
                    {inv.activo && (
                      <button onClick={() => desactivarInvitado(inv.id)}
                        style={{ border:'1px solid #ffcccc', background:'#fff0f0', color:'#c84040', borderRadius:10, padding:'7px 10px', fontSize:11, cursor:'pointer' }}>
                        Desactivar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>}

            {/* -- CUENTA -- */}
            {modal === 'roles' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:8 }}>Usuarios y permisos</div>
              <div style={{ fontSize:12, color:'#8b928b', marginBottom:16 }}>Registro interno de roles. Para dar acceso real, el usuario tambien debe existir en Supabase Authentication.</div>

              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>{form.id ? 'Editar usuario' : 'Agregar usuario'}</div>
                <input style={inp} type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="correo@empresa.com"/>
                <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre"/>
                <select style={inp} value={form.rol||'operador'} onChange={e=>setForm(f=>({...f,rol:e.target.value}))}>
                  <option value="admin">Admin</option>
                  <option value="operador">Operador</option>
                  <option value="lectura">Solo lectura</option>
                </select>
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
                <label style={{ display:'flex', alignItems:'center', gap:8, background:'#f7fbf5', border:'1px solid #cfe5c8', borderRadius:14, padding:12, marginBottom:12, fontSize:12, color:'#1d241f' }}>
                  <input type="checkbox" checked={Boolean(form.invitar_real)} onChange={e=>setForm(f=>({...f,invitar_real:e.target.checked}))}/>
                  Enviar invitacion real por email
                </label>
                <textarea style={{ ...inp, minHeight:64, resize:'vertical' }} value={form.notas||''} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas internas"/>
                <button style={saveBtn('#176a25')} onClick={guardarRol} disabled={loading}>{loading ? 'Guardando...' : 'Guardar permiso'}</button>
              </div>

              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Registrados</div>
                {roles.length === 0 ? (
                  <div style={{ fontSize:12, color:'#9a9a9a', padding:'8px 0' }}>Sin usuarios registrados.</div>
                ) : roles.map(r => (
                  <div key={r.id} style={listItem}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>{r.nombre || r.email}</div>
                      <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.email} - {r.rol}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button style={{ padding:'5px 10px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }} onClick={() => setForm({ ...r, permisos: Array.isArray(r.permisos) ? r.permisos : [], acciones: r.acciones || {}, invitar_real:false })}>Editar</button>
                      <button style={{ padding:'5px 10px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }} onClick={() => eliminarRol(r.id)}>Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'cuenta' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Mi cuenta</div>

              {/* Foto */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:24 }}>
                <div style={{ position:'relative', marginBottom:10 }}>
                  {perfil.foto ? (
                    <img src={perfil.foto} alt="perfil"
                      style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'3px solid #e8e6e2' }}/>
                  ) : (
                    <div style={{ width:80, height:80, borderRadius:'50%', background:'#e8e6e2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <i className="ti ti-user" style={{ fontSize:36, color:'#9a9a9a' }} aria-hidden="true"></i>
                    </div>
                  )}
                  <button onClick={() => fotoRef.current?.click()}
                    style={{ position:'absolute', bottom:0, right:0, width:26, height:26, borderRadius:'50%', background:'#212121', border:'2px solid #f2f1ef', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className="ti ti-camera" style={{ fontSize:13, color:'#fff' }} aria-hidden="true"></i>
                  </button>
                </div>
                <span style={{ fontSize:11, color:'#9a9a9a' }}>Toca la camara para cambiar la foto</span>
              </div>

              {/* Nombre */}
              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Nombre</div>
                <input style={{ ...inp, marginBottom:8 }} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Tu nombre"/>
                <button style={saveBtn()} onClick={guardarNombre} disabled={loading}>{loading?'Guardando...':'Guardar nombre'}</button>
              </div>

              {/* Email */}
              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Email</div>
                <input style={{ ...inp, marginBottom:8 }} type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="nuevo@email.com"/>
                <div style={{ fontSize:11, color:'#9a9a9a', marginBottom:10 }}>Si cambias el email, recibiras un link de confirmacion</div>
                <button style={saveBtn('#1a5c2e')} onClick={guardarEmail} disabled={loading}>{loading?'Guardando...':'Cambiar email'}</button>
              </div>

              {/* Contrasena */}
              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Contrasena</div>
                <input style={{ ...inp, marginBottom:8 }} type="password" value={form.nueva||''} onChange={e=>setForm(f=>({...f,nueva:e.target.value}))} placeholder="Nueva contrasena"/>
                <input style={{ ...inp, marginBottom:8 }} type="password" value={form.repetir||''} onChange={e=>setForm(f=>({...f,repetir:e.target.value}))} placeholder="Repetir contrasena"/>
                <button style={saveBtn('#c84040')} onClick={guardarContrasena} disabled={loading}>{loading?'Guardando...':'Cambiar contrasena'}</button>
              </div>

              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {/* -- CAMPOS -- */}
            {modal === 'campos' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Campos</div>
              {campos.map(c => (<div key={c.id} style={listItem}><div style={{ fontSize:13, fontWeight:500 }}>{c.nombre}</div></div>))}
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {/* -- CULTIVOS -- */}
            {modal === 'cultivos' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Cultivos</div>
              {cultivos.map(c => (
                <div key={c.id} style={listItem}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{c.nombre}</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }} onClick={() => abrir('editarCultivo',{id:c.id,nombre:c.nombre})}>Editar</button>
                    <button style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }} onClick={() => eliminar('cultivos',c.id,'cultivos')}>Eliminar</button>
                  </div>
                </div>
              ))}
              <button style={addBtn} onClick={() => abrir('editarCultivo',{})}>+ Agregar cultivo</button>
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarCultivo' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id?'Editar cultivo':'Nuevo cultivo'}</div>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Nombre</div>
              <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Morron"/>
              <button style={saveBtn()} onClick={guardarCultivo} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('cultivos')}>Volver</button>
            </>}

            {/* -- OPERARIOS -- */}
            {modal === 'operarios' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Operarios</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', padding:'10px 0 6px' }}>{campo.nombre}</div>
                  {operarios.filter(o => o.campo_id === campo.id).map(o => (
                    <div key={o.id} style={listItem}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{o.nombre}</div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }} onClick={() => abrir('editarOperario',{id:o.id,nombre:o.nombre,campo_id:o.campo_id})}>Editar</button>
                        <button style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }} onClick={() => eliminar('operarios',o.id,'operarios')}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                  <button style={addBtn} onClick={() => abrir('editarOperario',{campo_id:campo.id})}>+ Agregar a {campo.nombre}</button>
                </div>
              ))}
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarOperario' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id?'Editar operario':'Nuevo operario'}</div>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Nombre</div>
              <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del operario"/>
              <button style={saveBtn()} onClick={guardarOperario} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('operarios')}>Volver</button>
            </>}

            {/* -- ABONOS -- */}
            {modal === 'abonos' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Abonos de base</div>
              {abonos.map(a => (
                <div key={a.id} style={listItem}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{a.nombre}</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }} onClick={() => abrir('editarAbono',{id:a.id,nombre:a.nombre})}>Editar</button>
                    <button style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }} onClick={() => eliminar('abonos',a.id,'abonos')}>Eliminar</button>
                  </div>
                </div>
              ))}
              <button style={addBtn} onClick={() => abrir('editarAbono',{})}>+ Agregar abono</button>
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarAbono' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id?'Editar abono':'Nuevo abono'}</div>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Nombre</div>
              <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: 15-15-15"/>
              <button style={saveBtn()} onClick={guardarAbono} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('abonos')}>Volver</button>
            </>}

            {/* -- BLOQUES -- */}
            {modal === 'bloques' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:6 }}>Tipo de bloques</div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Toca un bloque para cambiar si es invernadero o campo abierto</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', padding:'10px 0 6px' }}>{campo.nombre}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                    {bloques.filter(b => b.campo_id === campo.id).map(b => (
                      <div key={b.id} onClick={() => abrir('editarBloque', { id:b.id, codigo:b.codigo, tipo:b.tipo })}
                        style={{ padding:'6px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', border:'1px solid #e8e6e2', background: b.tipo === 'invernadero' ? '#eeeeee' : '#f2f1ef', color: b.tipo === 'invernadero' ? '#212121' : '#555' }}>
                        {b.codigo}  -  {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarBloque' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:6 }}>Bloque {form.codigo}</div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Selecciona el tipo de este bloque</div>
              <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                {['invernadero','campo_abierto'].map(t => (
                  <button key={t} onClick={() => setForm(f=>({...f,tipo:t}))} style={{ flex:1, padding:14, borderRadius:14, border:'1px solid #e8e6e2', fontSize:13, fontWeight:600, cursor:'pointer', background: form.tipo===t ? '#212121' : '#fff', color: form.tipo===t ? '#fff' : '#555' }}>
                    {t === 'invernadero' ? 'Invernadero' : 'Campo abierto'}
                  </button>
                ))}
              </div>
              <button style={saveBtn()} onClick={guardarBloque} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('bloques')}>Volver</button>
            </>}

          </div>
        </div>
      )}
    </div>
  )
}

