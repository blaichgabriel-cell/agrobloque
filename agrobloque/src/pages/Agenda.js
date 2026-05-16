import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS = {
  fumigacion: { label:'Fumigación', icon:'🧪' },
  fertiriego: { label:'Fertiriego', icon:'💧' },
  cosecha: { label:'Cosecha', icon:'🌾' },
  evaluacion: { label:'Evaluación', icon:'📋' },
  otro: { label:'Otro', icon:'📌' },
}

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  addBtn: { color:'#f9f8f6', fontSize:24, cursor:'pointer', lineHeight:1 },
  body: { padding:10 },
  filtros: { display:'flex', gap:6, marginBottom:12, overflowX:'auto' },
  filtroBtn: { padding:'5px 12px', borderRadius:20, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:11, color:'#888', cursor:'pointer', whiteSpace:'nowrap' },
  filtroBtnActive: { background:'#1a1a1a', color:'#f9f8f6', borderColor:'#1a1a1a' },
  tarea: { background:'#f9f8f6', borderRadius:10, padding:'12px 14px', marginBottom:8, border:'0.5px solid #d0cdc8' },
  tareaHead: { display:'flex', alignItems:'center', gap:8, marginBottom:4 },
  tareaIcon: { fontSize:16 },
  tareaTipo: { fontSize:11, color:'#888' },
  tareaFecha: { marginLeft:'auto', fontSize:11, color:'#888' },
  tareaDesc: { fontSize:13, color:'#1a1a1a', fontWeight:500, marginBottom:6 },
  tareaFooter: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  completarBtn: { fontSize:11, padding:'3px 10px', borderRadius:6, border:'0.5px solid #d0cdc8', background:'transparent', color:'#888', cursor:'pointer' },
  completadaBadge: { fontSize:10, padding:'2px 8px', borderRadius:10, background:'#e8f5e8', color:'#2d6a2d', fontWeight:500 },
  vencidaBadge: { fontSize:10, padding:'2px 8px', borderRadius:10, background:'#ffeeee', color:'#cc4444', fontWeight:500 },
  hoyBadge: { fontSize:10, padding:'2px 8px', borderRadius:10, background:'#fff3e0', color:'#e07b00', fontWeight:500 },
  empty: { textAlign:'center', padding:40, color:'#888', fontSize:13 },
  overlay: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet: { background:'#f9f8f6', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:480, padding:'20px 16px 40px', maxHeight:'85vh', overflowY:'auto' },
  sheetTitle: { fontSize:16, fontWeight:600, color:'#1a1a1a', marginBottom:16 },
  label: { fontSize:11, color:'#888', marginBottom:4, display:'block' },
  input: { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:10 },
  select: { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:10 },
  textarea: { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:10, minHeight:80, resize:'vertical' },
  saveBtn: { width:'100%', padding:11, borderRadius:8, background:'#1a1a1a', color:'#f9f8f6', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', marginTop:6 },
  cancelBtn: { width:'100%', padding:11, borderRadius:8, background:'transparent', color:'#888', border:'0.5px solid #d0cdc8', fontSize:13, cursor:'pointer', marginTop:8 },
}

export default function Agenda() {
  const [tareas, setTareas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [filtro, setFiltro] = useState('pendientes')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ tipo:'fumigacion', descripcion:'', fecha_programada:'', campo_id:'', bloque_id:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchTareas(); fetchCampos() }, [])

  const fetchTareas = async () => {
    const { data } = await supabase.from('tareas').select('*, campos(nombre), bloques(codigo)').order('fecha_programada')
    setTareas(data || [])
  }

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*')
    setCampos(data || [])
  }

  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campo_id).order('codigo')
    setBloques(data || [])
  }

  const guardarTarea = async () => {
    if (!form.descripcion || !form.fecha_programada) return
    setSaving(true)
    await supabase.from('tareas').insert({
      tipo: form.tipo,
      descripcion: form.descripcion,
      fecha_programada: form.fecha_programada,
      campo_id: form.campo_id || null,
      bloque_id: form.bloque_id || null,
      completada: false
    })
    await fetchTareas()
    setSaving(false)
    setModal(false)
    setForm({ tipo:'fumigacion', descripcion:'', fecha_programada:'', campo_id:'', bloque_id:'' })
  }

  const completarTarea = async (id) => {
    await supabase.from('tareas').update({ completada: true, fecha_completada: new Date().toISOString().split('T')[0] }).eq('id', id)
    fetchTareas()
  }

  const eliminarTarea = async (id) => {
    if (!window.confirm('¿Eliminar esta tarea?')) return
    await supabase.from('tareas').delete().eq('id', id)
    fetchTareas()
  }

  const hoy = new Date().toISOString().split('T')[0]

  const getBadge = (t) => {
    if (t.completada) return <span style={s.completadaBadge}>Completada</span>
    if (t.fecha_programada < hoy) return <span style={s.vencidaBadge}>Vencida</span>
    if (t.fecha_programada === hoy) return <span style={s.hoyBadge}>Hoy</span>
    return null
  }

  const tareasFiltradas = tareas.filter(t => {
    if (filtro === 'pendientes') return !t.completada
    if (filtro === 'hoy') return t.fecha_programada === hoy && !t.completada
    if (filtro === 'completadas') return t.completada
    return true
  })

  return (
    <div>
      <div style={s.topbar}>
        <div style={s.topTitle}>Agenda</div>
        <span style={s.addBtn} onClick={() => setModal(true)}>+</span>
      </div>
      <div style={s.body}>
        <div style={s.filtros}>
          {[['pendientes','Pendientes'],['hoy','Hoy'],['completadas','Completadas'],['todas','Todas']].map(([k,v]) => (
            <button key={k} style={{ ...s.filtroBtn, ...(filtro===k ? s.filtroBtnActive : {}) }} onClick={() => setFiltro(k)}>{v}</button>
          ))}
        </div>

        {tareasFiltradas.length === 0
          ? <div style={s.empty}>No hay tareas {filtro === 'pendientes' ? 'pendientes' : ''}</div>
          : tareasFiltradas.map(t => (
            <div key={t.id} style={{ ...s.tarea, opacity: t.completada ? 0.6 : 1 }}>
              <div style={s.tareaHead}>
                <span style={s.tareaIcon}>{TIPOS[t.tipo]?.icon || '📌'}</span>
                <span style={s.tareaTipo}>{TIPOS[t.tipo]?.label || t.tipo}</span>
                <span style={s.tareaFecha}>{t.fecha_programada}</span>
              </div>
              <div style={s.tareaDesc}>{t.descripcion}</div>
              {(t.campos?.nombre || t.bloques?.codigo) && (
                <div style={{ fontSize:11, color:'#aaa', marginBottom:6 }}>
                  {t.campos?.nombre}{t.bloques?.codigo ? ' · Bloque ' + t.bloques.codigo : ''}
                </div>
              )}
              <div style={s.tareaFooter}>
                {getBadge(t)}
                <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
                  {!t.completada && <button style={s.completarBtn} onClick={() => completarTarea(t.id)}>✓ Completar</button>}
                  <button style={{ ...s.completarBtn, color:'#cc4444', borderColor:'#ffcccc' }} onClick={() => eliminarTarea(t.id)}>Eliminar</button>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {modal && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={s.sheet}>
            <div style={s.sheetTitle}>Nueva tarea</div>
            <label style={s.label}>Tipo</label>
            <select style={s.select} value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))}>
              {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <label style={s.label}>Descripción *</label>
            <textarea style={s.textarea} value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Fumigar con Captan bloques A-2 y A-3"/>
            <label style={s.label}>Fecha *</label>
            <input style={s.input} type="date" value={form.fecha_programada} onChange={e => setForm(f => ({...f, fecha_programada:e.target.value}))}/>
            <label style={s.label}>Campo (opcional)</label>
            <select style={s.select} value={form.campo_id} onChange={e => { setForm(f => ({...f, campo_id:e.target.value, bloque_id:''})); if(e.target.value) fetchBloques(e.target.value) }}>
              <option value="">Todos los campos</option>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {form.campo_id && bloques.length > 0 && <>
              <label style={s.label}>Bloque (opcional)</label>
              <select style={s.select} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
                <option value="">Todos los bloques</option>
                {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
              </select>
            </>}
            <button style={s.saveBtn} onClick={guardarTarea} disabled={saving}>{saving ? 'Guardando...' : 'Guardar tarea'}</button>
            <button style={s.cancelBtn} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
