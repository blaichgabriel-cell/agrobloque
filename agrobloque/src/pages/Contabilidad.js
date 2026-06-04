import React, { useEffect, useMemo, useState } from 'react'
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
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const parseGs = (v) => parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0

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
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(formInicial)
  const [filtro, setFiltro] = useState('todos')
  const [anho, setAnho] = useState(anhoActual())

  useEffect(() => { fetchMovimientos() }, [anho])

  const fetchMovimientos = async () => {
    setLoading(true)
    const desde = `${anho}-01-01`
    const hasta = `${anho}-12-31`
    const { data, error } = await supabase
      .from('contabilidad_movimientos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

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

  const movimientosFiltrados = useMemo(() => {
    if (filtro === 'todos') return movimientos
    return movimientos.filter(m => m.tipo === filtro)
  }, [movimientos, filtro])

  const abrirNuevo = (tipo = 'compra') => {
    setForm({
      ...formInicial,
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
    descargarCsv('contabilidad-movimientos', ['Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Contraparte', 'MedioPago', 'Comprobante', 'Monto', 'Notas'], rows)
  }

  const imprimirBalance = () => {
    imprimirHtml('Balance contable AgroBloque', `
      <h1>Balance contable AgroBloque</h1>
      <div class="muted">Año ${anho}</div>
      <table>
        <tr><th>Mes</th><th class="right">Compras</th><th class="right">Ventas</th><th class="right">Balance</th></tr>
        ${resumen.porMes.map(m => `<tr><td>${m.nombre}</td><td class="right">Gs. ${fmtGs(m.compras)}</td><td class="right">Gs. ${fmtGs(m.ventas)}</td><td class="right total">Gs. ${fmtGs(m.balance)}</td></tr>`).join('')}
        <tr><td class="total">Total</td><td class="right total">Gs. ${fmtGs(resumen.compras)}</td><td class="right total">Gs. ${fmtGs(resumen.ventas)}</td><td class="right total">Gs. ${fmtGs(resumen.balance)}</td></tr>
      </table>
    `)
  }

  const categorias = form.tipo === 'venta' ? categoriasVenta : categoriasCompra

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16 }}>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <div style={headerIcon}><i className="ti ti-calculator" style={{ fontSize:26, color:'#176a25' }} aria-hidden="true"></i></div>
            <div>
              <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Balance independiente</div>
              <div style={{ fontSize:24, fontWeight:850, color:'#0a0a0a', letterSpacing:-.5 }}>Contabilidad</div>
            </div>
          </div>
          <button onClick={() => abrirNuevo('compra')} style={addBtn}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:21 }} aria-hidden="true"></i>
          </button>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:12 }}>
          <select value={anho} onChange={e => setAnho(Number(e.target.value))} style={selectYear}>
            {[anhoActual() - 1, anhoActual(), anhoActual() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={exportarCsv} style={smallAction}>CSV</button>
            <button onClick={imprimirBalance} style={smallAction}>PDF</button>
            <button onClick={() => abrirNuevo('compra')} style={smallAction}>Compra</button>
            <button onClick={() => abrirNuevo('venta')} style={{ ...smallAction, background:'#176a25', color:'#fff' }}>Venta</button>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8 }}>
          <TotalCard label="Ventas" value={resumen.ventas} tone="green" />
          <TotalCard label="Compras" value={resumen.compras} tone="red" />
          <TotalCard label="Balance" value={resumen.balance} tone={resumen.balance >= 0 ? 'dark' : 'red'} />
        </div>
      </div>

      <div style={{ padding:'8px 14px 100px' }}>
        <section style={card}>
          <div style={sectionHead}>
            <div>
              <div style={eyebrow}>Control de balance {anho}</div>
              <h2 style={sectionTitle}>Resumen mensual</h2>
            </div>
            <i className="ti ti-table" style={{ fontSize:22, color:'#176a25' }} aria-hidden="true"></i>
          </div>

          <div style={{ overflowX:'auto' }}>
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
                  <tr key={m.nombre}>
                    <td style={td}>{m.nombre}</td>
                    <td style={tdRight}>Gs. {fmtGs(m.compras)}</td>
                    <td style={tdRight}>Gs. {fmtGs(m.ventas)}</td>
                    <td style={{ ...tdRight, color: m.balance >= 0 ? '#176a25' : '#c84040', fontWeight:800 }}>Gs. {fmtGs(m.balance)}</td>
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
              <h2 style={sectionTitle}>Movimientos</h2>
            </div>
            <div style={segmented}>
              {['todos', 'compra', 'venta'].map(k => (
                <button key={k} onClick={() => setFiltro(k)} style={filtro === k ? segActive : segBtn}>
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

        <NotasPanel modulo="contabilidad" titulo="Blog de notas de contabilidad" />
      </div>

      {modal && (
        <div style={overlay} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={sheet}>
            <div style={{ fontSize:19, fontWeight:850, marginBottom:16 }}>
              {form.id ? 'Editar movimiento' : 'Nuevo movimiento'}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
              <button onClick={() => setTipo('compra')} style={form.tipo === 'compra' ? tipoActiveRed : tipoBtn}>Compra</button>
              <button onClick={() => setTipo('venta')} style={form.tipo === 'venta' ? tipoActiveGreen : tipoBtn}>Venta</button>
            </div>

            <Field label="Fecha *" type="date" value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha:v }))} />
            <Field label="Monto (Gs.) *" value={form.monto} inputMode="numeric" onChange={v => {
              const n = parseGs(v)
              setForm(f => ({ ...f, monto:n ? fmtGs(n) : '' }))
            }} placeholder="Ej: 150.000" />
            <Field label="Descripcion *" value={form.descripcion} onChange={v => setForm(f => ({ ...f, descripcion:v }))} placeholder="Ej: compra de insumos / venta de tomate" />
            <Select label="Categoria" value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria:v }))} options={categorias} />
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

function TotalCard({ label, value, tone }) {
  const bg = tone === 'dark' ? '#161a16' : '#fff'
  const color = tone === 'dark' ? '#fff' : tone === 'red' ? '#c84040' : '#176a25'
  return (
    <div style={{ background:bg, borderRadius:16, padding:'14px 13px', border:'1px solid #e8ece8' }}>
      <div style={{ fontSize:10, color: tone === 'dark' ? 'rgba(255,255,255,0.58)' : '#8a918b', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:900, color, letterSpacing:-0.3 }}>Gs. {fmtGs(value)}</div>
    </div>
  )
}

function Movimiento({ mov, onEdit, onDelete }) {
  const venta = mov.tipo === 'venta'
  return (
    <div style={{ display:'grid', gridTemplateColumns:'42px 1fr auto', gap:11, alignItems:'center', padding:'11px 0', borderBottom:'1px solid #eef0ee' }}>
      <div style={{ ...iconPill, background: venta ? '#edf6ec' : '#fff0f0' }}>
        <i className={`ti ${venta ? 'ti-arrow-up-right' : 'ti-arrow-down-left'}`} style={{ fontSize:20, color: venta ? '#176a25' : '#c84040' }} aria-hidden="true"></i>
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <strong style={{ fontSize:13, color:'#111611' }}>{mov.descripcion}</strong>
          <span style={{ borderRadius:20, background: venta ? '#edf6ec' : '#fff0f0', color: venta ? '#176a25' : '#c84040', padding:'3px 7px', fontSize:10, fontWeight:800 }}>
            {venta ? 'Venta' : 'Compra'}
          </span>
        </div>
        <div style={{ fontSize:11, color:'#7a817b', marginTop:3 }}>
          {mov.fecha} · {mov.categoria || 'Sin categoria'}{mov.contraparte ? ` · ${mov.contraparte}` : ''}
        </div>
      </div>
      <div style={{ display:'grid', justifyItems:'end', gap:5 }}>
        <strong style={{ fontSize:13, color: venta ? '#176a25' : '#c84040' }}>Gs. {fmtGs(mov.monto)}</strong>
        <div style={{ display:'flex', gap:5 }}>
          <button onClick={onEdit} style={miniBtn}><i className="ti ti-pencil" /></button>
          <button onClick={onDelete} style={{ ...miniBtn, color:'#c84040', borderColor:'#ffd1d1' }}><i className="ti ti-trash" /></button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', textarea, inputMode }) {
  return (
    <label style={{ display:'block' }}>
      <div style={labelStyle}>{label}</div>
      {textarea ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, minHeight:72, resize:'vertical' }} />
      ) : (
        <input type={type} inputMode={inputMode} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </label>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display:'block' }}>
      <div style={labelStyle}>{label}</div>
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  )
}

function Empty({ text }) {
  return <div style={{ color:'#8c938d', textAlign:'center', padding:'26px 0', fontSize:13 }}>{text}</div>
}

const headerIcon = {
  width:46,
  height:46,
  borderRadius:16,
  background:'#edf6ec',
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
  flexShrink:0,
}

const addBtn = {
  width:42,
  height:42,
  borderRadius:14,
  background:'#212121',
  border:'none',
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
  cursor:'pointer',
}

const smallAction = {
  border:'none',
  background:'#fff',
  color:'#121512',
  borderRadius:12,
  padding:'0 12px',
  fontSize:12,
  fontWeight:800,
  cursor:'pointer',
}

const selectYear = {
  width:'100%',
  border:'1px solid #e1e5e1',
  borderRadius:14,
  background:'#fff',
  padding:'11px 12px',
  fontSize:13,
  color:'#111611',
}

const card = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:20,
  padding:16,
  marginBottom:10,
  boxShadow:'0 12px 28px rgba(29, 38, 29, 0.05)',
}

const sectionHead = {
  display:'flex',
  justifyContent:'space-between',
  alignItems:'center',
  gap:12,
  marginBottom:14,
}

const eyebrow = { fontSize:10, color:'#8a918b', textTransform:'uppercase', marginBottom:4, fontWeight:800 }
const sectionTitle = { margin:0, fontSize:17, letterSpacing:-0.3 }

const tabla = { width:'100%', minWidth:560, borderCollapse:'collapse', fontSize:12 }
const th = { textAlign:'left', padding:'10px 8px', color:'#6a716b', borderBottom:'1px solid #e8ece8', textTransform:'uppercase', fontSize:10 }
const thRight = { ...th, textAlign:'right' }
const td = { padding:'10px 8px', borderBottom:'1px solid #f0f2f0', color:'#111611' }
const tdRight = { ...td, textAlign:'right' }
const tf = { padding:'12px 8px', fontWeight:900, background:'#f5f7f5', borderTop:'1px solid #dfe5df' }
const tfRight = { ...tf, textAlign:'right' }

const segmented = { display:'flex', gap:4, background:'#eef0ee', padding:4, borderRadius:12 }
const segBtn = { border:'none', borderRadius:9, background:'transparent', padding:'7px 9px', fontSize:11, fontWeight:800, color:'#737a74', cursor:'pointer' }
const segActive = { ...segBtn, background:'#fff', color:'#111611', boxShadow:'0 4px 10px rgba(0,0,0,0.06)' }

const iconPill = {
  width:42,
  height:42,
  borderRadius:13,
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
  background:'#f2f1ef',
  borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0',
  padding:'24px 20px 40px',
  boxSizing:'border-box',
}

const labelStyle = { fontSize:10, color:'#8a918b', marginBottom:6, fontWeight:800, textTransform:'uppercase' }
const inputStyle = { width:'100%', boxSizing:'border-box', border:'1px solid #e1e5e1', borderRadius:12, padding:'11px 13px', fontSize:13, color:'#111611', background:'#fff', marginBottom:12 }
const primaryBtn = { width:'100%', border:'none', borderRadius:14, background:'#161a16', color:'#fff', padding:14, fontSize:14, fontWeight:850, cursor:'pointer', marginTop:4 }
const secondaryBtn = { width:'100%', border:'1px solid #dfe4df', borderRadius:14, background:'transparent', color:'#69706a', padding:12, fontSize:13, fontWeight:800, cursor:'pointer', marginTop:8 }
const tipoBtn = { border:'1px solid #e1e5e1', borderRadius:13, background:'#fff', padding:12, fontSize:13, fontWeight:850, cursor:'pointer', color:'#4f5650' }
const tipoActiveRed = { ...tipoBtn, background:'#c84040', borderColor:'#c84040', color:'#fff' }
const tipoActiveGreen = { ...tipoBtn, background:'#176a25', borderColor:'#176a25', color:'#fff' }
const errorBox = { background:'#fff3e8', color:'#a35f00', border:'1px solid #ffdda8', fontSize:12, padding:'9px 12px', borderRadius:12, marginBottom:12 }
