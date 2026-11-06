import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { descargarCsv, imprimirHtml } from '../lib/exporters'

const meses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const categoriasCompra = ['Insumos', 'Mercaderia', 'Sueldos', 'Servicios', 'Reparaciones', 'Combustible', 'Otros']
const categoriasVenta = ['Verduras', 'Plantines', 'Servicios', 'Otros']
const mediosPago = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro']

const hoy = () => new Date().toISOString().split('T')[0]
const anhoActual = () => new Date().getFullYear()
const mesActual = () => new Date().getMonth()
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const parseGs = (v) => parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0
const fechaInicioMes = (anho, mes) => `${anho}-${String(mes + 1).padStart(2, '0')}-01`

const formInicial = {
  fecha: hoy(),
  tipo: 'compra',
  descripcion: '',
  categoria: 'Insumos',
  contraparte: '',
  medio_pago: 'Efectivo',
  comprobante: '',
  monto: '',
  notas: '',
}

export default function Contabilidad() {
  const navigate = useNavigate()
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(formInicial)
  const [filtro, setFiltro] = useState('todos')
  const [anho, setAnho] = useState(anhoActual())
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual())
  const [bloquesActivos, setBloquesActivos] = useState(0)

  useEffect(() => { fetchMovimientos() }, [anho])

  const fetchMovimientos = async () => {
    setLoading(true)
    const desde = `${anho}-01-01`
    const hasta = `${anho}-12-31`
    const [movimientosResult, bloquesResult] = await Promise.all([
      supabase
        .from('contabilidad_movimientos')
        .select('*')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('bloques').select('id', { count:'exact', head:true }).eq('activo', true),
    ])
    const { data, error } = movimientosResult
    setBloquesActivos(Number(bloquesResult.count) || 0)

    if (error) {
      setError('Falta ejecutar el SQL de contabilidad en Supabase.')
      setMovimientos([])
    } else {
      setError('')
      setMovimientos(data || [])
    }
    setLoading(false)
  }

  const resumen = useMemo(() => {
    const porMes = meses.map((nombre, idx) => ({ nombre, idx, compras: 0, ventas: 0, balance: 0 }))

    movimientos.forEach(m => {
      const idx = Number((m.fecha || '').slice(5, 7)) - 1
      if (idx < 0 || idx > 11) return
      const monto = Number(m.monto) || 0
      if (m.tipo === 'venta') porMes[idx].ventas += monto
      else porMes[idx].compras += monto
      porMes[idx].balance = porMes[idx].ventas - porMes[idx].compras
    })

    const ventas = porMes.reduce((s, m) => s + m.ventas, 0)
    const compras = porMes.reduce((s, m) => s + m.compras, 0)
    return { porMes, ventas, compras, balance: ventas - compras }
  }, [movimientos])

  const movimientosDelMes = useMemo(() => {
    return movimientos.filter(m => Number((m.fecha || '').slice(5, 7)) - 1 === mesSeleccionado)
  }, [movimientos, mesSeleccionado])

  const resumenMes = useMemo(() => {
    const ventas = movimientosDelMes.filter(m => m.tipo === 'venta').reduce((s, m) => s + (Number(m.monto) || 0), 0)
    const compras = movimientosDelMes.filter(m => m.tipo !== 'venta').reduce((s, m) => s + (Number(m.monto) || 0), 0)
    const balance = ventas - compras
    return {
      ventas,
      compras,
      balance,
      margen: ventas > 0 ? (balance / ventas) * 100 : 0,
      costoPorBloque: bloquesActivos > 0 ? compras / bloquesActivos : 0,
      total: movimientosDelMes.length,
    }
  }, [movimientosDelMes, bloquesActivos])

  const movimientosFiltrados = useMemo(() => {
    if (filtro === 'todos') return movimientosDelMes
    return movimientosDelMes.filter(m => m.tipo === filtro)
  }, [movimientosDelMes, filtro])

  const abrirNuevo = (tipo = 'compra') => {
    const fechaSugerida = anho === anhoActual() && mesSeleccionado === mesActual()
      ? hoy()
      : fechaInicioMes(anho, mesSeleccionado)
    setForm({
      ...formInicial,
      fecha: fechaSugerida,
      tipo,
      categoria: tipo === 'venta' ? 'Verduras' : 'Insumos',
    })
    setModal(true)
  }

  const abrirEditar = (mov) => {
    setForm({
      id: mov.id,
      fecha: mov.fecha || hoy(),
      tipo: mov.tipo || 'compra',
      descripcion: mov.descripcion || '',
      categoria: mov.categoria || (mov.tipo === 'venta' ? 'Verduras' : 'Insumos'),
      contraparte: mov.contraparte || '',
      medio_pago: mov.medio_pago || 'Efectivo',
      comprobante: mov.comprobante || '',
      monto: mov.monto ? fmtGs(mov.monto) : '',
      notas: mov.notas || '',
    })
    setModal(true)
  }

  const setTipo = (tipo) => {
    setForm(f => ({
      ...f,
      tipo,
      categoria: tipo === 'venta' ? 'Verduras' : 'Insumos',
    }))
  }

  const guardar = async () => {
    const monto = parseGs(form.monto)
    if (!form.fecha || !form.descripcion.trim() || monto <= 0) return
    setSaving(true)
    const payload = {
      fecha: form.fecha,
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      categoria: form.categoria || null,
      contraparte: form.contraparte || null,
      medio_pago: form.medio_pago || null,
      comprobante: form.comprobante || null,
      monto,
      notas: form.notas || null,
    }

    const res = form.id
      ? await supabase.from('contabilidad_movimientos').update(payload).eq('id', form.id)
      : await supabase.from('contabilidad_movimientos').insert(payload)

    if (res.error) setError('No se pudo guardar. Revisa si ejecutaste el SQL de contabilidad.')
    else {
      setModal(false)
      await fetchMovimientos()
    }
    setSaving(false)
  }

  const eliminar = async (id) => {
    if (!window.confirm('Eliminar este movimiento de contabilidad?')) return
    const { error } = await supabase.from('contabilidad_movimientos').delete().eq('id', id)
    if (error) setError('No se pudo eliminar el movimiento.')
    else fetchMovimientos()
  }

  const exportarCsv = () => {
    const rows = movimientosFiltrados.map(m => ({
      Fecha: m.fecha,
      Tipo: m.tipo,
      Descripcion: m.descripcion,
      Categoria: m.categoria || '',
      Contraparte: m.contraparte || '',
      MedioPago: m.medio_pago || '',
      Comprobante: m.comprobante || '',
      Monto: Number(m.monto) || 0,
      Notas: m.notas || '',
    }))
    descargarCsv(`contabilidad-${anho}-${String(mesSeleccionado + 1).padStart(2, '0')}`, ['Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Contraparte', 'MedioPago', 'Comprobante', 'Monto', 'Notas'], rows)
  }

  const imprimirBalance = () => {
    imprimirHtml('Balance contable AgroBloque', `
      <h1>Balance contable AgroBloque</h1>
      <div class="muted">Historial de ${meses[mesSeleccionado]} ${anho}</div>
      <h2>Resumen del mes</h2>
      <table>
        <tr><th>Periodo</th><th class="right">Compras</th><th class="right">Ventas</th><th class="right">Balance</th></tr>
        <tr><td>${meses[mesSeleccionado]} ${anho}</td><td class="right">Gs. ${fmtGs(resumenMes.compras)}</td><td class="right">Gs. ${fmtGs(resumenMes.ventas)}</td><td class="right total">Gs. ${fmtGs(resumenMes.balance)}</td></tr>
      </table>
      <h2>Movimientos del mes</h2>
      <table>
        <tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Contraparte</th><th>Comprobante</th><th class="right">Monto</th></tr>
        ${movimientosFiltrados.map(m => `<tr><td>${m.fecha || ''}</td><td>${m.tipo || ''}</td><td>${m.descripcion || ''}</td><td>${m.categoria || ''}</td><td>${m.contraparte || ''}</td><td>${m.comprobante || ''}</td><td class="right">Gs. ${fmtGs(m.monto)}</td></tr>`).join('')}
      </table>
      <h2>Resumen anual</h2>
      <div class="muted">Año ${anho}</div>
      <table>
        <tr><th>Mes</th><th class="right">Compras</th><th class="right">Ventas</th><th class="right">Balance</th></tr>
        ${resumen.porMes.map(m => `<tr><td>${m.nombre}</td><td class="right">Gs. ${fmtGs(m.compras)}</td><td class="right">Gs. ${fmtGs(m.ventas)}</td><td class="right total">Gs. ${fmtGs(m.balance)}</td></tr>`).join('')}
        <tr><td class="total">Total</td><td class="right total">Gs. ${fmtGs(resumen.compras)}</td><td class="right total">Gs. ${fmtGs(resumen.ventas)}</td><td class="right total">Gs. ${fmtGs(resumen.balance)}</td></tr>
      </table>
    `)
  }

  const categorias = form.tipo === 'venta' ? categoriasVenta : categoriasCompra

  const maxMes = Math.max(1, ...resumen.porMes.flatMap(m => [m.ventas, m.compras]))

  return (
    <div className="accounting-page bl-module-page">
      <div className="fin-head-wrap">
        <div className="bl-page-head">
          <div className="bl-page-title">
            <span className="bl-page-icon" aria-hidden="true"><i className="ti ti-calculator" /></span>
            <div><small>Balance independiente</small><h1 className="ag-page-title">Contabilidad</h1></div>
          </div>
          <button className="bl-btn-solid" aria-label="Nueva compra" onClick={() => abrirNuevo('compra')}>
            <i className="ti ti-plus" aria-hidden="true" />
          </button>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div className="ui-860439">
          <select value={anho} onChange={e => setAnho(Number(e.target.value))} style={selectYear}>
            {[anhoActual() - 1, anhoActual(), anhoActual() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="ui-91294d">
            <button className="ui-c59ad0" onClick={() => navigate('/contabilidad/facturas')} style={{ ...smallAction }}>
              <i className="ti ti-file-invoice" aria-hidden="true" /> Facturas
            </button>
            <button onClick={exportarCsv} style={smallAction}>CSV</button>
            <button onClick={imprimirBalance} style={smallAction}>PDF</button>
            <button onClick={() => abrirNuevo('compra')} style={smallAction}>Compra</button>
            <button className="ui-c84552" onClick={() => abrirNuevo('venta')} style={{ ...smallAction }}>Venta</button>
          </div>
        </div>

        <div className="accounting-kpis">
          <TotalCard icon="ti-trending-up" label={`Ingresos ${meses[mesSeleccionado]}`} value={resumenMes.ventas} tone="in" detail="Ventas registradas" />
          <TotalCard icon="ti-trending-down" label={`Egresos ${meses[mesSeleccionado]}`} value={resumenMes.compras} tone="out" detail="Compras registradas" />
          <TotalCard icon="ti-scale" label={`Balance neto ${meses[mesSeleccionado]}`} value={resumenMes.balance} tone={resumenMes.balance >= 0 ? 'net' : 'out'} detail={`Margen ${resumenMes.margen.toLocaleString('es-PY', { maximumFractionDigits:1 })}%`} />
          <TotalCard icon="ti-layout-grid" label="Costo por bloque activo" value={resumenMes.costoPorBloque} tone="block" detail={bloquesActivos ? `${bloquesActivos} bloques activos` : 'Sin bloques activos'} />
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        <section style={card}>
          <div style={sectionHead}>
            <div>
              <div style={eyebrow}>Historial contable {anho}</div>
              <h2 style={sectionTitle}>Elegir mes</h2>
            </div>
            <div className="ui-19585d">{resumenMes.total} movimientos</div>
          </div>
          <div className="fin-month-grid">
            {resumen.porMes.map(m => {
              const activo = mesSeleccionado === m.idx
              const tieneMovimientos = (m.compras + m.ventas) > 0
              return (
                <button key={m.nombre} onClick={() => setMesSeleccionado(m.idx)} className={`fin-month ${activo ? 'is-active' : ''} ${m.balance < 0 ? 'is-negative' : ''}`} aria-pressed={activo}>
                  <span className="fin-bars" aria-hidden="true"><i className="is-in" style={{ height:`${m.ventas / maxMes * 100}%` }} /><i className="is-out" style={{ height:`${m.compras / maxMes * 100}%` }} /></span>
                  <strong>{m.nombre}</strong>
                  <small className="mono">{tieneMovimientos ? `Gs. ${fmtGs(m.balance)}` : 'Sin movimientos'}</small>
                </button>
              )
            })}
          </div>
        </section>

        <section style={card}>
          <div style={sectionHead}>
            <div>
              <div style={eyebrow}>Control de balance {anho}</div>
              <h2 style={sectionTitle}>Resumen mensual</h2>
            </div>
            <i className="ti ti-table ui-1cfb3f" aria-hidden="true"></i>
          </div>

          <div className="ui-df74e8">
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Mes</th>
                  <th style={thRight}>Compras</th>
                  <th style={thRight}>Ventas</th>
                  <th style={thRight}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {resumen.porMes.map(m => (
                  <tr className="ui-b202c6" key={m.nombre} onClick={() => setMesSeleccionado(m.idx)} style={{ background: mesSeleccionado === m.idx ? '#f0f7ef' : 'transparent' }}>
                    <td style={td}>{m.nombre}</td>
                    <td style={tdRight}>Gs. {fmtGs(m.compras)}</td>
                    <td style={tdRight}>Gs. {fmtGs(m.ventas)}</td>
                    <td className="ui-83e448" style={{ ...tdRight, color: m.balance >= 0 ? '#176a25' : '#c84040' }}>Gs. {fmtGs(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={tf}>Total</td>
                  <td style={tfRight}>Gs. {fmtGs(resumen.compras)}</td>
                  <td style={tfRight}>Gs. {fmtGs(resumen.ventas)}</td>
                  <td style={{ ...tfRight, color: resumen.balance >= 0 ? '#176a25' : '#c84040' }}>Gs. {fmtGs(resumen.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section style={card}>
          <div style={sectionHead}>
            <div>
              <div style={eyebrow}>Compras y ventas</div>
              <h2 style={sectionTitle}>Historial de {meses[mesSeleccionado]} {anho}</h2>
            </div>
            <div className="SegmentedControl" role="tablist" aria-label="Filtrar movimientos">
              {['todos', 'compra', 'venta'].map(k => (
                <button className={filtro === k ? 'active' : ''} role="tab" aria-selected={filtro === k} key={k} onClick={() => setFiltro(k)}>
                  {k === 'todos' ? 'Todos' : k === 'compra' ? 'Compras' : 'Ventas'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <Empty text="Cargando movimientos..." />
          ) : movimientosFiltrados.length === 0 ? (
            <Empty text="Sin movimientos registrados." />
          ) : movimientosFiltrados.map(m => (
            <Movimiento key={m.id} mov={m} onEdit={() => abrirEditar(m)} onDelete={() => eliminar(m.id)} />
          ))}
        </section>

        <NotasPanel modulo="contabilidad" titulo="Bloc de notas de contabilidad" />
      </div>

      {modal && (
        <div style={overlay}>
          <div style={sheet}>
            <div className="ui-d5c0da">
              {form.id ? 'Editar movimiento' : 'Nuevo movimiento'}
            </div>

            <div className="ui-1a76a0">
              <button onClick={() => setTipo('compra')} style={form.tipo === 'compra' ? tipoActiveRed : tipoBtn}>Compra</button>
              <button onClick={() => setTipo('venta')} style={form.tipo === 'venta' ? tipoActiveGreen : tipoBtn}>Venta</button>
            </div>

            <Field label="Fecha *" type="date" value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha:v }))} />
            <Field label="Monto (Gs.) *" value={form.monto} inputMode="numeric" onChange={v => {
              const n = parseGs(v)
              setForm(f => ({ ...f, monto:n ? fmtGs(n) : '' }))
            }} placeholder="Ej: 150.000" />
            <Field label="Descripción *" value={form.descripcion} onChange={v => setForm(f => ({ ...f, descripcion:v }))} placeholder="Ej: compra de insumos / venta de tomate" />
            <Select label="Categoría" value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria:v }))} options={categorias} />
            <Field label={form.tipo === 'venta' ? 'Cliente' : 'Proveedor'} value={form.contraparte} onChange={v => setForm(f => ({ ...f, contraparte:v }))} placeholder="Nombre opcional" />
            <Select label="Medio de pago" value={form.medio_pago} onChange={v => setForm(f => ({ ...f, medio_pago:v }))} options={mediosPago} />
            <Field label="Comprobante" value={form.comprobante} onChange={v => setForm(f => ({ ...f, comprobante:v }))} placeholder="Factura, recibo, transferencia..." />
            <Field label="Notas" textarea value={form.notas} onChange={v => setForm(f => ({ ...f, notas:v }))} />

            <button onClick={guardar} disabled={saving} style={primaryBtn}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button onClick={() => setModal(false)} style={secondaryBtn}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TotalCard({ icon, label, value, tone, detail = '' }) {
  return (
    <div className="kpi-card accounting-kpi fin-card" data-fin={tone}>
      <span className="fin-card-icon" aria-hidden="true"><i className={`ti ${icon}`} /></span>
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value"><small>Gs.</small> {fmtGs(value)}</div>
      {detail && <small className="kpi-card__detail">{detail}</small>}
    </div>
  )
}

function Movimiento({ mov, onEdit, onDelete }) {
  const venta = mov.tipo === 'venta'
  return (
    <div className="ui-bd5fd3">
      <div style={{ ...iconPill, background: venta ? '#edf6ec' : '#fff0f0' }}>
        <i className={`${`ti ${venta ? 'ti-arrow-up-right' : 'ti-arrow-down-left'}`} ui-e5e6f8`} style={{ color: venta ? '#176a25' : '#c84040' }} aria-hidden="true"></i>
      </div>
      <div className="ui-3f9f96">
        <div className="ui-36eedc">
          <strong className="ui-aebc78" title={mov.descripcion}>{mov.descripcion}</strong>
          <span className="ui-3c74d4" style={{ background: venta ? '#edf6ec' : '#fff0f0', color: venta ? '#176a25' : '#c84040' }}>
            {venta ? 'Venta' : 'Compra'}
          </span>
        </div>
        <div className="ui-7aa842">
          {mov.fecha} · {mov.categoria || 'Sin categoría'}{mov.contraparte ? ` · ${mov.contraparte}` : ''}
        </div>
      </div>
      <div className="ui-11f4c8">
        <strong className="ui-3044b6" style={{ color: venta ? '#176a25' : '#c84040' }}>Gs. {fmtGs(mov.monto)}</strong>
        <div className="ui-cfb7cc">
          <button onClick={onEdit} style={miniBtn}><i className="ti ti-pencil" /></button>
          <button className="ui-00b236" onClick={onDelete} style={{ ...miniBtn }}><i className="ti ti-trash" /></button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', textarea, inputMode }) {
  return (
    <label className="ui-fa9aec">
      <div style={labelStyle}>{label}</div>
      {textarea ? (
        <textarea className="ui-135d49" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle }} />
      ) : (
        <input type={type} inputMode={inputMode} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </label>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="ui-fa9aec">
      <div style={labelStyle}>{label}</div>
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  )
}

function Empty({ text }) {
  return <div className="ui-fdcaa7">{text}</div>
}

const smallAction = {
  border:'none',
  background:'#fff',
  color:'#121512',
  borderRadius:8,
  padding:'0 12px',
  fontSize:12,
  fontWeight:700,
  cursor:'pointer',
}

const selectYear = {
  width:'100%',
  border:'1px solid #e1e5e1',
  borderRadius:8,
  background:'#fff',
  padding:'11px 12px',
  fontSize:13,
  color:'#111611',
}

const card = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:8,
  padding:16,
  marginBottom:10,
  boxShadow:'none',
}

const sectionHead = {
  display:'flex',
  justifyContent:'space-between',
  alignItems:'center',
  gap:12,
  marginBottom:14,
}

const eyebrow = { fontSize:10, color:'#8a918b', textTransform:'uppercase', marginBottom:4, fontWeight:700 }
const sectionTitle = { margin:0, fontSize:17, letterSpacing:-0.3 }

const tabla = { width:'100%', minWidth:560, borderCollapse:'collapse', fontSize:12 }
const th = { textAlign:'left', padding:'10px 8px', color:'#6a716b', borderBottom:'1px solid #e8ece8', textTransform:'uppercase', fontSize:10 }
const thRight = { ...th, textAlign:'right' }
const td = { padding:'10px 8px', borderBottom:'1px solid #f0f2f0', color:'#111611' }
const tdRight = { ...td, textAlign:'right' }
const tf = { padding:'12px 8px', fontWeight:700, background:'#f5f7f5', borderTop:'1px solid #dfe5df' }
const tfRight = { ...tf, textAlign:'right' }


const iconPill = {
  width:42,
  height:42,
  borderRadius:8,
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
  flexShrink:0,
}

const miniBtn = {
  width:27,
  height:27,
  borderRadius:8,
  border:'1px solid #e2e6e2',
  background:'#fff',
  color:'#4f5650',
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
  cursor:'pointer',
}

const overlay = {
  position:'fixed',
  inset:0,
  background:'rgba(0,0,0,0.42)',
  zIndex:100,
  display:'flex',
  alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end',
  justifyContent:'center',
}

const sheet = {
  width:'100%',
  maxWidth:520,
  maxHeight:'88vh',
  overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
  background:"#f6f8f7",
  borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0',
  padding:'24px 20px 40px',
  boxSizing:'border-box',
}

const labelStyle = { fontSize:10, color:'#8a918b', marginBottom:6, fontWeight:700, textTransform:'uppercase' }
const inputStyle = { width:'100%', boxSizing:'border-box', border:'1px solid #e1e5e1', borderRadius:8, padding:'11px 13px', fontSize:13, color:'#111611', background:'#fff', marginBottom:12 }
const primaryBtn = { width:'100%', border:'none', borderRadius:8, background:'#161a16', color:'#fff', padding:14, fontSize:14, fontWeight:700, cursor:'pointer', marginTop:4 }
const secondaryBtn = { width:'100%', border:'1px solid #dfe4df', borderRadius:8, background:'transparent', color:'#69706a', padding:12, fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }
const tipoBtn = { border:'1px solid #e1e5e1', borderRadius:8, background:'#fff', padding:12, fontSize:13, fontWeight:700, cursor:'pointer', color:'#4f5650' }
const tipoActiveRed = { ...tipoBtn, background:'#c84040', borderColor:'#c84040', color:'#fff' }
const tipoActiveGreen = { ...tipoBtn, background:"#08603f", borderColor:"#08603f", color:'#fff' }
const errorBox = { background:'#fff3e8', color:'#a35f00', border:'1px solid #ffdda8', fontSize:12, padding:'9px 12px', borderRadius:8, marginBottom:12 }
