import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { useCan } from '../lib/RoleContext'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, DateQuickField, ChoiceChips, resumenPie } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
import ModalConfirm from '../components/ModalConfirm'

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

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cheque']

const estadoLabel = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  parcial: 'Parcial',
}

const totalDeVenta = v => Number(v.total) || (Number(v.kg_total) || 0) * (Number(v.precio_kg) || 0)

function ModalDetalle({ open, venta, onClose, onEdit, onDelete }) {
  const can = useCan('ventas')
  const v = venta || {}
  const total = totalDeVenta(v)
  const saldo = Math.max(0, total - (Number(v.monto_cobrado) || 0))

  return (
    <UnifiedFormModal
      open={open}
      tone="finanzas"
      icon="ti-receipt"
      eyebrow="Detalle de venta"
      title={v.producto || 'Producto'}
      subtitle={`${v.compradores?.nombre || 'Sin comprador'} · ${v.fecha || ''}`}
      label="Detalle de venta"
      onClose={onClose}
      onSubmit={can.edit ? onEdit : undefined}
      submitLabel={can.edit ? 'Editar venta' : null}
      shortcut={false}
      cancelLabel="Cerrar"
      secondary={can.delete ? <button type="button" className="apple-btn apple-btn--ghost apple-btn--dangerghost" onClick={onDelete}>Eliminar</button> : null}
      summary={saldo > 0 ? `Debe Gs. ${fmtGs(saldo)}` : 'Cobrada por completo'}
    >{() => <>
      <div className="apple-stats">
        <div className="apple-stat"><small>Total venta</small><strong>Gs. {fmtGs(total)}</strong></div>
        <div className={`apple-stat ${saldo > 0 ? 'is-warn' : 'is-ok'}`}><small>Estado</small><strong>{estadoLabel[v.estado_cobro] || 'Pagado'}</strong></div>
      </div>
      <dl className="apple-kv">
        <div className="apple-kv__row"><dt>Kilos vendidos</dt><dd className="is-num">{fmtKg(v.kg_total)} kg</dd></div>
        <div className="apple-kv__row"><dt>Precio por kg</dt><dd className="is-num">Gs. {fmtGs(v.precio_kg)}</dd></div>
        <div className="apple-kv__row"><dt>Cobrado</dt><dd className="is-num">Gs. {fmtGs(v.monto_cobrado)}</dd></div>
        <div className="apple-kv__row"><dt>Saldo</dt><dd className="is-num">{saldo > 0 ? `Gs. ${fmtGs(saldo)}` : '—'}</dd></div>
        <div className="apple-kv__row"><dt>Forma de pago</dt><dd>{v.forma_pago || '—'}</dd></div>
        <div className="apple-kv__row"><dt>Origen</dt><dd>{v.bloques?.codigo ? `Bloque ${v.bloques.codigo}` : 'Sin bloque asignado'}</dd></div>
      </dl>
      {v.notas && <p className="apple-quote">{v.notas}</p>}
    </>}</UnifiedFormModal>
  )
}

function ModalDetalleGrupo({ open, grupo, onClose, onEdit, onDelete }) {
  const can = useCan('ventas')
  const g = grupo || { items: [], total: 0, cobrado: 0, comprador: '', fecha: '' }
  const saldo = Math.max(0, g.total - g.cobrado)

  return (
    <UnifiedFormModal
      open={open}
      tone="finanzas"
      icon="ti-receipt"
      eyebrow="Detalle de venta agrupada"
      title={g.comprador}
      subtitle={`${g.fecha} · ${g.items.length} productos`}
      label="Detalle de venta agrupada"
      onClose={onClose}
      submitLabel={null}
      cancelLabel="Cerrar"
      summary={saldo > 0 ? `Debe Gs. ${fmtGs(saldo)}` : 'Cobrada por completo'}
    >{() => <>
      <div className="apple-stats">
        <div className="apple-stat"><small>Total venta</small><strong>Gs. {fmtGs(g.total)}</strong></div>
        <div className={`apple-stat ${saldo > 0 ? 'is-warn' : 'is-ok'}`}><small>Cobro</small><strong>{saldo > 0 ? `Debe Gs. ${fmtGs(saldo)}` : 'Pagado'}</strong></div>
      </div>
      <div className="apple-list">
        {g.items.map(venta => (
          <div className="apple-list__row" key={venta.id}>
            <div className="apple-list__main">
              <strong>{venta.producto}</strong>
              <small>{venta.bloques?.codigo ? `Bloque ${venta.bloques.codigo}` : 'Sin bloque asignado'} · {fmtKg(venta.kg_total)} kg · Gs. {fmtGs(venta.precio_kg)}/kg</small>
              <strong className="apple-list__money">Gs. {fmtGs(totalDeVenta(venta))}</strong>
            </div>
            {(can.edit || can.delete) && <div className="apple-list__actions">
              {can.edit && <button type="button" className="apple-mini-btn" onClick={() => onEdit(venta)}>Editar</button>}
              {can.delete && <button type="button" className="apple-mini-btn apple-mini-btn--danger" onClick={() => onDelete(venta.id)}>Eliminar</button>}
            </div>}
          </div>
        ))}
      </div>
    </>}</UnifiedFormModal>
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
    setError('')
    limpiarForm()
    setModoMultiple(false)
    setModal(true)
  }

  const abrirEditar = (venta) => {
    setError('')
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
      toast.success('Venta registrada', { description: `${payload.length} productos · Gs. ${fmtGs(totalVenta)}` })
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
      toast.success(form.id ? 'Venta actualizada' : 'Venta registrada', { description: `${payload.producto} · ${fmtKg(payload.kg_total)} kg · Gs. ${fmtGs(payload.total)}` })
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
  const esMultiple = modoMultiple && !form.id
  const ventaTotalMostrada = esMultiple ? ventaTotalMultiple : ventaTotalForm
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

  return (
    <div className="ui-c1c124">
      <ModalDetalle open={Boolean(detalle)} venta={detalle} onClose={() => setDetalle(null)} onEdit={() => abrirEditar(detalle)} onDelete={() => eliminar(detalle.id)} />
      <ModalDetalleGrupo open={Boolean(detalleGrupo)} grupo={detalleGrupo} onClose={() => setDetalleGrupo(null)} onEdit={(venta) => abrirEditar(venta)} onDelete={(id) => eliminar(id)} />

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
                <div className="ui-a2222c" role="button" tabIndex={0} key={g.key} onClick={() => esGrupo ? setDetalleGrupo(g) : setDetalle(v)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); esGrupo ? setDetalleGrupo(g) : setDetalle(v) } }}>
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
                <div className="ui-ccaf82" role="button" tabIndex={0} key={g.key} onClick={() => esGrupo ? setDetalleGrupo(g) : setDetalle(v)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); esGrupo ? setDetalleGrupo(g) : setDetalle(v) } }} style={{ marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
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

      <UnifiedFormModal
        open={modal}
        tone="finanzas"
        icon="ti-receipt"
        eyebrow={form.id ? 'Editar venta' : 'Comercial'}
        title={form.id ? 'Editar venta' : 'Registrar venta'}
        label={form.id ? 'Editar venta' : 'Registrar venta'}
        busy={saving}
        onClose={() => setModal(false)}
        onSubmit={guardar}
        submitLabel={modoMultiple && !form.id ? 'Guardar venta completa' : 'Guardar venta'}
        error={modal ? error : ''}
        summary={resumenPie(esMultiple ? [
          { n: lineasVenta.filter(l => String(l.producto || '').trim()).length, texto: 'productos', uno: 'producto' },
          { solo: ventaTotalMostrada > 0 ? `Gs. ${fmtGs(ventaTotalMostrada)}` : '' },
          { solo: estadoLabel[form.estado_cobro] },
        ] : [
          { n: parsearKg(form.kg_total) > 0 ? fmtKg(parsearKg(form.kg_total)) : '', texto: 'kg' },
          { solo: ventaTotalMostrada > 0 ? `Gs. ${fmtGs(ventaTotalMostrada)}` : '' },
          { solo: estadoLabel[form.estado_cobro] },
        ]) || 'Comprador, producto, kilos y precio'}
      >{() => <>
        <ModalSection title="Venta" icon="ti-receipt">
          {!form.id && (
            <ModalGroup label="Tipo de venta">
              <ChoiceChips label="Tipo de venta" value={modoMultiple ? 'varios' : 'uno'} onChange={v => setModoMultiple(v === 'varios')} options={[{ value:'uno', label:'Un producto', icon:'ti-package' }, { value:'varios', label:'Varios productos', icon:'ti-packages' }]} />
            </ModalGroup>
          )}
          <ModalGrid>
            <ModalField label="Comprador *" hint={compradores.length === 0 ? 'Todavía no hay compradores cargados.' : ''}>
              <select className="apple-control" data-autofocus value={form.comprador_id} onChange={e => setForm(f => ({ ...f, comprador_id:e.target.value }))}>
                <option value="">Elegir comprador…</option>
                {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </ModalField>
            <DateQuickField label="Fecha" required value={form.fecha} onChange={fecha => setForm(f => ({ ...f, fecha }))} />
          </ModalGrid>
        </ModalSection>

        {!esMultiple ? (
          <>
            <ModalSection title="Producto" icon="ti-package">
              <ModalField label="Producto *"><input className="apple-control" value={form.producto} onChange={e => setForm(f => ({ ...f, producto:e.target.value }))} placeholder="Ej: Tomate, pepino, morrón" /></ModalField>
              <ModalGrid>
                <ModalField label="Kilos *"><input className="apple-control apple-control--num" type="text" inputMode="decimal" value={form.kg_total} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, kg_total:e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="Ej: 150" /></ModalField>
                <ModalField label="Precio por kg (Gs.) *"><input className="apple-control apple-control--num" type="text" inputMode="numeric" value={form.precio_kg} onWheel={e => e.currentTarget.blur()} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setForm(f => ({ ...f, precio_kg:r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 5.000" /></ModalField>
              </ModalGrid>
              {ventaTotalForm > 0 && <p className="apple-note">Total de la venta: <b>Gs. {fmtGs(ventaTotalForm)}</b></p>}
            </ModalSection>
            <ModalSection title="Origen (opcional)" icon="ti-map-pin" collapsible defaultOpen={Boolean(form.bloque_id)} badge={form.bloque_id ? '' : 'campo y bloque'}>
              <ModalGrid>
                <ModalField label="Campo">
                  <select className="apple-control" value={campoFiltro} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({ ...f, bloque_id:'' })) }}>
                    <option value="">Todos los campos</option>
                    {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </ModalField>
                <ModalField label="Bloque" hint={cultivoSugerido ? `Cultivo sugerido: ${cultivoSugerido}` : ''}>
                  <select className="apple-control" value={form.bloque_id} onChange={e => {
                    const bloque = bloques.find(b => b.id === e.target.value)
                    const cultivo = getCultivoBloque(bloque)
                    setForm(f => ({ ...f, bloque_id:e.target.value, producto: f.producto || cultivo }))
                  }}>
                    <option value="">Venta sin bloque específico</option>
                    {bloquesVisibles.map(b => <option key={b.id} value={b.id}>{getEtiquetaBloque(b)}</option>)}
                  </select>
                </ModalField>
              </ModalGrid>
            </ModalSection>
          </>
        ) : (
          <ModalSection title="Productos" icon="ti-packages">
            <ModalField label="Campo para sugerir bloques">
              <select className="apple-control" value={campoFiltro} onChange={e => setCampoFiltro(e.target.value)}>
                <option value="">Todos los campos</option>
                {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </ModalField>
            <div className="apple-rows">
              {lineasVenta.map((linea, idx) => {
                const bloqueLinea = bloques.find(b => b.id === linea.bloque_id)
                const cultivoLinea = getCultivoBloque(bloqueLinea)
                const totalLinea = parsearKg(linea.kg_total) * parsearGs(linea.precio_kg)
                return (
                  <div className="apple-solution apple-solution--card" key={idx}>
                    <div className="apple-solution__head">
                      <input className="apple-control" aria-label={`Producto ${idx + 1}`} value={linea.producto} onChange={e => actualizarLineaVenta(idx, 'producto', e.target.value)} placeholder={`Producto ${idx + 1}`} />
                      <button type="button" className="apple-row__remove" aria-label={`Quitar producto ${idx + 1}`} onClick={() => quitarLineaVenta(idx)} disabled={lineasVenta.length === 1}><i className="ti ti-x" aria-hidden="true" /></button>
                    </div>
                    <ModalGrid>
                      <input className="apple-control apple-control--num" aria-label="Kilos" type="text" inputMode="decimal" value={linea.kg_total} onWheel={e => e.currentTarget.blur()} onChange={e => actualizarLineaVenta(idx, 'kg_total', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Kilos" />
                      <input className="apple-control apple-control--num" aria-label="Precio por kg en guaraníes" type="text" inputMode="numeric" value={linea.precio_kg} onWheel={e => e.currentTarget.blur()} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); actualizarLineaVenta(idx, 'precio_kg', r ? parseInt(r, 10).toLocaleString('es-PY') : '') }} placeholder="Gs. por kg" />
                    </ModalGrid>
                    <select className="apple-control" aria-label={`Bloque de origen del producto ${idx + 1}`} value={linea.bloque_id} onChange={e => {
                      const bloque = bloques.find(b => b.id === e.target.value)
                      const cultivo = getCultivoBloque(bloque)
                      actualizarLineaVenta(idx, 'bloque_id', e.target.value)
                      if (!linea.producto && cultivo) actualizarLineaVenta(idx, 'producto', cultivo)
                    }}>
                      <option value="">Sin bloque específico</option>
                      {bloquesVisibles.map(b => <option key={b.id} value={b.id}>{getEtiquetaBloque(b)}</option>)}
                    </select>
                    <input className="apple-control" aria-label={`Nota del producto ${idx + 1}`} value={linea.notas} onChange={e => actualizarLineaVenta(idx, 'notas', e.target.value)} placeholder="Nota opcional" />
                    {(cultivoLinea || totalLinea > 0) && <small className="apple-field__hint">{cultivoLinea ? `Cultivo: ${cultivoLinea}` : ''}{cultivoLinea && totalLinea > 0 ? ' · ' : ''}{totalLinea > 0 ? `Subtotal: Gs. ${fmtGs(totalLinea)}` : ''}</small>}
                  </div>
                )
              })}
            </div>
            <button type="button" className="apple-add" onClick={agregarLineaVenta}><i className="ti ti-plus" aria-hidden="true" />Agregar otro producto</button>
            {ventaTotalMultiple > 0 && <p className="apple-note">Total de la venta: <b>Gs. {fmtGs(ventaTotalMultiple)}</b></p>}
          </ModalSection>
        )}

        <ModalSection title="Cobro" icon="ti-coin">
          <ModalGroup label="Estado de cobro">
            <ChoiceChips label="Estado de cobro" value={form.estado_cobro} onChange={e => setForm(f => ({ ...f, estado_cobro:e, monto_cobrado: e === 'parcial' ? f.monto_cobrado : '' }))} options={[{ value:'pagado', label:'Pagado', icon:'ti-circle-check' }, { value:'pendiente', label:'Pendiente', icon:'ti-hourglass' }, { value:'parcial', label:'Parcial', icon:'ti-coin' }]} />
          </ModalGroup>
          {form.estado_cobro === 'parcial' && (
            <ModalField label="Monto cobrado (Gs.)" hint={ventaTotalMostrada > 0 ? `Saldo pendiente: Gs. ${fmtGs(Math.max(0, ventaTotalMostrada - parsearGs(form.monto_cobrado)))}` : ''}>
              <input className="apple-control apple-control--num" type="text" inputMode="numeric" value={form.monto_cobrado} onWheel={e => e.currentTarget.blur()} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setForm(f => ({ ...f, monto_cobrado:r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 500.000" />
            </ModalField>
          )}
          <ModalGroup label="Forma de pago">
            <ChoiceChips wrap label="Forma de pago" value={FORMAS_PAGO.includes(form.forma_pago) ? form.forma_pago : 'otra'} onChange={v => setForm(f => ({ ...f, forma_pago: v === 'otra' ? (FORMAS_PAGO.includes(f.forma_pago) ? '' : f.forma_pago) : v }))} options={[...FORMAS_PAGO.map(f => ({ value:f, label:f })), { value:'otra', label:'Otra' }]} />
            {!FORMAS_PAGO.includes(form.forma_pago) && <input className="apple-control" aria-label="Otra forma de pago" value={form.forma_pago} onChange={e => setForm(f => ({ ...f, forma_pago:e.target.value }))} placeholder="Ej: Giro, tarjeta, canje…" />}
          </ModalGroup>
        </ModalSection>

        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(form.notas)} badge={form.notas ? '' : 'notas'}>
          <ModalField label="Notas"><textarea className="apple-control" value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones…" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      <ModalConfirm open={Boolean(confirmar)} titulo="¿Eliminar venta?" mensaje="Esta acción no se puede deshacer." textoBoton="Eliminar venta" onConfirm={confirmar?.fn} onCancel={() => setConfirmar(null)} />
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
