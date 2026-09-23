import { Modal, FormHeading, Notice, Skeleton } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'

const TIPOS = {
  fumigacion: { label:'Fumigación', icon:'ti-spray', color:'#e07b00', bg:'#fff3e8' },
  fertiriego:  { label:'Fertiriego',  icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  cosecha:     { label:'Cosecha',     icon:'ti-cut',     color:"#124e38", bg:'#eeeeee' },
  evaluacion:  { label:'Evaluación',  icon:'ti-clipboard-list', color:'#8e44ad', bg:'#f5eefb' },
  otro:        { label:'Otro',        icon:'ti-pin',     color:'#555',    bg:'#f2f1ef' },
}

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface" style={{ background:'#fff', borderRadius:'var(--ag-radius)', padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:"#182c25", marginBottom:8, textAlign:'center' }}>¿Cancelar tarea?</div>
        <div style={{ fontSize:13, color:"#697970", textAlign:'center', marginBottom:20 }}>La tarea se conservará en el historial.</div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="ag-small-action" onClick={onCancel} style={{ flex:1, padding:12, borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'transparent', fontSize:13, color:"#697970", cursor:'pointer' }}>Cancelar</button>
          <button className="ag-small-action" onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:'var(--ag-radius)', border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Cancelar tarea</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Agenda() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
  const [tareas, setTareas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [filtro, setFiltro] = useState('pendientes')
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const vacio = { id:'', tipo:'fumigacion', descripcion:'', fecha_programada:'', campo_id:'', bloque_id:'', prioridad:'normal', responsable:'' }
  const [form, setForm] = useState(vacio)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const hoy = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchTareas(); fetchCampos() }, [])

  const fetchTareas = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('tareas').select('*, campos(nombre), bloques(codigo)').order('fecha_programada')
    if (error) setError('No se pudo cargar la agenda.')
    else setTareas(data || [])
    setLoading(false)
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
    if (!form.descripcion || !form.fecha_programada) return setError('Completá la descripción y la fecha.')
    setSaving(true); setError(''); setSuccess('')
    const payload = { tipo:form.tipo, descripcion:form.descripcion, fecha_programada:form.fecha_programada, campo_id:form.campo_id||null, bloque_id:form.bloque_id||null, prioridad:form.prioridad || 'normal', responsable:form.responsable || null, updated_at:new Date().toISOString() }
    const { error } = form.id ? await supabase.from('tareas').update(payload).eq('id', form.id) : await supabase.from('tareas').insert({ ...payload, completada:false })
    if (error) { setError('No se pudo guardar la tarea. Revisá la conexión e intentá nuevamente.'); setSaving(false); return }
    await fetchTareas(); setSaving(false); setModal(false); setSuccess('Tarea guardada correctamente.')
    setForm(vacio)
  }

  const editarTarea = async (t) => {
    setForm({ id:t.id, tipo:t.tipo || 'otro', descripcion:t.descripcion || '', fecha_programada:t.fecha_programada || '', campo_id:t.campo_id || '', bloque_id:t.bloque_id || '', prioridad:t.prioridad || 'normal', responsable:t.responsable || '' })
    if (t.campo_id) await fetchBloques(t.campo_id)
    setModal(true)
  }

  const reabrirTarea = async (id) => {
    await supabase.from('tareas').update({ completada:false, fecha_completada:null, anulada:false, cancelada:false, anulada_at:null, anulada_motivo:null, updated_at:new Date().toISOString() }).eq('id', id)
    fetchTareas()
  }

  const completarTarea = async (id) => {
    await supabase.from('tareas').update({ completada:true, fecha_completada:hoy }).eq('id', id)
    fetchTareas()
  }

  const eliminarTarea = (id) => {
    setConfirmar({ fn: async () => {
      const { error } = await supabase.from('tareas').update({ anulada:true, anulada_at:new Date().toISOString() }).eq('id', id)
      if (error && `${error.message || ''}`.toLowerCase().includes('anulada')) {
        const tarea = tareas.find(t => t.id === id)
        await supabase.from('tareas').update({ completada:true, fecha_completada:hoy, descripcion:`[Cancelada] ${tarea?.descripcion || ''}` }).eq('id', id)
      }
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
    if (t.anulada || String(t.descripcion || '').startsWith('[Cancelada]')) return { label:'Cancelada', bg:'#f2f1ef', color:'#697970' }
    if (t.completada) return { label:'Completada', bg:'#eeeeee', color:"#124e38" }
    if (t.fecha_programada < hoy) return { label:'Vencida', bg:'#fff0f0', color:'#c84040' }
    if (t.fecha_programada === hoy) return { label:'Hoy', bg:'#fff3e8', color:'#c8700a' }
    return null
  }

  return (
    <div className="ag-page" style={{ background:"#f6f8f7", minHeight:'100vh' }}>
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div className="ag-page-header" style={{ background:"#f6f8f7", padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:12, color:"#697970", marginBottom:4 }}>Planificación</div>
            <div className="ag-page-title" style={{ fontSize:24, fontWeight:700, color:"#182c25", letterSpacing:-.5 }}>Agenda</div>
          </div>
          <button aria-label="Agregar registro" onClick={() => { setForm(vacio); setModal(true) }} style={{ width:40, height:40, borderRadius:'var(--ag-radius)', background:"#124e38", border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
          {[['pendientes','Pendientes'],['hoy','Hoy'],['completadas','Completadas'],['todas','Todas']].map(([k,v]) => (
            <button className="ag-small-action" key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:'var(--ag-radius)', border:'none', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#212121' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div className="ag-page-body" style={{ padding: isDesktop ? '12px 36px 100px' : '12px 14px 100px' }}>
        <Notice tone="error">{!modal && error}</Notice><Notice>{success}</Notice>
        {loading ? <Skeleton rows={3} label="Cargando agenda" /> : tareasFiltradas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:"#697970", fontSize:13 }}>No hay tareas {filtro === 'pendientes' ? 'pendientes' : ''}</div>
        ) : (
          <div className="ag-record-grid" style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {tareasFiltradas.map(t => {
          const tipo = TIPOS[t.tipo] || TIPOS.otro
          const badge = getBadge(t)
          return (
            <div className="ag-surface" key={t.id} style={{ background:'#fff', borderRadius:'var(--ag-radius)', padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, opacity: t.completada ? 0.6 : 1, boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ width:34, height:34, borderRadius:'var(--ag-radius)', background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${tipo.icon}`} style={{ fontSize:16, color:tipo.color }} aria-hidden="true"></i>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:"#697970", marginBottom:1 }}>{tipo.label}{t.campos?.nombre ? ' · ' + t.campos.nombre : ''}{t.bloques?.codigo ? ' · ' + t.bloques.codigo : ''}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#182c25" }}>{t.descripcion}</div>
                </div>
                {badge && <div style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:'var(--ag-radius)', background:badge.bg, color:badge.color, flexShrink:0 }}>{badge.label}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:"1px solid #f6f8f7" }}>
                <div style={{ fontSize:12, color:'#6b796d' }}>{t.fecha_programada}</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="ag-small-action" onClick={() => editarTarea(t)} style={{ padding:'5px 12px', borderRadius:'var(--ag-radius)', border:'1px solid #d9ded9', background:'transparent', fontSize:12, color:'#343a36', cursor:'pointer' }}>Editar</button>
                  {!t.completada && !t.anulada && (
                    <button className="ag-small-action" onClick={() => completarTarea(t.id)} style={{ padding:'5px 12px', borderRadius:'var(--ag-radius)', border:'1px solid #d4b89a', background:'transparent', fontSize:12, fontWeight:500, color:"#124e38", cursor:'pointer' }}>
                      ✓ Completar
                    </button>
                  )}
                  {!t.anulada && <button className="ag-small-action" onClick={() => eliminarTarea(t.id)} style={{ padding:'5px 12px', borderRadius:'var(--ag-radius)', border:'1px solid #ffcccc', background:'transparent', fontSize:12, fontWeight:500, color:'#c84040', cursor:'pointer' }}>
                    Cancelar
                  </button>
                  }
                  {(t.completada || t.anulada) && <button className="ag-small-action" onClick={() => reabrirTarea(t.id)} style={{ padding:'5px 12px', borderRadius:'var(--ag-radius)', border:'1px solid #d4b89a', background:'transparent', fontSize:12, color:'#124e38', cursor:'pointer' }}>Reabrir</button>}
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
        <Modal busy={saving} onClose={() => setModal(false)} label="Registro de tarea" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div style={{ background:"#f6f8f7", borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:700, color:"#182c25", marginBottom:20 }}>{form.id ? 'Editar tarea' : 'Nueva tarea'}</div>
            <label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Tipo
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12 }} value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))}>
              {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
            <label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Descripción *
            <textarea style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12, minHeight:80, resize:'vertical' }} value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Fumigar bloques A-2 y A-3"/></label>
            <label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Fecha *
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12 }} type="date" value={form.fecha_programada} onChange={e => setForm(f => ({...f, fecha_programada:e.target.value}))}/></label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}><div><label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Prioridad<select style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, marginBottom:12 }} value={form.prioridad || 'normal'} onChange={e => setForm(f => ({...f, prioridad:e.target.value}))}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option></select></label></div><div><label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Responsable<input style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, marginBottom:12, boxSizing:'border-box' }} value={form.responsable || ''} onChange={e => setForm(f => ({...f, responsable:e.target.value}))} placeholder="Opcional" /></label></div></div>
            <label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Campo (opcional)
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12 }} value={form.campo_id} onChange={e => { setForm(f => ({...f, campo_id:e.target.value, bloque_id:''})); if(e.target.value) fetchBloques(e.target.value) }}>
              <option value="">Todos los campos</option>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            {form.campo_id && bloques.length > 0 && <>
              <div style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Bloque (opcional)</div>
              <select style={{ width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12 }} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
                <option value="">Todos los bloques</option>
                {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
              </select>
            </>}
            <button className="ag-small-action" style={{ width:'100%', padding:14, borderRadius:'var(--ag-radius)', background:"#124e38", border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardarTarea} disabled={saving}>
              {saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Guardar tarea'}
            </button>
            <button className="ag-small-action" style={{ width:'100%', padding:12, borderRadius:'var(--ag-radius)', background:'transparent', border:"1px solid #e2e9e5", fontSize:13, color:"#697970", cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
