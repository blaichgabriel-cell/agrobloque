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
const parseGs = (v) => {
  const limpio = String(v || '').replace(/[^\d-]/g, '')
  return Number(limpio) || 0
}
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
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)
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
    setModalError('')
  }

  const abrirMovimiento = (movimiento = null, proveedorId = '') => {
    setMovimientoForm(movimiento
      ? { ...movimiento, monto: String(Math.round(Number(movimiento.monto || 0))) }
      : { ...movimientoVacio, proveedor_id: proveedorId || proveedores[0]?.id || '' }
    )
    setModalMovimiento(true)
    setError('')
    setModalError('')
  }

  const guardarProveedor = async () => {
    if (!proveedorForm.nombre.trim()) {
      setModalError('Escribi el nombre del proveedor.')
      return
    }

    setSaving(true)
    setModalError('')
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

    if (error) {
      console.error('Error guardando proveedor', error)
      setModalError(`No se pudo guardar el proveedor: ${error.message}`)
    }
    else {
      setModalProveedor(false)
      setProveedorForm(proveedorVacio)
      await cargarDatos()
    }
    setSaving(false)
  }

  const guardarMovimiento = async () => {
    const monto = parseGs(movimientoForm.monto)
    if (!movimientoForm.proveedor_id || !movimientoForm.concepto.trim() || monto <= 0) {
      setModalError('Completa proveedor, concepto y monto. Si el monto tiene puntos, esta bien: ejemplo 1.000.000.')
      return
    }

    setSaving(true)
    setModalError('')
    const payload = {
      proveedor_id: movimientoForm.proveedor_id,
      fecha: movimientoForm.fecha || hoy(),
      tipo: movimientoForm.tipo || 'compra_credito',
      concepto: movimientoForm.concepto.trim(),
      categoria: movimientoForm.categoria || null,
      medio_pago: movimientoForm.medio_pago || null,
      comprobante: movimientoForm.comprobante || null,
      monto,
      notas: movimientoForm.notas || null,
    }

    const query = movimientoForm.id
      ? supabase.from('proveedor_movimientos').update(payload).eq('id', movimientoForm.id)
      : supabase.from('proveedor_movimientos').insert(payload)
    const { error } = await query

    if (error) {
      console.error('Error guardando movimiento de proveedor', error)
      setModalError(`No se pudo guardar el movimiento: ${error.message}`)
    }
    else {
      setModalMovimiento(false)
      setMovimientoForm(movimientoVacio)
      await cargarDatos()
    }
    setSaving(false)
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
    <div style={{ background:'#f2f1ef', minHeight:'100vh', padding:'32px 18px 90px' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14, marginBottom:18 }}>
          <div>
            <div style={{ color:'#8b928b', fontSize:12 }}>Credito con proveedores</div>
            <h1 style={{ margin:'4px 0 0', fontSize:28, letterSpacing:-0.8 }}>Cuentas a pagar</h1>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <button onClick={exportarCsv} style={smallBtn}>CSV</button>
            <button onClick={imprimir} style={smallBtn}>PDF</button>
            <button onClick={() => abrirProveedor()} style={darkBtn}>+ Proveedor</button>
            <button onClick={() => abrirMovimiento()} style={greenBtn}>+ Movimiento</button>
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(140px, 1fr))', gap:12, marginBottom:16 }}>
          <Stat dark title="Deuda total" value={fmtGs(resumen.deudaTotal)} sub={`${resumen.conDeuda} proveedores con deuda`} />
          <Stat title="Compras a credito" value={fmtGs(resumen.comprasTotal)} sub="total registrado" />
          <Stat title="Pagos realizados" value={fmtGs(resumen.pagosTotal)} sub="total abonado" />
          <Stat title="Proveedores" value={proveedores.length} sub="registrados" />
        </div>

        <div style={{ ...card, padding:12, marginBottom:16 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
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

        <div style={{ display:'grid', gap:12 }}>
          {loading ? (
            <div style={empty}>Cargando...</div>
          ) : proveedoresFiltrados.length === 0 ? (
            <div style={empty}>Sin proveedores para mostrar.</div>
          ) : proveedoresFiltrados.map(p => (
            <div key={p.id} style={card}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:14, alignItems:'center' }}>
                <button onClick={() => setProveedorAbierto(proveedorAbierto === p.id ? null : p.id)} style={{ border:'none', background:'transparent', textAlign:'left', cursor:'pointer', padding:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={iconPill}><i className="ti ti-building-store" style={{ fontSize:23, color:'#176a25' }} /></span>
                    <span>
                      <strong style={{ fontSize:17 }}>{p.nombre}</strong>
                      <span style={{ display:'block', fontSize:12, color:'#7a817a', marginTop:3 }}>
                        {p.tipo || 'Proveedor'}{p.telefono ? ` - ${p.telefono}` : ''}
                      </span>
                    </span>
                  </div>
                </button>
                <div style={{ textAlign:'right' }}>
                  <strong style={{ fontSize:22, color:p.saldo > 0 ? '#c84040' : '#176a25' }}>{fmtGs(p.saldo)}</strong>
                  <div style={{ display:'flex', gap:7, justifyContent:'flex-end', marginTop:8, flexWrap:'wrap' }}>
                    <button onClick={() => abrirMovimiento(null, p.id)} style={miniBtn}>Movimiento</button>
                    <button onClick={() => abrirProveedor(p)} style={miniBtn}>Editar</button>
                    <button onClick={() => eliminarProveedor(p)} style={dangerMiniBtn}>Eliminar</button>
                  </div>
                </div>
              </div>

              {proveedorAbierto === p.id && (
                <div style={{ marginTop:14, borderTop:'1px solid #edf0ed', paddingTop:12 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:12 }}>
                    <MiniTotal label="Compras/deuda" value={fmtGs(p.compras)} />
                    <MiniTotal label="Pagos/ajustes" value={fmtGs(p.pagos)} />
                    <MiniTotal label="Movimientos" value={p.movimientos.length} />
                  </div>
                  {p.notas && <div style={{ fontSize:13, color:'#4d544e', marginBottom:10, whiteSpace:'pre-wrap' }}>{p.notas}</div>}
                  <div style={{ display:'grid', gap:8 }}>
                    {p.movimientos.length === 0 ? (
                      <div style={{ color:'#8b928b', fontSize:13 }}>Sin movimientos.</div>
                    ) : p.movimientos.map(m => (
                      <div key={m.id} style={{ background:'#f7f8f6', borderRadius:14, padding:'10px 12px', display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center' }}>
                        <div>
                          <strong style={{ fontSize:14 }}>{m.concepto}</strong>
                          <div style={{ fontSize:12, color:'#788078', marginTop:3 }}>
                            {m.fecha} - {tiposMovimiento.find(t => t.value === m.tipo)?.label || m.tipo}{m.comprobante ? ` - ${m.comprobante}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <strong style={{ color:signoMovimiento(m.tipo) > 0 ? '#c84040' : '#176a25' }}>
                            {signoMovimiento(m.tipo) > 0 ? '+' : '-'} {fmtGs(m.monto)}
                          </strong>
                          <div style={{ display:'flex', gap:6, marginTop:7 }}>
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

        <NotasPanel modulo="cuentas_pagar" titulo="Blog de notas de cuentas a pagar" />
      </div>

      {modalProveedor && (
        <Modal onClose={() => setModalProveedor(false)} title={proveedorForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}>
          {modalError && <div style={modalErrorBox}>{modalError}</div>}
          <input style={input} placeholder="Nombre de la agropecuaria/proveedor" value={proveedorForm.nombre || ''} onChange={e => setProveedorForm(f => ({ ...f, nombre:e.target.value }))} />
          <select style={input} value={proveedorForm.tipo || 'Agropecuaria'} onChange={e => setProveedorForm(f => ({ ...f, tipo:e.target.value }))}>
            {tiposProveedor.map(t => <option key={t}>{t}</option>)}
          </select>
          <input style={input} placeholder="Contacto" value={proveedorForm.contacto || ''} onChange={e => setProveedorForm(f => ({ ...f, contacto:e.target.value }))} />
          <input style={input} placeholder="Telefono" value={proveedorForm.telefono || ''} onChange={e => setProveedorForm(f => ({ ...f, telefono:e.target.value }))} />
          <input style={input} placeholder="Direccion" value={proveedorForm.direccion || ''} onChange={e => setProveedorForm(f => ({ ...f, direccion:e.target.value }))} />
          <textarea style={{ ...input, minHeight:80 }} placeholder="Notas internas" value={proveedorForm.notas || ''} onChange={e => setProveedorForm(f => ({ ...f, notas:e.target.value }))} />
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginBottom:12 }}>
            <input type="checkbox" checked={proveedorForm.activo !== false} onChange={e => setProveedorForm(f => ({ ...f, activo:e.target.checked }))} />
            Proveedor activo
          </label>
          <button onClick={guardarProveedor} disabled={saving} style={{ ...greenBtn, width:'100%', opacity:saving ? 0.65 : 1 }}>{saving ? 'Guardando...' : 'Guardar proveedor'}</button>
        </Modal>
      )}

      {modalMovimiento && (
        <Modal onClose={() => setModalMovimiento(false)} title={movimientoForm.id ? 'Editar movimiento' : 'Nuevo movimiento'}>
          {modalError && <div style={modalErrorBox}>{modalError}</div>}
          <select style={input} value={movimientoForm.proveedor_id || ''} onChange={e => setMovimientoForm(f => ({ ...f, proveedor_id:e.target.value }))}>
            <option value="">Elegir proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <input type="date" style={input} value={movimientoForm.fecha || hoy()} onChange={e => setMovimientoForm(f => ({ ...f, fecha:e.target.value }))} />
            <select style={input} value={movimientoForm.tipo || 'compra_credito'} onChange={e => setMovimientoForm(f => ({ ...f, tipo:e.target.value }))}>
              {tiposMovimiento.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <input style={input} placeholder="Concepto: fertilizante, semillas, pago parcial..." value={movimientoForm.concepto || ''} onChange={e => setMovimientoForm(f => ({ ...f, concepto:e.target.value }))} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <select style={input} value={movimientoForm.categoria || 'Insumos'} onChange={e => setMovimientoForm(f => ({ ...f, categoria:e.target.value }))}>
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
            <input style={input} placeholder="Monto" value={movimientoForm.monto || ''} onChange={e => setMovimientoForm(f => ({ ...f, monto:e.target.value }))} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <select style={input} value={movimientoForm.medio_pago || 'Transferencia'} onChange={e => setMovimientoForm(f => ({ ...f, medio_pago:e.target.value }))}>
              {mediosPago.map(m => <option key={m}>{m}</option>)}
            </select>
            <input style={input} placeholder="Factura/comprobante" value={movimientoForm.comprobante || ''} onChange={e => setMovimientoForm(f => ({ ...f, comprobante:e.target.value }))} />
          </div>
          <textarea style={{ ...input, minHeight:80 }} placeholder="Notas" value={movimientoForm.notas || ''} onChange={e => setMovimientoForm(f => ({ ...f, notas:e.target.value }))} />
          <button onClick={guardarMovimiento} disabled={saving} style={{ ...greenBtn, width:'100%', opacity:saving ? 0.65 : 1 }}>{saving ? 'Guardando...' : 'Guardar movimiento'}</button>
        </Modal>
      )}
    </div>
  )
}

function Stat({ title, value, sub, dark }) {
  return (
    <div style={{ ...card, background:dark ? '#212121' : '#fff', color:dark ? '#fff' : '#101511' }}>
      <div style={{ color:dark ? 'rgba(255,255,255,0.62)' : '#7b837b', fontSize:11, textTransform:'uppercase' }}>{title}</div>
      <strong style={{ display:'block', fontSize:24, marginTop:7 }}>{value}</strong>
      <div style={{ color:dark ? 'rgba(255,255,255,0.58)' : '#6c746d', fontSize:12, marginTop:5 }}>{sub}</div>
    </div>
  )
}

function MiniTotal({ label, value }) {
  return (
    <div style={{ background:'#f7f8f6', borderRadius:14, padding:12 }}>
      <div style={{ color:'#7a817a', fontSize:11, textTransform:'uppercase' }}>{label}</div>
      <strong style={{ fontSize:16, display:'block', marginTop:4 }}>{value}</strong>
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:18 }}>
      <div style={{ width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', background:'#f2f1ef', borderRadius:24, padding:20, boxShadow:'0 24px 70px rgba(0,0,0,0.28)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h2 style={{ margin:0, fontSize:22 }}>{title}</h2>
          <button onClick={onClose} style={{ border:'1px solid #e3e3de', background:'#fff', borderRadius:12, width:36, height:36, cursor:'pointer' }}>x</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const card = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:18,
  padding:16,
  boxShadow:'0 14px 34px rgba(24, 32, 24, 0.05)',
}

const empty = {
  ...card,
  color:'#8b928b',
  textAlign:'center',
  padding:26,
}

const iconPill = {
  width:46,
  height:46,
  borderRadius:14,
  background:'#edf6ec',
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
}

const input = {
  width:'100%',
  border:'1px solid #e2e5df',
  borderRadius:13,
  padding:'12px 13px',
  background:'#fff',
  fontSize:14,
  marginBottom:10,
  boxSizing:'border-box',
}

const smallBtn = {
  border:'1px solid #e0e4df',
  background:'#fff',
  borderRadius:13,
  padding:'10px 13px',
  fontWeight:800,
  cursor:'pointer',
}

const darkBtn = {
  border:'none',
  background:'#212121',
  color:'#fff',
  borderRadius:13,
  padding:'11px 15px',
  fontWeight:850,
  cursor:'pointer',
}

const greenBtn = {
  border:'none',
  background:'#176a25',
  color:'#fff',
  borderRadius:13,
  padding:'11px 15px',
  fontWeight:850,
  cursor:'pointer',
}

const miniBtn = {
  border:'1px solid #dfe5df',
  background:'#fff',
  borderRadius:10,
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
  fontWeight:750,
  cursor:'pointer',
  color:'#727872',
}

const activeChip = {
  ...chip,
  background:'#212121',
  color:'#fff',
}

const errorBox = {
  background:'#fff0f0',
  color:'#b52828',
  borderRadius:14,
  padding:'12px 14px',
  fontSize:13,
  marginBottom:14,
}

const modalErrorBox = {
  background:'#fff0f0',
  color:'#b52828',
  border:'1px solid #ffd6d6',
  borderRadius:13,
  padding:'10px 12px',
  fontSize:13,
  marginBottom:12,
}
