import React, { useEffect, useMemo, useState } from 'react'
import NotasPanel from '../components/NotasPanel'
import { supabase } from '../lib/supabase'

const tiposProveedor = ['Agropecuaria', 'Ferreteria', 'Transporte', 'Servicios', 'Otro']
const categorias = ['Insumos', 'Fertilizantes', 'Agroquimicos', 'Semillas', 'Herramientas', 'Servicios', 'Combustible', 'Otros']
const mediosPago = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro']
const tiposMovimiento = [
  { value: 'compra_credito', label: 'Compra a credito', signo: 1 },
  { value: 'pago', label: 'Pago realizado', signo: -1 },
  { value: 'ajuste_suma', label: 'Ajuste que suma deuda', signo: 1 },
  { value: 'ajuste_resta', label: 'Descuento o ajuste a favor', signo: -1 },
]

const hoy = () => new Date().toISOString().slice(0, 10)
const fmtGs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`
const parseGs = (v) => Number(String(v || '').replace(/[^\d.-]/g, '')) || 0
const signoMovimiento = (tipo) => tiposMovimiento.find(t => t.value === tipo)?.signo || 1

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
      ? { ...movimiento, monto: String(Math.round(Number(movimiento.monto || 0))) }
      : { ...movimientoVacio, proveedor_id: proveedorId || proveedores[0]?.id || '' }
    )
    setModalMovimiento(true)
    setError('')
  }

  const guardarProveedor = async () => {
    if (!proveedorForm.nombre.trim()) {
      setError('Escribi el nombre del proveedor.')
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

    const query = proveedorForm.id
      ? supabase.from('proveedores_credito').update(payload).eq('id', proveedorForm.id)
      : supabase.from('proveedores_credito').insert(payload)
    const { error } = await query

    if (error) setError('No se pudo guardar el proveedor.')
    else {
      setModalProveedor(false)
      setProveedorForm(proveedorVacio)
      await cargarDatos()
    }
  }

  const guardarMovimiento = async () => {
    if (!movimientoForm.proveedor_id || !movimientoForm.concepto.trim() || parseGs(movimientoForm.monto) <= 0) {
      setError('Completa proveedor, concepto y monto.')
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

    const query = movimientoForm.id
      ? supabase.from('proveedor_movimientos').update(payload).eq('id', movimientoForm.id)
      : supabase.from('proveedor_movimientos').insert(payload)
    const { error } = await query

    if (error) setError('No se pudo guardar el movimiento.')
    else {
      setModalMovimiento(false)
      setMovimientoForm(movimientoVacio)
      await cargarDatos()
    }
  }

  const eliminarProveedor = async (proveedor) => {
    if (!window.confirm(`Eliminar ${proveedor.nombre} y todos sus movimientos?`)) return
    const { error } = await supabase.from('proveedores_credito').delete().eq('id', proveedor.id)
    if (error) setError('No se pudo eliminar el proveedor.')
    else cargarDatos()
  }

  const eliminarMovimiento = async (movimiento) => {
    if (!window.confirm('Eliminar este movimiento?')) return
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
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
  }

  return (
    <div className="ui-42cbcb">
      <div className="ui-89a869">
        <div className="ui-a9915a">
          <div>
            <div className="ui-567f4b">Credito con proveedores</div>
            <h1 className="ui-5f0bf1">Cuentas a pagar</h1>
          </div>
          <div className="ui-9a2d51">
            <button onClick={exportarCsv} style={smallBtn}>CSV</button>
            <button onClick={imprimir} style={smallBtn}>PDF</button>
            <button onClick={() => abrirProveedor()} style={darkBtn}>+ Proveedor</button>
            <button onClick={() => abrirMovimiento()} style={greenBtn}>+ Movimiento</button>
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div className="ui-e9ea38">
          <Stat dark title="Deuda total" value={fmtGs(resumen.deudaTotal)} sub={`${resumen.conDeuda} proveedores con deuda`} />
          <Stat title="Compras a credito" value={fmtGs(resumen.comprasTotal)} sub="total registrado" />
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

      {modalProveedor && (
        <Modal onClose={() => setModalProveedor(false)} title={proveedorForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}>
          <input style={input} placeholder="Nombre de la agropecuaria/proveedor" value={proveedorForm.nombre || ''} onChange={e => setProveedorForm(f => ({ ...f, nombre:e.target.value }))} />
          <select style={input} value={proveedorForm.tipo || 'Agropecuaria'} onChange={e => setProveedorForm(f => ({ ...f, tipo:e.target.value }))}>
            {tiposProveedor.map(t => <option key={t}>{t}</option>)}
          </select>
          <input style={input} placeholder="Contacto" value={proveedorForm.contacto || ''} onChange={e => setProveedorForm(f => ({ ...f, contacto:e.target.value }))} />
          <input style={input} placeholder="Telefono" value={proveedorForm.telefono || ''} onChange={e => setProveedorForm(f => ({ ...f, telefono:e.target.value }))} />
          <input style={input} placeholder="Direccion" value={proveedorForm.direccion || ''} onChange={e => setProveedorForm(f => ({ ...f, direccion:e.target.value }))} />
          <textarea className="ui-278063" style={{ ...input }} placeholder="Notas internas" value={proveedorForm.notas || ''} onChange={e => setProveedorForm(f => ({ ...f, notas:e.target.value }))} />
          <label className="ui-0f0b58">
            <input type="checkbox" checked={proveedorForm.activo !== false} onChange={e => setProveedorForm(f => ({ ...f, activo:e.target.checked }))} />
            Proveedor activo
          </label>
          <button className="ui-6d5673" onClick={guardarProveedor} style={{ ...greenBtn }}>Guardar proveedor</button>
        </Modal>
      )}

      {modalMovimiento && (
        <Modal onClose={() => setModalMovimiento(false)} title={movimientoForm.id ? 'Editar movimiento' : 'Nuevo movimiento'}>
          <select style={input} value={movimientoForm.proveedor_id || ''} onChange={e => setMovimientoForm(f => ({ ...f, proveedor_id:e.target.value }))}>
            <option value="">Elegir proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div className="ui-eba032">
            <input type="date" style={input} value={movimientoForm.fecha || hoy()} onChange={e => setMovimientoForm(f => ({ ...f, fecha:e.target.value }))} />
            <select style={input} value={movimientoForm.tipo || 'compra_credito'} onChange={e => setMovimientoForm(f => ({ ...f, tipo:e.target.value }))}>
              {tiposMovimiento.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <input style={input} placeholder="Concepto: fertilizante, semillas, pago parcial..." value={movimientoForm.concepto || ''} onChange={e => setMovimientoForm(f => ({ ...f, concepto:e.target.value }))} />
          <div className="ui-eba032">
            <select style={input} value={movimientoForm.categoria || 'Insumos'} onChange={e => setMovimientoForm(f => ({ ...f, categoria:e.target.value }))}>
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
            <input style={input} placeholder="Monto" value={movimientoForm.monto || ''} onChange={e => setMovimientoForm(f => ({ ...f, monto:e.target.value }))} />
          </div>
          <div className="ui-eba032">
            <select style={input} value={movimientoForm.medio_pago || 'Transferencia'} onChange={e => setMovimientoForm(f => ({ ...f, medio_pago:e.target.value }))}>
              {mediosPago.map(m => <option key={m}>{m}</option>)}
            </select>
            <input style={input} placeholder="Factura/comprobante" value={movimientoForm.comprobante || ''} onChange={e => setMovimientoForm(f => ({ ...f, comprobante:e.target.value }))} />
          </div>
          <textarea className="ui-278063" style={{ ...input }} placeholder="Notas" value={movimientoForm.notas || ''} onChange={e => setMovimientoForm(f => ({ ...f, notas:e.target.value }))} />
          <button className="ui-6d5673" onClick={guardarMovimiento} style={{ ...greenBtn }}>Guardar movimiento</button>
        </Modal>
      )}
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

function Modal({ title, children, onClose }) {
  return (
    <div className="ui-9d3361">
      <div className="ui-b344e7">
        <div className="ui-57d669">
          <h2 className="ui-8f657d">{title}</h2>
          <button className="ui-685979" onClick={onClose}>x</button>
        </div>
        {children}
      </div>
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

const input = {
  width:'100%',
  border:'1px solid #e2e5df',
  borderRadius:8,
  padding:'12px 13px',
  background:'#fff',
  fontSize:14,
  marginBottom:10,
  boxSizing:'border-box',
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
