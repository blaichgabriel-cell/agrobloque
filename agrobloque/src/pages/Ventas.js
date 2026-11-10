import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { useCan } from '../lib/RoleContext'

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
    <div className="ui-8bd58b">
      <div className="ui-585654">
        <div className="ui-cb8bcf">Eliminar venta</div>
        <div className="ui-01159a">Esta acción no se puede deshacer.</div>
        <div className="ui-9c6869">
          <button className="ui-077b36" onClick={onCancel}>Cancelar</button>
          <button className="ui-fbf0a5" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalle({ venta, onClose, onEdit, onDelete }) {
  const can = useCan('ventas')
  const total = Number(venta.total) || (Number(venta.kg_total) || 0) * (Number(venta.precio_kg) || 0)
  const saldo = Math.max(0, total - (Number(venta.monto_cobrado) || 0))
  const item = { display:'flex', justifyContent:'space-between', gap:16, padding:'11px 0', borderBottom:'1px solid #eeeeee' }
  const label = { fontSize:12, color:'#8d938d' }
  const value = { fontSize:13, fontWeight:700, color:'#111', textAlign:'right' }

  return (
    <div className="ui-74ea9b" style={{ alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ui-759bab" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
        <div className="ui-65048f">
          <div>
            <div className="ui-de5560">Detalle de venta</div>
            <div className="ui-882dd8">{venta.producto || 'Producto'}</div>
            <div className="ui-1301e2">{venta.compradores?.nombre || 'Sin comprador'} - {venta.fecha}</div>
          </div>
          <button className="ui-f730c6 ag-close-btn" aria-label="Cerrar" onClick={onClose}>
            <i className="ti ti-x ui-bf83cf" aria-hidden="true"></i>
          </button>
        </div>

        <div className="ui-1a76a0">
          <div className="ui-76327e">
            <div className="ui-a3c58b">Total venta</div>
            <div className="ui-a32197">Gs. {fmtGs(total)}</div>
          </div>
          <div className="ui-bc331e" style={{ background: saldo > 0 ? '#fff3e3' : '#e8f5e5' }}>
            <div className="ui-f31d5c">Estado</div>
            <div className="ui-90ec18" style={{ color: saldo > 0 ? '#bd640b' : '#176a25' }}>{estadoLabel[venta.estado_cobro] || 'Pagado'}</div>
          </div>
        </div>

        <div className="ui-be8685">
          <div style={item}><span style={label}>Kilos vendidos</span><span style={value}>{fmtKg(venta.kg_total)} kg</span></div>
          <div style={item}><span style={label}>Precio por kg</span><span style={value}>Gs. {fmtGs(venta.precio_kg)}</span></div>
          <div style={item}><span style={label}>Cobrado</span><span style={value}>Gs. {fmtGs(venta.monto_cobrado)}</span></div>
          <div style={item}><span style={label}>Saldo</span><span style={value}>{saldo > 0 ? `Gs. ${fmtGs(saldo)}` : '-'}</span></div>
          <div style={item}><span style={label}>Forma de pago</span><span style={value}>{venta.forma_pago || '-'}</span></div>
          <div className="ui-310b5d" style={{ ...item }}><span style={label}>Origen</span><span style={value}>{venta.bloques?.codigo ? `Bloque ${venta.bloques.codigo}` : 'Sin bloque asignado'}</span></div>
        </div>

        {venta.notas && <div className="ui-a5941a">{venta.notas}</div>}

        <div className="ui-f56ef1">
          {can.edit && <button className="ui-356937" onClick={onEdit}>Editar venta</button>}
          {can.delete && <button className="ui-690a60" onClick={onDelete}>Eliminar</button>}
        </div>
      </div>
    </div>
  )
}

function ModalDetalleGrupo({ grupo, onClose, onEdit, onDelete }) {
  const can = useCan('ventas')
  const saldo = Math.max(0, grupo.total - grupo.cobrado)

  return (
    <div className="ui-74ea9b" style={{ alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ui-f81175" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
        <div className="ui-65048f">
          <div>
            <div className="ui-de5560">Detalle de venta agrupada</div>
            <div className="ui-882dd8">{grupo.comprador}</div>
            <div className="ui-1301e2">{grupo.fecha} - {grupo.items.length} productos</div>
          </div>
          <button className="ui-f730c6 ag-close-btn" aria-label="Cerrar" onClick={onClose}>
            <i className="ti ti-x ui-bf83cf" aria-hidden="true"></i>
          </button>
        </div>

        <div className="ui-1a76a0">
          <div className="ui-76327e">
            <div className="ui-a3c58b">Total venta</div>
            <div className="ui-a32197">Gs. {fmtGs(grupo.total)}</div>
          </div>
          <div className="ui-bc331e" style={{ background: saldo > 0 ? '#fff3e3' : '#e8f5e5' }}>
            <div className="ui-f31d5c">Cobro</div>
            <div className="ui-90ec18" style={{ color: saldo > 0 ? '#bd640b' : '#176a25' }}>{saldo > 0 ? `Debe Gs. ${fmtGs(saldo)}` : 'Pagado'}</div>
          </div>
        </div>

        <div className="ui-dff26e">
          {grupo.items.map((venta, idx) => {
            const total = Number(venta.total) || (Number(venta.kg_total) || 0) * (Number(venta.precio_kg) || 0)
            return (
              <div className="ui-b2b190" key={venta.id} style={{ borderBottom: idx === grupo.items.length - 1 ? 'none' : '1px solid #eeeeee' }}>
                <div className="ui-87fd17">
                  <div className="ui-3f9f96">
                    <div className="ui-788a2f">{venta.producto}</div>
                    <div className="ui-66d4fa">{venta.bloques?.codigo ? `Bloque ${venta.bloques.codigo}` : 'Sin bloque asignado'}</div>
                  </div>
                  <div className="ui-1d3685">
                    <div className="ui-788a2f">Gs. {fmtGs(total)}</div>
                    <div className="ui-51b095">{fmtKg(venta.kg_total)} kg - Gs. {fmtGs(venta.precio_kg)}/kg</div>
                  </div>
                </div>
                <div className="ui-24f5cd">
                  {can.edit && <button className="ui-389f8b" onClick={() => onEdit(venta)}>Editar</button>}
                  {can.delete && <button className="ui-132fe6" onClick={() => onDelete(venta.id)}>Eliminar</button>}
                </div>
              </div>
            )
          })}
        </div>

        <button className="ui-132c44" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

export default function Ventas() {
  const can = useCan('ventas')
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [ventas, setVentas] = useState([])
  const [compradores, setCompradores] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [detalleGrupo, setDetalleGrupo] = useState(null)
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

  const fetchInicial = async () => {
    await Promise.all([fetchVentas(), fetchCompradores(), fetchCampos(), fetchBloques()])
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
  }

  const fetchBloques = async () => {
    const { data, error } = await supabase
      .from('bloques')
      .select('id, codigo, campo_id, campos(nombre), plantaciones(cultivos(nombre), activa, created_at, fecha_siembra)')
      .order('codigo')
    if (error) {
      setError('No se pudieron cargar todos los bloques: ' + error.message)
      setBloques([])
      return
    }
    setBloques(data || [])
  }

  const getEtiquetaBloque = (bloque) => {
    const campo = bloque?.campos?.nombre
    return campo ? `${campo} - ${bloque.codigo}` : bloque.codigo
  }

  const getCultivoBloque = (bloque) => {
    const plantacion = (bloque?.plantaciones || [])
      .filter(p => p.activa)
      .sort((a, b) => String(b.fecha_siembra || b.created_at || '').localeCompare(String(a.fecha_siembra || a.created_at || '')))[0]
    return plantacion?.cultivos?.nombre || ''
  }

  const crearLineaVenta = () => ({ producto:'', bloque_id:'', kg_total:'', precio_kg:'', notas:'' })
  const limpiarForm = () => {
    setCampoFiltro('')
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
    setCampoFiltro('')
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
      setDetalleGrupo(null)
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
  const bloquesVisibles = campoFiltro
    ? bloques.filter(b => b.campo_id === campoFiltro)
    : bloques
  const cultivoSugerido = getCultivoBloque(bloqueSeleccionado)
  const gruposVentas = Object.values(ventas.reduce((acc, v) => {
    const lote = v.created_at || v.id
    const key = `${v.fecha || ''}|${v.comprador_id || ''}|${lote}`
    if (!acc[key]) {
      acc[key] = {
        key,
        fecha: v.fecha,
        comprador: v.compradores?.nombre || 'Sin comprador',
        created_at: v.created_at,
        items: [],
        total: 0,
        cobrado: 0,
        kg: 0,
      }
    }
    const total = Number(v.total) || (Number(v.kg_total) || 0) * (Number(v.precio_kg) || 0)
    acc[key].items.push(v)
    acc[key].total += total
    acc[key].cobrado += Number(v.monto_cobrado) || 0
    acc[key].kg += Number(v.kg_total) || 0
    return acc
  }, {}))
  const inp = { width:'100%', padding:'11px 14px', borderRadius:8, border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12, boxSizing:'border-box' }
  const label = { fontSize:10, color:"#697970", marginBottom:6, display:'block', fontWeight:700 }

  return (
    <div className="ui-c1c124">
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      {detalle && <ModalDetalle venta={detalle} onClose={() => setDetalle(null)} onEdit={() => abrirEditar(detalle)} onDelete={() => eliminar(detalle.id)} />}
      {detalleGrupo && <ModalDetalleGrupo grupo={detalleGrupo} onClose={() => setDetalleGrupo(null)} onEdit={(venta) => abrirEditar(venta)} onDelete={(id) => eliminar(id)} />}

      <div className="ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-796b93">
          <div>
            <div className="ui-476525">Comercial</div>
            <div className="ui-136b85">Ventas</div>
          </div>
          {can.create && <button className="ui-11115c" onClick={abrirNueva}>
            <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
          </button>}
        </div>
        {error && <div className="ui-7d680a">{error}</div>}
        <div className="ui-998b74" style={{ gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : '1fr 1fr', gap: isDesktop ? 14 : 8 }}>
          <Stat dark title="Vendido" value={`Gs. ${fmtGs(totalVendido)}`} sub={`${fmtKg(kgVendidos)} kg`} />
          <Stat title="Cobrado" value={`Gs. ${fmtGs(totalCobrado)}`} sub="dinero recibido" />
          <Stat title="Pendiente" value={totalPendiente > 0 ? `Gs. ${fmtGs(totalPendiente)}` : '-'} sub="cuentas por cobrar" warn={totalPendiente > 0} />
          <Stat title="Operaciones" value={ventas.length} sub="ventas registradas" />
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        {ventas.length === 0 ? (
          <div className="ui-e1ea88">
            Sin ventas registradas.
          </div>
        ) : isDesktop ? (
          <div className="ui-32ad28">
            <div className="ui-da9b72">
              <span>Venta</span>
              <span>Comprador / origen</span>
              <span className="ui-f6e3d7">Kg</span>
              <span className="ui-f6e3d7">Productos</span>
              <span className="ui-f6e3d7">Total</span>
              <span className="ui-f6e3d7">Acciones</span>
            </div>
            {gruposVentas.map(g => {
              const saldo = Math.max(0, g.total - g.cobrado)
              const esGrupo = g.items.length > 1
              const v = g.items[0]
              return (
                <div className="ui-a2222c" key={g.key} onClick={() => esGrupo ? setDetalleGrupo(g) : setDetalle(v)}>
                  <div className="ui-3f9f96">
                    <div className="ui-0debaf">{esGrupo ? `${g.items.length} productos vendidos` : v.producto}</div>
                    {esGrupo && <div className="ui-a4ec02">{g.items.map(item => item.producto).join(', ')}</div>}
                    <div className="ui-c3af51">
                      <span className="ui-e278ed" style={{ background: saldo > 0 ? '#fff3e3' : '#e8f5e5', color: saldo > 0 ? '#bd640b' : '#176a25' }}>{saldo > 0 ? 'Pendiente' : 'Pagado'}</span>
                      {saldo > 0 && <span className="ui-242114">Debe Gs. {fmtGs(saldo)}</span>}
                    </div>
                  </div>
                  <div className="ui-3f9f96">
                    <div className="ui-3004e8">{g.comprador}</div>
                    <div className="ui-3315a4">{g.fecha}</div>
                  </div>
                  <div className="ui-358cfe">{fmtKg(g.kg)}</div>
                  <div className="ui-18be75">{g.items.length}</div>
                  <div className="ui-c9e5e3">Gs. {fmtGs(g.total)}</div>
                  <div className="ui-12274e">
                    {(esGrupo || can.edit) && <button className="ui-dbdafa" onClick={(e) => { e.stopPropagation(); esGrupo ? setDetalleGrupo(g) : abrirEditar(v) }} title={esGrupo ? 'Ver detalle' : 'Editar'}>
                      <i className={`${`ti ${esGrupo ? 'ti-eye' : 'ti-pencil'}`} ui-2592cc`} aria-hidden="true"></i>
                    </button>}
                    {!esGrupo && can.delete && <button className="ui-5cff60" onClick={(e) => { e.stopPropagation(); eliminar(v.id) }} title="Eliminar">
                      <i className="ti ti-trash ui-2592cc" aria-hidden="true"></i>
                    </button>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="ui-998b74" style={{ gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {gruposVentas.map(g => {
              const saldo = Math.max(0, g.total - g.cobrado)
              const esGrupo = g.items.length > 1
              const v = g.items[0]
              return (
                <div className="ui-ccaf82" key={g.key} onClick={() => esGrupo ? setDetalleGrupo(g) : setDetalle(v)} style={{ marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
                  <div className="ui-2b96ff">
                    <div className="ui-3f9f96">
                      <div className="ui-62e15c">{esGrupo ? `${g.items.length} productos vendidos` : v.producto}</div>
                      <div className="ui-efaf11">{g.comprador}</div>
                      <div className="ui-66d4fa">{g.fecha}</div>
                      {esGrupo && <div className="ui-6ad5d0">{g.items.map(item => item.producto).join(', ')}</div>}
                    </div>
                    <div className="ui-1d3685">
                      <div className="ui-000002">Gs. {fmtGs(g.total)}</div>
                      <div className="ui-fbe473">{fmtKg(g.kg)} kg</div>
                    </div>
                  </div>
                  <div className="ui-0726a3">
                    <span className="ui-9e3e7e" style={{ background: saldo > 0 ? '#fff3e3' : '#e8f5e5', color: saldo > 0 ? '#bd640b' : '#176a25' }}>{saldo > 0 ? 'Pendiente' : 'Pagado'}</span>
                    <span className="ui-93221c">{g.items.length} producto{g.items.length === 1 ? '' : 's'}</span>
                    {saldo > 0 && <span className="ui-bd1935">Debe Gs. {fmtGs(saldo)}</span>}
                  </div>
                  {v.notas && !esGrupo && <div className="ui-6ecc79">{v.notas}</div>}
                  <div className="ui-510ea6">
                    <span className="ui-dc716d">Tocar para ver detalle</span>
                    <div className="ui-91294d">
                      {(esGrupo || can.edit) && <button className="ui-3624ce" onClick={(e) => { e.stopPropagation(); esGrupo ? setDetalleGrupo(g) : abrirEditar(v) }}>{esGrupo ? 'Ver' : 'Editar'}</button>}
                      {!esGrupo && can.delete && <button className="ui-ee01f4" onClick={(e) => { e.stopPropagation(); eliminar(v.id) }}>Eliminar</button>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <NotasPanel modulo="ventas" titulo="Bloc de notas de ventas" />
      </div>

      {modal && (
        <div className="ui-8b7442" style={{ alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end' }}>
          <div className="ui-44a917" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar venta' : 'Registrar venta'}</div>
            {error && <div className="ui-fb48d7">{error}</div>}

            {!form.id && (
              <div className="ui-796353">
                <button className="ui-cada8c" type="button" onClick={() => setModoMultiple(false)} style={{ background: !modoMultiple ? '#212121' : 'transparent', color: !modoMultiple ? '#fff' : '#777' }}>
                  Un producto
                </button>
                <button className="ui-cada8c" type="button" onClick={() => setModoMultiple(true)} style={{ background: modoMultiple ? '#212121' : 'transparent', color: modoMultiple ? '#fff' : '#777' }}>
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

                <div className="ui-f56ef1">
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
                  <option value="">Todos los campos</option>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select style={inp} value={form.bloque_id} onChange={e => {
                  const bloque = bloques.find(b => b.id === e.target.value)
                  const cultivo = getCultivoBloque(bloque)
                  setForm(f => ({ ...f, bloque_id:e.target.value, producto: f.producto || cultivo }))
                }}>
                  <option value="">Venta sin bloque especifico</option>
                  {bloquesVisibles.map(b => <option key={b.id} value={b.id}>{getEtiquetaBloque(b)}</option>)}
                </select>
                {cultivoSugerido && <div className="ui-99850b">Cultivo sugerido: {cultivoSugerido}</div>}
              </>
            ) : (
              <>
                <label style={label}>Campo para sugerir bloques</label>
                <select style={inp} value={campoFiltro} onChange={e => setCampoFiltro(e.target.value)}>
                  <option value="">Todos los campos</option>
                  {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <div className="ui-c0b83a">
                  {lineasVenta.map((linea, idx) => {
                    const bloqueLinea = bloques.find(b => b.id === linea.bloque_id)
                    const cultivoLinea = getCultivoBloque(bloqueLinea)
                    const totalLinea = parsearKg(linea.kg_total) * parsearGs(linea.precio_kg)
                    return (
                      <div className="ui-ac8a4c" key={idx}>
                        <div className="ui-b3c308">
                          <strong className="ui-3044b6">Producto {idx + 1}</strong>
                          {lineasVenta.length > 1 && (
                            <button className="ui-375820" type="button" onClick={() => quitarLineaVenta(idx)}>Quitar</button>
                          )}
                        </div>
                        <input style={inp} value={linea.producto} onChange={e => actualizarLineaVenta(idx, 'producto', e.target.value)} placeholder="Producto"/>
                        <div className="ui-f56ef1">
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
                          {bloquesVisibles.map(b => <option key={b.id} value={b.id}>{getEtiquetaBloque(b)}</option>)}
                        </select>
                        {cultivoLinea && <div className="ui-9af458">{cultivoLinea}</div>}
                        <input className="ui-e7ec54" style={{ ...inp }} value={linea.notas} onChange={e => actualizarLineaVenta(idx, 'notas', e.target.value)} placeholder="Nota opcional"/>
                        {totalLinea > 0 && <div className="ui-be0b54">Subtotal: Gs. {fmtGs(totalLinea)}</div>}
                      </div>
                    )
                  })}
                </div>
                <button className="ui-f8cb2b" type="button" onClick={agregarLineaVenta}>
                  + Agregar otro producto
                </button>
              </>
            )}

            <label style={label}>Estado de cobro</label>
            <div className="ui-60e304">
              {['pagado', 'pendiente', 'parcial'].map(e => (
                <button className="ui-eb3cc9" key={e} onClick={() => setForm(f => ({ ...f, estado_cobro:e, monto_cobrado: e === 'parcial' ? f.monto_cobrado : '' }))} style={{ background: form.estado_cobro === e ? '#212121' : '#fff', color: form.estado_cobro === e ? '#fff' : '#555' }}>{estadoLabel[e]}</button>
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
            <textarea className="ui-d303ae" style={{ ...inp }} value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones..." />

            {((!modoMultiple || form.id) ? ventaTotalForm : ventaTotalMultiple) > 0 && (
              <div className="ui-a11ccd">
                <span className="ui-aa481a">Total venta</span>
                <span className="ui-398ec2">Gs. {fmtGs((!modoMultiple || form.id) ? ventaTotalForm : ventaTotalMultiple)}</span>
              </div>
            )}

            <button className="ui-ae772b" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : modoMultiple && !form.id ? 'Guardar venta con productos' : 'Guardar venta'}</button>
            <button className="ui-3f3807" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ title, value, sub, dark, warn }) {
  return (
    <div className="ui-d7e44b" style={{ background: dark ? '#212121' : '#fff', border: dark ? 'none' : '1px solid #e8ece8' }}>
      <div className="ui-dedf0f" style={{ color: dark ? 'rgba(255,255,255,0.5)' : '#8b928b' }}>{title}</div>
      <div className="ui-b9c079" style={{ fontSize: dark ? 22 : 18, color: dark ? '#fff' : warn ? '#bd640b' : '#212121' }}>{value}</div>
      <div className="ui-89a879" style={{ color: dark ? 'rgba(255,255,255,0.5)' : '#8b928b' }}>{sub}</div>
    </div>
  )
}
