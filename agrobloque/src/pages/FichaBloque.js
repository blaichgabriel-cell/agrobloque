import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  back: { color:'#f9f8f6', fontSize:22, cursor:'pointer', lineHeight:1 },
  body: { padding:12 },
  head: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  codigo: { fontSize:22, fontWeight:600, color:'#1a1a1a' },
  sector: { fontSize:11, color:'#888', marginTop:2 },
  badge: { fontSize:10, padding:'3px 10px', borderRadius:20, background:'#1a1a1a', color:'#f9f8f6', fontWeight:500 },
  row: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'8px 0', borderBottom:'0.5px solid #e8e4de' },
  rkey: { fontSize:12, color:'#888' },
  rval: { fontSize:12, color:'#1a1a1a', fontWeight:500, textAlign:'right', maxWidth:'60%' },
  abonoWrap: { display:'flex', flexWrap:'wrap', gap:4, justifyContent:'flex-end' },
  abonoTag: { fontSize:10, padding:'2px 8px', borderRadius:6, background:'#f0ede8', border:'0.5px solid #d0cdc8', color:'#444' },
  addBtn: { fontSize:10, padding:'2px 8px', borderRadius:6, border:'0.5px dashed #bbb', color:'#888', background:'transparent', cursor:'pointer' },
  histBtn: { width:'100%', padding:10, borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:12, color:'#1a1a1a', display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:12, cursor:'pointer' },
  plantForm: { background:'#f0ede8', borderRadius:10, padding:14, marginTop:12, border:'0.5px solid #d0cdc8' },
  formTitle: { fontSize:13, fontWeight:500, color:'#1a1a1a', marginBottom:10 },
  input: { width:'100%', padding:'9px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f9f8f6', fontSize:12, color:'#1a1a1a', marginBottom:8 },
  select: { width:'100%', padding:'9px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f9f8f6', fontSize:12, color:'#1a1a1a', marginBottom:8 },
  saveBtn: { width:'100%', padding:10, borderRadius:8, background:'#1a1a1a', color:'#f9f8f6', border:'none', fontSize:12, fontWeight:500, cursor:'pointer' },
  histItem: { background:'#f0ede8', borderRadius:8, padding:'10px 12px', marginBottom:6, border:'0.5px solid #d0cdc8' },
  histTitle: { fontSize:12, fontWeight:500, color:'#1a1a1a' },
  histSub: { fontSize:11, color:'#888', marginTop:2 },
  obsWrap: { marginTop:12 },
  obsInput: { width:'100%', padding:'9px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f9f8f6', fontSize:12, color:'#1a1a1a', marginBottom:6, minHeight:70, resize:'vertical' },
}

export default function FichaBloque() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [bloque, setBloque] = useState(null)
  const [plantacionActiva, setPlantacionActiva] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [variedades, setVariedades] = useState([])
  const [abonos, setAbonos] = useState([])
  const [abonosPlantacion, setAbonosPlantacion] = useState([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [form, setForm] = useState({ cultivo_id:'', variedad_id:'', fecha_siembra:'', densidad_plantas_m2:'' })

  useEffect(() => {
    fetchData()
    fetchCultivos()
    fetchAbonos()
  }, [id])

  const fetchData = async () => {
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)
    const { data: plantas } = await supabase.from('plantaciones')
      .select('*, cultivos(nombre), variedades(nombre)')
      .eq('bloque_id', id).order('created_at', { ascending: false })
    if (plantas) {
      setPlantacionActiva(plantas.find(p => p.activa) || null)
      setHistorial(plantas.filter(p => !p.activa))
    }
    if (plantas?.find(p => p.activa)) {
      const { data: ab } = await supabase.from('plantacion_abonos')
        .select('*, abonos(nombre)').eq('plantacion_id', plantas.find(p => p.activa).id)
      setAbonosPlantacion(ab || [])
    }
  }

  const fetchCultivos = async () => {
    const { data } = await supabase.from('cultivos').select('*').eq('activo', true)
    setCultivos(data || [])
  }

  const fetchAbonos = async () => {
    const { data } = await supabase.from('abonos').select('*').eq('activo', true)
    setAbonos(data || [])
  }

  const handleCultivoChange = async (cultivo_id) => {
    setForm(f => ({ ...f, cultivo_id, variedad_id:'' }))
    const { data } = await supabase.from('variedades').select('*').eq('cultivo_id', cultivo_id).eq('activo', true)
    setVariedades(data || [])
  }

  const guardarPlantacion = async () => {
    if (!form.cultivo_id || !form.fecha_siembra) return
    if (plantacionActiva) {
      await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    }
    await supabase.from('plantaciones').insert({
      bloque_id: id,
      cultivo_id: form.cultivo_id,
      variedad_id: form.variedad_id || null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.densidad_plantas_m2 || null,
      activa: true
    })
    setShowNuevaPlantacion(false)
    fetchData()
  }

  const guardarObservacion = async () => {
    if (!observacion.trim()) return
    await supabase.from('observaciones').insert({ bloque_id: id, plantacion_id: plantacionActiva?.id || null, texto: observacion })
    setObservacion('')
  }

  if (!bloque) return <div style={{ padding:40, textAlign:'center', color:'#888' }}>Cargando...</div>

  return (
    <div>
      <div style={s.topbar}>
        <span style={s.back} onClick={() => navigate(-1)}>←</span>
        <div style={s.topTitle}>Bloque {bloque.codigo}</div>
      </div>
      <div style={s.body}>
        <div style={s.head}>
          <div>
            <div style={s.codigo}>Bloque {bloque.codigo}</div>
            <div style={s.sector}>{bloque.campos?.nombre} · {bloque.sectores?.nombre}</div>
          </div>
          <div style={s.badge}>{bloque.activo ? 'Activo' : 'Inactivo'}</div>
        </div>

        <div style={s.row}><div style={s.rkey}>Cultivo</div><div style={s.rval}>{plantacionActiva?.cultivos?.nombre || '—'}</div></div>
        <div style={s.row}><div style={s.rkey}>Variedad</div><div style={s.rval}>{plantacionActiva?.variedades?.nombre || '—'}</div></div>
        <div style={s.row}><div style={s.rkey}>Fecha de siembra</div><div style={s.rval}>{plantacionActiva?.fecha_siembra || '—'}</div></div>
        <div style={s.row}><div style={s.rkey}>Densidad</div><div style={s.rval}>{plantacionActiva?.densidad_plantas_m2 ? `${plantacionActiva.densidad_plantas_m2} pl/m²` : '—'}</div></div>
        <div style={s.row}>
          <div style={s.rkey}>Abonos de base</div>
          <div style={s.abonoWrap}>
            {abonosPlantacion.map(a => <span key={a.id} style={s.abonoTag}>{a.abonos?.nombre}</span>)}
            <button style={s.addBtn} onClick={() => {}}>+ Agregar</button>
          </div>
        </div>
        <div style={s.row}><div style={s.rkey}>Tipo</div><div style={s.rval}>{bloque.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'}</div></div>
        {bloque.notas && <div style={s.row}><div style={s.rkey}>Notas</div><div style={s.rval}>{bloque.notas}</div></div>}

        <button style={{ ...s.histBtn, marginTop:16 }} onClick={() => setShowNuevaPlantacion(!showNuevaPlantacion)}>
          {showNuevaPlantacion ? '✕ Cancelar' : '+ Nueva plantación'}
        </button>

        {showNuevaPlantacion && (
          <div style={s.plantForm}>
            <div style={s.formTitle}>Nueva plantación</div>
            <select style={s.select} value={form.cultivo_id} onChange={e => handleCultivoChange(e.target.value)}>
              <option value="">Seleccioná cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {variedades.length > 0 && (
              <select style={s.select} value={form.variedad_id} onChange={e => setForm(f => ({ ...f, variedad_id: e.target.value }))}>
                <option value="">Seleccioná variedad...</option>
                {variedades.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            )}
            <input style={s.input} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({ ...f, fecha_siembra: e.target.value }))} placeholder="Fecha de siembra" />
            <input style={s.input} type="number" value={form.densidad_plantas_m2} onChange={e => setForm(f => ({ ...f, densidad_plantas_m2: e.target.value }))} placeholder="Densidad (plantas/m²)" step="0.1" />
            <button style={s.saveBtn} onClick={guardarPlantacion}>Guardar plantación</button>
          </div>
        )}

        <div style={s.obsWrap}>
          <div style={{ ...s.rkey, marginBottom:6 }}>Agregar observación</div>
          <textarea style={s.obsInput} value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Escribí una observación..." />
          <button style={{ ...s.saveBtn, background: observacion ? '#1a1a1a' : '#d0cdc8' }} onClick={guardarObservacion}>Guardar observación</button>
        </div>

        <button style={{ ...s.histBtn, marginTop:16 }} onClick={() => setShowHistorial(!showHistorial)}>
          📋 {showHistorial ? 'Ocultar historial' : 'Ver historial de plantaciones'}
        </button>
        {showHistorial && (
          <div style={{ marginTop:8 }}>
            {historial.length === 0 ? <div style={{ color:'#888', fontSize:12, padding:8 }}>Sin plantaciones anteriores</div> :
              historial.map(p => (
                <div key={p.id} style={s.histItem}>
                  <div style={s.histTitle}>{p.cultivos?.nombre}{p.variedades?.nombre ? ` · ${p.variedades.nombre}` : ''}</div>
                  <div style={s.histSub}>Siembra: {p.fecha_siembra || '—'} · {p.notas || ''}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
