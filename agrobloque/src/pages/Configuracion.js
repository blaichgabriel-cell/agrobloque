import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Configuracion() {
  const navigate = useNavigate()
  const [modal, setModal] = useState(null)
  const [perfil, setPerfil] = useState({ nombre:'', email:'' })
  const [campos, setCampos] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [abonos, setAbonos] = useState([])
  const [compradores, setCompradores] = useState([])
  const [bloques, setBloques] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setPerfil({ nombre: user.user_metadata?.nombre || '', email: user.email })
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

  const abrir = (tipo, datos = {}) => { setForm(datos); setModal(tipo); setError('') }
  const cerrar = () => { setModal(null); setForm({}); setError('') }

  const guardarPerfil = async () => {
    setLoading(true); setError('')
    try {
      const { error } = await supabase.auth.updateUser({ data: { nombre: form.nombre?.trim() || '' } })
      if (error) throw error
      setPerfil(p => ({ ...p, nombre: form.nombre?.trim() || '' })); cerrar()
    } catch (e) { setError('Error al guardar: ' + e.message) }
    setLoading(false)
  }

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
      if (form.id) await supabase.from('abonos').update({ nombre: form.nombre }).eq('id', form.id)
      else await supabase.from('abonos').insert({ nombre: form.nombre })
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

  const inp = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }
  const saveBtn = { width:'100%', padding:14, borderRadius:14, background:'#A0785A', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }
  const cancelBtn = { width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }
  const listItem = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #f2f1ef' }
  const addBtn = { width:'100%', padding:12, borderRadius:14, border:'1px dashed #d4b89a', background:'#f5ede3', fontSize:13, color:'#A0785A', cursor:'pointer', marginTop:8, fontWeight:500 }

  const menuItems = [
    { icon:'ti-user', title:'Cuenta', sub: perfil.nombre || perfil.email, action: () => abrir('cuenta', { nombre: perfil.nombre }) },
    { icon:'ti-building', title:'Campos', sub: campos.length + ' campos', action: () => abrir('campos') },
    { icon:'ti-plant-2', title:'Cultivos', sub: cultivos.length + ' cultivos', color:'#A0785A', bg:'#f5ede3', action: () => abrir('cultivos') },
    { icon:'ti-users', title:'Operarios', sub: operarios.length + ' personas', action: () => abrir('operarios') },
    { icon:'ti-leaf', title:'Abonos de base', sub: abonos.length + ' abonos', color:'#A0785A', bg:'#f5ede3', action: () => abrir('abonos') },
    { icon:'ti-map', title:'Tipo de bloques', sub: 'Invernadero / campo abierto', color:'#A0785A', bg:'#f5ede3', action: () => abrir('bloques') },
    { icon:'ti-building-store', title:'Compradores', sub: compradores.length + ' compradores', color:'#185fa5', bg:'#e6f1fb', action: () => navigate('/compradores') },
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
        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginTop:8, cursor:'pointer' }} onClick={() => supabase.auth.signOut()}>
          <div style={{ fontSize:14, fontWeight:600, color:'#c84040', textAlign:'center' }}>Cerrar sesión</div>
        </div>
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && cerrar()}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto' }}>
            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}

            {modal === 'cuenta' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Mi cuenta</div>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Nombre</div>
              <input style={inp} value={form.nombre||''} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Tu nombre"/>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Email</div>
              <input style={{...inp,color:'#aaa'}} value={perfil.email} disabled/>
              <button style={saveBtn} onClick={guardarPerfil} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={cerrar}>Cancelar</button>
            </>}

            {modal === 'campos' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Campos</div>
              {campos.map(c => (<div key={c.id} style={listItem}><div style={{ fontSize:13, fontWeight:500 }}>{c.nombre}</div></div>))}
              <button style={cancelBtn} onClick={cerrar}>Cerrar</button>
            </>}

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
              <button style={saveBtn} onClick={guardarCultivo} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('cultivos')}>Volver</button>
            </>}

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
              <button style={saveBtn} onClick={guardarOperario} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('operarios')}>Volver</button>
            </>}

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
              <button style={saveBtn} onClick={guardarAbono} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('abonos')}>Volver</button>
            </>}

            {modal === 'bloques' && <>
              <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:6 }}>Tipo de bloques</div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Tocá un bloque para cambiar si es invernadero o campo abierto</div>
              {campos.map(campo => (
                <div key={campo.id}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', padding:'10px 0 6px' }}>{campo.nombre}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                    {bloques.filter(b => b.campo_id === campo.id).map(b => (
                      <div key={b.id} onClick={() => abrir('editarBloque', { id:b.id, codigo:b.codigo, tipo:b.tipo })}
                        style={{ padding:'6px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', border:'1px solid #e8e6e2', background: b.tipo === 'invernadero' ? '#f5ede3' : '#f2f1ef', color: b.tipo === 'invernadero' ? '#A0785A' : '#555' }}>
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
                  <button key={t} onClick={() => setForm(f=>({...f,tipo:t}))} style={{ flex:1, padding:14, borderRadius:14, border:'1px solid #e8e6e2', fontSize:13, fontWeight:600, cursor:'pointer', background: form.tipo===t ? '#A0785A' : '#fff', color: form.tipo===t ? '#fff' : '#555' }}>
                    {t === 'invernadero' ? 'Invernadero' : 'Campo abierto'}
                  </button>
                ))}
              </div>
              <button style={saveBtn} onClick={guardarBloque} disabled={loading}>{loading?'Guardando...':'Guardar'}</button>
              <button style={cancelBtn} onClick={() => abrir('bloques')}>Volver</button>
            </>}

          </div>
        </div>
      )}
    </div>
  )
}
