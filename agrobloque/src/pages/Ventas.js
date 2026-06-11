import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const parsearKg = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? 0 : n }
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const fmtKg = (n) => {
  const num = Number(n) || 0
  return num % 1 === 0
    ? num.toLocaleString('es-PY')
    : num.toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}
const fechaLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const estadoLabel = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  parcial: 'Parcial',
}

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>Eliminar venta</div>
        <div style={{ fontSize:13, color:'#8b928b', textAlign:'center', marginBottom:20 }}>Esta accion no se puede deshacer.</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#777', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalle({ venta, onClose, onEdit, onDelete }) {
  const total = Number(venta.total) || (Number(venta.kg_total) || 0) * (Number(venta.precio_kg) || 0)
  const saldo = Math.max(0, total - (Number(venta.monto_cobrado) || 0))
  const item = { display:'flex', justifyContent:'space-between', gap:16, padding:'11px 0', borderBottom:'1px solid #eeeeee' }
  const label = { fontSize:12, color:'#8d938d' }
  const value = { fontSize:13, fontWeight:750, color:'#111', textAlign:'right' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:150, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:500, padding:'22px 20px 34px', maxHeight:'88vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:12, color:'#8d938d', marginBottom:4 }}>Detalle de venta</div>
            <div style={{ fontSize:22, fontWeight:850, color:'#0a0a0a' }}>{venta.producto || 'Producto'}</div>
            <div style={{ fontSize:12, color:'#8d938d', marginTop:4 }}>{venta.compradores?.nombre || 'Sin comprador'} - {venta.fecha}</div>
          </div>
          <button onClick={onClose} style={{ width:36, height:36, borderRadius:12, border:'1px solid #ececec', background:'#fff', cursor:'pointer' }}>
            <i className="ti ti-x" style={{ fontSize:18 }} aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
          <div style={{ background:'#212121', borderRadius:16, padding:'14px 15px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', marginBottom:4 }}>Total venta</div>
            <div style={{ fontSize:21, color:'#fff', fontWeight:850 }}>Gs. {fmtGs(total)}</div>
          </div>
          <div style={{ background: saldo > 0 ? '#fff3e3' : '#e8f5e5', borderRadius:16, padding:'14px 15px' }}>
            <div style={{ fontSize:10, color:'#6d746e', marginBottom:4 }}>Estado</div>
            <div style={{ fontSize:18, color: saldo > 0 ? '#bd640b' : '#176a25', fontWeight:850 }}>{estadoLabel[venta.estado_cobro] || 'Pagado'}</div>
          </div>
        </div>

        <div style={{ background:'#fafafa', borderRadius:16, padding:'4px 14px', marginBottom:14 }}>
          <div style={item}><span style={label}>Kilos vendidos</span><span style={value}>{fmtKg(venta.kg_total)} kg</span></div>
          <div style={item}><span style={label}>Precio por kg</span><span style={value}>Gs. {fmtGs(venta.precio_kg)}</span></div>
          <div style={item}><span style={label}>Cobrado</span><span style={value}>Gs. {fmtGs(venta.monto_cobrado)}</span></div>
          <div style={item}><span style={label}>Saldo</span><span style={value}>{saldo > 0 ? `Gs. ${fmtGs(saldo)}` : '-'}</span></div>
          <div style={item}><span style={label}>Forma de pago</span><span style={value}>{venta.forma_pago || '-'}</span></div>
          <div style={{ ...item, borderBottom:'none' }}><span style={label}>Origen</span><span style={value}>{venta.bloques?.codigo ? `Bloque ${venta.bloques.codigo}` : 'Sin bloque asignado'}</span></div>
        </div>

        {venta.notas && <div style={{ background:'#f2f1ef', borderRadius:14, padding:'12px 14px', fontSize:13, color:'#4d544e', marginBottom:14 }}>{venta.notas}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={onEdit} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #d9ddd8', background:'#fff', color:'#212121', fontSize:13, fontWeight:700, cursor:'pointer' }}>Editar venta</button>
          <button onClick={onDelete} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'#fff0f0', color:'#c84040', fontSize:13, fontWeight:700, cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function Ventas() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [ventas, setVentas] = useState([])
  const [compradores, setCompradores] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [campoFiltro, setCampoFiltro] = useState('')
  const [modoMultiple, setModoMultiple] = useState(false)
  const [lineasVenta, setLineasVenta] = useState([])
  const [form, setForm] = useState({
    fecha: fechaLocal(),
    comprador_id: '',
    producto: '',
    bloque_id: '',
    kg_total: '',
    precio_kg: '',
    estado_cobro: 'pagado',
    monto_cobrado: '',
    forma_pago: 'Efectivo',
    notas: '',
  })

  useEffect(() => { fetchInicial() }, [])
  useEffect(() => { if (campoFiltro) fetchBloques(campoFiltro) }, [campoFiltro])

  const fetchInicial = async () => {
    await Promise.all([fetchVentas(), fetchCompradores(), fetchCampos()])
  }

  const fetchVentas = async () => {
    const { data, error } = await supabase
      .from('ventas')
      .select('*, compradores(nombre), bloques(codigo, campos(nombre))')
      .order('fecha', { ascending: false })
      .limit(200)
    if (error) {
      const msg = String(error.message || '').toLowerCase()
      setError(msg.includes('ventas') || msg.includes('relation')
        ? 'Falta crear la tabla ventas en Supabase. Ejecuta el SQL que te deje preparado.'
        : 'Error al cargar ventas: ' + error.message)
      setVentas([])
      return
    }
    setError('')
    setVentas(data || [])
  }

  const fetchCompradores = async () => {
    const { data } = await supabase.from('compradores').select('*').order('nombre')
    setCompradores(data || [])
  }

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setCampoFiltro(data[0].id)
  }

  const fetchBloques = async (campo_id) => {
    const { data } = await supabase
      .from('bloques')
      .select('id, codigo, plantaciones(cultivos(nombre), activa, created_at, fecha_siembra)')
      .eq('campo_id', campo_id)
      .order('codigo')
    setBloques(data || [])
  }

  const getCultivoBloque = (bloque) => {
    const plantacion = (bloque?.plantaciones || [])
      .filter(p => p.activa)
      .sort((a, b) => String(b.fecha_siembra || b.created_at || '').localeCompare(String(a.fecha_siembra || a.created_at || '')))[0]
    return plantacion?.cultivos?.nombre || ''
  }

  const crearLineaVenta = () => ({ producto:'', bloque_id:'', kg_total:'', precio_kg:'', notas:'' })
  const limpiarForm = () => {
    setForm({
      fecha: fechaLocal(),
      comprador_id: '',
      producto: '',
      bloque_id: '',
      kg_total: '',
      precio_kg: '',
      estado_cobro: 'pagado',
      monto_cobrado: '',
      forma_pago: 'Efectivo',
      notas: '',
    })
    setLineasVenta([crearLineaVenta(), crearLineaVenta()])
  }

  const abrirNueva = () => {
    limpiarForm()
    setModoMultiple(false)
    setModal(true)
  }

  const abrirEditar = (venta) => {
    setForm({
      id: venta.id,
      fecha: venta.fecha || fechaLocal(),
      comprador_id: venta.comprador_id || '',
      producto: venta.producto || '',
      bloque_id: venta.bloque_id || '',
      kg_total: venta.kg_total || '',
      precio_kg: venta.precio_kg ? Number(venta.precio_kg).toLocaleString('es-PY') : '',
      estado_cobro: venta.estado_cobro || 'pagado',
      monto_cobrado: venta.monto_cobrado ? Number(venta.monto_cobrado).toLocaleString('es-PY') : '',
      forma_pago: venta.forma_pago || 'Efectivo',
      notas: venta.notas || '',
    })
    setModoMultiple(false)
    setDetalle(null)
    setModal(true)
  }

  const actualizarLineaVenta = (idx, campo, valor) => {
    setLineasVenta(prev => prev.map((linea, i) => i === idx ? { ...linea, [campo]: valor } : linea))
  }

  const agregarLineaVenta = () => setLineasVenta(prev => [...prev, crearLineaVenta()])
  const quitarLineaVenta = (idx) => setLineasVenta(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const guardarMultiple = async () => {
    if (!form.fecha || !form.comprador_id) {
      setError('Carga fecha y comprador.')
      return
    }

    const lineas = lineasVenta
      .map(linea => {
        const kg = parsearKg(linea.kg_total)
        const precio = parsearGs(linea.precio_kg)
        const total = kg * precio
        return {
          ...linea,
          producto: String(linea.producto || '').trim(),
          kg,
          precio,
          total,
        }
      })
      .filter(linea => linea.producto && linea.kg > 0 && linea.precio > 0)

    if (lineas.length === 0) {
      setError('Carga al menos un producto con kilos y precio.')
      return
    }

    const totalVenta = lineas.reduce((s, linea) => s + linea.total, 0)
    const cobradoTotal = form.estado_cobro === 'pagado'
      ? totalVenta
      : form.estado_cobro === 'pendiente'
        ? 0
        : Math.min(parsearGs(form.monto_cobrado), totalVenta)

    setSaving(true)
    setError('')
    try {
      const payload = lineas.map(linea => {
        const proporcion = totalVenta > 0 ? linea.total / totalVenta : 0
        const montoCobrado = form.estado_cobro === 'parcial'
          ? Math.round(cobradoTotal * proporcion)
          : form.estado_cobro === 'pagado'
            ? linea.total
            : 0
        return {
          fecha: form.fecha,
          comprador_id: form.comprador_id,
          producto: linea.producto,
          bloque_id: linea.bloque_id || null,
          kg_total: linea.kg,
          precio_kg: linea.precio,
          total: linea.total,
          estado_cobro: form.estado_cobro,
          monto_cobrado: montoCobrado,
          forma_pago: form.forma_pago || null,
          notas: linea.notas || form.notas || null,
        }
      })

      const { error } = await supabase.from('ventas').insert(payload)
      if (error) throw error
      await registrarAuditoria({
        accion: 'Registro venta multiple',
        modulo: 'Ventas',
        tabla: 'ventas',
        registroId: '',
        detalle: `${payload.length} productos - Gs. ${totalVenta}`,
      })
      await fetchVentas()
      setModal(false)
      setModoMultiple(false)
      limpiarForm()
    } catch (e) {
      setError('Error al guardar venta multiple: ' + e.message)
    }
    setSaving(false)
  }

  const guardar = async () => {
    if (modoMultiple && !form.id) {
      await guardarMultiple()
      return
    }
    const kg = parsearKg(form.kg_total)
    const precio = parsearGs(form.precio_kg)
    const total = kg * precio
    const montoCobrado = form.estado_cobro === 'pagado'
      ? total
      : form.estado_cobro === 'pendiente'
        ? 0
        : parsearGs(form.monto_cobrado)

    if (!form.fecha || !form.comprador_id || !form.producto.trim() || kg <= 0 || precio <= 0) {
      setError('Carga fecha, comprador, producto, kilos y precio.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        fecha: form.fecha,
        comprador_id: form.comprador_id,
        producto: form.producto.trim(),
        bloque_id: form.bloque_id || null,
        kg_total: kg,
        precio_kg: precio,
        total,
        estado_cobro: form.estado_cobro,
        monto_cobrado: montoCobrado,
        forma_pago: form.forma_pago || null,
        notas: form.notas || null,
      }
      const { error } = form.id
        ? await supabase.from('ventas').update(payload).eq('id', form.id)
        : await supabase.from('ventas').insert(payload)
      if (error) throw error
      await registrarAuditoria({
        accion: form.id ? 'Edito venta' : 'Registro venta',
        modulo: 'Ventas',
        tabla: 'ventas',
        registroId: form.id || '',
        detalle: `${payload.producto} - ${payload.kg_total} kg - Gs. ${payload.total}`,
      })
      await fetchVentas()
      setModal(false)
      limpiarForm()
    } catch (e) {
      setError('Error al guardar venta: ' + e.message)
    }
    setSaving(false)
  }

  const eliminar = (id) => {
    setConfirmar({ fn: async () => {
      await supabase.from('ventas').delete().eq('id', id)
      await registrarAuditoria({ accion:'Elimino venta', modulo:'Ventas', tabla:'ventas', registroId:id })
      setConfirmar(null)
      setDetalle(null)
      fetchVentas()
    }})
  }

  const totalVendido = ventas.reduce((s, v) => s + (Number(v.total) || (Number(v.kg_total) || 0) * (Number(v.precio_kg) || 0)), 0)
  const totalCobrado = ventas.reduce((s, v) => s + (Number(v.monto_cobrado) || 0), 0)
  const totalPendiente = Math.max(0, totalVendido - totalCobrado)
  const kgVendidos = ventas.reduce((s, v) => s + (Number(v.kg_total) || 0), 0)
  const ventaTotalForm = parsearKg(form.kg_total) * parsearGs(form.precio_kg)
  const ventaTotalMultiple = lineasVenta.reduce((s, linea) => s + (parsearKg(linea.kg_total) * parsearGs(linea.precio_kg)), 0)
  const bloqueSeleccionado = bloques.find(b => b.id === form.bloque_id)
  const cultivoSugerido = getCultivoBloque(bloqueSeleccionado)
  const inp = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }
  const label = { fontSize:10, color:'#8b928b', marginBottom:6, display:'block', fontWeight:750 }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      {detalle && <ModalDetalle venta={detalle} onClose={() => setDetalle(null)} onEdit={() => abrirEditar(detalle)} onDelete={() => eliminar(detalle.id)} />}

      <div style={{ background:'#f2f1ef', padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Comercial</div>
            <div style={{ fontSize:24, fontWeight:800, color:'#0a0a0a', letterSpacing:-.5 }}>Ventas</div>
          </div>
          <button onClick={abrirNueva} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        {error && <div style={{ background:'#fff3e3', color:'#8a4d00', fontSize:12, padding:'9px 12px', borderRadius:10, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : '1fr 1fr', gap: isDesktop ? 14 : 8 }}>
          <Stat dark title="Vendido" value={`Gs. ${fmtGs(totalVendido)}`} sub={`${fmtKg(kgVendidos)} kg`} />
          <Stat title="Cobrado" value={`Gs. ${fmtGs(totalCobrado)}`} sub="dinero recibido" />
          <Stat title="Pendiente" value={totalPendiente > 0 ? `Gs. ${fmtGs(totalPendiente)}` : '-'} sub="cuentas por cobrar" warn={totalPendiente > 0} />
          <Stat title="Operaciones" value={ventas.length} sub="ventas registradas" />
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        {ventas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13, background:'#fff', borderRadius:20 }}>
            Sin ventas registradas.
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {ventas.map(v => {
              const total = Number(v.total) || (Number(v.kg_total) || 0) * (Number(v.precio_kg) || 0)
              const saldo = Math.max(0, total - (Number(v.monto_cobrado) || 0))
              return (
                <div key={v.id} onClick={() => setDetalle(v)} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, cursor:'pointer', boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:'#0a0a0a' }}>{v.producto}</div>
                      <div style={{ fontSize:12, color:'#176a25', fontWeight:750, marginTop:2 }}>{v.compradores?.nombre || 'Sin comprador'}</div>
                      <div style={{ fontSize:11, color:'#8b928b', marginTop:2 }}>{v.bloques?.codigo ? `Bloque ${v.bloques.codigo} - ` : ''}{v.fecha}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:19, fontWeight:850, color:'#0a0a0a' }}>Gs. {fmtGs(total)}</div>
                      <div style={{ fontSize:11, color:'#555', fontWeight:700 }}>{fmtKg(v.kg_total)} kg</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:800, background: saldo > 0 ? '#fff3e3' : '#e8f5e5', color: saldo > 0 ? '#bd640b' : '#176a25' }}>{estadoLabel[v.estado_cobro] || 'Pagado'}</span>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, background:'#f2f1ef', color:'#555' }}>Gs. {fmtGs(v.precio_kg)}/kg</span>
                    {saldo > 0 && <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, background:'#fff0f0', color:'#c84040' }}>Debe Gs. {fmtGs(saldo)}</span>}
                  </div>
                  {v.notas && <div style={{ fontSize:11, color:'#8b928b', padding:'7px 10px', background:'#f2f1ef', borderRadius:8, marginBottom:8 }}>{v.notas}</div>}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'#777' }}>Tocar para ver detalle</span>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={(e) => { e.stopPropagation(); abrirEditar(v) }} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }}>Editar</button>
                      <button onClick={(e) => { e.stopPropagation(); eliminar(v.id) }} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <NotasPanel modulo="ventas" titulo="Blog de notas de ventas" />
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:500, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#0a0a0a', marginBottom:20 }}>{form.id ? 'Editar venta' : 'Registrar venta'}</div>
            {error && <div style={{ background:'#fff3e3', color:'#8a4d00', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}

            {!form.id && (
              <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:14 }}>
                <button type="button" onClick={() => setModoMultiple(false)} style={{ flex:1, padding:9, borderRadius:10, border:'none', cursor:'pointer', background: !modoMultiple ? '#212121' : 'transparent', color: !modoMultiple ? '#fff' : '#777', fontSize:12, fontWeight:800 }}>
                  Un producto
                </button>
                <button type="button" onClick={() => setModoMultiple(true)} style={{ flex:1, padding:9, borderRadius:10, border:'none', cursor:'pointer', background: modoMultiple ? '#212121' : 'transparent', color: modoMultiple ? '#fff' : '#777', fontSize:12, fontWeight:800 }}>
                  Varios productos
                </button>
              </div>
            )}

            <label style={label}>Fecha *</label>
            <input style={inp} type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha:e.target.value }))} />

            <label style={label}>Comprador *</label>
            <select style={inp} value={form.comprador_id} onChange={e => setForm(f => ({ ...f, comprador_id:e.target.value }))}>
              <option value="">Selecciona comprador...</option>
              {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            {(!modoMultiple || form.id) ? (
              <>
                <label style={label}>Producto *</label>
                <input style={inp} value={form.producto} onChange={e => setForm(f => ({ ...f, producto:e.target.value }))} placeholder="Ej: Tomate, pepino, morron" />

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={label}>Kilos *</label>
                    <input style={inp} type="text" inputMode="decimal" value={form.kg_total} onChange={e => setForm(f => ({ ...f, kg_total:e.target.value }))} placeholder="Ej: 150" />
                  </div>
                  <div>
                    <label style={label}>Precio por kg *</label>
                    <input style={inp} type="text" inputMode="numeric" value={form.precio_kg} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setForm(f => ({ ...f, precio_kg:r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 5.000" />
                  </div>
                </div>

                <label style={label}>Campo/bloque origen (opcional)</label>
                <select style={inp} value={campoFiltro} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({ ...f, bloque_id:'' })) }}>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select style={inp} value={form.bloque_id} onChange={e => {
                  const bloque = bloques.find(b => b.id === e.target.value)
                  const cultivo = getCultivoBloque(bloque)
                  setForm(f => ({ ...f, bloque_id:e.target.value, producto: f.producto || cultivo }))
                }}>
                  <option value="">Venta sin bloque especifico</option>
                  {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                </select>
                {cultivoSugerido && <div style={{ background:'#e8f5e5', color:'#176a25', borderRadius:12, padding:'9px 12px', fontSize:12, fontWeight:750, marginBottom:12 }}>Cultivo sugerido: {cultivoSugerido}</div>}
              </>
            ) : (
              <>
                <label style={label}>Campo para sugerir bloques</label>
                <select style={inp} value={campoFiltro} onChange={e => setCampoFiltro(e.target.value)}>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <div style={{ display:'grid', gap:10, marginBottom:12 }}>
                  {lineasVenta.map((linea, idx) => {
                    const bloqueLinea = bloques.find(b => b.id === linea.bloque_id)
                    const cultivoLinea = getCultivoBloque(bloqueLinea)
                    const totalLinea = parsearKg(linea.kg_total) * parsearGs(linea.precio_kg)
                    return (
                      <div key={idx} style={{ background:'#fff', border:'1px solid #e4e6e2', borderRadius:16, padding:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                          <strong style={{ fontSize:13 }}>Producto {idx + 1}</strong>
                          {lineasVenta.length > 1 && (
                            <button type="button" onClick={() => quitarLineaVenta(idx)} style={{ border:'1px solid #ffcccc', background:'#fff', color:'#c84040', borderRadius:10, padding:'5px 9px', fontSize:11, cursor:'pointer' }}>Quitar</button>
                          )}
                        </div>
                        <input style={inp} value={linea.producto} onChange={e => actualizarLineaVenta(idx, 'producto', e.target.value)} placeholder="Producto"/>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                          <input style={inp} type="text" inputMode="decimal" value={linea.kg_total} onChange={e => actualizarLineaVenta(idx, 'kg_total', e.target.value)} placeholder="Kg"/>
                          <input style={inp} type="text" inputMode="numeric" value={linea.precio_kg} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); actualizarLineaVenta(idx, 'precio_kg', r ? parseInt(r, 10).toLocaleString('es-PY') : '') }} placeholder="Gs/kg"/>
                        </div>
                        <select style={inp} value={linea.bloque_id} onChange={e => {
                          const bloque = bloques.find(b => b.id === e.target.value)
                          const cultivo = getCultivoBloque(bloque)
                          actualizarLineaVenta(idx, 'bloque_id', e.target.value)
                          if (!linea.producto && cultivo) actualizarLineaVenta(idx, 'producto', cultivo)
                        }}>
                          <option value="">Sin bloque especifico</option>
                          {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                        </select>
                        {cultivoLinea && <div style={{ background:'#e8f5e5', color:'#176a25', borderRadius:10, padding:'7px 10px', fontSize:11, fontWeight:750, margin:'-4px 0 10px' }}>{cultivoLinea}</div>}
                        <input style={{ ...inp, marginBottom:0 }} value={linea.notas} onChange={e => actualizarLineaVenta(idx, 'notas', e.target.value)} placeholder="Nota opcional"/>
                        {totalLinea > 0 && <div style={{ fontSize:11, color:'#687068', fontWeight:800, marginTop:8 }}>Subtotal: Gs. {fmtGs(totalLinea)}</div>}
                      </div>
                    )
                  })}
                </div>
                <button type="button" onClick={agregarLineaVenta} style={{ width:'100%', padding:12, borderRadius:14, border:'1px dashed #bfc6bf', background:'#fff', fontSize:13, fontWeight:800, color:'#176a25', cursor:'pointer', marginBottom:12 }}>
                  + Agregar otro producto
                </button>
              </>
            )}

            <label style={label}>Estado de cobro</label>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {['pagado', 'pendiente', 'parcial'].map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, estado_cobro:e, monto_cobrado: e === 'parcial' ? f.monto_cobrado : '' }))} style={{ flex:1, padding:'9px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:12, fontWeight:750, cursor:'pointer', background: form.estado_cobro === e ? '#212121' : '#fff', color: form.estado_cobro === e ? '#fff' : '#555' }}>{estadoLabel[e]}</button>
              ))}
            </div>

            {form.estado_cobro === 'parcial' && (
              <>
                <label style={label}>Monto cobrado</label>
                <input style={inp} type="text" inputMode="numeric" value={form.monto_cobrado} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setForm(f => ({ ...f, monto_cobrado:r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 500.000" />
              </>
            )}

            <label style={label}>Forma de pago</label>
            <input style={inp} value={form.forma_pago} onChange={e => setForm(f => ({ ...f, forma_pago:e.target.value }))} placeholder="Efectivo, transferencia, cheque..." />

            <label style={label}>Notas</label>
            <textarea style={{ ...inp, minHeight:64, resize:'vertical' }} value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones..." />

            {((!modoMultiple || form.id) ? ventaTotalForm : ventaTotalMultiple) > 0 && (
              <div style={{ background:'#eeeeee', borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'#212121' }}>Total venta</span>
                <span style={{ fontSize:14, fontWeight:800, color:'#212121' }}>Gs. {fmtGs((!modoMultiple || form.id) ? ventaTotalForm : ventaTotalMultiple)}</span>
              </div>
            )}

            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:800, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : modoMultiple && !form.id ? 'Guardar venta con productos' : 'Guardar venta'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#8b928b', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ title, value, sub, dark, warn }) {
  return (
    <div style={{ background: dark ? '#212121' : '#fff', borderRadius:16, padding:'14px 16px', border: dark ? 'none' : '1px solid #e8ece8' }}>
      <div style={{ fontSize:9, color: dark ? 'rgba(255,255,255,0.5)' : '#8b928b', textTransform:'uppercase', marginBottom:4 }}>{title}</div>
      <div style={{ fontSize: dark ? 22 : 18, fontWeight:850, color: dark ? '#fff' : warn ? '#bd640b' : '#212121', letterSpacing:-.5, lineHeight:1.1 }}>{value}</div>
      <div style={{ fontSize:10, color: dark ? 'rgba(255,255,255,0.5)' : '#8b928b', marginTop:3 }}>{sub}</div>
    </div>
  )
}
