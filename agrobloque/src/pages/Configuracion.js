import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { forceLocalSignOut, supabase } from '../lib/supabase'
import { descargarJson } from '../lib/exporters'

const ABONO_BASE_CATEGORIA = 'Abono de base'
const FOTO_PERFIL_KEY = 'agrobloque-foto-perfil'

const normalizarNombre = (valor) => String(valor || '').trim().toLowerCase()

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
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setPerfil({
      nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || '',
      email: user.email,
      foto: typeof window !== 'undefined' ? (window.localStorage.getItem(FOTO_PERFIL_KEY) || '') : ''
    })
    const [{ data: c }, { data: cu }, { data: op }, { data: ab }, { data: comp }, { data: bl }] = await Promise.all([
      supabase.from('campos').select('*').order('nombre'),
      supabase.from('cultivos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('abonos').select('*').order('nombre'),
      supabase.from('compradores').select('*').order('nombre'),
      supabase.from('bloques').select('*').order('codigo'),
    ])
    setCampos(c||[]); setCultivos(cu||[]); setOperarios(op||[])
    setAbonos(ab||[]); setCompradores(comp||[]); setBloques(bl||[])
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

  // ─── PERFIL ────────────────────────────────────────────────────────

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
      setSuccess('Revisá tu nuevo email para confirmar el cambio')
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

  // ─── OTROS ────────────────────────────────────────────────────────

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
      'compradores', 'tareas', 'notas_modulo', 'vivero_lotes',
      'vivero_tratamientos', 'contabilidad_movimientos',
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
    setSuccess('Backup descargado')
    setLoading(false)
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
    { icon:'ti-download', title:'Backup de datos', sub: 'Descargar copia JSON', color:'#176a25', bg:'#edf6ec', action: descargarBackup },
  ]

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <input type="file" accept="image/*" ref={fotoRef} style={{ display:'none' }} onChange={subirFotoPerfil} />

      <div style={{ padding:'24px 20px 16px' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Sistema</div>
        <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:20 }}>Configuración</div>
        {error && !modal && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}
        {success && !modal && <div style={{ background:'#edfaf3', color:'#1a5c2e', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{success}</div>}

        {/* Tarjeta de perfil rápida */}
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
          <div style={{ fontSize:14, fontWeight:600, color:'#c84040', textAlign:'center' }}>Cerrar sesión</div>
        </div>
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && cerrar()}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'88vh', overflowY:'auto' }}>

            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}
            {success && <div style={{ background:'#edfaf3', color:'#1a5c2e', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{success}</div>}

            {/* ── CUENTA ── */}
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
                <span style={{ fontSize:11, color:'#9a9a9a' }}>Tocá la cámara para cambiar la foto</span>
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
                <div style={{ fontSize:11, color:'#9a9a9a', marginBottom:10 }}>Si cambiás el email, recibirás un link de confirmación</div>
                <button style={saveBtn('#1a5c2e')} onClick={guardarEmail} disabled={loading}>{loading?'Guardando...':'Cambiar email'}</button>
              </div>

              {/* Contraseña */}
              <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Contraseña</div>
                <input style={{ ...inp, marginBottom:8 }} type="password" value={form.nueva||''} onChange={e=>setForm(f=>({...f,nueva:e.target.value}))} placeholder="Nueva contraseña"/>
                <input style={{ ...inp, marginBottom:8 }} type="password" value={form.repetir||''} onChange={e=>setForm(f=>({...f,repetir:e.target.value}))} placeholder="Repetir contraseña"/>
                <button style={saveBtn('#c84040')} onClick={guardarContrasena} disabled={loading}>{loading?'Guardando...':'Cambiar contraseña'}</button>
              </div>

              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {/* ── CAMPOS ── */}
            {modal === 'campos' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Campos</div>
              {campos.map(c => (<div key={c.id} style={listItem}><div style={{ fontSize:13, fontWeight:500 }}>{c.nombre}</div></div>))}
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {/* ── CULTIVOS ── */}
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
              <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Morrón"/>
              <button style={saveBtn()} onClick={guardarCultivo} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('cultivos')}>Volver</button>
            </>}

            {/* ── OPERARIOS ── */}
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

            {/* ── ABONOS ── */}
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

            {/* ── BLOQUES ── */}
            {modal === 'bloques' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:6 }}>Tipo de bloques</div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Tocá un bloque para cambiar si es invernadero o campo abierto</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', padding:'10px 0 6px' }}>{campo.nombre}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                    {bloques.filter(b => b.campo_id === campo.id).map(b => (
                      <div key={b.id} onClick={() => abrir('editarBloque', { id:b.id, codigo:b.codigo, tipo:b.tipo })}
                        style={{ padding:'6px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', border:'1px solid #e8e6e2', background: b.tipo === 'invernadero' ? '#eeeeee' : '#f2f1ef', color: b.tipo === 'invernadero' ? '#212121' : '#555' }}>
                        {b.codigo} · {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarBloque' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:6 }}>Bloque {form.codigo}</div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Seleccioná el tipo de este bloque</div>
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
