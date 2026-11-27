import React, { useEffect, useMemo, useState } from 'react'
import { imprimirHtml } from '../lib/exporters'
import NotasPanel from '../components/NotasPanel'
import { supabase } from '../lib/supabase'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, DateQuickField, ChoiceChips, resumenPie, fechaIso } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
import { useConfirmar } from '../components/ModalConfirm'

const tiposProveedor = ['Agropecuaria', 'Ferreteria', 'Transporte', 'Servicios', 'Otro']
const categorias = ['Insumos', 'Fertilizantes', 'Agroquimicos', 'Semillas', 'Herramientas', 'Servicios', 'Combustible', 'Otros']
const mediosPago = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro']
const tiposMovimiento = [
  { value: 'compra_credito', label: 'Compra a crédito', signo: 1 },
  { value: 'pago', label: 'Pago realizado', signo: -1 },
  { value: 'ajuste_suma', label: 'Ajuste que suma deuda', signo: 1 },
  { value: 'ajuste_resta', label: 'Descuento o ajuste a favor', signo: -1 },
]

const hoy = () => fechaIso(0)
const fmtGs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`
const parseGs = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0
const signoMovimiento = (tipo) => tiposMovimiento.find(t => t.value === tipo)?.signo || 1

const ICONO_MOVIMIENTO = { compra_credito: 'ti-shopping-cart', pago: 'ti-cash', ajuste_suma: 'ti-plus', ajuste_resta: 'ti-minus' }

const proveedorVacio = {
  nombre: '',
  tipo: 'Agropecuaria',
  contacto: '',
  telefono: '',
  direccion: '',
  notas: '',
  activo: true,
}

const movimientoVacio = {
  proveedor_id: '',
  fecha: hoy(),
  tipo: 'compra_credito',
  concepto: '',
  categoria: 'Insumos',
  medio_pago: 'Transferencia',
  comprobante: '',
  monto: '',
  notas: '',
}

export default function CuentasPagar() {
  const [pedir, dialogoConfirmar] = useConfirmar()
  const [proveedores, setProveedores] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [proveedorForm, setProveedorForm] = useState(proveedorVacio)
  const [movimientoForm, setMovimientoForm] = useState(movimientoVacio)
  const [modalProveedor, setModalProveedor] = useState(false)
  const [modalMovimiento, setModalMovimiento] = useState(false)
  const [proveedorAbierto, setProveedorAbierto] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    setLoading(true)
    const [{ data: prov, error: eProv }, { data: mov, error: eMov }] = await Promise.all([
      supabase.from('proveedores_credito').select('*').order('nombre'),
      supabase.from('proveedor_movimientos').select('*, proveedores_credito(nombre)').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    ])

    if (eProv || eMov) {
      setError('Falta ejecutar el SQL de cuentas a pagar en Supabase.')
      setProveedores([])
      setMovimientos([])
    } else {
      setError('')
      setProveedores(prov || [])
      setMovimientos(mov || [])
    }
    setLoading(false)
  }

  const resumen = useMemo(() => {
    const porProveedor = proveedores.map(p => {
      const lista = movimientos.filter(m => m.proveedor_id === p.id)
      const compras = lista.filter(m => signoMovimiento(m.tipo) > 0).reduce((s, m) => s + Number(m.monto || 0), 0)
      const pagos = lista.filter(m => signoMovimiento(m.tipo) < 0).reduce((s, m) => s + Number(m.monto || 0), 0)
      const saldo = lista.reduce((s, m) => s + Number(m.monto || 0) * signoMovimiento(m.tipo), 0)
      return { ...p, compras, pagos, saldo, movimientos: lista }
    })

    return {
      porProveedor,
      deudaTotal: porProveedor.reduce((s, p) => s + Math.max(0, p.saldo), 0),
      comprasTotal: porProveedor.reduce((s, p) => s + p.compras, 0),
      pagosTotal: porProveedor.reduce((s, p) => s + p.pagos, 0),
      conDeuda: porProveedor.filter(p => p.saldo > 0).length,
    }
  }, [proveedores, movimientos])

  const proveedoresFiltrados = resumen.porProveedor.filter(p => {
    if (filtro === 'deuda') return p.saldo > 0
    if (filtro === 'sin_deuda') return p.saldo <= 0
    if (filtro === 'inactivos') return !p.activo
    return p.activo !== false
  })

  const abrirProveedor = (proveedor = null) => {
    setProveedorForm(proveedor || proveedorVacio)
    setModalProveedor(true)
    setError('')
  }

  const abrirMovimiento = (movimiento = null, proveedorId = '') => {
    setMovimientoForm(movimiento
      ? { ...movimiento, monto: Math.round(Number(movimiento.monto || 0)).toLocaleString('es-PY') }
      : { ...movimientoVacio, fecha: hoy(), proveedor_id: proveedorId || proveedores[0]?.id || '' }
    )
    setModalMovimiento(true)
    setError('')
  }

  const guardarProveedor = async () => {
    if (!proveedorForm.nombre.trim()) {
      setError('Escribí el nombre del proveedor.')
      return
    }

    const payload = {
      nombre: proveedorForm.nombre.trim(),
      tipo: proveedorForm.tipo || 'Agropecuaria',
      contacto: proveedorForm.contacto || null,
      telefono: proveedorForm.telefono || null,
      direccion: proveedorForm.direccion || null,
      notas: proveedorForm.notas || null,
      activo: proveedorForm.activo !== false,
    }

    setSaving(true)
    setError('')
    const query = proveedorForm.id
      ? supabase.from('proveedores_credito').update(payload).eq('id', proveedorForm.id)
      : supabase.from('proveedores_credito').insert(payload)
    const { error } = await query
    setSaving(false)

    if (error) setError('No se pudo guardar el proveedor.')
    else {
      setModalProveedor(false)
      setProveedorForm(proveedorVacio)
      await cargarDatos()
      toast.success(proveedorForm.id ? 'Proveedor actualizado' : 'Proveedor registrado', { description: payload.nombre })
    }
  }

  const guardarMovimiento = async () => {
    if (!movimientoForm.proveedor_id || !movimientoForm.concepto.trim() || parseGs(movimientoForm.monto) <= 0) {
      setError('Completá proveedor, concepto y monto.')
      return
    }

    const payload = {
      proveedor_id: movimientoForm.proveedor_id,
      fecha: movimientoForm.fecha || hoy(),
      tipo: movimientoForm.tipo || 'compra_credito',
      concepto: movimientoForm.concepto.trim(),
      categoria: movimientoForm.categoria || null,
      medio_pago: movimientoForm.medio_pago || null,
      comprobante: movimientoForm.comprobante || null,
      monto: parseGs(movimientoForm.monto),
      notas: movimientoForm.notas || null,
    }

    setSaving(true)
    setError('')
    const query = movimientoForm.id
      ? supabase.from('proveedor_movimientos').update(payload).eq('id', movimientoForm.id)
      : supabase.from('proveedor_movimientos').insert(payload)
    const { error } = await query
    setSaving(false)

    if (error) setError('No se pudo guardar el movimiento.')
    else {
      setModalMovimiento(false)
      setMovimientoForm(movimientoVacio)
      await cargarDatos()
      toast.success(movimientoForm.id ? 'Movimiento actualizado' : 'Movimiento registrado', { description: `${payload.concepto} · ${fmtGs(payload.monto)}` })
    }
  }

  const eliminarProveedor = async (proveedor) => {
    if (!(await pedir({ titulo: `¿Eliminar a ${proveedor.nombre}?`, mensaje: 'Se eliminan también todos sus movimientos. No se puede deshacer.', textoBoton: 'Eliminar proveedor', tono: 'peligro' }))) return
    const { error } = await supabase.from('proveedores_credito').delete().eq('id', proveedor.id)
    if (error) setError('No se pudo eliminar el proveedor.')
    else cargarDatos()
  }

  const eliminarMovimiento = async (movimiento) => {
    if (!(await pedir({ titulo: '¿Eliminar este movimiento?', mensaje: 'Cambia el saldo del proveedor. No se puede deshacer.', textoBoton: 'Eliminar movimiento', tono: 'peligro' }))) return
    const { error } = await supabase.from('proveedor_movimientos').delete().eq('id', movimiento.id)
    if (error) setError('No se pudo eliminar el movimiento.')
    else cargarDatos()
  }

  const exportarCsv = () => {
    const rows = [['Proveedor', 'Fecha', 'Tipo', 'Concepto', 'Categoria', 'Monto', 'Saldo proveedor']]
    resumen.porProveedor.forEach(p => {
      p.movimientos.forEach(m => rows.push([
        p.nombre,
        m.fecha,
        tiposMovimiento.find(t => t.value === m.tipo)?.label || m.tipo,
        m.concepto,
        m.categoria || '',
        Number(m.monto || 0) * signoMovimiento(m.tipo),
        p.saldo,
      ]))
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cuentas-a-pagar-${hoy()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const imprimir = () => {
    const html = `
      <html><head><title>Cuentas a pagar</title><style>
        body{font-family:Arial,sans-serif;padding:28px;color:#111}
        h1{margin:0 0 8px}.muted{color:#666;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-top:18px}
        th,td{border-bottom:1px solid #ddd;text-align:left;padding:9px;font-size:13px}
        th{background:#f1f3f1}.right{text-align:right;font-weight:700}
      </style></head><body>
        <h1>Cuentas a pagar</h1><div class="muted">Deuda total: ${fmtGs(resumen.deudaTotal)}</div>
        <table><thead><tr><th>Proveedor</th><th>Tipo</th><th>Movimientos</th><th class="right">Saldo</th></tr></thead><tbody>
        ${resumen.porProveedor.map(p => `<tr><td>${p.nombre}</td><td>${p.tipo || ''}</td><td>${p.movimientos.length}</td><td class="right">${fmtGs(p.saldo)}</td></tr>`).join('')}
        </tbody></table>
      </body></html>`
    imprimirHtml('cuentas-a-pagar', html.replace(/<\/?(?:html|head|body)[^>]*>/g, '').replace(/<title>.*?<\/title>/, '').replace(/<style>[\s\S]*?<\/style>/, ''))
  }

  return (
    <div className="ui-42cbcb">
      <div className="ui-89a869">
        <div className="ui-a9915a">
          <div>
            <div className="ui-567f4b">Crédito con proveedores</div>
            <h1 className="ui-5f0bf1">Cuentas a pagar</h1>
          </div>
          <div className="ui-9a2d51">
            <button onClick={exportarCsv} style={smallBtn}>Descargar para Excel</button>
            <button onClick={imprimir} style={smallBtn}>Descargar PDF</button>
            <button onClick={() => abrirProveedor()} style={darkBtn}>+ Proveedor</button>
            <button onClick={() => abrirMovimiento()} style={greenBtn}>+ Movimiento</button>
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div className="ui-e9ea38">
          <Stat dark title="Deuda total" value={fmtGs(resumen.deudaTotal)} sub={`${resumen.conDeuda} proveedores con deuda`} />
          <Stat title="Compras a crédito" value={fmtGs(resumen.comprasTotal)} sub="total registrado" />
          <Stat title="Pagos realizados" value={fmtGs(resumen.pagosTotal)} sub="total abonado" />
          <Stat title="Proveedores" value={proveedores.length} sub="registrados" />
        </div>

        <div className="ui-d5d952" style={{ ...card }}>
          <div className="ui-e0e9ec">
            {[
              ['todos', 'Activos'],
              ['deuda', 'Con deuda'],
              ['sin_deuda', 'Sin deuda'],
              ['inactivos', 'Inactivos'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setFiltro(key)} style={filtro === key ? activeChip : chip}>{label}</button>
            ))}
          </div>
        </div>

        <div className="ui-3dee6e">
          {loading ? (
            <div style={empty}>Cargando...</div>
          ) : proveedoresFiltrados.length === 0 ? (
            <div style={empty}>Sin proveedores para mostrar.</div>
          ) : proveedoresFiltrados.map(p => (
            <div key={p.id} style={card}>
              <div className="ui-0e57ac">
                <button className="ui-d7681e" onClick={() => setProveedorAbierto(proveedorAbierto === p.id ? null : p.id)}>
                  <div className="ui-9f0e4d">
                    <span style={iconPill}><i className="ti ti-building-store ui-157cb3" /></span>
                    <span>
                      <strong className="ui-74d4b0">{p.nombre}</strong>
                      <span className="ui-61d9d1">
                        {p.tipo || 'Proveedor'}{p.telefono ? ` - ${p.telefono}` : ''}
                      </span>
                    </span>
                  </div>
                </button>
                <div className="ui-f6e3d7">
                  <strong className="ui-b5ef88" style={{ color:p.saldo > 0 ? '#c84040' : '#176a25' }}>{fmtGs(p.saldo)}</strong>
                  <div className="ui-329ffb">
                    <button onClick={() => abrirMovimiento(null, p.id)} style={miniBtn}>Movimiento</button>
                    <button onClick={() => abrirProveedor(p)} style={miniBtn}>Editar</button>
                    <button onClick={() => eliminarProveedor(p)} style={dangerMiniBtn}>Eliminar</button>
                  </div>
                </div>
              </div>

              {proveedorAbierto === p.id && (
                <div className="ui-868ac0">
                  <div className="ui-84875d">
                    <MiniTotal label="Compras/deuda" value={fmtGs(p.compras)} />
                    <MiniTotal label="Pagos/ajustes" value={fmtGs(p.pagos)} />
                    <MiniTotal label="Movimientos" value={p.movimientos.length} />
                  </div>
                  {p.notas && <div className="ui-7aca70">{p.notas}</div>}
                  <div className="ui-b1b744">
                    {p.movimientos.length === 0 ? (
                      <div className="ui-a35c15">Sin movimientos.</div>
                    ) : p.movimientos.map(m => (
                      <div className="ui-294e9c" key={m.id}>
                        <div>
                          <strong className="ui-0cf08e">{m.concepto}</strong>
                          <div className="ui-9c8a95">
                            {m.fecha} - {tiposMovimiento.find(t => t.value === m.tipo)?.label || m.tipo}{m.comprobante ? ` - ${m.comprobante}` : ''}
                          </div>
                        </div>
                        <div className="ui-f6e3d7">
                          <strong style={{ color:signoMovimiento(m.tipo) > 0 ? '#c84040' : '#176a25' }}>
                            {signoMovimiento(m.tipo) > 0 ? '+' : '-'} {fmtGs(m.monto)}
                          </strong>
                          <div className="ui-c5f310">
                            <button onClick={() => abrirMovimiento(m)} style={miniBtn}>Editar</button>
                            <button onClick={() => eliminarMovimiento(m)} style={dangerMiniBtn}>Borrar</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <NotasPanel modulo="cuentas_pagar" titulo="Bloc de notas de cuentas a pagar" />
      </div>

      <UnifiedFormModal
        open={modalProveedor}
        tone="finanzas"
        icon="ti-building-store"
        eyebrow={proveedorForm.id ? 'Editar proveedor' : 'Crédito con proveedores'}
        title={proveedorForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        label={proveedorForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        busy={saving}
        onClose={() => setModalProveedor(false)}
        onSubmit={guardarProveedor}
        submitLabel={proveedorForm.id ? 'Guardar cambios' : 'Guardar proveedor'}
        error={modalProveedor ? error : ''}
        summary={resumenPie([
          { solo: (proveedorForm.nombre || '').trim() },
          { solo: proveedorForm.tipo || '' },
          { solo: proveedorForm.activo === false ? 'Inactivo' : '' },
        ]) || 'Escribí el nombre del proveedor'}
      >{() => <>
        <ModalSection title="Proveedor" icon="ti-building-store">
          <ModalField label="Nombre *"><input className="apple-control" data-autofocus value={proveedorForm.nombre || ''} onChange={e => setProveedorForm(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Agropecuaria San Juan" /></ModalField>
          <ModalGroup label="Tipo">
            <ChoiceChips wrap label="Tipo de proveedor" value={proveedorForm.tipo || 'Agropecuaria'} onChange={tipo => setProveedorForm(f => ({ ...f, tipo }))} options={tiposProveedor.map(t => ({ value:t, label:t }))} />
          </ModalGroup>
          {proveedorForm.id && (
            <ModalGroup label="Estado">
              <ChoiceChips label="Estado del proveedor" value={proveedorForm.activo === false ? 'inactivo' : 'activo'} onChange={v => setProveedorForm(f => ({ ...f, activo: v === 'activo' }))} options={[{ value:'activo', label:'Activo', icon:'ti-circle-check' }, { value:'inactivo', label:'Inactivo', icon:'ti-circle-off' }]} />
            </ModalGroup>
          )}
        </ModalSection>
        <ModalSection title="Contacto" icon="ti-phone">
          <ModalGrid>
            <ModalField label="Persona de contacto"><input className="apple-control" value={proveedorForm.contacto || ''} onChange={e => setProveedorForm(f => ({ ...f, contacto:e.target.value }))} placeholder="Opcional" /></ModalField>
            <ModalField label="Teléfono"><input className="apple-control apple-control--num" type="tel" inputMode="tel" value={proveedorForm.telefono || ''} onChange={e => setProveedorForm(f => ({ ...f, telefono:e.target.value }))} placeholder="Ej: 0981 000 000" /></ModalField>
          </ModalGrid>
          <ModalField label="Dirección"><input className="apple-control" value={proveedorForm.direccion || ''} onChange={e => setProveedorForm(f => ({ ...f, direccion:e.target.value }))} placeholder="Opcional" /></ModalField>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(proveedorForm.notas)} badge={proveedorForm.notas ? '' : 'notas internas'}>
          <ModalField label="Notas internas"><textarea className="apple-control" value={proveedorForm.notas || ''} onChange={e => setProveedorForm(f => ({ ...f, notas:e.target.value }))} placeholder="Condiciones de pago, observaciones…" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      <UnifiedFormModal
        open={modalMovimiento}
        tone="finanzas"
        icon="ti-arrows-exchange"
        eyebrow={movimientoForm.id ? 'Editar movimiento' : 'Crédito con proveedores'}
        title={movimientoForm.id ? 'Editar movimiento' : 'Nuevo movimiento'}
        label={movimientoForm.id ? 'Editar movimiento' : 'Nuevo movimiento'}
        busy={saving}
        onClose={() => setModalMovimiento(false)}
        onSubmit={guardarMovimiento}
        submitLabel={movimientoForm.id ? 'Guardar cambios' : 'Guardar movimiento'}
        error={modalMovimiento ? error : ''}
        summary={resumenPie([
          { solo: tiposMovimiento.find(t => t.value === movimientoForm.tipo)?.label || '' },
          { solo: parseGs(movimientoForm.monto) > 0 ? `${signoMovimiento(movimientoForm.tipo) > 0 ? '+' : '−'} ${fmtGs(parseGs(movimientoForm.monto))}` : '' },
          { solo: proveedores.find(p => p.id === movimientoForm.proveedor_id)?.nombre || '' },
        ]) || 'Proveedor, concepto y monto'}
      >{() => <>
        <ModalSection title="Movimiento" icon="ti-arrows-exchange">
          <ModalField label="Proveedor *" hint={proveedores.length === 0 ? 'Primero cargá un proveedor.' : ''}>
            <select className="apple-control" data-autofocus value={movimientoForm.proveedor_id || ''} onChange={e => setMovimientoForm(f => ({ ...f, proveedor_id:e.target.value }))}>
              <option value="">Elegir proveedor…</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </ModalField>
          <ModalGroup label="Tipo">
            <ChoiceChips wrap label="Tipo de movimiento" value={movimientoForm.tipo || 'compra_credito'} onChange={tipo => setMovimientoForm(f => ({ ...f, tipo }))} options={tiposMovimiento.map(t => ({ value:t.value, label:t.label, icon:ICONO_MOVIMIENTO[t.value] }))} />
          </ModalGroup>
          <ModalField label="Concepto *"><input className="apple-control" value={movimientoForm.concepto || ''} onChange={e => setMovimientoForm(f => ({ ...f, concepto:e.target.value }))} placeholder="Ej: Fertilizante, semillas, pago parcial" /></ModalField>
          <ModalGrid>
            <ModalField label="Monto (Gs.) *"><input className="apple-control apple-control--num" type="text" inputMode="numeric" value={movimientoForm.monto || ''} onWheel={e => e.currentTarget.blur()} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setMovimientoForm(f => ({ ...f, monto:r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 500.000" /></ModalField>
            <DateQuickField label="Fecha" required value={movimientoForm.fecha || hoy()} onChange={fecha => setMovimientoForm(f => ({ ...f, fecha }))} />
          </ModalGrid>
        </ModalSection>
        <ModalSection title="Categoría y pago" icon="ti-tag">
          <ModalField label="Categoría">
            <select className="apple-control" value={movimientoForm.categoria || 'Insumos'} onChange={e => setMovimientoForm(f => ({ ...f, categoria:e.target.value }))}>
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
          </ModalField>
          <ModalGroup label="Medio de pago">
            <ChoiceChips wrap label="Medio de pago" value={movimientoForm.medio_pago || 'Transferencia'} onChange={medio_pago => setMovimientoForm(f => ({ ...f, medio_pago }))} options={mediosPago.map(m => ({ value:m, label:m }))} />
          </ModalGroup>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(movimientoForm.comprobante || movimientoForm.notas)} badge={movimientoForm.comprobante || movimientoForm.notas ? '' : 'comprobante, notas'}>
          <ModalField label="Factura o comprobante"><input className="apple-control apple-control--num" value={movimientoForm.comprobante || ''} onChange={e => setMovimientoForm(f => ({ ...f, comprobante:e.target.value }))} placeholder="Ej: 001-001-0001234" /></ModalField>
          <ModalField label="Notas"><textarea className="apple-control" value={movimientoForm.notas || ''} onChange={e => setMovimientoForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones…" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      {dialogoConfirmar}
    </div>
  )
}

function Stat({ title, value, sub, dark }) {
  return (
    <div style={{ ...card, background:dark ? '#212121' : '#fff', color:dark ? '#fff' : '#101511' }}>
      <div className="ui-8640d8" style={{ color:dark ? 'rgba(255,255,255,0.62)' : '#7b837b' }}>{title}</div>
      <strong className="ui-333c70">{value}</strong>
      <div className="ui-b7951f" style={{ color:dark ? 'rgba(255,255,255,0.58)' : '#6c746d' }}>{sub}</div>
    </div>
  )
}

function MiniTotal({ label, value }) {
  return (
    <div className="ui-3017aa">
      <div className="ui-f352e6">{label}</div>
      <strong className="ui-70c605">{value}</strong>
    </div>
  )
}

const card = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:8,
  padding:16,
  boxShadow:'none',
}

const empty = {
  ...card,
  color:"#697970",
  textAlign:'center',
  padding:26,
}

const iconPill = {
  width:46,
  height:46,
  borderRadius:8,
  background:"#edf7f1",
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
}

const smallBtn = {
  border:'1px solid #e0e4df',
  background:'#fff',
  borderRadius:8,
  padding:'10px 13px',
  fontWeight:700,
  cursor:'pointer',
}

const darkBtn = {
  border:'none',
  background:"#124e38",
  color:'#fff',
  borderRadius:8,
  padding:'11px 15px',
  fontWeight:700,
  cursor:'pointer',
}

const greenBtn = {
  border:'none',
  background:"#08603f",
  color:'#fff',
  borderRadius:8,
  padding:'11px 15px',
  fontWeight:700,
  cursor:'pointer',
}

const miniBtn = {
  border:'1px solid #dfe5df',
  background:'#fff',
  borderRadius:8,
  padding:'7px 10px',
  fontSize:12,
  cursor:'pointer',
}

const dangerMiniBtn = {
  ...miniBtn,
  border:'1px solid #ffd0d0',
  color:'#c84040',
}

const chip = {
  border:'none',
  background:'#eeefeb',
  borderRadius:999,
  padding:'8px 13px',
  fontSize:12,
  fontWeight:700,
  cursor:'pointer',
  color:'#727872',
}

const activeChip = {
  ...chip,
  background:"#124e38",
  color:'#fff',
}

const errorBox = {
  background:'#fff0f0',
  color:'#b52828',
  borderRadius:8,
  padding:'12px 14px',
  fontSize:13,
  marginBottom:14,
}
