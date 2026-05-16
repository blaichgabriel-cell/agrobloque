import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Cosecha() {
  const [cosechas, setCosechas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ bloque_id:'', fecha:'', kg_total:'', calidad:'primera', destino:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [campoFiltro, setCampoFiltro] = useState(null)

  useEffect(() => { fetchCampos(); fetchCosechas() }, [])
  useEffect(() => { if (campoFiltro) fetchBloques(campoFiltro) }, [campoFiltro])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setCampoFiltro(data[0].id)
  }

  const fetchCosechas = async () => {
    const { data } = await supabase.from('cosechas').select('*, bloques(codigo, campos(nombre))').order('fecha', { ascending: false })
    setCosechas(data || [])
  }

  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campo_id).order('codigo')
    setBloques(data || [])
  }

  const guardar = async () => {
    if (!form.bloque_id || !form.fecha || !form.kg_total) return
    setSaving(true)
    await supabase.from('cosechas').insert({
      bloque_id: form.bloque_id,
      fecha: form.fecha,
      kg_total: Number(form.kg_total),
      calidad: form.calidad,
      destino: form.destino || null,
      notas: form.notas || null
    })
    await fetchCosechas()
    setSaving(false)
    setModal(false)
    setForm({ bloque_id:'', fecha:'', kg_total:'', calidad:'primera', destino:'', notas:'' })
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return
    await supabase.from('cosechas').delete().eq('id', id)
    fetchCosechas()
  }

  const totalKg = cosechas.reduce((sum, c) => sum + (Number(c.kg_total) || 0), 0)

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Producción</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Cosecha</div>
          </div>
          <button onClick={() => setModal(true)} style={{ width:40, height:40, borderRadius:14, background:'#0a0a0a', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', marginTop:2 }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        <div style={{ background:'#0a0a0a', borderRadius:20, padding:'16px 18px', marginBottom:4 }}>
          <div style={{ fontSize:10, color:'#5a5a5a', textTransform:'uppercase', letterSpacing:.05, marginBottom:6 }}>Total cosechado</div>
          <div style={{ fontSize:42, fontWeight:800, color:'#fff', letterSpacing:-2, lineHeight:1 }}>{totalKg.toLocaleString()}</div>
          <div style={{ fontSize:11, color:'#4a4a4a', marginTop:4 }}>kg registrados · {cosechas.length} registros</div>
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        {cosechas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin registros de cosecha</div>
        ) : cosechas.map(c => (
          <div key={c.id} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a' }}>Bloque {c.bloques?.codigo}</div>
                <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>{c.bloques?.campos?.nombre} · {c.fecha}</div>
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:'#0a0a0a' }}>{Number(c.kg_total).toLocaleString()} kg</div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
              <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:600, background: c.calidad==='primera' ? '#edf7ed' : '#fff3e8', color: c.calidad==='primera' ? '#2d6a2d' : '#c8700a' }}>
                {c.calidad === 'primera' ? '1ra calidad' : '2da calidad'}
              </div>
              {c.destino && <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, background:'#f2f1ef', color:'#555' }}>{c.destino}</div>}
            </div>
            {c.notas && <div style={{ fontSize:11, color:'#9a9a9a', padding:'8px 10px', background:'#f2f1ef', borderRadius:8, marginBottom:10 }}>{c.notas}</div>}
            <button onClick={() => eliminar(c.id)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
          </div>
        ))}
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Registrar cosecha</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Campo</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={campoFiltro||''} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({...f, bloque_id:''})) }}>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloque *</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
              <option value="">Seleccioná bloque...</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
            </select>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha *</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Kg cosechados *</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="number" value={form.kg_total} onChange={e => setForm(f => ({...f, kg_total:e.target.value}))} placeholder="Ej: 150"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Calidad</div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {['primera','segunda','mixta'].map(q => (
                <button key={q} onClick={() => setForm(f => ({...f, calidad:q}))} style={{ flex:1, padding:'9px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:12, fontWeight:500, cursor:'pointer', background: form.calidad===q ? '#0a0a0a' : '#fff', color: form.calidad===q ? '#fff' : '#555' }}>
                  {q === 'primera' ? '1ra' : q === 'segunda' ? '2da' : 'Mixta'}
                </button>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Destino (opcional)</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="text" value={form.destino} onChange={e => setForm(f => ({...f, destino:e.target.value}))} placeholder="Ej: Mercado, Mayorista..."/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Notas (opcional)</div>
            <textarea style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16, minHeight:70, resize:'vertical' }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#0a0a0a', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cosecha'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
