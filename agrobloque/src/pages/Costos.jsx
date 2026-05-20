import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS_COSTO = [
  { key:'semillas',      label:'Semillas',      icon:'ti-seedling',    color:'#A0785A', bg:'#f2ebe4' },
  { key:'combustible',   label:'Combustible',   icon:'ti-flame',       color:'#e07b00', bg:'#fff3e8' },
  { key:'mantenimiento', label:'Mantenimiento', icon:'ti-tool',        color:'#555',    bg:'#f2f1ef' },
  { key:'electricidad',  label:'Electricidad',  icon:'ti-bolt',        color:'#2980b9', bg:'#eaf4fb' },
  { key:'agua',          label:'Agua',          icon:'ti-droplet',     color:'#16a085', bg:'#e8f8f5' },
  { key:'otro',          label:'Otro',          icon:'ti-plus-circle', color:'#888',    bg:'#f2f1ef' },
]

const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

export default function Costos({ campoActivo }) {
  const [campos, setCampos] = useState([])
  const [campoSel, setCampoSel] = useState(null)
  const [bloques, setBloques] = useState([])
  const [costosAuto, setCostosAuto] = useState({ agroquimicos: 0, jornales: 0 })
  const [costosManuales, setCostosManuales] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ tipo:'semillas', descripcion:'', monto:'', fecha: new Date().toISOString().split('T')[0], bloque_id:'' })
  const [saving, setSaving] = useState(false)
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo && !campoSel) setCampoSel(campoActivo) }, [campoActivo])
  useEffect(() => { if (campoSel) { fetchBloques(); fetchCostos() } }, [campoSel, periodo])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
  }
  const fetchBloques = async () => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campoSel.id).order('codigo')
    setBloques(data || [])
  }
  const getFechaDesde = () => {
    if (periodo === 'total') return '2020-01-01'
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  }
  const fetchCostos = async () => {
    const desde = getFechaDesde()
    const { data: fumis } = await supabase.from('fumigaciones')
      .select('fumigacion_productos(dosis, productos(precio_unitario))')
      .eq('campo_id', campoSel.id).gte('fecha', desde)
    let totalAgro = 0
    fumis?.forEach(f => f.fumigacion_productos?.forEach(fp => {
      totalAgro += (Number(fp.productos?.precio_unitario) || 0) * (parseFloat(fp.dosis) || 0)
    }))
    const { data: asist } = await supabase.from('asistencia')
      .select('monto, operarios(campo_id)').gte('fecha', desde)
    let totalJornales = 0
    asist?.forEach(a => { if (a.operarios?.campo_id === campoSel.id) totalJornales += Number(a.monto) || 0 })
    setCostosAuto({ agroquimicos: totalAgro, jornales: totalJornales })
    const { data: manuales } = await supabase.from('costos')
      .select('*, bloques(codigo)').eq('campo_id', campoSel.id)
      .gte('fecha', desde).order('fecha', { ascending: false })
    setCostosManuales(manuales || [])
  }
  const guardar = async () => {
    const monto = parsearGs(form.monto)
    if (!monto || !form.fecha) return
    setSaving(true)
    await supabase.from('costos').insert({
      tipo: form.tipo, descripcion: form.descripcion || null,
      monto, fecha: form.fecha,
      campo_id: campoSel?.id || null, bloque_id: form.bloque_id || null
    })
    await fetchCostos(); setSaving(false); setModal(false)
    setForm({ tipo:'semillas', descripcion:'', monto:'', fecha: new Date().toISOString().split('T')[0], bloque_id:'' })
  }
  const eliminar = async (id) => { await supabase.from('costos').delete().eq('id', id); fetchCostos() }

  const totalManuales = costosManuales.reduce((s, c) => s + Number(c.monto), 0)
  const totalGeneral = costosAuto.agroquimicos + costosAuto.jornales + totalManuales

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Gastos</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Costos</div>
          </div>
          <button onClick={() => setModal(true)} style={{ width:40, height:40, borderRadius:14, background:'#A0785A', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        {campos.length > 1 && (
          <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:12 }}>
            {campos.map(c => (
              <button key={c.id} onClick={() => setCampoSel(c)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoSel?.id===c.id ? '#A0785A' : 'transparent', color: campoSel?.id===c.id ? '#fff' : '#9a9a9a' }}>{c.nombre}</button>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:4 }}>
          {[['mes','Este mes'],['total','Histórico']].map(([k,v]) => (
            <button key={k} onClick={() => setPeriodo(k)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: periodo===k ? '#fff' : 'transparent', color: periodo===k ? '#0a0a0a' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'8px 14px 100px' }}>
        <div style={{ background:'#A0785A', borderRadius:20, padding:'18px 20px', marginBottom:10 }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:.05, marginBottom:6 }}>Total costos · {periodo === 'mes' ? 'este mes' : 'histórico'}</div>
          <div style={{ fontSize:36, fontWeight:800, color:'#fff', letterSpacing:-1, lineHeight:1 }}>Gs. {fmtGs(totalGeneral)}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:4 }}>{campoSel?.nombre}</div>
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:12, textTransform:'uppercase', letterSpacing:.05 }}>Calculados automáticamente</div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f2f1ef' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'#fff3e8', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-spray" style={{ fontSize:15, color:'#e07b00' }} aria-hidden="true"></i>
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>Agroquímicos</div>
                <div style={{ fontSize:10, color:'#9a9a9a' }}>Desde fumigaciones registradas</div>
              </div>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{costosAuto.agroquimicos > 0 ? `Gs. ${fmtGs(costosAuto.agroquimicos)}` : '—'}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'#f2ebe4', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-users" style={{ fontSize:15, color:'#A0785A' }} aria-hidden="true"></i>
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>Jornales</div>
                <div style={{ fontSize:10, color:'#9a9a9a' }}>Desde asistencia registrada</div>
              </div>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>Gs. {fmtGs(costosAuto.jornales)}</div>
          </div>
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', textTransform:'uppercase', letterSpacing:.05 }}>Costos manuales</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>Gs. {fmtGs(totalManuales)}</div>
          </div>
          {costosManuales.length === 0
            ? <div style={{ fontSize:12, color:'#b0b0b0', textAlign:'center', padding:'12px 0' }}>Sin costos manuales registrados</div>
            : costosManuales.map(c => {
              const tipo = TIPOS_COSTO.find(t => t.key === c.tipo) || TIPOS_COSTO[5]
              return (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f2f1ef' }}>
                  <div style={{ width:32, height:32, borderRadius:9, background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${tipo.icon}`} style={{ fontSize:14, color:tipo.color }} aria-hidden="true"></i>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{c.descripcion || tipo.label}</div>
                    <div style={{ fontSize:10, color:'#9a9a9a' }}>{c.fecha}{c.bloques?.codigo ? ' · ' + c.bloques.codigo : ''}</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>Gs. {fmtGs(c.monto)}</div>
                  <button onClick={() => eliminar(c.id)} style={{ width:28, height:28, borderRadius:8, border:'1px solid #ffcccc', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    <i className="ti ti-x" style={{ fontSize:12, color:'#c84040' }} aria-hidden="true"></i>
                  </button>
                </div>
              )
            })
          }
        </div>
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Nuevo costo</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:8 }}>Tipo</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:14 }}>
              {TIPOS_COSTO.map(t => (
                <button key={t.key} onClick={() => setForm(f => ({...f, tipo:t.key}))} style={{ padding:'10px 6px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:11, fontWeight:500, cursor:'pointer', background: form.tipo===t.key ? '#A0785A' : '#fff', color: form.tipo===t.key ? '#fff' : '#555', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize:16 }} aria-hidden="true"></i>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Monto (Gs.) *</div>
            <input style={inpStyle} type="text" inputMode="numeric" value={form.monto}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                const fmt = raw ? parseInt(raw, 10).toLocaleString('es-PY') : ''
                setForm(f => ({...f, monto: fmt}))
              }}
              placeholder="Ej: 150.000"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripción (opcional)</div>
            <input style={inpStyle} type="text" value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Compra de semillas de morrón"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha</div>
            <input style={inpStyle} type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloque (opcional)</div>
            <select style={inpStyle} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
              <option value="">Sin bloque específico</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
            </select>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#A0785A', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar costo'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
