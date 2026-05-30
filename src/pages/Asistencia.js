import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_CORTO = ['L','M','M','J','V','S']

const getLunes = (offset = 0) => {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diff + offset * 7)
  return lunes
}

const formatFecha = (d) => d.toISOString().split('T')[0]
const formatLabel = (d) => d.toLocaleDateString('es-PY', { day:'numeric', month:'short' })
const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

export default function Asistencia() {
  const [campoActivo, setCampoActivo] = useState(null)
  const [campos, setCampos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [registros, setRegistros] = useState({})
  const [inputs, setInputs] = useState({})
  const [adelantos, setAdelantos] = useState([])
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [modalAdelanto, setModalAdelanto] = useState(null)
  const [modalHistorial, setModalHistorial] = useState(null)
  const [formAdelanto, setFormAdelanto] = useState({ monto:'', descripcion:'' })
  const [savingAdelanto, setSavingAdelanto] = useState(false)
  const [error, setError] = useState('')
  const saveTimers = useRef({})

  const lunes = getLunes(semanaOffset)
  const diasFechas = DIAS.map((_, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i); return formatFecha(d)
  })

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo) { fetchOperarios(); fetchRegistros() } }, [campoActivo, semanaOffset])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setCampoActivo(data[0])
  }

  const fetchOperarios = async () => {
    const { data } = await supabase.from('operarios').select('*').eq('campo_id', campoActivo.id).order('orden', { ascending: true })
    setOperarios(data || [])
    if (data) fetchAdelantos(data)
  }

  const fetchRegistros = async () => {
    const { data } = await supabase.from('asistencia').select('*').in('fecha', diasFechas)
    const mapa = {}
    const newInputs = {}
    ;(data || []).forEach(a => {
      const key = `${a.operario_id}_${a.fecha}`
      mapa[key] = { id: a.id, monto: a.monto }
      newInputs[key] = a.monto > 0 ? fmtGs(a.monto) : ''
    })
    setRegistros(mapa)
    setInputs(newInputs)
  }

  const fetchAdelantos = async (ops) => {
    const ids = ops.map(o => o.id)
    if (!ids.length) return
    const { data } = await supabase.from('adelantos').select('*').in('operario_id', ids).order('fecha', { ascending: false })
    setAdelantos(data || [])
  }

  const getKey = (operario_id, fecha) => `${operario_id}_${fecha}`

  const handleChange = (operario_id, fecha, diaIdx, value) => {
    const raw = value.replace(/[^0-9]/g, '')
    const fmt = raw ? parseInt(raw, 10).toLocaleString('es-PY') : ''
    const key = getKey(operario_id, fecha)
    setInputs(prev => ({ ...prev, [key]: fmt }))

    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const monto = parsearGs(fmt)
      const existing = registros[key]
      try {
        if (existing) {
          await supabase.from('asistencia').update({ monto }).eq('id', existing.id)
        } else {
          const { data } = await supabase.from('asistencia').insert({
            operario_id, fecha, dia_semana: DIAS[diaIdx], monto, estado: 'presente'
          }).select().single()
          if (data) setRegistros(prev => ({ ...prev, [key]: { id: data.id, monto: data.monto } }))
        }
      } catch (e) {
        setError('Error al guardar asistencia')
      }
    }, 1200)
  }

  const getMonto = (operario_id, fecha) => inputs[getKey(operario_id, fecha)] || ''

  const getTotalSemana = (operario_id) =>
    diasFechas.reduce((sum, f) => sum + parsearGs(inputs[getKey(operario_id, f)] || '0'), 0)

  const getTotalGeneral = () => operarios.reduce((sum, o) => sum + getTotalSemana(o.id), 0)

  const getAdelantosOperario = (operario_id) => adelantos.filter(a => a.operario_id === operario_id)
  const getTotalAdelantos = (operario_id) => getAdelantosOperario(operario_id).reduce((s, a) => s + Number(a.monto), 0)

  const guardarAdelanto = async () => {
    const monto = parsearGs(formAdelanto.monto)
    if (!monto) return
    setSavingAdelanto(true)
    try {
      await supabase.from('adelantos').insert({
        operario_id: modalAdelanto.id,
        fecha: new Date().toISOString().split('T')[0],
        monto, descripcion: formAdelanto.descripcion || null
      })
      setModalAdelanto(null)
      setFormAdelanto({ monto:'', descripcion:'' })
      fetchAdelantos(operarios)
    } catch (e) { setError('Error al guardar adelanto') }
    setSavingAdelanto(false)
  }

  const eliminarAdelanto = async (id) => {
    await supabase.from('adelantos').delete().eq('id', id)
    fetchAdelantos(operarios)
  }

  const marcarPagado = async (adelanto) => {
    await supabase.from('adelantos').update({ descripcion: (adelanto.descripcion || '') + ' [PAGADO]' }).eq('id', adelanto.id)
    fetchAdelantos(operarios)
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Control semanal</div>
        <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:16 }}>Asistencia y pagos</div>
        {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:16 }}>
          {campos.map(c => (
            <button key={c.id} onClick={() => setCampoActivo(c)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoActivo?.id===c.id ? '#212121' : 'transparent', color: campoActivo?.id===c.id ? '#fff' : '#9a9a9a' }}>
              {c.nombre}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => setSemanaOffset(o => o-1)} style={{ padding:'7px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a', cursor:'pointer' }}>← Anterior</button>
          <div style={{ fontSize:12, fontWeight:600, color:'#0a0a0a' }}>{formatLabel(lunes)} — {formatLabel(new Date(lunes.getTime() + 5*86400000))}</div>
          <button onClick={() => setSemanaOffset(o => o+1)} style={{ padding:'7px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a', cursor:'pointer' }}>Siguiente →</button>
        </div>
      </div>

      <div style={{ padding:'12px 14px 100px' }}>
        {operarios.map(op => (
          <div key={op.id} style={{ background:'#fff', borderRadius:20, marginBottom:10, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid #f2f1ef' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{op.nombre}</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#212121' }}>Gs. {fmtGs(getTotalSemana(op.id))}</div>
            </div>
            <div style={{ display:'flex', padding:'12px 14px', gap:4 }}>
              {DIAS.map((dia, i) => (
                <div key={dia} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:10, color:'#9a9a9a', fontWeight:500 }}>{DIAS_CORTO[i]}</div>
                  <input
                    type="text" inputMode="numeric"
                    value={getMonto(op.id, diasFechas[i])}
                    onChange={e => handleChange(op.id, diasFechas[i], i, e.target.value)}
                    placeholder="0"
                    style={{ width:'100%', padding:'6px 2px', borderRadius:8, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:11, color:'#0a0a0a', textAlign:'center' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:'1px solid #f2f1ef' }}>
              <button onClick={() => setModalHistorial(op)} style={{ fontSize:11, color:'#9a9a9a', background:'none', border:'none', cursor:'pointer' }}>
                Adelantos: <span style={{ color: getTotalAdelantos(op.id) > 0 ? '#c84040' : '#9a9a9a', fontWeight:600 }}>Gs. {fmtGs(getTotalAdelantos(op.id))}</span> →
              </button>
              <button onClick={() => setModalAdelanto(op)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, fontWeight:500, color:'#0a0a0a', cursor:'pointer' }}>+ Adelanto</button>
            </div>
          </div>
        ))}

        <div style={{ background:'#212121', borderRadius:20, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Total semanal del campo</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:-.5 }}>Gs. {fmtGs(getTotalGeneral())}</div>
        </div>
      </div>

      {/* Modal historial adelantos */}
      {modalHistorial && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModalHistorial(null)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:4 }}>Adelantos — {modalHistorial.nombre}</div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Total: Gs. {fmtGs(getTotalAdelantos(modalHistorial.id))}</div>
            {getAdelantosOperario(modalHistorial.id).length === 0 ? (
              <div style={{ textAlign:'center', color:'#9a9a9a', fontSize:13, padding:'20px 0' }}>Sin adelantos registrados</div>
            ) : getAdelantosOperario(modalHistorial.id).map(a => (
              <div key={a.id} style={{ background:'#fff', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ fontSize:13, fontWeight:600, color: a.descripcion?.includes('[PAGADO]') ? '#9a9a9a' : '#0a0a0a' }}>
                    Gs. {fmtGs(a.monto)}
                    {a.descripcion?.includes('[PAGADO]') && <span style={{ fontSize:10, color:'#1E5631', background:'#edf7ed', padding:'1px 6px', borderRadius:6, marginLeft:6 }}>Pagado</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#9a9a9a' }}>{a.fecha}</div>
                </div>
                {a.descripcion && <div style={{ fontSize:11, color:'#9a9a9a', marginBottom:8 }}>{a.descripcion.replace('[PAGADO]','').trim()}</div>}
                <div style={{ display:'flex', gap:6 }}>
                  {!a.descripcion?.includes('[PAGADO]') && (
                    <button onClick={() => marcarPagado(a)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #c8ddc8', background:'transparent', fontSize:11, color:'#1E5631', cursor:'pointer' }}>✓ Marcar pagado</button>
                  )}
                  <button onClick={() => eliminarAdelanto(a.id)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
                </div>
              </div>
            ))}
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModalHistorial(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Modal nuevo adelanto */}
      {modalAdelanto && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModalAdelanto(null)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:4 }}>Registrar adelanto</div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>{modalAdelanto.nombre}</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Monto (Gs.)</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }}
              type="text" inputMode="numeric" value={formAdelanto.monto}
              onChange={e => { const r=e.target.value.replace(/[^0-9]/g,''); setFormAdelanto(f=>({...f,monto:r?parseInt(r,10).toLocaleString('es-PY'):''})) }}
              placeholder="Ej: 50.000"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripción (opcional)</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16, boxSizing:'border-box' }}
              type="text" value={formAdelanto.descripcion} onChange={e => setFormAdelanto(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Adelanto quincena"/>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardarAdelanto} disabled={savingAdelanto}>{savingAdelanto ? 'Guardando...' : 'Guardar adelanto'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModalAdelanto(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
