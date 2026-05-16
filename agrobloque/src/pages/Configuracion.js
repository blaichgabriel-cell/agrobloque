import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px' },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  body: { padding:'8px 0' },
  item: { display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom:'0.5px solid #f0ede8', cursor:'pointer' },
  icon: { width:34, height:34, borderRadius:8, background:'#f0ede8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 },
  title: { fontSize:13, fontWeight:500, color:'#1a1a1a' },
  sub: { fontSize:11, color:'#aaa' },
  arrow: { marginLeft:'auto', color:'#bbb', fontSize:18 },
  modal: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet: { background:'#f9f8f6', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:480, padding:'20px 16px 40px', maxHeight:'85vh', overflowY:'auto' },
  sheetTitle: { fontSize:16, fontWeight:600, color:'#1a1a1a', marginBottom:16 },
  input: { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:10 },
  label: { fontSize:11, color:'#888', marginBottom:4, display:'block' },
  saveBtn: { width:'100%', padding:11, borderRadius:8, background:'#1a1a1a', color:'#f9f8f6', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', marginTop:6 },
  cancelBtn: { width:'100%', padding:11, borderRadius:8, background:'transparent', color:'#888', border:'0.5px solid #d0cdc8', fontSize:13, cursor:'pointer', marginTop:8 },
  avatarWrap: { display:'flex', flexDirection:'column', alignItems:'center', marginBottom:20 },
  avatar: { width:80, height:80, borderRadius:'50%', background:'#1a1a1a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, color:'#f9f8f6', marginBottom:8, overflow:'hidden', cursor:'pointer' },
  avatarImg: { width:'100%', height:'100%', objectFit:'cover' },
  avatarBtn: { fontSize:12, color:'#888', cursor:'pointer', border:'0.5px solid #d0cdc8', padding:'4px 12px', borderRadius:20, background:'transparent' },
  listItem: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid #f0ede8' },
  listName: { fontSize:13, color:'#1a1a1a' },
  listBtns: { display:'flex', gap:6 },
  editBtn: { fontSize:11, padding:'3px 10px', borderRadius:6, border:'0.5px solid #d0cdc8', background:'transparent', color:'#888', cursor:'pointer' },
  delBtn: { fontSize:11, padding:'3px 10px', borderRadius:6, border:'0.5px solid #ffcccc', background:'transparent', color:'#cc4444', cursor:'pointer' },
  addBtn: { width:'100%', padding:10, borderRadius:8, border:'0.5px dashed #d0cdc8', background:'transparent', fontSize:12, color:'#888', cursor:'pointer', marginTop:10 },
  secLabel: { fontSize:11, fontWeight:500, color:'#888', padding:'12px 0 4px', marginBottom:4 },
}

export default function Configuracion() {
  const [modal, setModal] = useState(null)
  const [perfil, setPerfil] = useState({ nombre:'', email:'', foto:'' })
  const [campos, setCampos] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [variedades, setVariedades] = useState([])
  const [operarios, setOperarios] = useState([])
  const [abonos, setAbonos] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [cultivoSeleccionado, setCultivoSeleccionado] = useState(null)
  const fileRef = useRef()

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

  const fetchVariedades = async (cultivo_id) => {
    const { data } = await supabase.from('variedades').select('*').eq('cultivo_id', cultivo_id).order('nombre')
    setVariedades(data || [])
  }

  const abrirModal = (tipo, datos = {}) => { setForm(datos); setModal(tipo) }
  const cerrar = () => { setModal(null); setForm({}) }

  const guardarPerfil = async () => {
    setLoading(true)
    await supabase.auth.updateUser({ data: { nombre: form.nombre } })
    setPerfil(p => ({ ...p, nombre: form.nombre }))
    setLoading(false); cerrar()
  }

  const subirFoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.auth.updateUser({ data: { foto: data.publicUrl } })
      setPerfil(p => ({ ...p, foto: data.publicUrl }))
    }
  }

  const guardarCampo = async () => {
    setLoading(true)
    if (form.id) await supabase.from('campos').update({ nombre: form.nombre, descripcion: form.descripcion }).eq('id', form.id)
    else await supabase.from('campos').insert({ nombre: form.nombre, descripcion: form.descripcion })
    await fetchAll(); setLoading(false); abrirModal('campos')
  }

  const eliminarCampo = async (id) => {
    if (!window.confirm('¿Eliminar este campo?')) return
    await supabase.from('campos').delete().eq('id', id); await fetchAll()
  }

  const guardarCultivo = async () => {
    setLoading(true)
    if (form.id) await supabase.from('cultivos').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('cultivos').insert({ nombre: form.nombre })
    await fetchAll(); setLoading(false); abrirModal('cultivos')
  }

  const eliminarCultivo = async (id) => {
    if (!window.confirm('¿Eliminar este cultivo?')) return
    await supabase.from('cultivos').delete().eq('id', id); await fetchAll()
  }

  const abrirVariedades = async (cultivo) => {
    setCultivoSeleccionado(cultivo)
    await fetchVariedades(cultivo.id)
    setForm({}); setModal('variedades')
  }

  const guardarVariedad = async () => {
    if (!form.nombre) return
    setLoading(true)
    if (form.id) await supabase.from('variedades').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('variedades').insert({ nombre: form.nombre, cultivo_id: cultivoSeleccionado.id })
    await fetchVariedades(cultivoSeleccionado.id)
    setLoading(false); setForm({})
  }

  const eliminarVariedad = async (id) => {
    if (!window.confirm('¿Eliminar?')) return
    await supabase.from('variedades').delete().eq('id', id)
    await fetchVariedades(cultivoSeleccionado.id)
  }

  const guardarOperario = async () => {
    setLoading(true)
    if (form.id) await supabase.from('operarios').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('operarios').insert({ nombre: form.nombre, campo_id: form.campo_id })
    await fetchAll(); setLoading(false); abrirModal('operarios')
  }

  const eliminarOperario = async (id) => {
    if (!window.confirm('¿Eliminar este operario?')) return
    await supabase.from('operarios').delete().eq('id', id); await fetchAll()
  }

  const guardarAbono = async () => {
    setLoading(true)
    if (form.id) await supabase.from('abonos').update({ nombre: form.nombre }).eq('id', form.id)
    else await supabase.from('abonos').insert({ nombre: form.nombre })
    await fetchAll(); setLoading(false); abrirModal('abonos')
  }

  const eliminarAbono = async (id) => {
    if (!window.confirm('¿Eliminar este abono?')) return
    await supabase.from('abonos').delete().eq('id', id); await fetchAll()
  }

  const iniciales = (n) => n ? n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0,2) : 'U'

  const menuItems = [
    { icon:'👤', title:'Cuenta', sub: perfil.nombre || perfil.email, action: () => abrirModal('cuenta', { nombre: perfil.nombre }) },
    { icon:'🏗️', title:'Campos', sub:`${campos.length} campos`, action: () => abrirModal('campos') },
    { icon:'🌱', title:'Cultivos y variedades', sub:`${cultivos.length} cultivos`, action: () => abrirModal('cultivos') },
    { icon:'👥', title:'Operarios', sub:`${operarios.length} personas`, action: () => abrirModal('operarios') },
    { icon:'🌿', title:'Abonos de base', sub:`${abonos.length} abonos`, action: () => abrirModal('abonos') },
  ]

  return (
    <div>
      <div style={s.topbar}><div style={s.topTitle}>Configuración</div></div>
      <div style={s.body}>
        {menuItems.map((it, i) => (
          <div key={i} style={s.item} onClick={it.action}>
            <div style={s.icon}>{it.icon}</div>
            <div style={{ flex:1 }}>
              <div style={s.title}>{it.title}</div>
              <div style={s.sub}>{it.sub}</div>
            </div>
            <div style={s.arrow}>›</div>
          </div>
        ))}
      </div>

      {modal && (
        <div style={s.modal} onClick={e => e.target === e.currentTarget && cerrar()}>
          <div style={s.sheet}>

            {modal === 'cuenta' && <>
              <div style={s.sheetTitle}>Mi cuenta</div>
              <div style={s.avatarWrap}>
                <div style={s.avatar} onClick={() => fileRef.current.click()}>
                  {perfil.foto ? <img src={perfil.foto} alt="perfil" style={s.avatarImg}/> : iniciales(perfil.nombre || perfil.email)}
                </div>
                <button style={s.avatarBtn} onClick={() => fileRef.current.click()}>Cambiar foto de perfil</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={subirFoto}/>
              </div>
              <label style={s.label}>Nombre</label>
              <input style={s.input} value={form.nombre||''} onChange={e => setForm(f=>({...f,nombre:e.target.value}))} placeholder="Tu nombre"/>
              <label style={s.label}>Email</label>
              <input style={{...s.input,color:'#aaa'}} value={perfil.email} disabled/>
              <button style={s.saveBtn} onClick={guardarPerfil} disabled={loading}>{loading?'Guardando...':'Guardar cambios'}</button>
              <button style={s.cancelBtn} onClick={cerrar}>Cancelar</button>
            </>}

            {modal === 'campos' && <>
              <div style={s.sheetTitle}>Campos</div>
              {campos.map(c => (
                <div key={c.id} style={s.listItem}>
                  <div style={s.listName}>{c.nombre}</div>
                  <div style={s.listBtns}>
                    <button style={s.editBtn} onClick={() => abrirModal('editarCampo', {id:c.id,nombre:c.nombre,descripcion:c.descripcion})}>Editar</button>
                    <button style={s.delBtn} onClick={() => eliminarCampo(c.id)}>✕</button>
                  </div>
                </div>
              ))}
              <button style={s.addBtn} onClick={() => abrirModal('editarCampo',{})}>+ Agregar campo</button>
              <button style={s.cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarCampo' && <>
              <div style={s.sheetTitle}>{form.id?'Editar campo':'Nuevo campo'}</div>
              <label style={s.label}>Nombre</label>
              <input style={s.input} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: El Sembrador 1"/>
              <label style={s.label}>Descripción (opcional)</label>
              <input style={s.input} value={form.descripcion||''} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))} placeholder="Descripción"/>
              <button style={s.saveBtn} onClick={guardarCampo} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={s.cancelBtn} onClick={()=>abrirModal('campos')}>Volver</button>
            </>}

            {modal === 'cultivos' && <>
              <div style={s.sheetTitle}>Cultivos</div>
              {cultivos.map(c => (
                <div key={c.id} style={s.listItem}>
                  <div style={s.listName}>{c.nombre}</div>
                  <div style={s.listBtns}>
                    <button style={s.editBtn} onClick={() => abrirVariedades(c)}>Variedades</button>
                    <button style={s.editBtn} onClick={() => abrirModal('editarCultivo',{id:c.id,nombre:c.nombre})}>Editar</button>
                    <button style={s.delBtn} onClick={() => eliminarCultivo(c.id)}>✕</button>
                  </div>
                </div>
              ))}
              <button style={s.addBtn} onClick={() => abrirModal('editarCultivo',{})}>+ Agregar cultivo</button>
              <button style={s.cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarCultivo' && <>
              <div style={s.sheetTitle}>{form.id?'Editar cultivo':'Nuevo cultivo'}</div>
              <label style={s.label}>Nombre</label>
              <input style={s.input} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Morrón"/>
              <button style={s.saveBtn} onClick={guardarCultivo} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={s.cancelBtn} onClick={()=>abrirModal('cultivos')}>Volver</button>
            </>}

            {modal === 'variedades' && cultivoSeleccionado && <>
              <div style={s.sheetTitle}>Variedades · {cultivoSeleccionado.nombre}</div>
              {variedades.map(v => (
                <div key={v.id} style={s.listItem}>
                  <div style={s.listName}>{v.nombre}</div>
                  <div style={s.listBtns}>
                    <button style={s.editBtn} onClick={() => setForm({id:v.id,nombre:v.nombre})}>Editar</button>
                    <button style={s.delBtn} onClick={() => eliminarVariedad(v.id)}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ marginTop:14 }}>
                <label style={s.label}>{form.id?'Editar variedad':'Nueva variedad'}</label>
                <input style={s.input} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Rojo"/>
                <button style={s.saveBtn} onClick={guardarVariedad} disabled={loading}>{loading?'Guardando...':form.id?'Guardar cambios':'Agregar'}</button>
              </div>
              <button style={s.cancelBtn} onClick={()=>abrirModal('cultivos')}>Volver</button>
            </>}

            {modal === 'operarios' && <>
              <div style={s.sheetTitle}>Operarios</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div style={s.secLabel}>{campo.nombre}</div>
                  {operarios.filter(o => o.campo_id === campo.id).map(o => (
                    <div key={o.id} style={s.listItem}>
                      <div style={s.listName}>{o.nombre}</div>
                      <div style={s.listBtns}>
                        <button style={s.editBtn} onClick={() => abrirModal('editarOperario',{id:o.id,nombre:o.nombre,campo_id:o.campo_id})}>Editar</button>
                        <button style={s.delBtn} onClick={() => eliminarOperario(o.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                  <button style={s.addBtn} onClick={() => abrirModal('editarOperario',{campo_id:campo.id})}>+ Agregar a {campo.nombre}</button>
                </div>
              ))}
              <button style={s.cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarOperario' && <>
              <div style={s.sheetTitle}>{form.id?'Editar operario':'Nuevo operario'}</div>
              <label style={s.label}>Nombre</label>
              <input style={s.input} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del operario"/>
              <button style={s.saveBtn} onClick={guardarOperario} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={s.cancelBtn} onClick={()=>abrirModal('operarios')}>Volver</button>
            </>}

            {modal === 'abonos' && <>
              <div style={s.sheetTitle}>Abonos de base</div>
              {abonos.map(a => (
                <div key={a.id} style={s.listItem}>
                  <div style={s.listName}>{a.nombre}</div>
                  <div style={s.listBtns}>
                    <button style={s.editBtn} onClick={() => abrirModal('editarAbono',{id:a.id,nombre:a.nombre})}>Editar</button>
                    <button style={s.delBtn} onClick={() => eliminarAbono(a.id)}>✕</button>
                  </div>
                </div>
              ))}
              <button style={s.addBtn} onClick={() => abrirModal('editarAbono',{})}>+ Agregar abono</button>
              <button style={s.cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

            {modal === 'editarAbono' && <>
              <div style={s.sheetTitle}>{form.id?'Editar abono':'Nuevo abono'}</div>
              <label style={s.label}>Nombre</label>
              <input style={s.input} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: 15-15-15"/>
              <button style={s.saveBtn} onClick={guardarAbono} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={s.cancelBtn} onClick={()=>abrirModal('abonos')}>Volver</button>
            </>}

          </div>
        </div>
      )}
    </div>
  )
}
