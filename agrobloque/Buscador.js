import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'

const TIPOS = {
  fumigacion: { label:'Fumigación', icon:'ti-spray', color:'#e07b00', bg:'#fff3e8' },
  fertiriego:  { label:'Fertiriego',  icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  cosecha:     { label:'Cosecha',     icon:'ti-cut',     color:'#212121', bg:'#eeeeee' },
  evaluacion:  { label:'Evaluación',  icon:'ti-clipboard-list', color:'#8e44ad', bg:'#f5eefb' },
  otro:        { label:'Otro',        icon:'ti-pin',     color:'#555',    bg:'#f2f1ef' },
}

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>¿Eliminar tarea?</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>Esta acción no se puede deshacer.</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function Agenda() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [tareas, setTareas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [filtro, setFiltro] = useState('pendientes')
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ tipo:'fumigacion', descripcion:'', fecha_programada:'', campo_id:'', bloque_id:'' })
  const [saving, setSaving] = useState(false)
  const hoy = new Date().toISOString().split('T')[0]

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
    await supabase.from('tareas').insert({ tipo:form.tipo, descripcion:form.descripcion, fecha_programada:form.fecha_programada, campo_id:form.campo_id||null, bloque_id:form.bloque_id||null, completada:false })
    await fetchTareas(); setSaving(false); setModal(false)
    setForm({ tipo:'fumigacion', descripcion:'', fecha_programada:'', campo_id:'', bloque_id:'' })
  }

  const completarTarea = async (id) => {
    await supabase.from('tareas').update({ completada:true, fecha_completada:hoy }).eq('id', id)
    fetchTareas()
  }

  const eliminarTarea = (id) => {
    setConfirmar({ fn: async () => {
      await supabase.from('tareas').delete().eq('id', id)
      setConfirmar(null); fetchTareas()
    }})
  }

  const tareasFiltradas = tareas.filter(t => {
    if (filtro === 'pendientes') return !t.completada
    if (filtro === 'hoy') return t.fecha_programada === hoy && !t.completada
    if (filtro === 'completadas') return t.completada
    return true
  })

  const getBadge = (t) => {
    if (t.completada) return { label:'Completada', bg:'#eeeeee', color:'#212121' }
    if (t.fecha_programada < hoy) return { label:'Vencida', bg:'#fff0f0', color:'#c84040' }
    if (t.fecha_programada === hoy) return { label:'Hoy', bg:'#fff3e8', color:'#c8700a' }
    return null
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div style={{ background:'#f2f1ef', padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Planificación</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Agenda</div>
          </div>
          <button onClick={() => setModal(true)} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
          {[['pendientes','Pendientes'],['hoy','Hoy'],['completadas','Completadas'],['todas','Todas']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#212121' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: isDesktop ? '12px 36px 100px' : '12px 14px 100px' }}>
        {tareasFiltradas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>No hay tareas {filtro === 'pendientes' ? 'pendientes' : ''}</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {tareasFiltradas.map(t => {
          const tipo = TIPOS[t.tipo] || TIPOS.otro
          const badge = getBadge(t)
          return (
            <div key={t.id} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, opacity: t.completada ? 0.6 : 1, boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${tipo.icon}`} style={{ fontSize:16, color:tipo.color }} aria-hidden="true"></i>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginBottom:1 }}>{tipo.label}{t.campos?.nombre ? ' · ' + t.campos.nombre : ''}{t.bloques?.codigo ? ' · ' + t.bloques.codigo : ''}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a' }}>{t.descripcion}</div>
                </div>
                {badge && <div style={{ fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:8, background:badge.bg, color:badge.color, flexShrink:0 }}>{badge.label}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid #f2f1ef' }}>
                <div style={{ fontSize:10, color:'#b0b0b0' }}>{t.fecha_programada}</div>
                <div style={{ display:'flex', gap:6 }}>
                  {!t.completada && (
                    <button onClick={() => completarTarea(t.id)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #d4b89a', background:'transparent', fontSize:11, fontWeight:500, color:'#212121', cursor:'pointer' }}>
                      ✓ Completar
                    </button>
                  )}
                  <button onClick={() => eliminarTarea(t.id)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, fontWeight:500, color:'#c84040', cursor:'pointer' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="agenda" titulo="Blog de notas de agenda" />
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Nueva tarea</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Tipo</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))}>
              {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripción *</div>
            <textarea style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, minHeight:80, resize:'vertical' }} value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Fumigar bloques A-2 y A-3"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha *</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="date" value={form.fecha_programada} onChange={e => setForm(f => ({...f, fecha_programada:e.target.value}))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Campo (opcional)</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.campo_id} onChange={e => { setForm(f => ({...f, campo_id:e.target.value, bloque_id:''})); if(e.target.value) fetchBloques(e.target.value) }}>
              <option value="">Todos los campos</option>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {form.campo_id && bloques.length > 0 && <>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloque (opcional)</div>
              <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
                <option value="">Todos los bloques</option>
                {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
              </select>
            </>}
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardarTarea} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar tarea'}
            </button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
