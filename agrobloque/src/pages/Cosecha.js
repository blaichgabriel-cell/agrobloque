import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const parsearKg = (v) => { const n = parseFloat(String(v || '').replace(',','.')); return isNaN(n) ? 0 : n }
const fmtKg = (n) => { const num = Number(n)||0; return num % 1 === 0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY', {minimumFractionDigits:1, maximumFractionDigits:2}) }
const fechaLocal = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>¿Eliminar registro?</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>Esta acción no se puede deshacer.</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

const fechaPlantacion = (p) => p?.fecha_siembra || (p?.created_at || '').slice(0, 10)

const elegirPlantacionParaCosecha = (plantaciones = [], fechaCosecha = '') => {
  const lista = Array.isArray(plantaciones) ? plantaciones : []
  if (lista.length === 0) return null

  const anteriores = fechaCosecha
    ? lista.filter(p => {
      const fecha = fechaPlantacion(p)
      return fecha && fecha <= fechaCosecha
    })
    : []

  const candidatas = anteriores.length > 0
    ? anteriores
    : lista.filter(p => p.activa) || lista

  return [...(candidatas.length > 0 ? candidatas : lista)]
    .sort((a, b) => fechaPlantacion(b).localeCompare(fechaPlantacion(a)))[0]
}

const getCultivoCosecha = (cosecha) => {
  const plantacion = elegirPlantacionParaCosecha(cosecha?.bloques?.plantaciones, cosecha?.fecha)
  return plantacion?.cultivos?.nombre || 'Sin cultivo'
}

const getCultivoBloque = (bloque, fecha) => {
  const plantacion = elegirPlantacionParaCosecha(bloque?.plantaciones, fecha)
  return plantacion?.cultivos?.nombre || ''
}

const calidadLabel = (calidad) => calidad === 'primera'
  ? '1ra calidad'
  : calidad === 'segunda'
    ? '2da calidad'
    : 'Mixta'

function ModalDetalle({ cosecha, onClose, onEdit, onDelete }) {
  const cultivo = getCultivoCosecha(cosecha)
  const item = { display:'flex', justifyContent:'space-between', gap:16, padding:'11px 0', borderBottom:'1px solid #eeeeee' }
  const label = { fontSize:12, color:'#8d938d' }
  const value = { fontSize:13, fontWeight:700, color:'#111' }

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:150, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:480, padding:'22px 20px 34px', maxHeight:'88vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:12, color:'#8d938d', marginBottom:4 }}>Detalle de cosecha</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#0a0a0a' }}>{cultivo}</div>
            <div style={{ fontSize:12, color:'#8d938d', marginTop:4 }}>Bloque {cosecha.bloques?.codigo} · {cosecha.fecha}</div>
          </div>
          <button onClick={onClose} style={{ width:36, height:36, borderRadius:12, border:'1px solid #ececec', background:'#fff', cursor:'pointer' }}>
            <i className="ti ti-x" style={{ fontSize:18 }} aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
          <div style={{ background:'#212121', borderRadius:16, padding:'14px 15px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', marginBottom:4 }}>Kilos</div>
            <div style={{ fontSize:24, color:'#fff', fontWeight:850 }}>{fmtKg(cosecha.kg_total)} kg</div>
          </div>
          <div style={{ background:'#f2f1ef', borderRadius:16, padding:'14px 15px' }}>
            <div style={{ fontSize:10, color:'#8d938d', marginBottom:4 }}>Calidad</div>
            <div style={{ fontSize:18, color:'#212121', fontWeight:850 }}>{calidadLabel(cosecha.calidad)}</div>
          </div>
        </div>

        <div style={{ background:'#fafafa', borderRadius:16, padding:'4px 14px', marginBottom:14 }}>
          <div style={item}><span style={label}>Producto/cultivo</span><span style={value}>{cultivo}</span></div>
          <div style={item}><span style={label}>Campo</span><span style={value}>{cosecha.bloques?.campos?.nombre || '-'}</span></div>
          <div style={item}><span style={label}>Bloque</span><span style={value}>{cosecha.bloques?.codigo || '-'}</span></div>
          <div style={item}><span style={label}>Calidad</span><span style={value}>{calidadLabel(cosecha.calidad)}</span></div>
          <div style={{ ...item, borderBottom:'none' }}><span style={label}>Uso</span><span style={value}>Produccion del bloque</span></div>
        </div>

        {cosecha.notas && (
          <div style={{ background:'#f2f1ef', borderRadius:14, padding:'12px 14px', fontSize:13, color:'#4d544e', marginBottom:14 }}>
            {cosecha.notas}
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={onEdit} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #d9ddd8', background:'#fff', color:'#212121', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Editar cosecha
          </button>
          <button onClick={onDelete} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'#fff0f0', color:'#c84040', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Cosecha() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [cosechas, setCosechas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [modal, setModal] = useState(false)
  const [modoMultiple, setModoMultiple] = useState(false)
  const [filasCosecha, setFilasCosecha] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ bloque_id:'', fecha:fechaLocal(), kg_total:'', precio_kg:'', calidad:'primera', comprador_id:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [campoFiltro, setCampoFiltro] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchCampos(); fetchCosechas() }, [])
  useEffect(() => { if (campoFiltro) fetchBloques(campoFiltro) }, [campoFiltro])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setCampoFiltro(data[0].id)
  }
  const fetchCosechas = async () => {
    const { data, error } = await supabase.from('cosechas')
      .select('*, bloques(codigo, campos(nombre), plantaciones(cultivos(nombre), activa, created_at, fecha_siembra))')
      .order('fecha', { ascending: false })
    if (error) setError('Error al cargar cosechas')
    else setCosechas(data || [])
  }
  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques')
      .select('*, plantaciones(cultivos(nombre), activa, created_at, fecha_siembra)')
      .eq('campo_id', campo_id)
      .order('codigo')
    setBloques(data || [])
  }
  const crearFilaCosecha = () => ({ bloque_id:'', kg_total:'', calidad:'primera', notas:'' })
  const limpiarForm = () => {
    setForm({ bloque_id:'', fecha:fechaLocal(), kg_total:'', precio_kg:'', calidad:'primera', comprador_id:'', notas:'' })
    setFilasCosecha([crearFilaCosecha(), crearFilaCosecha()])
  }

  const abrirNuevaCosecha = () => {
    limpiarForm()
    setModoMultiple(false)
    setModal(true)
  }

  const abrirEditarCosecha = (cosecha) => {
    const campoId = campos.find(c => c.nombre === cosecha.bloques?.campos?.nombre)?.id || campoFiltro || ''
    if (campoId) setCampoFiltro(campoId)
    setForm({
      id: cosecha.id,
      bloque_id: cosecha.bloque_id || '',
      fecha: cosecha.fecha || '',
      kg_total: cosecha.kg_total || '',
      precio_kg: cosecha.precio_kg ? Number(cosecha.precio_kg).toLocaleString('es-PY') : '',
      calidad: cosecha.calidad || 'primera',
      comprador_id: cosecha.comprador_id || '',
      notas: cosecha.notas || ''
    })
    setDetalle(null)
    setModoMultiple(false)
    setModal(true)
  }

  const actualizarFilaCosecha = (idx, campo, valor) => {
    setFilasCosecha(prev => prev.map((fila, i) => i === idx ? { ...fila, [campo]: valor } : fila))
  }

  const agregarFilaCosecha = () => setFilasCosecha(prev => [...prev, crearFilaCosecha()])
  const quitarFilaCosecha = (idx) => setFilasCosecha(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const guardarMultiple = async () => {
    const filasValidas = filasCosecha
      .map(fila => ({
        bloque_id: fila.bloque_id,
        fecha: form.fecha,
        kg_total: parsearKg(fila.kg_total),
        precio_kg: 0,
        calidad: fila.calidad || 'primera',
        comprador_id: null,
        notas: fila.notas || form.notas || null,
      }))
      .filter(fila => fila.bloque_id && fila.fecha && fila.kg_total > 0)

    if (!form.fecha || filasValidas.length === 0) {
      setError('Cargá fecha y al menos una cosecha con bloque y kilos.')
      return
    }

    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('cosechas').insert(filasValidas)
      if (error) throw error
      await registrarAuditoria({
        accion: 'Registro lote de cosechas',
        modulo: 'Cosecha',
        tabla: 'cosechas',
        registroId: '',
        detalle: `${filasValidas.length} cosechas - ${filasValidas.reduce((s, f) => s + f.kg_total, 0)} kg`,
      })
      await fetchCosechas()
      setModal(false)
      setModoMultiple(false)
      limpiarForm()
    } catch (e) {
      setError('Error al guardar lote: ' + e.message)
    }
    setSaving(false)
  }

  const guardar = async () => {
    if (modoMultiple && !form.id) {
      await guardarMultiple()
      return
    }
    if (!form.bloque_id || !form.fecha || !form.kg_total) return
    setSaving(true); setError('')
    try {
      const payload = {
        bloque_id: form.bloque_id, fecha: form.fecha,
        kg_total: parsearKg(form.kg_total),
        precio_kg: form.id ? parsearGs(form.precio_kg) : 0,
        calidad: form.calidad,
        comprador_id: form.id ? (form.comprador_id || null) : null,
        notas: form.notas || null
      }

      const { error } = form.id
        ? await supabase.from('cosechas').update(payload).eq('id', form.id)
        : await supabase.from('cosechas').insert(payload)
      if (error) throw error
      await registrarAuditoria({
        accion: form.id ? 'Edito cosecha' : 'Registro cosecha',
        modulo: 'Cosecha',
        tabla: 'cosechas',
        registroId: form.id || '',
        detalle: `${payload.kg_total} kg cosechados`,
      })
      await fetchCosechas(); setModal(false)
      limpiarForm()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    }
    setSaving(false)
  }

  const eliminar = (id) => {
    setConfirmar({ fn: async () => {
      await supabase.from('cosechas').delete().eq('id', id)
      await registrarAuditoria({ accion:'Elimino cosecha', modulo:'Cosecha', tabla:'cosechas', registroId:id })
      setConfirmar(null); setDetalle(null); fetchCosechas()
    }})
  }

  const totalKg = cosechas.reduce((sum, c) => sum + (Number(c.kg_total) || 0), 0)
  const promedioKg = cosechas.length > 0 ? totalKg / cosechas.length : 0
  const bloqueSeleccionado = bloques.find(b => b.id === form.bloque_id)
  const cultivoSeleccionado = getCultivoBloque(bloqueSeleccionado, form.fecha)
  const totalKgMultiple = filasCosecha.reduce((sum, fila) => sum + parsearKg(fila.kg_total), 0)

  const inp = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      {detalle && <ModalDetalle cosecha={detalle} onClose={() => setDetalle(null)} onEdit={() => abrirEditarCosecha(detalle)} onDelete={() => eliminar(detalle.id)} />}

      <div style={{ background:'#f2f1ef', padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Producción</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Cosecha</div>
          </div>
          <button onClick={abrirNuevaCosecha} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: isDesktop ? 14 : 8 }}>
          <div style={{ background:'#212121', borderRadius:16, padding:'14px 16px' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', marginBottom:4 }}>Total cosechado</div>
            <div style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:-1, lineHeight:1 }}>{fmtKg(totalKg)}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:3 }}>kg · {cosechas.length} registros</div>
          </div>
          <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px' }}>
            <div style={{ fontSize:9, color:'#9a9a9a', textTransform:'uppercase', marginBottom:4 }}>Promedio por registro</div>
            <div style={{ fontSize:18, fontWeight:800, color:'#212121', letterSpacing:-.5, lineHeight:1 }}>
              {promedioKg > 0 ? `${fmtKg(promedioKg)} kg` : '—'}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginTop:3 }}>solo produccion cosechada</div>
          </div>
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        {cosechas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin registros de cosecha</div>
        ) : isDesktop ? (
          <div style={{ background:'#fff', border:'1px solid #e4e8e4', borderRadius:16, overflow:'hidden', boxShadow:'0 12px 28px rgba(31,36,31,0.05)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'110px 1fr 120px 120px 120px 108px', gap:12, padding:'11px 16px', background:'#fafbf8', borderBottom:'1px solid #edf0ed', color:'#687068', fontSize:11, fontWeight:850, textTransform:'uppercase' }}>
              <span>Bloque</span>
              <span>Cultivo / campo</span>
              <span>Fecha</span>
              <span>Calidad</span>
              <span style={{ textAlign:'right' }}>Kilos</span>
              <span style={{ textAlign:'right' }}>Acciones</span>
            </div>
            {cosechas.map(c => {
              const cultivo = getCultivoCosecha(c)
              return (
                <div key={c.id} onClick={() => setDetalle(c)} style={{ display:'grid', gridTemplateColumns:'110px 1fr 120px 120px 120px 108px', gap:12, alignItems:'center', padding:'13px 16px', borderBottom:'1px solid #f0f2ef', cursor:'pointer' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:900, color:'#0a0a0a' }}>{c.bloques?.codigo || '-'}</div>
                    <div style={{ fontSize:11, color:'#8b928b', marginTop:3 }}>Bloque</div>
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:850, color:'#176a25', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cultivo}</div>
                    <div style={{ fontSize:11, color:'#8b928b', marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.bloques?.campos?.nombre || '-'}</div>
                  </div>
                  <div style={{ fontSize:13, color:'#4d544e' }}>{c.fecha}</div>
                  <div>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:750, background: c.calidad==='primera' ? '#eeeeee' : '#fff3e8', color: c.calidad==='primera' ? '#212121' : '#c8700a' }}>
                      {calidadLabel(c.calidad)}
                    </span>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:17, fontWeight:900, color:'#0a0a0a' }}>{fmtKg(c.kg_total)} kg</div>
                    <div style={{ fontSize:10, color:'#687068', marginTop:2 }}>Produccion</div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:6 }}>
                    <button onClick={(e) => { e.stopPropagation(); abrirEditarCosecha(c) }} style={{ width:34, height:30, borderRadius:9, border:'1px solid #e1e5e1', background:'#fff', color:'#333', cursor:'pointer' }} title="Editar">
                      <i className="ti ti-pencil" style={{ fontSize:16 }} aria-hidden="true"></i>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); eliminar(c.id) }} style={{ width:34, height:30, borderRadius:9, border:'1px solid #ffcccc', background:'#fff', color:'#c84040', cursor:'pointer' }} title="Eliminar">
                      <i className="ti ti-trash" style={{ fontSize:16 }} aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:0 }}>
          {cosechas.map(c => {
          const cultivo = getCultivoCosecha(c)
          return (
            <div key={c.id} onClick={() => setDetalle(c)} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, cursor:'pointer', boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a' }}>Bloque {c.bloques?.codigo}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#176a25', marginTop:2 }}>{cultivo}</div>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>{c.bloques?.campos?.nombre} · {c.fecha}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'#0a0a0a' }}>{fmtKg(c.kg_total)} kg</div>
                  <div style={{ fontSize:11, color:'#687068', fontWeight:600 }}>Produccion</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, background:'#e8f5e5', color:'#176a25' }}>
                  {cultivo}
                </div>
                <div style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:600, background: c.calidad==='primera' ? '#eeeeee' : '#fff3e8', color: c.calidad==='primera' ? '#212121' : '#c8700a' }}>
                  {calidadLabel(c.calidad)}
                </div>
              </div>
              {c.notas && <div style={{ fontSize:11, color:'#9a9a9a', padding:'7px 10px', background:'#f2f1ef', borderRadius:8, marginBottom:8 }}>{c.notas}</div>}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#777' }}>Tocar para ver detalle</span>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={(e) => { e.stopPropagation(); abrirEditarCosecha(c) }} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }}>Editar</button>
                  <button onClick={(e) => { e.stopPropagation(); eliminar(c.id) }} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
                </div>
              </div>
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="cosecha" titulo="Blog de notas de cosecha" />
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id ? 'Editar cosecha' : 'Registrar cosecha'}</div>
            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}

            {!form.id && (
              <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:14 }}>
                <button type="button" onClick={() => setModoMultiple(false)} style={{ flex:1, padding:9, borderRadius:10, border:'none', cursor:'pointer', background: !modoMultiple ? '#212121' : 'transparent', color: !modoMultiple ? '#fff' : '#777', fontSize:12, fontWeight:800 }}>
                  Una cosecha
                </button>
                <button type="button" onClick={() => setModoMultiple(true)} style={{ flex:1, padding:9, borderRadius:10, border:'none', cursor:'pointer', background: modoMultiple ? '#212121' : 'transparent', color: modoMultiple ? '#fff' : '#777', fontSize:12, fontWeight:800 }}>
                  Varias juntas
                </button>
              </div>
            )}

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Campo</div>
            <select style={inp} value={campoFiltro||''} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({...f, bloque_id:''})) }}>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            {(!modoMultiple || form.id) && (
              <>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloque *</div>
            <select style={inp} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
              <option value="">Seleccioná bloque...</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
            </select>

            {form.bloque_id && (
              <div style={{ background:'#e8f5e5', color:'#176a25', borderRadius:12, padding:'9px 12px', fontSize:12, fontWeight:700, marginBottom:12 }}>
                Producto/cultivo: {cultivoSeleccionado || 'Sin plantacion activa registrada'}
              </div>
            )}
              </>
            )}

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha *</div>
            <input style={inp} type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))}/>

            {(!modoMultiple || form.id) ? (
              <>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Kg cosechados * (admite decimales, ej: 1.5)</div>
            <input style={inp} type="text" inputMode="decimal" value={form.kg_total}
              onChange={e => setForm(f => ({...f, kg_total: e.target.value}))}
              placeholder="Ej: 150 o 1.5"/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Calidad</div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {['primera','segunda','mixta'].map(q => (
                <button key={q} onClick={() => setForm(f => ({...f, calidad:q}))} style={{ flex:1, padding:'9px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:12, fontWeight:500, cursor:'pointer', background: form.calidad===q ? '#212121' : '#fff', color: form.calidad===q ? '#fff' : '#555' }}>
                  {q === 'primera' ? '1ra' : q === 'segunda' ? '2da' : 'Mixta'}
                </button>
              ))}
            </div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Notas (opcional)</div>
            <textarea style={{ ...inp, minHeight:60, resize:'vertical' }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>
              </>
            ) : (
              <>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:8 }}>Cosechas del lote</div>
                <div style={{ display:'grid', gap:10, marginBottom:12 }}>
                  {filasCosecha.map((fila, idx) => {
                    const bloqueFila = bloques.find(b => b.id === fila.bloque_id)
                    const cultivoFila = getCultivoBloque(bloqueFila, form.fecha)
                    return (
                      <div key={idx} style={{ background:'#fff', border:'1px solid #e4e6e2', borderRadius:16, padding:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                          <strong style={{ fontSize:13 }}>Cosecha {idx + 1}</strong>
                          {filasCosecha.length > 1 && (
                            <button type="button" onClick={() => quitarFilaCosecha(idx)} style={{ border:'1px solid #ffcccc', background:'#fff', color:'#c84040', borderRadius:10, padding:'5px 9px', fontSize:11, cursor:'pointer' }}>Quitar</button>
                          )}
                        </div>
                        <select style={inp} value={fila.bloque_id} onChange={e => actualizarFilaCosecha(idx, 'bloque_id', e.target.value)}>
                          <option value="">Bloque...</option>
                          {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                        </select>
                        {fila.bloque_id && (
                          <div style={{ background:'#e8f5e5', color:'#176a25', borderRadius:10, padding:'7px 10px', fontSize:11, fontWeight:700, margin:'-4px 0 10px' }}>
                            {cultivoFila || 'Sin plantacion activa registrada'}
                          </div>
                        )}
                        <input style={inp} type="text" inputMode="decimal" value={fila.kg_total} onChange={e => actualizarFilaCosecha(idx, 'kg_total', e.target.value)} placeholder="Kg cosechados"/>
                        <select style={inp} value={fila.calidad} onChange={e => actualizarFilaCosecha(idx, 'calidad', e.target.value)}>
                          <option value="primera">1ra calidad</option>
                          <option value="segunda">2da calidad</option>
                          <option value="mixta">Mixta</option>
                        </select>
                        <input style={{ ...inp, marginBottom:0 }} value={fila.notas} onChange={e => actualizarFilaCosecha(idx, 'notas', e.target.value)} placeholder="Nota opcional"/>
                      </div>
                    )
                  })}
                </div>
                <button type="button" onClick={agregarFilaCosecha} style={{ width:'100%', padding:12, borderRadius:14, border:'1px dashed #bfc6bf', background:'#fff', fontSize:13, fontWeight:800, color:'#176a25', cursor:'pointer', marginBottom:12 }}>
                  + Agregar otra cosecha
                </button>
                {totalKgMultiple > 0 && (
                  <div style={{ background:'#eeeeee', borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', justifyContent:'space-between', gap:12 }}>
                    <span style={{ fontSize:12, color:'#212121' }}>{fmtKg(totalKgMultiple)} kg en total</span>
                    <span style={{ fontSize:14, fontWeight:700, color:'#212121' }}>Produccion</span>
                  </div>
                )}
              </>
            )}

            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : form.id ? 'Guardar cambios' : modoMultiple ? 'Guardar lote de cosechas' : 'Guardar cosecha'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
