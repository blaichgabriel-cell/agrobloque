import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function ModalConfirm({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>¿Eliminar registro?</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>{mensaje}</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function Cosecha() {
  const [cosechas, setCosechas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [compradores, setCompradores] = useState([])
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ bloque_id:'', fecha:'', kg_total:'', precio_kg:'', calidad:'primera', comprador_id:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [campoFiltro, setCampoFiltro] = useState(null)

  useEffect(() => { fetchCampos(); fetchCosechas(); fetchCompradores() }, [])
  useEffect(() => { if (campoFiltro) fetchBloques(campoFiltro) }, [campoFiltro])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setCampoFiltro(data[0].id)
  }

  const fetchCosechas = async () => {
    const { data } = await supabase.from('cosechas')
      .select('*, bloques(codigo, campos(nombre)), compradores(nombre)')
      .order('fecha', { ascending: false })
    setCosechas(data || [])
  }

  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campo_id).order('codigo')
    setBloques(data || [])
  }

  const fetchCompradores = async () => {
    const { data } = await supabase.from('compradores').select('*').order('nombre')
    setCompradores(data || [])
  }

  const guardar = async () => {
    if (!form.bloque_id || !form.fecha || !form.kg_total) return
    setSaving(true)
    await supabase.from('cosechas').insert({
      bloque_id: form.bloque_id, fecha: form.fecha,
      kg_total: Number(form.kg_total),
      precio_kg: Number(form.precio_kg) || 0,
      calidad: form.calidad,
      comprador_id: form.comprador_id || null,
      notas: form.notas || null
    })
    await fetchCosechas()
    setSaving(false); setModal(false)
    setForm({ bloque_id:'', fecha:'', kg_total:'', precio_kg:'', calidad:'primera', comprador_id:'', notas:'' })
  }

  const eliminar = (id) => {
    setConfirmar({ mensaje: 'Esta acción no se puede deshacer.', fn: async () => {
      await supabase.from('cosechas').delete().eq('id', id)
      setConfirmar(null); fetchCosechas()
    }})
  }

  const totalKg = cosechas.reduce((sum, c) => sum + (Number(c.kg_total) || 0), 0)
  const totalIngresos = cosechas.reduce((sum, c) => sum + ((Number(c.kg_total) || 0) * (Number(c.precio_kg) || 0)), 0)

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Producción</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Cosecha</div>
          </div>
          <button onClick={() => setModal(true)} style={{ width:40, height:40, borderRadius:14, background:'#1E5631', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:4 }}>
          <div style={{ background:'#1E5631', borderRadius:16, padding:'14px 16px' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', marginBottom:4 }}>Total cosechado</div>
            <div style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:-1, lineHeight:1 }}>{totalKg.toLocaleString()}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:3 }}>kg · {cosechas.length} registros</div>
          </div>
          <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px' }}>
            <div style={{ fontSize:9, color:'#9a9a9a', textTransform:'uppercase', marginBottom:4 }}>Ingresos totales</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#1E5631', letterSpacing:-.5, lineHeight:1 }}>
              {totalIngresos > 0 ? `Gs. ${totalIngresos.toLocaleString()}` : '—'}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginTop:3 }}>calculado automáticamente</div>
          </div>
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        {cosechas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin registros de cosecha</div>
        ) : cosechas.map(c => {
          const ingreso = (Number(c.kg_total) || 0) * (Number(c.precio_kg) || 0)
          return (
            <div key={c.id} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a' }}>Bloque {c.bloques?.codigo}</div>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>{c.bloques?.campos?.nombre} · {c.fecha}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#0a0a0a' }}>{Number(c.kg_total).toLocaleString()} kg</div>
                  {c.precio_kg > 0 && <div style={{ fontSize:11, color:'#1E5631', fontWeight:600 }}>Gs. {ingreso.toLocaleString()}</div>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:600, background: c.calidad==='primera' ? '#edf7ed' : '#fff3e8', color: c.calidad==='primera' ? '#1E5631' : '#c8700a' }}>
                  {c.calidad === 'primera' ? '1ra calidad' : c.calidad === 'segunda' ? '2da calidad' : 'Mixta'}
                </div>
                {c.precio_kg > 0 && <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, background:'#f2f1ef', color:'#555' }}>Gs. {Number(c.precio_kg).toLocaleString()}/kg</div>}
                {c.compradores?.nombre && <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, background:'#e6f1fb', color:'#185fa5' }}>{c.compradores.nombre}</div>}
              </div>
              {c.notas && <div style={{ fontSize:11, color:'#9a9a9a', padding:'7px 10px', background:'#f2f1ef', borderRadius:8, marginBottom:8 }}>{c.notas}</div>}
              <button onClick={() => eliminar(c.id)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
            </div>
          )
        })}
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Registrar cosecha</div>

            {[
              { label:'Campo', content: (
                <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={campoFiltro||''} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({...f, bloque_id:''})) }}>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )},
              { label:'Bloque *', content: (
                <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
                  <option value="">Seleccioná bloque...</option>
                  {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                </select>
              )},
              { label:'Fecha *', content: (
                <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))}/>
              )},
              { label:'Kg cosechados *', content: (
                <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="number" value={form.kg_total} onChange={e => setForm(f => ({...f, kg_total:e.target.value}))} placeholder="Ej: 150"/>
              )},
              { label:'Precio por kg (Gs.) *', content: (
                <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="number" value={form.precio_kg} onChange={e => setForm(f => ({...f, precio_kg:e.target.value}))} placeholder="Ej: 5000"/>
              )},
            ].map(({ label, content }) => (
              <div key={label}>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>{label}</div>
                {content}
              </div>
            ))}

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Calidad</div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {['primera','segunda','mixta'].map(q => (
                <button key={q} onClick={() => setForm(f => ({...f, calidad:q}))} style={{ flex:1, padding:'9px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:12, fontWeight:500, cursor:'pointer', background: form.calidad===q ? '#1E5631' : '#fff', color: form.calidad===q ? '#fff' : '#555' }}>
                  {q === 'primera' ? '1ra' : q === 'segunda' ? '2da' : 'Mixta'}
                </button>
              ))}
            </div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Comprador (opcional)</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.comprador_id} onChange={e => setForm(f => ({...f, comprador_id:e.target.value}))}>
              <option value="">Sin comprador asignado</option>
              {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Notas (opcional)</div>
            <textarea style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16, minHeight:60, resize:'vertical' }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>

            {form.kg_total && form.precio_kg && (
              <div style={{ background:'#edf7ed', borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'#1E5631' }}>Ingreso estimado</span>
                <span style={{ fontSize:14, fontWeight:700, color:'#1E5631' }}>Gs. {(Number(form.kg_total) * Number(form.precio_kg)).toLocaleString()}</span>
              </div>
            )}

            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#1E5631', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cosecha'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
