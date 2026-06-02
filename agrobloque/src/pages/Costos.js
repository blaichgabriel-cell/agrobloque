import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { descargarCsv } from '../lib/exporters'
import { registrarAuditoria } from '../lib/audit'

const TIPOS_COSTO = [
  { key:'insumos',              label:'Insumos',              icon:'ti-seeding',     color:'#212121', bg:'#eeeeee' },
  { key:'combustible',          label:'Combustible',          icon:'ti-flame',       color:'#e07b00', bg:'#fff3e8' },
  { key:'herramientas',         label:'Herramientas',         icon:'ti-tool',        color:'#555',    bg:'#f2f1ef' },
  { key:'electricidad',         label:'Electricidad',         icon:'ti-bolt',        color:'#2980b9', bg:'#eaf4fb' },
  { key:'gastos_administrativos',label:'Gastos administrativos',icon:'ti-file-invoice',color:'#8e44ad',bg:'#f5eefb' },
  { key:'otro',                 label:'Otro',                 icon:'ti-plus-circle', color:'#888',    bg:'#f2f1ef' },
]

const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

export default function Costos({ campoActivo, isGuest = false }) {
  const [campos, setCampos] = useState([])
  const [campoSel, setCampoSel] = useState(null)
  const [bloques, setBloques] = useState([])
  const [costosAuto, setCostosAuto] = useState({ agroquimicos: 0, jornales: 0 })
  const [costosManuales, setCostosManuales] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ tipo:'insumos', descripcion:'', monto:'', fecha: new Date().toISOString().split('T')[0], bloque_id:'' })
  const [saving, setSaving] = useState(false)
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo) setCampoSel(campoActivo) }, [campoActivo])
  useEffect(() => { if (campoSel) { fetchBloques(); fetchCostos() } }, [campoSel, periodo])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    const lista = data || []
    setCampos(lista)
    if (!campoSel && lista.length > 0) {
      const campoGuardado = typeof window !== 'undefined' ? window.localStorage.getItem('agrobloque-campo-activo') : null
      setCampoSel(campoActivo || lista.find(c => c.id === campoGuardado) || lista[0])
    }
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

  const formVacio = () => ({ tipo:'insumos', descripcion:'', monto:'', fecha: new Date().toISOString().split('T')[0], bloque_id:'' })

  const abrirNuevo = () => {
    setForm(formVacio())
    setModal(true)
  }

  const abrirEditar = (costo) => {
    setForm({
      id: costo.id,
      tipo: costo.tipo || 'insumos',
      descripcion: costo.descripcion || '',
      monto: costo.monto ? fmtGs(costo.monto) : '',
      fecha: costo.fecha || new Date().toISOString().split('T')[0],
      bloque_id: costo.bloque_id || '',
    })
    setModal(true)
  }

  const cerrarModal = () => {
    setModal(false)
    setForm(formVacio())
  }

  const fetchCostos = async () => {
    const desde = getFechaDesde()
    const { data: fumis } = await supabase.from('fumigaciones')
      .select('fumigacion_productos(dosis, descuento_stock, productos(precio_unitario))')
      .eq('campo_id', campoSel.id).gte('fecha', desde)
    let totalAgro = 0
    fumis?.forEach(f => f.fumigacion_productos?.forEach(fp => {
        totalAgro += (Number(fp.productos?.precio_unitario) || 0) * (Number(fp.descuento_stock ?? parseFloat(fp.dosis)) || 0)
    }))
    const { data: asist } = isGuest
      ? { data: [] }
      : await supabase.from('asistencia')
        .select('monto, operarios(campo_id)').gte('fecha', desde)
    let totalJornales = 0
    asist?.forEach(a => { if (a.operarios?.campo_id === campoSel.id) totalJornales += Number(a.monto) || 0 })
    setCostosAuto({ agroquimicos: totalAgro, jornales: totalJornales })
    const { data: manuales } = await supabase.from('costos')
      .select('*, bloques(codigo)').eq('campo_id', campoSel.id).gte('fecha', desde).order('fecha', { ascending: false })
    setCostosManuales(manuales || [])
  }

  const guardar = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    const payload = {
      tipo: form.tipo, descripcion: form.descripcion || null,
      monto: parsearGs(form.monto), fecha: form.fecha,
      campo_id: campoSel?.id || null, bloque_id: form.bloque_id || null
    }
    if (form.id) await supabase.from('costos').update(payload).eq('id', form.id)
    else await supabase.from('costos').insert(payload)
    await registrarAuditoria({
      accion: form.id ? 'Edito costo manual' : 'Registro costo manual',
      modulo: 'Costos',
      tabla: 'costos',
      registroId: form.id || '',
      detalle: `${payload.descripcion || payload.tipo} - Gs. ${payload.monto}`,
    })
    await fetchCostos(); setSaving(false); cerrarModal()
  }

  const eliminar = async (id) => {
    await supabase.from('costos').delete().eq('id', id)
    await registrarAuditoria({ accion:'Elimino costo manual', modulo:'Costos', tabla:'costos', registroId:id })
    fetchCostos()
  }

  const totalManuales = costosManuales.reduce((s, c) => s + Number(c.monto), 0)
  const totalGeneral = costosAuto.agroquimicos + costosAuto.jornales + totalManuales

  const exportarCostos = () => {
    const rows = costosManuales.map(c => ({
      Fecha: c.fecha,
      Tipo: TIPOS_COSTO.find(t => t.key === c.tipo)?.label || c.tipo,
      Descripcion: c.descripcion || '',
      Bloque: c.bloques?.codigo || '',
      Monto: Number(c.monto) || 0,
    }))
    descargarCsv('costos-manuales', ['Fecha', 'Tipo', 'Descripcion', 'Bloque', 'Monto'], rows)
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Gastos</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Costos</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportarCostos} style={{ width:40, height:40, borderRadius:14, background:'#fff', border:'1px solid #e8e6e2', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <i className="ti ti-download" style={{ color:'#212121', fontSize:19 }} aria-hidden="true"></i>
            </button>
            {!isGuest && (
              <button onClick={abrirNuevo} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
              </button>
            )}
          </div>
        </div>
        {campos.length > 1 && (
          <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:12 }}>
            {campos.map(c => (
              <button key={c.id} onClick={() => setCampoSel(c)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoSel?.id===c.id ? '#212121' : 'transparent', color: campoSel?.id===c.id ? '#fff' : '#9a9a9a' }}>{c.nombre}</button>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4 }}>
          {[['mes','Este mes'],['total','Historico']].map(([k,v]) => (
            <button key={k} onClick={() => setPeriodo(k)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: periodo===k ? '#fff' : 'transparent', color: periodo===k ? '#0a0a0a' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'8px 14px 100px' }}>
        <div style={{ background:'#212121', borderRadius:20, padding:'18px 20px', marginBottom:10 }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', marginBottom:6 }}>Total costos · {periodo === 'mes' ? 'este mes' : 'historico'}</div>
          <div style={{ fontSize:36, fontWeight:800, color:'#fff', letterSpacing:-1, lineHeight:1 }}>Gs. {fmtGs(totalGeneral)}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:4 }}>{campoSel?.nombre}</div>
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:12, textTransform:'uppercase' }}>Calculados automaticamente</div>
          {[
            { icon:'ti-spray', color:'#e07b00', bg:'#fff3e8', label:'Agroquimicos', sub:'Desde fumigaciones registradas', val: costosAuto.agroquimicos },
            ...(!isGuest ? [{ icon:'ti-users', color:'#212121', bg:'#eeeeee', label:'Jornales', sub:'Desde asistencia registrada', val: costosAuto.jornales }] : []),
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom: i===0 ? '1px solid #f2f1ef' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:item.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize:15, color:item.color }} aria-hidden="true"></i>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>{item.label}</div>
                  <div style={{ fontSize:10, color:'#9a9a9a' }}>{item.sub}</div>
                </div>
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{item.val > 0 ? `Gs. ${fmtGs(item.val)}` : '—'}</div>
            </div>
          ))}
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', textTransform:'uppercase' }}>Costos manuales</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>Gs. {fmtGs(totalManuales)}</div>
          </div>
          {costosManuales.length === 0 ? (
            <div style={{ fontSize:12, color:'#b0b0b0', textAlign:'center', padding:'12px 0' }}>Sin costos manuales registrados</div>
          ) : costosManuales.map(c => {
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
                {!isGuest && (
                  <>
                    <button onClick={() => abrirEditar(c)} style={{ width:28, height:28, borderRadius:8, border:'1px solid #e8e6e2', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                      <i className="ti ti-pencil" style={{ fontSize:12, color:'#555' }} aria-hidden="true"></i>
                    </button>
                    <button onClick={() => eliminar(c.id)} style={{ width:28, height:28, borderRadius:8, border:'1px solid #ffcccc', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                      <i className="ti ti-x" style={{ fontSize:12, color:'#c84040' }} aria-hidden="true"></i>
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <NotasPanel modulo="costos" titulo="Blog de notas de costos" />
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && cerrarModal()}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id ? 'Editar costo' : 'Nuevo costo'}</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:8 }}>Tipo</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:14 }}>
              {TIPOS_COSTO.map(t => (
                <button key={t.key} onClick={() => setForm(f => ({...f, tipo:t.key}))} style={{ padding:'10px 6px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:10, fontWeight:500, cursor:'pointer', background: form.tipo===t.key ? '#212121' : '#fff', color: form.tipo===t.key ? '#fff' : '#555', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize:16 }} aria-hidden="true"></i>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Monto (Gs.) *</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }}
              type="text" inputMode="numeric" value={form.monto}
              onChange={e => { const r=e.target.value.replace(/[^0-9]/g,''); setForm(f=>({...f,monto:r?parseInt(r,10).toLocaleString('es-PY'):''})) }}
              placeholder="Ej: 150.000"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripcion (opcional)</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }}
              type="text" value={form.descripcion} onChange={e => setForm(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Compra de plantines"/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }}
              type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloque (opcional)</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16 }}
              value={form.bloque_id} onChange={e => setForm(f=>({...f,bloque_id:e.target.value}))}>
              <option value="">Sin bloque especifico</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
            </select>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Guardar costo'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={cerrarModal}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
