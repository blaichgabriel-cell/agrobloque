import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function FichaBloque() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [bloque, setBloque] = useState(null)
  const [plantacionActiva, setPlantacionActiva] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [abonosDisponibles, setAbonosDisponibles] = useState([])
  const [abonosPlantacion, setAbonosPlantacion] = useState([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [observaciones, setObservaciones] = useState([])
  const [form, setForm] = useState({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', densidad_plantas_m2:'', abonos_ids:[] })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData(); fetchCultivos(); fetchAbonos() }, [id])

  const fetchData = async () => {
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)
    const { data: plantas } = await supabase.from('plantaciones').select('*, cultivos(nombre), plantacion_abonos(*, abonos(nombre))').eq('bloque_id', id).order('created_at', { ascending: false })
    if (plantas) {
      setPlantacionActiva(plantas.find(p => p.activa) || null)
      setHistorial(plantas.filter(p => !p.activa))
    }
    if (plantas?.find(p => p.activa)) {
      const { data: ab } = await supabase.from('plantacion_abonos').select('*, abonos(nombre)').eq('plantacion_id', plantas.find(p => p.activa).id)
      setAbonosPlantacion(ab || [])
    } else {
      setAbonosPlantacion([])
    }
    const { data: obs } = await supabase.from('observaciones').select('*').eq('bloque_id', id).order('created_at', { ascending: false })
    setObservaciones(obs || [])
  }

  const fetchCultivos = async () => {
    const { data } = await supabase.from('cultivos').select('*').eq('activo', true).order('nombre')
    setCultivos(data || [])
  }

  const fetchAbonos = async () => {
    const { data } = await supabase.from('abonos').select('*').eq('activo', true).order('nombre')
    setAbonosDisponibles(data || [])
  }

  const toggleAbono = (abonoId) => {
    setForm(f => ({
      ...f,
      abonos_ids: f.abonos_ids.includes(abonoId)
        ? f.abonos_ids.filter(x => x !== abonoId)
        : [...f.abonos_ids, abonoId]
    }))
  }

  const terminarPlantacion = async () => {
    if (!window.confirm('¿Terminar esta plantación? Va a quedar en el historial.')) return
    await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    fetchData()
  }

  const guardarPlantacion = async () => {
    if (!form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    if (plantacionActiva) await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    await supabase.from('plantaciones').insert({
      bloque_id: id,
      cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? 'Variedad: ' + form.variedad_texto : null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.densidad_plantas_m2 || null,
      activa: true
    })
    if (form.abonos_ids.length > 0) {
      const { data: nueva } = await supabase.from('plantaciones').select('id').eq('bloque_id', id).eq('activa', true).single()
      if (nueva) {
        await supabase.from('plantacion_abonos').insert(
          form.abonos_ids.map(abono_id => ({ plantacion_id: nueva.id, abono_id }))
        )
      }
    }
    setShowNuevaPlantacion(false)
    setForm({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', densidad_plantas_m2:'', abonos_ids:[] })
    setSaving(false)
    fetchData()
  }

  const guardarObservacion = async () => {
    if (!observacion.trim()) return
    await supabase.from('observaciones').insert({ bloque_id: id, plantacion_id: plantacionActiva?.id || null, texto: observacion })
    setObservacion('')
    fetchData()
  }

  const getVariedad = (p) => {
    if (!p || !p.notas) return null
    if (p.notas.startsWith('Variedad: ')) return p.notas.replace('Variedad: ', '')
    return null
  }

  if (!bloque) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#9a9a9a', fontSize:13 }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <button onClick={() => navigate(-1)} style={{ background:'#0a0a0a', border:'none', borderRadius:12, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', marginBottom:16 }}>
          <i className="ti ti-arrow-left" style={{ color:'#fff', fontSize:18 }} aria-hidden="true"></i>
        </button>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>{bloque.campos?.nombre} · {bloque.sectores?.nombre}</div>
        <div style={{ fontSize:28, fontWeight:800, color:'#0a0a0a', letterSpacing:-1 }}>Bloque {bloque.codigo}</div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        <div style={{ background:'#0a0a0a', borderRadius:24, padding:20, marginBottom:10 }}>
          <div style={{ fontSize:10, color:'#5a5a5a', letterSpacing:.05, textTransform:'uppercase', marginBottom:6 }}>Plantación actual</div>
          <div style={{ fontSize:24, fontWeight:700, color: plantacionActiva ? '#fff' : '#3a3a3a', marginBottom:4 }}>
            {plantacionActiva?.cultivos?.nombre || 'Sin cultivo'}
          </div>
          {getVariedad(plantacionActiva) && (
            <div style={{ fontSize:12, color:'#6a6a6a', marginBottom:12 }}>{getVariedad(plantacionActiva)}</div>
          )}
          <div style={{ display:'flex', gap:16, marginTop:12 }}>
            <div>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:2 }}>Siembra</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#c8c8c8' }}>{plantacionActiva?.fecha_siembra || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:2 }}>Densidad</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#c8c8c8' }}>{plantacionActiva?.densidad_plantas_m2 ? plantacionActiva.densidad_plantas_m2 + ' pl/m²' : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:2 }}>Tipo</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#c8c8c8' }}>{bloque.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'}</div>
            </div>
          </div>
          {abonosPlantacion.length > 0 && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid #1e1e1e' }}>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:6 }}>Abonos de base</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {abonosPlantacion.map(a => (
                  <span key={a.id} style={{ background:'#1e1e1e', borderRadius:8, padding:'3px 10px', fontSize:10, color:'#aaa' }}>{a.abonos?.nombre}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {plantacionActiva && (
          <button onClick={terminarPlantacion} style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #ffcccc', fontSize:12, fontWeight:500, color:'#c84040', cursor:'pointer', marginBottom:8 }}>
            ✕ Terminar plantación actual
          </button>
        )}

        <button onClick={() => setShowNuevaPlantacion(!showNuevaPlantacion)} style={{ width:'100%', padding:12, borderRadius:14, background:'#fff', border:'none', fontSize:13, fontWeight:600, color:'#0a0a0a', cursor:'pointer', marginBottom:10 }}>
          {showNuevaPlantacion ? '✕ Cancelar' : '+ Nueva plantación'}
        </button>

        {showNuevaPlantacion && (
          <div style={{ background:'#fff', borderRadius:20, padding:18, marginBottom:10 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a', marginBottom:14 }}>Nueva plantación</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:4 }}>Cultivo *</div>
            <select style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:13, color:'#0a0a0a', marginBottom:10 }} value={form.cultivo_id} onChange={e => setForm(f => ({ ...f, cultivo_id:e.target.value }))}>
              <option value="">Seleccioná cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:4 }}>Variedad (escribí libremente)</div>
            <input style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:13, color:'#0a0a0a', marginBottom:10 }} type="text" value={form.variedad_texto} onChange={e => setForm(f => ({ ...f, variedad_texto:e.target.value }))} placeholder="Ej: Rojo, Lamuyo..."/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:4 }}>Fecha de siembra *</div>
            <input style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:13, color:'#0a0a0a', marginBottom:10 }} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({ ...f, fecha_siembra:e.target.value }))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:4 }}>Densidad (plantas/m²)</div>
            <input style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:13, color:'#0a0a0a', marginBottom:10 }} type="number" value={form.densidad_plantas_m2} onChange={e => setForm(f => ({ ...f, densidad_plantas_m2:e.target.value }))} placeholder="Ej: 2.5" step="0.1"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Abonos de base</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
              {abonosDisponibles.map(a => (
                <div key={a.id} onClick={() => toggleAbono(a.id)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', background: form.abonos_ids.includes(a.id) ? '#0a0a0a' : '#f2f1ef', color: form.abonos_ids.includes(a.id) ? '#fff' : '#555', border:'1px solid #e8e6e2' }}>
                  {a.nombre}
                </div>
              ))}
            </div>
            <button style={{ width:'100%', padding:12, borderRadius:12, background:'#0a0a0a', border:'none', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }} onClick={guardarPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar plantación'}
            </button>
          </div>
        )}

        <div style={{ background:'#fff', borderRadius:20, padding:18, marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a', marginBottom:12 }}>Agregar observación</div>
          <textarea style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:12, color:'#0a0a0a', marginBottom:10, minHeight:80, resize:'vertical' }} value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Escribí una observación..."/>
          <button style={{ width:'100%', padding:11, borderRadius:12, background: observacion.trim() ? '#0a0a0a' : '#e8e6e2', border:'none', fontSize:13, fontWeight:600, color: observacion.trim() ? '#fff' : '#b0b0b0', cursor:'pointer' }} onClick={guardarObservacion}>
            Guardar observación
          </button>
          {observaciones.length > 0 && (
            <div style={{ marginTop:12 }}>
              {observaciones.map(o => (
                <div key={o.id} style={{ background:'#f2f1ef', borderRadius:10, padding:'8px 12px', marginTop:6 }}>
                  <div style={{ fontSize:11, color:'#0a0a0a' }}>{o.texto}</div>
                  <div style={{ fontSize:9, color:'#b0b0b0', marginTop:3 }}>{new Date(o.created_at).toLocaleDateString('es-PY')}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setShowHistorial(!showHistorial)} style={{ width:'100%', padding:12, borderRadius:14, background:'#fff', border:'none', fontSize:13, fontWeight:600, color:'#0a0a0a', cursor:'pointer', marginBottom:8 }}>
          {showHistorial ? 'Ocultar historial' : 'Ver historial de plantaciones'}
        </button>

        {showHistorial && (
          <div>
            {historial.length === 0 ? (
              <div style={{ textAlign:'center', padding:16, color:'#9a9a9a', fontSize:12 }}>Sin plantaciones anteriores</div>
            ) : (
              historial.map(p => (
                <div key={p.id} style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:8 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a', marginBottom:10 }}>
                    {p.cultivos?.nombre || 'Sin cultivo'}{getVariedad(p) ? ' · ' + getVariedad(p) : ''}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:16, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:2 }}>Siembra</div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#555' }}>{p.fecha_siembra || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:2 }}>Densidad</div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#555' }}>{p.densidad_plantas_m2 ? p.densidad_plantas_m2 + ' pl/m²' : '—'}</div>
                    </div>
                  </div>
                  {p.plantacion_abonos && p.plantacion_abonos.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:4 }}>Abonos de base</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {p.plantacion_abonos.map(a => (
                          <span key={a.id} style={{ background:'#f2f1ef', borderRadius:8, padding:'2px 8px', fontSize:10, color:'#555' }}>{a.abonos?.nombre}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.notas && !p.notas.startsWith('Variedad:') && (
                    <div style={{ fontSize:11, color:'#9a9a9a', padding:'8px 10px', background:'#f2f1ef', borderRadius:8 }}>
                      {p.notas}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
