import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const estados = ['sembrado', 'germinando', 'listo', 'trasplantado', 'descartado']
const hoy = () => new Date().toISOString().split('T')[0]
const num = (v) => Number(v) || 0
const pct = (a, b) => b > 0 ? Math.round((num(a) / num(b)) * 100) : 0

const formInicial = {
  campo_id: '',
  fecha_siembra: hoy(),
  cultivo: '',
  variedad: '',
  semilla: '',
  cantidad_semillas: '',
  bandejas: '',
  sustrato: '',
  abono_sustrato: '',
  fecha_estimada_trasplante: '',
  fecha_real_trasplante: '',
  germinadas: '',
  perdidas: '',
  estado: 'sembrado',
  notas: '',
}

const tratamientoInicial = {
  fecha: hoy(),
  tipo: '',
  producto: '',
  dosis: '',
  responsable: '',
  notas: '',
}

function ViveroIcon({ size = 24, color = '#2f741f' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21V10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12C8.2 12 5.4 9.7 4.5 6.2C8.2 6 11.1 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12C15.8 12 18.6 9.7 19.5 6.2C15.8 6 12.9 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 21H17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function Vivero() {
  const [campos, setCampos] = useState([])
  const [lotes, setLotes] = useState([])
  const [tratamientos, setTratamientos] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [modalTratamiento, setModalTratamiento] = useState(false)
  const [form, setForm] = useState(formInicial)
  const [tratForm, setTratForm] = useState(tratamientoInicial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCampos()
    fetchLotes()
  }, [])

  useEffect(() => {
    if (detalle) fetchTratamientos(detalle.id)
  }, [detalle?.id])

  const resumen = useMemo(() => {
    const activos = lotes.filter(l => !['trasplantado', 'descartado'].includes(l.estado)).length
    const semillas = lotes.reduce((s, l) => s + num(l.cantidad_semillas), 0)
    const germinadas = lotes.reduce((s, l) => s + num(l.germinadas), 0)
    const perdidas = lotes.reduce((s, l) => s + num(l.perdidas), 0)
    return { activos, semillas, germinadas, perdidas, germinacion: pct(germinadas, semillas) }
  }, [lotes])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setForm(f => ({ ...f, campo_id: f.campo_id || data[0].id }))
  }

  const fetchLotes = async () => {
    const { data, error } = await supabase
      .from('vivero_lotes')
      .select('*, campos(nombre)')
      .order('fecha_siembra', { ascending: false })

    if (error) {
      setError('Falta ejecutar el SQL de vivero en Supabase.')
      setLotes([])
      return
    }

    setError('')
    setLotes(data || [])
  }

  const fetchTratamientos = async (loteId) => {
    const { data } = await supabase
      .from('vivero_tratamientos')
      .select('*')
      .eq('lote_id', loteId)
      .order('fecha', { ascending: false })
    setTratamientos(data || [])
  }

  const abrirNuevo = () => {
    setForm({ ...formInicial, campo_id: campos[0]?.id || '' })
    setModal(true)
  }

  const abrirEditar = (lote) => {
    setForm({
      id: lote.id,
      campo_id: lote.campo_id || '',
      fecha_siembra: lote.fecha_siembra || hoy(),
      cultivo: lote.cultivo || '',
      variedad: lote.variedad || '',
      semilla: lote.semilla || '',
      cantidad_semillas: lote.cantidad_semillas || '',
      bandejas: lote.bandejas || '',
      sustrato: lote.sustrato || '',
      abono_sustrato: lote.abono_sustrato || '',
      fecha_estimada_trasplante: lote.fecha_estimada_trasplante || '',
      fecha_real_trasplante: lote.fecha_real_trasplante || '',
      germinadas: lote.germinadas || '',
      perdidas: lote.perdidas || '',
      estado: lote.estado || 'sembrado',
      notas: lote.notas || '',
    })
    setDetalle(null)
    setModal(true)
  }

  const guardarLote = async () => {
    if (!form.fecha_siembra || !form.cultivo.trim()) return
    setSaving(true)
    const payload = {
      campo_id: form.campo_id || null,
      fecha_siembra: form.fecha_siembra,
      cultivo: form.cultivo.trim(),
      variedad: form.variedad || null,
      semilla: form.semilla || null,
      cantidad_semillas: num(form.cantidad_semillas),
      bandejas: num(form.bandejas),
      sustrato: form.sustrato || null,
      abono_sustrato: form.abono_sustrato || null,
      fecha_estimada_trasplante: form.fecha_estimada_trasplante || null,
      fecha_real_trasplante: form.fecha_real_trasplante || null,
      germinadas: num(form.germinadas),
      perdidas: num(form.perdidas),
      estado: form.estado,
      notas: form.notas || null,
    }

    const res = form.id
      ? await supabase.from('vivero_lotes').update(payload).eq('id', form.id)
      : await supabase.from('vivero_lotes').insert(payload)

    if (res.error) setError('No se pudo guardar el lote. Revisa el SQL de Supabase.')
    else {
      await registrarAuditoria({
        accion: form.id ? 'Edito lote de vivero' : 'Registro lote de vivero',
        modulo: 'Vivero',
        tabla: 'vivero_lotes',
        registroId: form.id || '',
        detalle: `${payload.cultivo} ${payload.variedad || ''}`,
      })
      setModal(false)
      await fetchLotes()
    }
    setSaving(false)
  }

  const eliminarLote = async (id) => {
    if (!window.confirm('Eliminar este lote de vivero?')) return
    await supabase.from('vivero_tratamientos').delete().eq('lote_id', id)
    await supabase.from('vivero_lotes').delete().eq('id', id)
    await registrarAuditoria({ accion:'Elimino lote de vivero', modulo:'Vivero', tabla:'vivero_lotes', registroId:id })
    setDetalle(null)
    fetchLotes()
  }

  const guardarTratamiento = async () => {
    if (!detalle || !tratForm.fecha || !tratForm.tipo.trim()) return
    setSaving(true)
    const { error } = await supabase.from('vivero_tratamientos').insert({
      lote_id: detalle.id,
      fecha: tratForm.fecha,
      tipo: tratForm.tipo,
      producto: tratForm.producto || null,
      dosis: tratForm.dosis || null,
      responsable: tratForm.responsable || null,
      notas: tratForm.notas || null,
    })
    if (!error) {
      await registrarAuditoria({ accion:'Registro tratamiento de vivero', modulo:'Vivero', tabla:'vivero_tratamientos', registroId:detalle.id, detalle:tratForm.tipo })
      setTratForm(tratamientoInicial)
      setModalTratamiento(false)
      fetchTratamientos(detalle.id)
    } else setError('No se pudo guardar el tratamiento.')
    setSaving(false)
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:15, background:'#eef6ea', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <ViveroIcon size={25} />
            </div>
            <div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Plantinero</div>
              <div style={{ fontSize:24, fontWeight:800, color:'#0a0a0a', letterSpacing:-.5 }}>Vivero</div>
            </div>
          </div>
          <button onClick={abrirNuevo} style={{ width:42, height:42, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:21 }} aria-hidden="true"></i>
          </button>
        </div>

        {error && <div style={{ background:'#fff3e8', color:'#a35f00', fontSize:12, padding:'9px 12px', borderRadius:12, marginBottom:12 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <Stat dark label="Lotes activos" value={resumen.activos} sub={`${lotes.length} totales`} />
          <Stat label="Germinacion" value={`${resumen.germinacion}%`} sub={`${resumen.germinadas} de ${resumen.semillas}`} />
          <Stat label="Perdidas" value={resumen.perdidas} sub="plantines" />
          <Stat label="Semillas" value={resumen.semillas} sub="sembradas" />
        </div>
      </div>

      <div style={{ padding:'8px 14px 100px' }}>
        {lotes.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin lotes de vivero registrados</div>
        ) : lotes.map(lote => (
          <div key={lote.id} onClick={() => setDetalle(lote)} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8, cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#0a0a0a' }}>{lote.cultivo}</div>
                <div style={{ fontSize:12, color:'#176a25', fontWeight:700, marginTop:2 }}>{lote.variedad || 'Sin variedad'}</div>
                <div style={{ fontSize:11, color:'#9a9a9a', marginTop:3 }}>{lote.fecha_siembra} · {lote.campos?.nombre || 'Sin campo'}</div>
              </div>
              <span style={{ alignSelf:'flex-start', borderRadius:20, background:'#e8f5e5', color:'#176a25', padding:'4px 9px', fontSize:10, fontWeight:800 }}>
                {lote.estado}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:12 }}>
              <Mini label="Semillas" value={lote.cantidad_semillas || 0} />
              <Mini label="Germinadas" value={`${pct(lote.germinadas, lote.cantidad_semillas)}%`} />
              <Mini label="Perdidas" value={lote.perdidas || 0} />
            </div>
          </div>
        ))}

        <NotasPanel modulo="vivero" titulo="Blog de notas del vivero" />
      </div>

      {detalle && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setDetalle(null)}>
          <div style={sheet}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:12, color:'#9a9a9a' }}>Detalle de lote</div>
                <div style={{ fontSize:22, fontWeight:850 }}>{detalle.cultivo}</div>
                <div style={{ fontSize:12, color:'#176a25', fontWeight:800 }}>{detalle.variedad || 'Sin variedad'}</div>
              </div>
              <button onClick={() => setDetalle(null)} style={closeBtn}><i className="ti ti-x" /></button>
            </div>

            <div style={{ background:'#f7f7f5', borderRadius:16, padding:'4px 14px', marginBottom:14 }}>
              <Info label="Fecha siembra" value={detalle.fecha_siembra} />
              <Info label="Fecha estimada trasplante" value={detalle.fecha_estimada_trasplante || '-'} />
              <Info label="Fecha real trasplante" value={detalle.fecha_real_trasplante || '-'} />
              <Info label="Semilla" value={detalle.semilla || '-'} />
              <Info label="Sustrato" value={detalle.sustrato || '-'} />
              <Info label="Abono en sustrato" value={detalle.abono_sustrato || '-'} />
              <Info label="Bandejas" value={detalle.bandejas || 0} />
              <Info label="Germinacion" value={`${pct(detalle.germinadas, detalle.cantidad_semillas)}%`} />
              <Info label="Perdidas" value={detalle.perdidas || 0} last />
            </div>

            {detalle.notas && <div style={{ background:'#f2f1ef', borderRadius:14, padding:12, fontSize:13, marginBottom:14 }}>{detalle.notas}</div>}

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:15, fontWeight:800 }}>Tratamientos</div>
              <button onClick={() => setModalTratamiento(true)} style={{ border:'none', borderRadius:12, background:'#1a5c2e', color:'#fff', padding:'8px 10px', fontSize:12, fontWeight:800 }}>+ Tratamiento</button>
            </div>
            {tratamientos.length === 0 ? (
              <div style={{ color:'#9a9a9a', fontSize:13, marginBottom:14 }}>Sin tratamientos registrados.</div>
            ) : tratamientos.map(t => (
              <div key={t.id} style={{ background:'#f7f7f5', borderRadius:14, padding:11, marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:800 }}>{t.tipo}</div>
                <div style={{ fontSize:11, color:'#8b928b', marginTop:2 }}>{t.fecha}{t.producto ? ` · ${t.producto}` : ''}{t.dosis ? ` · ${t.dosis}` : ''}</div>
                {t.notas && <div style={{ fontSize:12, marginTop:6 }}>{t.notas}</div>}
              </div>
            ))}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:14 }}>
              <button onClick={() => abrirEditar(detalle)} style={secondaryBtn}>Editar lote</button>
              <button onClick={() => eliminarLote(detalle.id)} style={dangerBtn}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={sheet}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:16 }}>{form.id ? 'Editar lote' : 'Nuevo lote de vivero'}</div>
            <Select label="Campo" value={form.campo_id} onChange={v => setForm(f => ({ ...f, campo_id:v }))} options={campos.map(c => [c.id, c.nombre])} />
            <Field label="Fecha de siembra *" type="date" value={form.fecha_siembra} onChange={v => setForm(f => ({ ...f, fecha_siembra:v }))} />
            <Field label="Cultivo/semilla *" value={form.cultivo} onChange={v => setForm(f => ({ ...f, cultivo:v }))} placeholder="Ej: Tomate" />
            <Field label="Variedad" value={form.variedad} onChange={v => setForm(f => ({ ...f, variedad:v }))} placeholder="Ej: Sheila, Nathalie" />
            <Field label="Detalle de semilla" value={form.semilla} onChange={v => setForm(f => ({ ...f, semilla:v }))} placeholder="Marca, lote o procedencia" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <Field label="Cantidad semillas" type="number" value={form.cantidad_semillas} onChange={v => setForm(f => ({ ...f, cantidad_semillas:v }))} />
              <Field label="Bandejas" type="number" value={form.bandejas} onChange={v => setForm(f => ({ ...f, bandejas:v }))} />
            </div>
            <Field label="Sustrato" value={form.sustrato} onChange={v => setForm(f => ({ ...f, sustrato:v }))} placeholder="Ej: turba + perlita" />
            <Field label="Abono incorporado al sustrato" value={form.abono_sustrato} onChange={v => setForm(f => ({ ...f, abono_sustrato:v }))} placeholder="Ej: 15-15-15, humus, compost" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <Field label="Trasplante estimado" type="date" value={form.fecha_estimada_trasplante} onChange={v => setForm(f => ({ ...f, fecha_estimada_trasplante:v }))} />
              <Field label="Trasplante real" type="date" value={form.fecha_real_trasplante} onChange={v => setForm(f => ({ ...f, fecha_real_trasplante:v }))} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <Field label="Germinadas" type="number" value={form.germinadas} onChange={v => setForm(f => ({ ...f, germinadas:v }))} />
              <Field label="Perdidas" type="number" value={form.perdidas} onChange={v => setForm(f => ({ ...f, perdidas:v }))} />
            </div>
            <Select label="Estado" value={form.estado} onChange={v => setForm(f => ({ ...f, estado:v }))} options={estados.map(e => [e, e])} />
            <Field label="Notas" textarea value={form.notas} onChange={v => setForm(f => ({ ...f, notas:v }))} placeholder="Observaciones del lote..." />
            <button onClick={guardarLote} disabled={saving} style={primaryBtn}>{saving ? 'Guardando...' : 'Guardar lote'}</button>
            <button onClick={() => setModal(false)} style={secondaryBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {modalTratamiento && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setModalTratamiento(false)}>
          <div style={sheet}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:16 }}>Nuevo tratamiento</div>
            <Field label="Fecha *" type="date" value={tratForm.fecha} onChange={v => setTratForm(f => ({ ...f, fecha:v }))} />
            <Field label="Tipo *" value={tratForm.tipo} onChange={v => setTratForm(f => ({ ...f, tipo:v }))} placeholder="Ej: fungicida, fertilizante, enraizante" />
            <Field label="Producto" value={tratForm.producto} onChange={v => setTratForm(f => ({ ...f, producto:v }))} />
            <Field label="Dosis" value={tratForm.dosis} onChange={v => setTratForm(f => ({ ...f, dosis:v }))} />
            <Field label="Responsable" value={tratForm.responsable} onChange={v => setTratForm(f => ({ ...f, responsable:v }))} />
            <Field label="Notas" textarea value={tratForm.notas} onChange={v => setTratForm(f => ({ ...f, notas:v }))} />
            <button onClick={guardarTratamiento} disabled={saving} style={primaryBtn}>{saving ? 'Guardando...' : 'Guardar tratamiento'}</button>
            <button onClick={() => setModalTratamiento(false)} style={secondaryBtn}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, dark }) {
  return (
    <div style={{ background: dark ? '#212121' : '#fff', color: dark ? '#fff' : '#0a0a0a', borderRadius:16, padding:'14px 16px' }}>
      <div style={{ fontSize:9, color: dark ? 'rgba(255,255,255,0.55)' : '#9a9a9a', textTransform:'uppercase', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:850 }}>{value}</div>
      <div style={{ fontSize:10, color: dark ? 'rgba(255,255,255,0.55)' : '#9a9a9a', marginTop:3 }}>{sub}</div>
    </div>
  )
}

function Mini({ label, value }) {
  return <div style={{ background:'#f7f7f5', borderRadius:12, padding:9 }}><div style={{ fontSize:9, color:'#9a9a9a' }}>{label}</div><div style={{ fontSize:14, fontWeight:850 }}>{value}</div></div>
}

function Info({ label, value, last }) {
  return <div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'10px 0', borderBottom:last ? 'none' : '1px solid #e8e8e8' }}><span style={{ fontSize:12, color:'#8d938d' }}>{label}</span><strong style={{ fontSize:13, textAlign:'right' }}>{value}</strong></div>
}

function Field({ label, value, onChange, type = 'text', placeholder = '', textarea }) {
  return (
    <label style={{ display:'block' }}>
      <div style={labelStyle}>{label}</div>
      {textarea ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, minHeight:72, resize:'vertical' }} />
      ) : (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </label>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display:'block' }}>
      <div style={labelStyle}>{label}</div>
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">Sin asignar</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

const overlay = { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.42)', zIndex:120, display:'flex', alignItems:'flex-end', justifyContent:'center' }
const sheet = { background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:520, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto', boxSizing:'border-box' }
const inputStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e3e5e1', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }
const labelStyle = { fontSize:10, color:'#8d938d', marginBottom:6 }
const primaryBtn = { width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }
const secondaryBtn = { width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #d9ddd8', color:'#555', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }
const dangerBtn = { ...secondaryBtn, border:'1px solid #ffcccc', color:'#c84040', background:'#fff0f0' }
const closeBtn = { width:36, height:36, borderRadius:12, border:'1px solid #e1e3df', background:'#fff', cursor:'pointer' }
