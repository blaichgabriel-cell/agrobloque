import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / 86400000)
}
const fmtGs = (n) => Math.round(Number(n)||0).toLocaleString('es-PY')
const fmtKg = (n) => { const num=Number(n)||0; return num%1===0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY',{minimumFractionDigits:1,maximumFractionDigits:2}) }

const CAUSAS_MUERTE = ['Enfermedad','Dumping off','Esclerotinia','Insectos','Hormigas','Gusanos','Clima','Riego','Otra']

function ModalConfirm({ titulo, mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>{titulo}</div>
        {mensaje && <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>{mensaje}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

export default function FichaBloque() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [bloque, setBloque] = useState(null)
  const [plantacionActiva, setPlantacionActiva] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cosechasCiclo, setCosechasCiclo] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const [fotos, setFotos] = useState([])
  const [muertes, setMuertes] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [abonos, setAbonos] = useState([])
  const [abonosPlantacion, setAbonosPlantacion] = useState([])

  const [seccion, setSeccion] = useState('plantacion') // plantacion | cosechas | incidencias | fotos | historial
  const [historialDetalle, setHistorialDetalle] = useState(null)

  const [showEditarPlantacion, setShowEditarPlantacion] = useState(false)
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [showMuerte, setShowMuerte] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  const [form, setForm] = useState({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
  const [formMuerte, setFormMuerte] = useState({ cantidad:'', causa:'Enfermedad', descripcion:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)

    const { data: plantas } = await supabase.from('plantaciones')
      .select('*, cultivos(nombre)').eq('bloque_id', id).order('created_at', { ascending: false })
    if (plantas) {
      const activa = plantas.find(p => p.activa) || null
      setPlantacionActiva(activa)
      setHistorial(plantas.filter(p => !p.activa))

      if (activa) {
        const { data: ab } = await supabase.from('plantacion_abonos').select('*, abonos(nombre)').eq('plantacion_id', activa.id)
        setAbonosPlantacion(ab || [])

        // Cosechas de este ciclo
        const { data: cos } = await supabase.from('cosechas')
          .select('*, compradores(nombre)')
          .eq('bloque_id', id)
          .gte('fecha', activa.fecha_siembra || '2000-01-01')
          .order('fecha', { ascending: false })
        setCosechasCiclo(cos || [])

        // Incidencias desde fumigaciones
        const { data: fumBloques } = await supabase.from('fumigacion_bloques')
          .select('fumigaciones(fecha, notas, tipo, fumigacion_productos(productos(nombre)))')
          .eq('bloque_id', id)
        const inc = (fumBloques || [])
          .map(fb => fb.fumigaciones)
          .filter(f => f && f.notas)
          .sort((a, b) => b.fecha.localeCompare(a.fecha))
        setIncidencias(inc)

        // Fotos
        const { data: fts } = await supabase.from('fotos_bloque')
          .select('*').eq('bloque_id', id).eq('plantacion_id', activa.id)
          .order('created_at', { ascending: false })
        setFotos(fts || [])

        // Muertes
        const { data: mts } = await supabase.from('muertes_plantas')
          .select('*').eq('bloque_id', id).eq('plantacion_id', activa.id)
          .order('fecha', { ascending: false })
        setMuertes(mts || [])
      }
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

  const abrirNuevaPlantacion = () => {
    fetchCultivos(); fetchAbonos()
    setForm({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
    setShowNuevaPlantacion(true)
  }

  const abrirEditarPlantacion = () => {
    fetchCultivos(); fetchAbonos()
    const cultivo = cultivos.find(c => c.nombre === plantacionActiva?.cultivos?.nombre)
    const abIds = abonosPlantacion.map(a => a.abono_id)
    const abCants = {}
    abonosPlantacion.forEach(a => { abCants[a.abono_id] = a.cantidad || '' })
    setForm({
      cultivo_id: cultivo?.id || '',
      variedad_texto: plantacionActiva?.notas?.replace('Variedad: ','') || '',
      fecha_siembra: plantacionActiva?.fecha_siembra || '',
      cantidad_plantas: plantacionActiva?.densidad_plantas_m2 || '',
      abonos_ids: abIds,
      abonos_cantidades: abCants
    })
    setShowEditarPlantacion(true)
  }

  const toggleAbono = (abonoId) => {
    setForm(f => ({
      ...f,
      abonos_ids: f.abonos_ids.includes(abonoId) ? f.abonos_ids.filter(x => x!==abonoId) : [...f.abonos_ids, abonoId]
    }))
  }

  const guardarNuevaPlantacion = async () => {
    if (!form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    if (plantacionActiva) await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    const { data: nueva } = await supabase.from('plantaciones').insert({
      bloque_id: id, cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.cantidad_plantas || null, activa: true
    }).select().single()
    if (nueva && form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({
          plantacion_id: nueva.id, abono_id: ab,
          cantidad: form.abonos_cantidades[ab] || null
        }))
      )
    }
    setSaving(false); setShowNuevaPlantacion(false)
    fetchData()
  }

  const guardarEditarPlantacion = async () => {
    if (!plantacionActiva || !form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    await supabase.from('plantaciones').update({
      cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.cantidad_plantas || null
    }).eq('id', plantacionActiva.id)
    await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
    if (form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({
          plantacion_id: plantacionActiva.id, abono_id: ab,
          cantidad: form.abonos_cantidades[ab] || null
        }))
      )
    }
    setSaving(false); setShowEditarPlantacion(false)
    fetchData()
  }

  const eliminarHistorial = (plantacionId) => {
    setConfirmar({ titulo:'¿Eliminar ciclo?', mensaje:'Se eliminará este ciclo del historial. No se puede deshacer.', fn: async () => {
      await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionId)
      await supabase.from('plantaciones').delete().eq('id', plantacionId)
      setConfirmar(null); setHistorialDetalle(null); fetchData()
    }})
  }

  const guardarMuerte = async () => {
    if (!formMuerte.cantidad) return
    setSaving(true)
    await supabase.from('muertes_plantas').insert({
      bloque_id: id, plantacion_id: plantacionActiva?.id,
      cantidad: Number(formMuerte.cantidad),
      causa: formMuerte.causa,
      descripcion: formMuerte.descripcion || null,
      fecha: new Date().toISOString().split('T')[0]
    })
    setSaving(false); setShowMuerte(false)
    setFormMuerte({ cantidad:'', causa:'Enfermedad', descripcion:'' })
    fetchData()
  }

  const subirFoto = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      await supabase.from('fotos_bloque').insert({
        bloque_id: id, plantacion_id: plantacionActiva?.id,
        url: ev.target.result,
        fecha: new Date().toISOString().split('T')[0]
      })
      fetchData()
    }
    reader.readAsDataURL(file)
  }

  const eliminarFoto = async (fotoId) => {
    await supabase.from('fotos_bloque').delete().eq('id', fotoId)
    fetchData()
  }

  const getVariedad = (p) => {
    if (!p?.notas) return null
    return p.notas.startsWith('Variedad: ') ? p.notas.replace('Variedad: ', '') : null
  }

  const totalKgCiclo = cosechasCiclo.reduce((s, c) => s + Number(c.kg_total), 0)
  const totalIngresosCiclo = cosechasCiclo.reduce((s, c) => s + (Number(c.kg_total) * Number(c.precio_kg||0)), 0)
  const kgPorPlanta = plantacionActiva?.densidad_plantas_m2 && totalKgCiclo > 0
    ? (totalKgCiclo / Number(plantacionActiva.densidad_plantas_m2)).toFixed(2)
    : null
  const totalMuertes = muertes.reduce((s, m) => s + Number(m.cantidad), 0)

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:10, boxSizing:'border-box' }

  if (!bloque) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:13, color:'#9a9a9a' }}>Cargando...</div>
    </div>
  )

  // Vista detalle de ciclo histórico
  if (historialDetalle) {
    const kgTotal = 0 // podría cargarse si se quiere
    return (
      <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
        {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
        <div style={{ padding:'24px 20px 16px' }}>
          <button onClick={() => setHistorialDetalle(null)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
            <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
            <span style={{ fontSize:13, color:'#212121', fontWeight:500 }}>Historial</span>
          </button>
          <div style={{ fontSize:22, fontWeight:700, color:'#0a0a0a', marginBottom:4 }}>
            {historialDetalle.cultivos?.nombre}{getVariedad(historialDetalle) ? ` · ${getVariedad(historialDetalle)}` : ''}
          </div>
          <div style={{ fontSize:12, color:'#9a9a9a' }}>Bloque {bloque.codigo} · {historialDetalle.fecha_siembra || 'Sin fecha'}</div>
        </div>
        <div style={{ padding:'0 14px 100px' }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Datos del ciclo</div>
            {[
              ['Cultivo', historialDetalle.cultivos?.nombre || '—'],
              ['Variedad', getVariedad(historialDetalle) || '—'],
              ['Fecha siembra', historialDetalle.fecha_siembra || '—'],
              ['Plantas', historialDetalle.densidad_plantas_m2 ? `${Number(historialDetalle.densidad_plantas_m2).toLocaleString('es-PY')}` : '—'],
            ].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                <div style={{ fontSize:12, color:'#9a9a9a' }}>{k}</div>
                <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={() => eliminarHistorial(historialDetalle.id)}
            style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:13, color:'#c84040', cursor:'pointer' }}>
            Eliminar este ciclo del historial
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      <input type="file" accept="image/*" ref={fileRef} style={{ display:'none' }} onChange={subirFoto} />

      {/* Header */}
      <div style={{ padding:'24px 20px 0' }}>
        <button onClick={() => navigate(-1)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
          <span style={{ fontSize:13, color:'#212121', fontWeight:500 }}>Volver</span>
        </button>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:2 }}>{bloque.campos?.nombre}</div>
            <div style={{ fontSize:26, fontWeight:800, color:'#0a0a0a', letterSpacing:-.5 }}>Bloque {bloque.codigo}</div>
            {plantacionActiva && (
              <div style={{ fontSize:13, color:'#555', marginTop:2 }}>
                {plantacionActiva.cultivos?.nombre}{getVariedad(plantacionActiva) ? ` · ${getVariedad(plantacionActiva)}` : ''}
              </div>
            )}
          </div>
          {!plantacionActiva && (
            <button onClick={abrirNuevaPlantacion} style={{ padding:'8px 14px', borderRadius:12, background:'#212121', border:'none', fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer' }}>
              + Nueva plantación
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:4 }}>
          {[
            ['plantacion','Plantación'],
            ['cosechas',`Cosechas (${cosechasCiclo.length})`],
            ['incidencias',`Incidencias (${incidencias.length})`],
            ['fotos',`Fotos (${fotos.length})`],
            ['historial',`Historial (${historial.length})`],
          ].map(([k,v]) => (
            <button key={k} onClick={() => setSeccion(k)}
              style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: seccion===k ? '#212121' : '#e8e6e2', color: seccion===k ? '#fff' : '#9a9a9a' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 14px 100px' }}>

        {/* PLANTACIÓN ACTUAL */}
        {seccion === 'plantacion' && (
          <>
            {plantacionActiva ? (
              <>
                <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>Datos de la plantación</div>
                    <button onClick={abrirEditarPlantacion} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }}>Editar</button>
                  </div>
                  {[
                    ['Cultivo', plantacionActiva.cultivos?.nombre || '—'],
                    ['Variedad', getVariedad(plantacionActiva) || '—'],
                    ['Fecha siembra', plantacionActiva.fecha_siembra || '—'],
                    ['Días en campo', diasDesde(plantacionActiva.fecha_siembra) !== null ? `${diasDesde(plantacionActiva.fecha_siembra)} días` : '—'],
                    ['Cantidad de plantas', plantacionActiva.densidad_plantas_m2 ? `${Number(plantacionActiva.densidad_plantas_m2).toLocaleString('es-PY')} plantas` : '—'],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a' }}>{k}</div>
                      <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{v}</div>
                    </div>
                  ))}
                  {abonosPlantacion.length > 0 && (
                    <div style={{ padding:'8px 0' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:6 }}>Abonos de base</div>
                      {abonosPlantacion.map(a => (
                        <div key={a.id} style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:12, color:'#0a0a0a' }}>{a.abonos?.nombre}</span>
                          <span style={{ fontSize:12, color:'#9a9a9a' }}>{a.cantidad || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stats del ciclo */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  <div style={{ background:'#212121', borderRadius:16, padding:'14px' }}>
                    <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>KG COSECHADOS</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>{fmtKg(totalKgCiclo)}</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:2 }}>este ciclo</div>
                  </div>
                  <div style={{ background:'#fff', borderRadius:16, padding:'14px' }}>
                    <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:4 }}>KG POR PLANTA</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#212121' }}>{kgPorPlanta || '—'}</div>
                    <div style={{ fontSize:10, color:'#9a9a9a', marginTop:2 }}>kg/planta</div>
                  </div>
                  {totalMuertes > 0 && (
                    <div style={{ background:'#fff0f0', borderRadius:16, padding:'14px', gridColumn:'1 / -1' }}>
                      <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:4 }}>PLANTAS MUERTAS</div>
                      <div style={{ fontSize:22, fontWeight:800, color:'#c84040' }}>{totalMuertes.toLocaleString('es-PY')}</div>
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', gap:8' }}>
                  <button onClick={abrirNuevaPlantacion}
                    style={{ flex:1, padding:'12px', borderRadius:14, border:'1px dashed #888', background:'transparent', fontSize:12, fontWeight:600, color:'#555', cursor:'pointer' }}>
                    Nueva plantación
                  </button>
                  <button onClick={() => setShowMuerte(true)}
                    style={{ flex:1, padding:'12px', borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:12, fontWeight:600, color:'#c84040', cursor:'pointer' }}>
                    + Muerte de plantas
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'#9a9a9a', fontSize:13, background:'#fff', borderRadius:20 }}>
                Sin plantación activa.<br/>
                <button onClick={abrirNuevaPlantacion} style={{ marginTop:12, padding:'10px 20px', borderRadius:12, background:'#212121', border:'none', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>
                  + Nueva plantación
                </button>
              </div>
            )}
          </>
        )}

        {/* COSECHAS */}
        {seccion === 'cosechas' && (
          <>
            {cosechasCiclo.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin cosechas registradas en este ciclo</div>
            ) : (
              <>
                <div style={{ background:'#212121', borderRadius:20, padding:'16px', marginBottom:10 }}>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>TOTAL DEL CICLO</div>
                  <div style={{ fontSize:32, fontWeight:800, color:'#fff' }}>{fmtKg(totalKgCiclo)} kg</div>
                  {totalIngresosCiclo > 0 && <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>Gs. {fmtGs(totalIngresosCiclo)} en ingresos</div>}
                  {kgPorPlanta && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{kgPorPlanta} kg por planta</div>}
                </div>
                {cosechasCiclo.map(c => (
                  <div key={c.id} style={{ background:'#fff', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a' }}>{c.fecha}</div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#0a0a0a' }}>{fmtKg(c.kg_total)} kg</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <div style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#eeeeee', color:'#555' }}>
                        {c.calidad === 'primera' ? '1ra' : c.calidad === 'segunda' ? '2da' : 'Mixta'}
                      </div>
                      {c.precio_kg > 0 && <div style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#eeeeee', color:'#555' }}>Gs. {fmtGs(c.precio_kg)}/kg</div>}
                      {c.compradores?.nombre && <div style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#e6f1fb', color:'#185fa5' }}>{c.compradores.nombre}</div>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* INCIDENCIAS */}
        {seccion === 'incidencias' && (
          <>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:12 }}>Notas de fumigaciones registradas en este bloque</div>
            {incidencias.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin incidencias registradas</div>
            ) : incidencias.map((inc, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:6, background: inc.tipo==='fumigacion' ? '#fff3e8' : '#eaf4fb', color: inc.tipo==='fumigacion' ? '#e07b00' : '#2980b9' }}>
                    {inc.tipo === 'fumigacion' ? 'Fumigación' : inc.tipo === 'fertiriego' ? 'Fertiriego' : 'Foliar'}
                  </div>
                  <div style={{ fontSize:11, color:'#9a9a9a' }}>{inc.fecha}</div>
                </div>
                <div style={{ fontSize:13, color:'#0a0a0a', marginBottom:4 }}>{inc.notas}</div>
                {inc.fumigacion_productos?.length > 0 && (
                  <div style={{ fontSize:11, color:'#9a9a9a' }}>
                    {inc.fumigacion_productos.map(fp => fp.productos?.nombre).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            ))}

            {muertes.length > 0 && (
              <>
                <div style={{ fontSize:12, fontWeight:600, color:'#9a9a9a', margin:'16px 0 8px', textTransform:'uppercase' }}>Muerte de plantas</div>
                {muertes.map(m => (
                  <div key={m.id} style={{ background:'#fff0f0', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#c84040' }}>{m.cantidad} plantas · {m.causa}</div>
                      <div style={{ fontSize:11, color:'#9a9a9a' }}>{m.fecha}</div>
                    </div>
                    {m.descripcion && <div style={{ fontSize:12, color:'#9a9a9a' }}>{m.descripcion}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* FOTOS */}
        {seccion === 'fotos' && (
          <>
            <button onClick={() => fileRef.current?.click()}
              style={{ width:'100%', padding:13, borderRadius:14, border:'1px dashed #888', background:'transparent', fontSize:13, fontWeight:600, color:'#555', cursor:'pointer', marginBottom:12 }}>
              <i className="ti ti-camera" style={{ fontSize:16, marginRight:6 }} aria-hidden="true"></i>
              Agregar foto
            </button>
            {fotos.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin fotos en este ciclo</div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {fotos.map(f => (
                  <div key={f.id} style={{ borderRadius:16, overflow:'hidden', position:'relative', background:'#e8e6e2' }}>
                    <img src={f.url} alt="foto bloque" style={{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' }}/>
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.5)', padding:'6px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:10, color:'#fff' }}>{f.fecha}</span>
                      <button onClick={() => eliminarFoto(f.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
                        <i className="ti ti-trash" style={{ fontSize:14, color:'#fff' }} aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* HISTORIAL */}
        {seccion === 'historial' && (
          <>
            {historial.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin ciclos anteriores</div>
            ) : historial.map(p => (
              <div key={p.id} onClick={() => setHistorialDetalle(p)}
                style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#0a0a0a' }}>
                    {p.cultivos?.nombre}{getVariedad(p) ? ` · ${getVariedad(p)}` : ''}
                  </div>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>
                    Siembra: {p.fecha_siembra || '—'}
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modal nueva/editar plantación */}
      {(showNuevaPlantacion || showEditarPlantacion) && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && (setShowNuevaPlantacion(false)||setShowEditarPlantacion(false))}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{showEditarPlantacion ? 'Editar plantación' : 'Nueva plantación'}</div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cultivo *</div>
            <select style={inpStyle} value={form.cultivo_id} onChange={e => setForm(f => ({...f, cultivo_id:e.target.value}))}>
              <option value="">Seleccioná cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Variedad</div>
            <input style={inpStyle} type="text" value={form.variedad_texto} onChange={e => setForm(f => ({...f, variedad_texto:e.target.value}))} placeholder="Ej: Rojo, Lamuyo..."/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha de siembra *</div>
            <input style={inpStyle} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({...f, fecha_siembra:e.target.value}))}/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cantidad de plantas</div>
            <input style={inpStyle} type="number" value={form.cantidad_plantas} onChange={e => setForm(f => ({...f, cantidad_plantas:e.target.value}))} placeholder="Ej: 1000"/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:8 }}>Abonos de base</div>
            {abonos.map(a => (
              <div key={a.id} style={{ marginBottom:8 }}>
                <div onClick={() => toggleAbono(a.id)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:12, background: form.abonos_ids.includes(a.id) ? '#212121' : '#fff', cursor:'pointer', marginBottom: form.abonos_ids.includes(a.id) ? 6 : 0 }}>
                  <div style={{ width:18, height:18, borderRadius:5, border: form.abonos_ids.includes(a.id) ? 'none' : '1.5px solid #d0d0d0', background: form.abonos_ids.includes(a.id) ? '#fff' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {form.abonos_ids.includes(a.id) && <i className="ti ti-check" style={{ fontSize:12, color:'#212121' }} aria-hidden="true"></i>}
                  </div>
                  <span style={{ fontSize:13, color: form.abonos_ids.includes(a.id) ? '#fff' : '#0a0a0a' }}>{a.nombre}</span>
                </div>
                {form.abonos_ids.includes(a.id) && (
                  <div style={{ display:'flex', gap:6, paddingLeft:4 }}>
                    <input style={{ flex:2, padding:'8px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }}
                      type="text" placeholder="Cantidad (ej: 50)"
                      value={form.abonos_cantidades[a.id] || ''}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id]:e.target.value}}))}/>
                    <select style={{ flex:1, padding:'8px 6px', borderRadius:10, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }}
                      value={(form.abonos_cantidades[a.id+'_unidad']) || 'kg'}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id+'_unidad']:e.target.value}}))}>
                      <option value="kg">kg</option>
                      <option value="gramos">gramos</option>
                    </select>
                  </div>
                )}
              </div>
            ))}

            <button style={{ width:'100%', padding:14, borderRadius:14, background: saving ? '#888' : '#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', marginTop:12 }}
              onClick={showEditarPlantacion ? guardarEditarPlantacion : guardarNuevaPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : showEditarPlantacion ? 'Guardar cambios' : 'Guardar plantación'}
            </button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }}
              onClick={() => { setShowNuevaPlantacion(false); setShowEditarPlantacion(false) }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal muerte de plantas */}
      {showMuerte && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setShowMuerte(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Registrar muerte de plantas</div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cantidad de plantas *</div>
            <input style={inpStyle} type="number" value={formMuerte.cantidad} onChange={e => setFormMuerte(f => ({...f, cantidad:e.target.value}))} placeholder="Ej: 5"/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Causa</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
              {CAUSAS_MUERTE.map(c => (
                <button key={c} onClick={() => setFormMuerte(f => ({...f, causa:c}))}
                  style={{ padding:'7px 14px', borderRadius:20, border:'1px solid #e8e6e2', fontSize:11, fontWeight:500, cursor:'pointer', background: formMuerte.causa===c ? '#c84040' : '#fff', color: formMuerte.causa===c ? '#fff' : '#555' }}>
                  {c}
                </button>
              ))}
            </div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripción (opcional)</div>
            <textarea style={{ ...inpStyle, minHeight:60, resize:'vertical' }} value={formMuerte.descripcion} onChange={e => setFormMuerte(f => ({...f, descripcion:e.target.value}))} placeholder="Detalles adicionales..."/>

            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#c84040', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardarMuerte} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setShowMuerte(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
