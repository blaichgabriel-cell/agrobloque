import React, { useState, useEffect } from 'react'
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
  const [asistencia, setAsistencia] = useState({})
  const [adelantos, setAdelantos] = useState({})
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [modalAdelanto, setModalAdelanto] = useState(null)
  const [formAdelanto, setFormAdelanto] = useState({ monto:'', descripcion:'' })
  const [saving, setSaving] = useState(false)

  const lunes = getLunes(semanaOffset)
  const diasFechas = DIAS.map((_, i) => { const d = new Date(lunes); d.setDate(lunes.getDate() + i); return formatFecha(d) })

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo) { fetchOperarios(); fetchAsistencia() } }, [campoActivo, semanaOffset])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data && data.length > 0) setCampoActivo(data[0])
  }

  const fetchOperarios = async () => {
    const { data } = await supabase.from('operarios').select('*').eq('campo_id', campoActivo.id).order('nombre')
    setOperarios(data || [])
    if (data) fetchAdelantos(data)
  }

  const fetchAsistencia = async () => {
    const { data } = await supabase.from('asistencia').select('*').in('fecha', diasFechas)
    const mapa = {}
    ;(data || []).forEach(a => {
      if (!mapa[a.operario_id]) mapa[a.operario_id] = {}
      mapa[a.operario_id][a.fecha] = a
    })
    setAsistencia(mapa)
  }

  const fetchAdelantos = async (ops) => {
    const ids = ops.map(o => o.id)
    if (!ids.length) return
    const { data } = await supabase.from('adelantos').select('*').in('operario_id', ids)
    const mapa = {}
    ;(data || []).forEach(a => {
      if (!mapa[a.operario_id]) mapa[a.operario_id] = 0
      mapa[a.operario_id] += Number(a.monto)
    })
    setAdelantos(mapa)
  }

  const guardarMonto = async (operario_id, fecha, montoRaw, dia_semana) => {
    const monto = parsearGs(montoRaw)
    const existing = asistencia[operario_id]?.[fecha]
    if (existing) await supabase.from('asistencia').update({ monto }).eq('id', existing.id)
    else await supabase.from('asistencia').insert({ operario_id, fecha, dia_semana, monto, estado: monto > 0 ? 'presente' : 'ausente' })
    fetchAsistencia()
  }

  const handleMontoChange = (operario_id, fecha, value) => {
    const raw = value.replace(/[^0-9]/g, '')
    const fmt = raw ? parseInt(raw, 10).toLocaleString('es-PY') : ''
    setAsistencia(prev => ({
      ...prev,
      [operario_id]: {
        ...(prev[operario_id] || {}),
        [fecha]: { ...(prev[operario_id]?.[fecha] || {}), _input: fmt, monto: parsearGs(fmt) }
      }
    }))
  }

  const getMontoDisplay = (operario_id, fecha) => {
    const rec = asistencia[operario_id]?.[fecha]
    if (!rec) return ''
    if (rec._input !== undefined) return rec._input
    return rec.monto ? fmtGs(rec.monto) : ''
  }

  const getTotalSemana = (operario_id) => diasFechas.reduce((sum, f) => sum + (Number(asistencia[operario_id]?.[f]?.monto) || 0), 0)
  const getTotalGeneral = () => operarios.reduce((sum, o) => sum + getTotalSemana(o.id), 0)

  const guardarAdelanto = async () => {
    const monto = parsearGs(formAdelanto.monto)
    if (!monto) return
    setSaving(true)
    await supabase.from('adelantos').insert({ operario_id:modalAdelanto, fecha:new Date().toISOString().split('T')[0], monto, descripcion:formAdelanto.descripcion })
    setModalAdelanto(null); setFormAdelanto({ monto:'', descripcion:'' }); setSaving(false)
    fetchAdelantos(operarios)
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Control semanal</div>
        <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:16 }}>Asistencia y pagos</div>
        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:16 }}>
          {campos.map(c => (
            <button key={c.id} onClick={() => setCampoActivo(c)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoActivo?.id===c.id ? '#1E5631' : 'transparent', color: campoActivo?.id===c.id ? '#fff' : '#9a9a9a' }}>
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
              <div style={{ fontSize:14, fontWeight:700, color:'#1E5631' }}>Gs. {fmtGs(getTotalSemana(op.id))}</div>
            </div>
            <div style={{ display:'flex', padding:'12px 14px', gap:4 }}>
              {DIAS.map((dia, i) => (
                <div key={dia} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:10, color:'#9a9a9a', fontWeight:500 }}>{DIAS_CORTO[i]}</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={getMontoDisplay(op.id, diasFechas[i])}
                    onChange={e => handleMontoChange(op.id, diasFechas[i], e.target.value)}
                    onBlur={e => guardarMonto(op.id, diasFechas[i], e.target.value, dia)}
                    placeholder="0"
                    style={{ width:'100%', padding:'6px 2px', borderRadius:8, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:11, color:'#0a0a0a', textAlign:'center' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:'1px solid #f2f1ef' }}>
              <div style={{ fontSize:11, color:'#9a9a9a' }}>Adelantos: <span style={{ color:'#c84040', fontWeight:600 }}>Gs. {fmtGs(adelantos[op.id]||0)}</span></div>
              <button onClick={() => setModalAdelanto(op.id)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, fontWeight:500, color:'#0a0a0a', cursor:'pointer' }}>+ Adelanto</button>
            </div>
          </div>
        ))}

        <div style={{ background:'#1E5631', borderRadius:20, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Total semanal del campo</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:-.5 }}>Gs. {fmtGs(getTotalGeneral())}</div>
        </div>
      </div>

      {modalAdelanto && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModalAdelanto(null)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Registrar adelanto</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Monto (Gs.)</div>
            <input
              style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }}
              type="text" inputMode="numeric"
              value={formAdelanto.monto}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                const fmt = raw ? parseInt(raw, 10).toLocaleString('es-PY') : ''
                setFormAdelanto(f => ({...f, monto: fmt}))
              }}
              placeholder="Ej: 50.000"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripción (opcional)</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16, boxSizing:'border-box' }} type="text" value={formAdelanto.descripcion} onChange={e => setFormAdelanto(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Adelanto quincena"/>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#1E5631', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardarAdelanto} disabled={saving}>{saving ? 'Guardando...' : 'Guardar adelanto'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModalAdelanto(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
