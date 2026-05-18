import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Configuracion() {
  const [modal, setModal] = useState(null)
  const [perfil, setPerfil] = useState({ nombre:'', email:'', foto:'' })
  const [campos, setCampos] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [abonos, setAbonos] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setPerfil({ nombre: user.user_metadata?.nombre || '', email: user.email, foto: user.user_metadata?.foto || '' })
    const { data: c } = await supabase.from('campos').select('*').order('nombre')
    setCampos(c || [])
    const { data: cu } = await supabase.from('cultivos').select('*').order('nombre')
    setCultivos(cu || [])
    const { data: op } = await supabase.from('operarios').select('*').order('nombre')
    setOperarios(op || [])
    const { data: ab } = await supabase.from('abonos').select('*').order('nombre')
    setAbonos(ab || [])
  }

  const abrir = (tipo, datos = {}) => { setForm(datos); setModal(tipo) }
  const cerrar = () => { setModal(null); setForm({}) }

  const subirFoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const { error } = await supabase.auth.updateUser({ data: { foto: ev.target.result } })
      if (!error) {
        setPerfil(p => ({ ...p, foto: ev.target.result }))
        alert('Foto actualizada')
      } else {
        alert('Error al guardar la foto')
      }
    }
    reader.readAsDataURL(file)
  }

  const guardarPerfil = async () => {
    if (!form.nombre?.trim()) return
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ data: { nombre: form.nombre.trim() } })
    if (!error) {
      setPerfil(p => ({ ...p, nombre: form.nombre.trim() }))
      alert('Perfil guardado correctamente')
    } else {
      alert('Error al guardar el perfil')
    }
    setLoading(false)
    cerrar()
  }

  const guardarCultivo = async () => {
    if (!form.nombre) return
    setLoading(true)
    if (form.id) await supabase.from('cultivos').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('cultivos').insert({ nombre: form.nombre })
    await fetchAll(); setLoading(false); abrir('cultivos')
  }

  const eliminarCultivo = async (id) => {
    if (!window.confirm('¿Eliminar este cultivo?')) return
    await supabase.from('cultivos').delete().eq('id', id); await fetchAll()
  }

  const guardarOperario = async () => {
    if (!form.nombre) return
    setLoading(true)
    if (form.id) await supabase.from('operarios').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('operarios').insert({ nombre: form.nombre, campo_id: form.campo_id })
    await fetchAll(); setLoading(false); abrir('operarios')
  }

  const eliminarOperario = async (id) => {
    if (!window.confirm('¿Eliminar este operario?')) return
    await supabase.from('operarios').delete().eq('id', id); await fetchAll()
  }

  const guardarAbono = async () => {
    if (!form.nombre) return
    setLoading(true)
    if (form.id) await supabase.from('abonos').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('abonos').insert({ nombre: form.nombre })
    await fetchAll(); setLoading(false); abrir('abonos')
  }

  const eliminarAbono = async (id) => {
    if (!window.confirm('¿Eliminar?')) return
    await supabase.from('abonos').delete().eq('id', id); await fetchAll()
  }

  const iniciales = (n) => n ? n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0,2) : 'HS'

  const inp = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }
  const saveBtn = { width:'100%', padding:14, borderRadius:14, background:'#0a0a0a', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }
  const cancelBtn = { width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }
  const listItem = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #f2f1ef' }
  const listName = { fontSize:13, fontWeight:500, color:'#0a0a0a' }
  const editBtn = { padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, fontWeight:500, color:'#555', cursor:'pointer' }
  const delBtn = { padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, fontWeight:500, color:'#c84040', cursor:'pointer' }
  const addBtn = { width:'100%', padding:12, borderRadius:14, border:'1px dashed #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }
  const lbl = { fontSize:10, color:'#9a9a9a', marginBottom:6, display:'block' }

  const menuItems = [
    { icon:'ti-user', title:'Cuenta', sub: perfil.nombre || perfil.email, bg:'#f2f1ef', action: () => abrir('cuenta', { nombre: perfil.nombre }) },
    { icon:'ti-building', title:'Campos', sub: campos.length + ' campos', bg:'#f2f1ef', action: () => abrir('campos') },
    { icon:'ti-plant-2', title:'Cultivos', sub: cultivos.length + ' cultivos', bg:'#edf7ed', color:'#2d6a2d', action: () => abrir('cultivos') },
    { icon:'ti-users', title:'Operarios', sub: operarios.length + ' personas', bg:'#f2f1ef', action: () => abrir('operarios') },
    { icon:'ti-leaf', title:'Abonos de base', sub: abonos.length + ' abonos', bg:'#edf7ed', color:'#2d6a2d', action: () => abrir('abonos') },
  ]

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Sistema</div>
        <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:20 }}>Configuración</div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        {menuItems.map((it, i) => (
          <div key={i} onClick={it.action} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
            <div style={{ width:40, height:40, borderRadius:12, background:it.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <i className={`ti ${it.icon}`} style={{ fontSize:18, color: it.color || '#0a0a0a' }} aria-hidden="true"></i>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#0a0a0a' }}>{it.title}</div>
              <div style={{ fontSize:11, color:'#b0b0b0', marginTop:2 }}>{it.sub}</div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
          </div>
        ))}

        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginTop:8, cursor:'pointer' }} onClick={() => supabase.auth.signOut()}>
          <div style={{ fontSize:14, fontWeight:600, color:'#c84040', textAlign:'center' }}>Cerrar sesión</div>
        </div>
      </div>

      {modal &&
