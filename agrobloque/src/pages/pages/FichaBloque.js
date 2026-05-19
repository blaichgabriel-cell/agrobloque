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
  histBtn: { width:'100%', padding:10, borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:12, color:'#1a1a1a', display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:12, cursor:'pointer' },
  plantForm: { background:'#f0ede8', borderRadius:10, padding:14, marginTop:12, border:'0.5px solid #d0cdc8' },
  formTitle: { fontSize:13, fontWeight:500, color:'#1a1a1a', marginBottom:10 },
  input: { width:'100%', padding:'9px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f9f8f6', fontSize:12, color:'#1a1a1a', marginBottom:8 },
  select: { width:'100%', padding:'9px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f9f8f6', fontSize:12, color:'#1a1a1a', marginBottom:8 },
  saveBtn: { width:'100%', padding:10, borderRadius:8, background:'#1a1a1a', color:'#f9f8f6', border:'none', fontSize:12, fontWeight:500, cursor:'pointer', marginTop:4 },
  histItem: { background:'#f0ede8', borderRadius:8, padding:'10px 12px', marginBottom:6, border:'0.5px solid #d0cdc8' },
  histTitle: { fontSize:12, fontWeight:500, color:'#1a1a1a' },
  histSub: { fontSize:11, color:'#888', marginTop:2 },
  obsWrap: { marginTop:12 },
  obsInput: { width:'100%', padding:'9px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f9f8f6', fontSize:12, color:'#1a1a1a', marginBottom:6, minHeight:70, resize:'vertical' },
  label: { fontSize:11, color:'#888', marginBottom:4, display:'block' },
}

export default function FichaBloque() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [bloque, setBloque] = useState(null)
  const [plantacionActiva, setPlantacionActiva] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [abonos, setAbonos] = useState([])
  const [abonosPlantacion, setAbonosPlantacion] = useState([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [form, setForm] = useState({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[] })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData(); fetchCultivos(); fetchAbonos() }, [id])

  const fetchData = async () => {
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)
    const { data: plantas } = await supabase.from('plantaciones')
      .select('*, cultivos(nombre)')
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
    const { data } = await supabase.from('cultivos').select('*').order('nombre')
    setCultivos(data || [])
  }

  const fetchAbonos = async () => {
    const { data } = await supabase.from('abonos').select('*').order('nombre')
    setAbonos(data || [])
  }

  const toggleAbono = (id) => {
    setForm(f => ({ ...f, abonos_ids: f.abonos_ids.includes(id) ? f.abonos_ids.filter(x => x !== id) : [...f.abonos_ids, id] }))
  }

  const guardarPlantacion = async () => {
    if (!form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    if (plantacionActiva) {
      await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    }
    const { data: nueva } = await supabase.from('plantaciones').insert({
      bloque_id: id,
      cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.cantidad_plantas || null,
      activa: true
    }).select().single()
    if (nueva && form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({ plantacion_id: nueva.id, abono_id: ab }))
      )
    }
    setShowNuevaPlantacion(false)
    setForm({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[] })
    setSaving(false)
    fetchData()
  }

  const guardarObservacion = async () => {
    if (!observacion.trim()) return
    await supabase.from('observaciones').insert({
      bloque_id: id,
      plantacion_id: plantacionActiva?.id || null,
      texto: observacion
    })
    setObservacion('')
    alert('Observación guardada')
  }

  const getVariedad = (p) => {
    if (!p) return '—'
    if (p.notas && p.notas.startsWith('Variedad: ')) return p.notas.replace('Variedad: ', '')
    return '—'
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
        <div style={s.row}><div style={s.rkey}>Variedad</div><div style={s.rval}>{getVariedad(plantacionActiva)}</div></div>
        <div style={s.row}><div style={s.rkey}>Fecha de siembra</div><div style={s.rval}>{plantacionActiva?.fecha_siembra || '—'}</div></div>
        <div style={s.row}><div style={s.rkey}>Cantidad de plantas</div><div style={s.rval}>{plantacionActiva?.densidad_plantas_m2 ? `${Number(plantacionActiva.densidad_plantas_m2).toLocaleString()} plantas` : '—'}</div></div>
        <div style={s.row}>
          <div style={s.rkey}>Abonos de base</div>
          <div style={s.abonoWrap}>
            {abonosPlantacion.map(a => <span key={a.id} style={s.abonoTag}>{a.abonos?.nombre}</span>)}
            {abonosPlantacion.length === 0 && <span style={{ fontSize:11, color:'#aaa' }}>Sin abonos</span>}
          </div>
        </div>
        <div style={s.row}><div style={s.rkey}>Tipo</div><div style={s.rval}>{bloque.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'}</div></div>

        <button style={{ ...s.histBtn, marginTop:16 }} onClick={() => setShowNuevaPlantacion(!showNuevaPlantacion)}>
          {showNuevaPlantacion ? '✕ Cancelar' : '+ Nueva plantación'}
        </button>

        {showNuevaPlantacion && (
          <div style={s.plantForm}>
            <div style={s.formTitle}>Nueva plantación</div>
            <label style={s.label}>Cultivo *</label>
            <select style={s.select} value={form.cultivo_id} onChange={e => setForm(f => ({ ...f, cultivo_id: e.target.value }))}>
              <option value="">Seleccioná cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <label style={s.label}>Variedad (escribí libremente)</label>
            <input style={s.input} type="text" value={form.variedad_texto} onChange={e => setForm(f => ({ ...f, variedad_texto: e.target.value }))} placeholder="Ej: Rojo, Lamuyo, Holandés..." />
            <label style={s.label}>Fecha de siembra *</label>
            <input style={s.input} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({ ...f, fecha_siembra: e.target.value }))} />
            <label style={s.label}>Cantidad total de plantas</label>
            <input style={s.input} type="number" value={form.cantidad_plantas} onChange={e => setForm(f => ({ ...f, cantidad_plantas: e.target.value }))} placeholder="Ej: 1000" step="1" min="0" />
            <label style={s.label}>Abonos de base</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
              {abonos.map(a => (
                <div key={a.id} onClick={() => toggleAbono(a.id)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', background: form.abonos_ids.includes(a.id) ? '#1a1a1a' : '#f9f8f6', color: form.abonos_ids.includes(a.id) ? '#fff' : '#555', border:'0.5px solid #d0cdc8' }}>
                  {a.nombre}
                </div>
              ))}
              {abonos.length === 0 && <div style={{ fontSize:11, color:'#aaa' }}>No hay abonos cargados</div>}
            </div>
            <button style={{ ...s.saveBtn, background: saving ? '#888' : '#1a1a1a' }} onClick={guardarPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar plantación'}
            </button>
          </div>
        )}

        <div style={s.obsWrap}>
          <label style={s.label}>Agregar observación</label>
          <textarea style={s.obsInput} value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Escribí una observación sobre este bloque..." />
          <button style={{ ...s.saveBtn, background: observacion.trim() ? '#1a1a1a' : '#d0cdc8' }} onClick={guardarObservacion}>
            Guardar observación
          </button>
        </div>

        <button style={{ ...s.histBtn, marginTop:16 }} onClick={() => setShowHistorial(!showHistorial)}>
          {showHistorial ? 'Ocultar historial' : 'Ver historial de plantaciones'}
        </button>
        {showHistorial && (
          <div style={{ marginTop:8 }}>
            {historial.length === 0
              ? <div style={{ color:'#888', fontSize:12, padding:8 }}>Sin plantaciones anteriores</div>
              : historial.map(p => (
                <div key={p.id} style={s.histItem}>
                  <div style={s.histTitle}>{p.cultivos?.nombre}{getVariedad(p) !== '—' ? ` · ${getVariedad(p)}` : ''}</div>
                  <div style={s.histSub}>Siembra: {p.fecha_siembra || '—'}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
