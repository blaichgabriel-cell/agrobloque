import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CICLO_DIAS = {
  'Morrón': 90, 'Tomate': 75, 'Pepino': 50, 'Berenjena': 80,
  'Zapalito': 55, 'Zucchini': 50, 'Lechuga': 45, 'Lechuga repollo': 50,
  'Tomate Cherry': 70,
}

const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24))
}

const getProgreso = (cultivo, fechaSiembra) => {
  const dias = diasDesde(fechaSiembra)
  if (dias === null) return null
  const ciclo = CICLO_DIAS[cultivo] || 75
  return { dias, ciclo, pct: Math.min(100, Math.round((dias / ciclo) * 100)) }
}

function ModalConfirm({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>¿Confirmar eliminación?</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>{mensaje}</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
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
  const [confirmar, setConfirmar] = useState(null)

  useEffect(() => { fetchData(); fetchCultivos(); fetchAbonos() }, [id])

  const fetchData = async () => {
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)
    const { data: plantas } = await supabase.from('plantaciones')
      .select('*, cultivos(nombre)').eq('bloque_id', id).order('created_at', { ascending: false })
    if (plantas) {
      setPlantacionActiva(plantas.find(p => p.activa) || null)
      setHistorial(plantas.filter(p => !p.activa))
    }
    const activa = plantas?.find(p => p.activa)
    if (activa) {
      const { data: ab } = await supabase.from('plantacion_abonos').select('*, abonos(nombre)').eq('plantacion_id', activa.id)
      setAbonosPlantacion(ab || [])
    } else {
      setAbonosPlantacion([])
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

  const toggleAbono = (abonoId) => {
    setForm(f => ({ ...f, abonos_ids: f.abonos_ids.includes(abonoId) ? f.abonos_ids.filter(x => x !== abonoId) : [...f.abonos_ids, abonoId] }))
  }

  const guardarPlantacion = async () => {
    if (!form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    if (plantacionActiva) {
      await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    }
    const { data: nueva } = await supabase.from('plantaciones').insert({
      bloque_id: id, cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra, densidad_plantas_m2: form.cantidad_plantas || null, activa: true
    }).select().single()
    if (nueva && form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(form.abonos_ids.map(ab => ({ plantacion_id: nueva.id, abono_id: ab })))
    }
    setShowNuevaPlantacion(false)
    setForm({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[] })
    setSaving(false)
    fetchData()
  }

  const guardarObservacion = async () => {
    if (!observacion.trim()) return
    await supabase.from('observaciones').insert({ bloque_id: id, plantacion_id: plantacionActiva?.id || null, texto: observacion })
    setObservacion('')
  }

  const getVariedad = (p) => {
    if (!p?.notas) return '—'
    return p.notas.startsWith('Variedad: ') ? p.notas.replace('Variedad: ', '') : '—'
  }

  const progreso = plantacionActiva ? getProgreso(plantacionActiva.cultivos?.nombre, plantacionActiva.fecha_siembra) : null

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:10, boxSizing:'border-box' }
  const lblStyle = { fontSize:10, color:'#9a9a9a', marginBottom:5, display:'block' }

  if (!bloque) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:13, color:'#9a9a9a' }}>Cargando...</div>
    </div>
  )

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      {/* Header */}
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <button onClick={() => navigate(-1)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#1E5631' }} aria-hidden="true"></i>
          <span style={{ fontSize:13, color:'#1E5631', fontWeight:500 }}>Volver</span>
        </button>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:2 }}>{bloque.campos?.nombre} · {bloque.sectores?.nombre || 'Sin sector'}</div>
            <div style={{ fontSize:26, fontWeight:800, color:'#0a0a0a', letterSpacing:-.5 }}>Bloque {bloque.codigo}</div>
          </div>
          <div style={{ padding:'4px 12px', borderRadius:20, background: bloque.activo ? '#edf7ed' : '#f2f1ef', fontSize:11, fontWeight:600, color: bloque.activo ? '#1E5631' : '#9a9a9a' }}>
            {bloque.activo ? 'Activo' : 'Inactivo'}
          </div>
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>

        {/* Cultivo actual */}
        <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:12, textTransform:'uppercase', letterSpacing:.05 }}>Cultivo actual</div>
          {[
            ['Cultivo', plantacionActiva?.cultivos?.nombre || '—'],
            ['Variedad', getVariedad(plantacionActiva)],
            ['Fecha de siembra', plantacionActiva?.fecha_siembra || '—'],
            ['Cantidad de plantas', plantacionActiva?.densidad_plantas_m2 ? `${Number(plantacionActiva.densidad_plantas_m2).toLocaleString()} plantas` : '—'],
            ['Tipo', bloque.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
              <div style={{ fontSize:12, color:'#9a9a9a' }}>{k}</div>
              <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{v}</div>
            </div>
          ))}

          {/* Abonos */}
          {abonosPlantacion.length > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
              <div style={{ fontSize:12, color:'#9a9a9a' }}>Abonos de base</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, justifyContent:'flex-end' }}>
                {abonosPlantacion.map(a => (
                  <span key={a.id} style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#f2f1ef', border:'0.5px solid #e0ddd8', color:'#555' }}>{a.abonos?.nombre}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Barra de progreso del ciclo */}
        {progreso && (
          <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#0a0a0a' }}>Progreso del ciclo</div>
              <div style={{ fontSize:12, color:'#9a9a9a' }}>{progreso.dias}d de {progreso.ciclo}d estimados</div>
            </div>
            <div style={{ background:'#f2f1ef', borderRadius:20, height:8, overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:20, background: progreso.pct >= 100 ? '#c84040' : progreso.pct >= 90 ? '#2d8a4e' : progreso.pct >= 70 ? '#f0c060' : '#1E5631', width:`${progreso.pct}%`, transition:'width .3s' }}></div>
            </div>
            <div style={{ fontSize:10, color: progreso.pct >= 100 ? '#c84040' : progreso.pct >= 90 ? '#2d8a4e' : '#9a9a9a', marginTop:6, textAlign:'right', fontWeight:600 }}>
              {progreso.pct >= 100 ? 'Cosecha atrasada' : progreso.pct >= 90 ? 'Listo para cosechar' : progreso.pct >= 70 ? 'Próximo a cosechar' : `${progreso.pct}% del ciclo`}
            </div>
          </div>
        )}

        {/* Nueva plantación */}
        <button onClick={() => setShowNuevaPlantacion(!showNuevaPlantacion)} style={{ width:'100%', padding:'13px 16px', borderRadius:16, border:'1px dashed #c8ddc8', background:'#edf7ed', fontSize:13, fontWeight:600, color:'#1E5631', cursor:'pointer', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <i className={`ti ${showNuevaPlantacion ? 'ti-x' : 'ti-plus'}`} style={{ fontSize:14 }} aria-hidden="true"></i>
          {showNuevaPlantacion ? 'Cancelar' : 'Nueva plantación'}
        </button>

        {showNuevaPlantacion && (
          <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a', marginBottom:14 }}>Nueva plantación</div>
            <label style={lblStyle}>Cultivo *</label>
            <select style={inpStyle} value={form.cultivo_id} onChange={e => setForm(f => ({ ...f, cultivo_id: e.target.value }))}>
              <option value="">Seleccioná cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <label style={lblStyle}>Variedad</label>
            <input style={inpStyle} type="text" value={form.variedad_texto} onChange={e => setForm(f => ({ ...f, variedad_texto: e.target.value }))} placeholder="Ej: Rojo, Lamuyo, Holandés..." />
            <label style={lblStyle}>Fecha de siembra *</label>
            <input style={inpStyle} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({ ...f, fecha_siembra: e.target.value }))} />
            <label style={lblStyle}>Cantidad total de plantas</label>
            <input style={inpStyle} type="number" value={form.cantidad_plantas} onChange={e => setForm(f => ({ ...f, cantidad_plantas: e.target.value }))} placeholder="Ej: 1000" />
            <label style={lblStyle}>Abonos de base</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
              {abonos.length > 0 ? abonos.map(a => (
                <div key={a.id} onClick={() => toggleAbono(a.id)} style={{ padding:'6px 14px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', background: form.abonos_ids.includes(a.id) ? '#1E5631' : '#f2f1ef', color: form.abonos_ids.includes(a.id) ? '#fff' : '#555', border:'1px solid #e8e6e2' }}>
                  {a.nombre}
                </div>
              )) : <div style={{ fontSize:11, color:'#aaa' }}>Sin abonos cargados</div>}
            </div>
            <button style={{ width:'100%', padding:13, borderRadius:12, background: saving ? '#8aaa94' : '#1E5631', border:'none', fontSize:14, fontWeight:600, color:'#fff', cursor:'pointer' }} onClick={guardarPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar plantación'}
            </button>
          </div>
        )}

        {/* Observación */}
        <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a', marginBottom:10 }}>Agregar observación</div>
          <textarea style={{ ...inpStyle, minHeight:70, resize:'vertical', marginBottom:10 }} value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Escribí una observación sobre este bloque..." />
          <button style={{ width:'100%', padding:12, borderRadius:12, background: observacion.trim() ? '#1E5631' : '#e8e6e2', border:'none', fontSize:13, fontWeight:600, color: observacion.trim() ? '#fff' : '#aaa', cursor:'pointer' }} onClick={guardarObservacion}>
            Guardar observación
          </button>
        </div>

        {/* Historial */}
        <button onClick={() => setShowHistorial(!showHistorial)} style={{ width:'100%', padding:'13px 16px', borderRadius:16, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, fontWeight:500, color:'#0a0a0a', cursor:'pointer', marginBottom: showHistorial ? 8 : 0, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <i className={`ti ${showHistorial ? 'ti-chevron-up' : 'ti-history'}`} style={{ fontSize:14 }} aria-hidden="true"></i>
          {showHistorial ? 'Ocultar historial' : `Ver historial (${historial.length} plantaciones)`}
        </button>
        {showHistorial && (
          <div style={{ background:'#fff', borderRadius:20, padding:'12px 16px', marginBottom:10 }}>
            {historial.length === 0
              ? <div style={{ color:'#9a9a9a', fontSize:12, textAlign:'center', padding:8 }}>Sin plantaciones anteriores</div>
              : historial.map(p => (
                <div key={p.id} style={{ padding:'10px 0', borderBottom:'1px solid #f2f1ef' }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>{p.cultivos?.nombre}{getVariedad(p) !== '—' ? ` · ${getVariedad(p)}` : ''}</div>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>Siembra: {p.fecha_siembra || '—'}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
