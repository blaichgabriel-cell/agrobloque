import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_CORTO = ['L','M','M','J','V','S']

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  topSub: { color:'rgba(249,248,246,0.5)', fontSize:11 },
  body: { padding:10 },
  switcher: { display:'flex', gap:6, marginBottom:12 },
  swBtn: { flex:1, padding:'7px 4px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:11, fontWeight:500, color:'#888', textAlign:'center', cursor:'pointer' },
  swActive: { background:'#1a1a1a', color:'#f9f8f6', borderColor:'#1a1a1a' },
  semanaNav: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  semanaBtn: { padding:'6px 14px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:12, color:'#1a1a1a', cursor:'pointer' },
  semanaLabel: { fontSize:13, fontWeight:500, color:'#1a1a1a' },
  card: { background:'#f9f8f6', borderRadius:10, border:'0.5px solid #d0cdc8', marginBottom:10, overflow:'hidden' },
  cardHead: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'0.5px solid #f0ede8' },
  cardNombre: { fontSize:13, fontWeight:500, color:'#1a1a1a' },
  cardTotal: { fontSize:13, fontWeight:500, color:'#1a1a1a' },
  diasRow: { display:'flex', padding:'8px 12px', gap:4 },
  diaCol: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 },
  diaLabel: { fontSize:10, color:'#888' },
  diaInput: { width:'100%', padding:'6px 2px', borderRadius:6, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:11, color:'#1a1a1a', textAlign:'center' },
  adelantoRow: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 12px', borderTop:'0.5px solid #f0ede8' },
  adelantoLabel: { fontSize:11, color:'#888' },
  adelantoVal: { fontSize:11, color:'#cc4444', fontWeight:500 },
  adelantoBtn: { fontSize:10, padding:'2px 8px', borderRadius:6, border:'0.5px solid #d0cdc8', background:'transparent', color:'#888', cursor:'pointer' },
  totalRow: { background:'#1a1a1a', padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4, borderRadius:8 },
  totalLabel: { fontSize:12, color:'rgba(249,248,246,0.7)' },
  totalVal: { fontSize:16, fontWeight:600, color:'#f9f8f6' },
  overlay: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet: { background:'#f9f8f6', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:480, padding:'20px 16px 40px' },
  sheetTitle: { fontSize:16, fontWeight:600, color:'#1a1a1a', marginBottom:16 },
  label: { fontSize:11, color:'#888', marginBottom:4, display:'block' },
  input: { width:'100%', padding:'10px 12px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:10 },
  saveBtn: { width:'100%', padding:11, borderRadius:8, background:'#1a1a1a', color:'#f9f8f6', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', marginTop:6 },
  cancelBtn: { width:'100%', padding:11, borderRadius:8, background:'transparent', color:'#888', border:'0.5px solid #d0cdc8', fontSize:13, cursor:'pointer', marginTop:8 },
}

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
    fetchAdelantos(data || [])
  }

  const fetchAsistencia = async () => {
    const { data } = await supabase.from('asistencia')
      .select('*')
      .in('fecha', diasFechas)
    const mapa = {}
    ;(data || []).forEach(a => {
      if (!mapa[a.operario_id]) mapa[a.operario_id] = {}
      mapa[a.operario_id][a.fecha] = a
    })
    setAsistencia(mapa)
  }

  const fetchAdelantos = async (ops) => {
    const ids = ops.map(o => o.id)
    if (ids.length === 0) return
    const { data } = await supabase.from('adelantos').select('*').in('operario_id', ids)
    const mapa = {}
    ;(data || []).forEach(a => {
      if (!mapa[a.operario_id]) mapa[a.operario_id] = 0
      mapa[a.operario_id] += Number(a.monto)
    })
    setAdelantos(mapa)
  }

  const guardarMonto = async (operario_id, fecha, monto, dia_semana) => {
    const montoNum = Number(monto) || 0
    const existing = asistencia[operario_id]?.[fecha]
    if (existing) {
      await supabase.from('asistencia').update({ monto: montoNum }).eq('id', existing.id)
    } else {
      await supabase.from('asistencia').insert({ operario_id, fecha, dia_semana, monto: montoNum, estado: montoNum > 0 ? 'presente' : 'ausente' })
    }
    fetchAsistencia()
  }

  const getMonto = (operario_id, fecha) => {
    return asistencia[operario_id]?.[fecha]?.monto ?? ''
  }

  const getTotalSemana = (operario_id) => {
    return diasFechas.reduce((sum, f) => sum + (Number(asistencia[operario_id]?.[f]?.monto) || 0), 0)
  }

  const getTotalGeneral = () => {
    return operarios.reduce((sum, o) => sum + getTotalSemana(o.id), 0)
  }

  const guardarAdelanto = async () => {
    if (!formAdelanto.monto) return
    setSaving(true)
    await supabase.from('adelantos').insert({
      operario_id: modalAdelanto,
      fecha: new Date().toISOString().split('T')[0],
      monto: Number(formAdelanto.monto),
      descripcion: formAdelanto.descripcion
    })
    setModalAdelanto(null)
    setFormAdelanto({ monto:'', descripcion:'' })
    setSaving(false)
    fetchAdelantos(operarios)
  }

  return (
    <div>
      <div style={s.topbar}>
        <div>
          <div style={s.topTitle}>Asistencia y pagos</div>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.switcher}>
          {campos.map(c => (
            <div key={c.id} style={{ ...s.swBtn, ...(campoActivo?.id === c.id ? s.swActive : {}) }} onClick={() => setCampoActivo(c)}>
              {c.nombre}
            </div>
          ))}
        </div>

        <div style={s.semanaNav}>
          <button style={s.semanaBtn} onClick={() => setSemanaOffset(o => o - 1)}>← Anterior</button>
          <div style={s.semanaLabel}>
            {formatLabel(lunes)} — {formatLabel(new Date(lunes.getTime() + 5 * 86400000))}
          </div>
          <button style={s.semanaBtn} onClick={() => setSemanaOffset(o => o + 1)}>Siguiente →</button>
        </div>

        {operarios.map(op => (
          <div key={op.id} style={s.card}>
            <div style={s.cardHead}>
              <div style={s.cardNombre}>{op.nombre}</div>
              <div style={s.cardTotal}>Gs. {getTotalSemana(op.id).toLocaleString()}</div>
            </div>
            <div style={s.diasRow}>
              {DIAS.map((dia, i) => (
                <div key={dia} style={s.diaCol}>
                  <div style={s.diaLabel}>{DIAS_CORTO[i]}</div>
                  <input
                    style={s.diaInput}
                    type="number"
                    value={getMonto(op.id, diasFechas[i])}
                    onChange={e => guardarMonto(op.id, diasFechas[i], e.target.value, dia)}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <div style={s.adelantoRow}>
              <div style={s.adelantoLabel}>Adelantos: <span style={s.adelantoVal}>Gs. {(adelantos[op.id] || 0).toLocaleString()}</span></div>
              <button style={s.adelantoBtn} onClick={() => setModalAdelanto(op.id)}>+ Adelanto</button>
            </div>
          </div>
        ))}

        <div style={s.totalRow}>
          <div style={s.totalLabel}>Total semanal del campo</div>
          <div style={s.totalVal}>Gs. {getTotalGeneral().toLocaleString()}</div>
        </div>
      </div>

      {modalAdelanto && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setModalAdelanto(null)}>
          <div style={s.sheet}>
            <div style={s.sheetTitle}>Registrar adelanto</div>
            <label style={s.label}>Monto (Gs.)</label>
            <input style={s.input} type="number" value={formAdelanto.monto} onChange={e => setFormAdelanto(f => ({...f, monto:e.target.value}))} placeholder="Ej: 50000"/>
            <label style={s.label}>Descripción (opcional)</label>
            <input style={s.input} type="text" value={formAdelanto.descripcion} onChange={e => setFormAdelanto(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Adelanto quincena"/>
            <button style={s.saveBtn} onClick={guardarAdelanto} disabled={saving}>{saving ? 'Guardando...' : 'Guardar adelanto'}</button>
            <button style={s.cancelBtn} onClick={() => setModalAdelanto(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
