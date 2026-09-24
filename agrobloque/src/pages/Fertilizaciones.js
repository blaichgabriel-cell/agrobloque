import { Modal, FormHeading, Notice, Skeleton } from '../components/UI'
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { registrarAuditoria } from '../lib/audit'
import { ajustarStockSeguro } from '../lib/inventory'
import { esProductoFertilizacion, incluirSeleccionados } from '../lib/productCategories'

const UNIDADES = ['kg', 'g', 'cc', 'ml', 'L', 'unidad']
const hoy = () => new Date().toISOString().split('T')[0]
const fmtNum = (n) => Number(n || 0).toLocaleString('es-PY')
const fmtFecha = (fecha) => fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PY') : '-'
const sumarDias = (fecha, dias) => {
  const base = fecha ? new Date(`${fecha}T12:00:00`) : new Date()
  base.setDate(base.getDate() + dias)
  return base.toISOString().split('T')[0]
}
const fechasDelPlan = (inicio, fin, frecuencia, diaSemana) => {
  const fechas = []
  if (!inicio || !fin) return fechas
  const actual = new Date(`${inicio}T12:00:00`)
  const limite = new Date(`${fin}T12:00:00`)
  while (actual <= limite) {
    if (frecuencia === 'diaria' || actual.getDay() === Number(diaSemana)) fechas.push(actual.toISOString().split('T')[0])
    actual.setDate(actual.getDate() + 1)
  }
  return fechas
}
const plantasDelBloque = (bloque) => {
  const plantacion = bloque?.plantaciones?.find?.(p => p.activa)
  return Number(plantacion?.cantidad_plantas ?? plantacion?.densidad_plantas_m2 ?? 0)
}

const normalizarUnidad = (unidad = '') => {
  const u = String(unidad).trim().toLowerCase()
  if (['kg', 'kilo', 'kilos'].includes(u)) return 'kg'
  if (['g', 'gr', 'gramo', 'gramos'].includes(u)) return 'g'
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return 'L'
  if (['cc', 'ml'].includes(u)) return 'cc'
  if (['unidad', 'unidades', 'u'].includes(u)) return 'unidad'
  return u
}

const convertirAStock = (cantidad, unidadUso, unidadStock) => {
  const valor = Number(String(cantidad || '').replace(',', '.')) || 0
  const uso = normalizarUnidad(unidadUso)
  const stock = normalizarUnidad(unidadStock)
  if (valor <= 0) return 0
  if (uso === stock) return valor
  if (stock === 'kg' && uso === 'g') return valor / 1000
  if (stock === 'g' && uso === 'kg') return valor * 1000
  if (stock === 'L' && ['cc', 'ml'].includes(uso)) return valor / 1000
  if (['cc', 'ml'].includes(stock) && uso === 'L') return valor * 1000
  return null
}

function useViewportWidth() {
  const [width, setWidth] = useState(typeof window === 'undefined' ? 1200 : window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

const inputBase = {
  width: '100%',
  border: '1px solid #e3e0db',
  borderRadius:'var(--ag-radius)',
  padding: '11px 12px',
  boxSizing: 'border-box',
  background: '#fff',
  fontSize: 14,
}

const btnNegro = {
  border: 'none',
  background: '#1f1f1f',
  color: '#fff',
  borderRadius:'var(--ag-radius)',
  padding: '11px 14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const card = {
  background: '#fff',
  border: "1px solid #e2e9e5",
  borderRadius:'var(--ag-radius)',
  boxShadow: 'none',
}

const productoTexto = (producto) => {
  const nombre = producto?.nombre || 'Producto'
  const cantidad = producto?.cantidad ? `${producto.cantidad} ${producto.unidad || ''}`.trim() : ''
  const dosis = producto?.modo === 'por_planta' && producto?.dosis_por_planta
    ? ` · ${producto.dosis_por_planta} ${producto.unidad_dosis || producto.unidad || ''}/planta`
    : ''
  return cantidad ? `${nombre} (${cantidad}${dosis})` : nombre
}

const resumenSoluciones = (soluciones = []) => soluciones
  .map(sol => {
    const productos = (sol.productos || []).filter(p => p.nombre || p.cantidad).map(productoTexto)
    if (!productos.length) return null
    return `${sol.nombre || 'Solucion'}: ${productos.join(', ')}`
  })
  .filter(Boolean)
  .join(' | ')

function ModalFertilizacion({ bloques, productos, form, setForm, onClose, onSave, saving, error }) {
  const width = useViewportWidth()
  const isMobile = width < 720
  const alternarBloque = (bloqueId) => {
    setForm(f => {
      const actuales = new Set(f.bloques_ids || [])
      if (actuales.has(bloqueId)) actuales.delete(bloqueId)
      else actuales.add(bloqueId)
      return { ...f, bloques_ids: Array.from(actuales) }
    })
  }

  const agregarSolucion = () => {
    const letras = ['A', 'B', 'C', 'D', 'E', 'F']
    const usadas = form.soluciones.map(s => s.nombre)
    const nombre = letras.find(l => !usadas.includes(l)) || `S${form.soluciones.length + 1}`
    setForm(f => ({ ...f, soluciones: [...f.soluciones, { nombre, productos: [{ nombre: '', cantidad: '', unidad: 'kg', modo: 'por_tanque' }] }] }))
  }

  const actualizarSolucion = (si, campo, valor) => {
    setForm(f => {
      const soluciones = [...f.soluciones]
      soluciones[si] = { ...soluciones[si], [campo]: valor }
      return { ...f, soluciones }
    })
  }

  const eliminarSolucion = (si) => {
    setForm(f => ({ ...f, soluciones: f.soluciones.filter((_, i) => i !== si) }))
  }

  const agregarProducto = (si) => {
    setForm(f => {
      const soluciones = [...f.soluciones]
      soluciones[si] = { ...soluciones[si], productos: [...soluciones[si].productos, { nombre: '', cantidad: '', unidad: 'kg', modo: 'por_tanque' }] }
      return { ...f, soluciones }
    })
  }

  const actualizarProducto = (si, pi, campo, valor) => {
    setForm(f => {
      const soluciones = [...f.soluciones]
      const productosSol = [...soluciones[si].productos]
      const actual = { ...productosSol[pi], [campo]: valor }
      if (campo === 'producto_id') {
        const prod = productos.find(p => p.id === valor)
        actual.nombre = prod?.nombre || ''
        const unidadStock = normalizarUnidad(prod?.unidad || '')
        actual.unidad = actual.modo === 'por_planta'
          ? (unidadStock === 'kg' || unidadStock === 'g' ? 'g' : unidadStock === 'L' || unidadStock === 'cc' ? 'ml' : prod?.unidad || actual.unidad || 'g')
          : prod?.unidad || actual.unidad || 'kg'
      }
      if (campo === 'modo' && valor === 'por_planta') {
        const prod = productos.find(p => p.id === actual.producto_id)
        const unidadStock = normalizarUnidad(prod?.unidad || '')
        actual.unidad = unidadStock === 'kg' || unidadStock === 'g' ? 'g' : unidadStock === 'L' || unidadStock === 'cc' ? 'ml' : actual.unidad || 'g'
      }
      productosSol[pi] = actual
      soluciones[si] = { ...soluciones[si], productos: productosSol }
      return { ...f, soluciones }
    })
  }

  const eliminarProducto = (si, pi) => {
    setForm(f => {
      const soluciones = [...f.soluciones]
      soluciones[si] = { ...soluciones[si], productos: soluciones[si].productos.filter((_, i) => i !== pi) }
      return { ...f, soluciones }
    })
  }

  return (
    <Modal busy={saving} onClose={onClose} label="Registrar fertilización" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:250, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'34px 16px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:900, background:'#f7f6f3', borderRadius:'var(--ag-radius)', padding:20, boxShadow:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#8a948b' }}>{form.tipo === 'plan' ? 'Registro semanal por bloques' : 'Aplicacion puntual'}</div>
            <h2 style={{ margin:'2px 0 0', fontSize:24 }}>{form.tipo === 'plan' ? (form.edit_plan_id ? 'Corregir fertilización semanal' : 'Nueva fertilización semanal') : form.edit_grupo ? 'Corregir fertilización' : form.plan_id ? 'Registrar aplicacion del plan' : 'Nueva fertilizacion'}</h2>
          </div>
          <button aria-label="Cerrar" onClick={onClose} style={{ border:'none', background:'#fff', borderRadius:'var(--ag-radius)', width:40, height:40, cursor:'pointer' }}>
            <i className="ti ti-x" style={{ fontSize:20 }} />
          </button>
        </div>

        <Notice tone="error">{error}</Notice><FormHeading number="01" detail="Fecha, preparación y bloques seleccionados">Datos de la aplicación</FormHeading>
        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:10, marginBottom:14 }}>
          {form.tipo === 'plan' && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700, gridColumn:isMobile ? '1 / -1' : 'span 2' }}>Nombre de la semana<input value={form.nombre_plan || ''} onChange={e => setForm(f => ({ ...f, nombre_plan:e.target.value }))} placeholder="Ej: Fertilización tomate · semana 3" style={inputBase} /></label>}
          <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>
            {form.tipo === 'plan' ? 'Inicio de la semana' : 'Fecha'}
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha:e.target.value, ...(f.tipo === 'plan' ? { fecha_fin:sumarDias(e.target.value, 6) } : {}) }))} style={inputBase} />
          </label>
          {form.tipo === 'plan' && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Fin de la semana<input type="date" min={form.fecha} value={form.fecha_fin || ''} onChange={e => setForm(f => ({ ...f, fecha_fin:e.target.value }))} style={inputBase} /></label>}
          <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Litros por tanque<input type="number" min="1" step="1" value={form.tanque_litros || ''} onChange={e => setForm(f => ({ ...f, tanque_litros:e.target.value }))} style={inputBase} /></label>
          <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Cantidad de tanques<input type="number" min="1" step="1" value={form.tanques_cantidad || ''} onChange={e => setForm(f => ({ ...f, tanques_cantidad:e.target.value }))} style={inputBase} /></label>
          {form.plan_id && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Resultado<select value={form.estado || 'completa'} onChange={e => setForm(f => ({ ...f, estado:e.target.value }))} style={inputBase}><option value="completa">Completa</option><option value="parcial">Parcial</option><option value="suspendida">Suspendida</option></select></label>}
          <div style={{ display:'grid', alignContent:'center', background:"#edf7f1", border:'1px solid #d6e8d4', borderRadius:'var(--ag-radius)', padding:'10px 12px' }}><span style={{ fontSize:12, color:'#69706a' }}>VOLUMEN TOTAL</span><strong style={{ fontSize:18, color:"#08603f" }}>{fmtNum(Number(form.tanque_litros || 0) * Number(form.tanques_cantidad || 0))} L</strong></div>
          <div style={{ display:'grid', gap:8, gridColumn:'1 / -1' }}>
            <div style={{ fontSize:12, color:'#687068', fontWeight:700 }}>Bloques</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {bloques.map(b => {
                const activo = (form.bloques_ids || []).includes(b.id)
                const cultivo = b.plantaciones?.find?.(p => p.activa)?.cultivos?.nombre
                return (
                  <button className="ag-small-action" key={b.id} onClick={() => alternarBloque(b.id)} style={{
                    border: activo ? '1px solid #1f1f1f' : '1px solid #e3e0db',
                    background: activo ? '#1f1f1f' : '#fff',
                    color: activo ? '#fff' : '#343a36',
                    borderRadius: 999,
                    padding: '9px 12px',
                    cursor:'pointer',
                    fontWeight:700,
                  }}>
                    {b.codigo}{cultivo ? ` - ${cultivo}` : ''}{plantasDelBloque(b) ? ` · ${fmtNum(plantasDelBloque(b))} plantas` : ''}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize:12, color:'#8a948b' }}>{(form.bloques_ids || []).length} bloques seleccionados. {form.tipo === 'plan' ? 'Al guardar, la semana queda registrada en el historial de cada bloque.' : 'Se guarda un registro por bloque.'}</div>
          </div>
        </div>

        <FormHeading number="02" detail="Cantidades y unidades por solución">Preparación de soluciones</FormHeading>
        <div style={{ fontSize:12, fontWeight:700, color:"#08603f", margin:'2px 0 9px' }}>Las cantidades siguientes son por cada tanque.</div>
        <div style={{ display:'grid', gap:12 }}>
          {form.soluciones.map((sol, si) => (
            <div key={si} style={{ ...card, padding:14, boxShadow:'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:10 }}>
                <input value={sol.nombre} onChange={e => actualizarSolucion(si, 'nombre', e.target.value)} placeholder="Solucion A" style={{ ...inputBase, maxWidth:180, fontWeight:700 }} />
                {form.soluciones.length > 1 && (
                  <button className="ag-small-action" onClick={() => eliminarSolucion(si)} style={{ border:'1px solid #ffd1d1', background:'#fff', color:'#d42f2f', borderRadius:'var(--ag-radius)', padding:'9px 11px', cursor:'pointer' }}>Eliminar</button>
                )}
              </div>
              <div style={{ display:'grid', gap:8 }}>
                {sol.productos.map((p, pi) => (
                  <div key={pi} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : '1fr 138px 120px 94px 38px', gap:8, alignItems:'center' }}>
                    <div style={{ display:'grid', gap:6 }}>
                      <select value={p.producto_id || ''} onChange={e => actualizarProducto(si, pi, 'producto_id', e.target.value)} style={inputBase}>
                        <option value="">Sin inventario</option>
                        {incluirSeleccionados(productos, esProductoFertilizacion, [p.producto_id]).map(prod => <option key={prod.id} value={prod.id}>{prod.nombre} - stock {fmtNum(prod.stock_actual)} {prod.unidad || ''}</option>)}
                      </select>
                      {productos.filter(esProductoFertilizacion).length === 0 && !p.producto_id && <div style={{ fontSize:11, color:'#8a6b33', lineHeight:1.35 }}>No hay fertilizantes clasificados. Revisá la categoría del producto en Inventario.</div>}
                      {!p.producto_id && <input value={p.nombre || ''} onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)} placeholder="Escribir producto" style={{ ...inputBase, background:'#f7fbf7', borderColor:'#d6dfd6' }} />}
                    </div>
                    <select value={p.modo || 'por_tanque'} onChange={e => actualizarProducto(si, pi, 'modo', e.target.value)} style={inputBase}>
                      <option value="por_tanque">Por tanque</option>
                      <option value="por_planta">Por planta</option>
                    </select>
                    <input value={p.cantidad} onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value)} placeholder={p.modo === 'por_planta' ? 'Dosis/planta' : 'Cantidad'} type="number" min="0" step="0.01" style={inputBase} />
                    <select value={p.unidad || 'kg'} onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)} style={inputBase}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button aria-label="Eliminar" onClick={() => eliminarProducto(si, pi)} disabled={sol.productos.length === 1} style={{ border:'none', background:'#f2efeb', borderRadius:'var(--ag-radius)', height:38, cursor: sol.productos.length === 1 ? 'not-allowed' : 'pointer' }}>
                      <i className="ti ti-trash" />
                    </button>
                    {p.modo === 'por_planta' && <div style={{ gridColumn:'1 / -1', background:'#edf7f1', borderRadius:'var(--ag-radius)', padding:'8px 10px', color:'#08603f', fontSize:12 }}>
                      <strong>Total calculado:</strong> {fmtNum((form.bloques_ids || []).reduce((total, id) => total + plantasDelBloque(bloques.find(b => b.id === id)), 0) * Number(p.cantidad || 0))} {p.unidad || 'g'} para {fmtNum((form.bloques_ids || []).reduce((total, id) => total + plantasDelBloque(bloques.find(b => b.id === id)), 0))} plantas.
                    </div>}
                  </div>
                ))}
              </div>
              <button className="ag-small-action" onClick={() => agregarProducto(si)} style={{ marginTop:10, border:'1px solid #e3e0db', background:'#fff', borderRadius:'var(--ag-radius)', padding:'9px 12px', fontWeight:700, cursor:'pointer' }}>+ Producto</button>
            </div>
          ))}
        </div>

        <button className="ag-small-action" onClick={agregarSolucion} style={{ marginTop:12, border:'1px solid #e3e0db', background:'#fff', borderRadius:'var(--ag-radius)', padding:'10px 13px', fontWeight:700, cursor:'pointer' }}>+ Solucion</button>

        <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700, marginTop:14 }}>
          Notas
          <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Ej: aplicacion por goteo, lote completo, observaciones..." style={{ ...inputBase, minHeight:86, resize:'vertical' }} />
        </label>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:16 }}>
          <button className="ag-small-action" onClick={onClose} style={{ border:'1px solid #e3e0db', background:'#fff', borderRadius:'var(--ag-radius)', padding:'11px 14px', fontWeight:700, cursor:'pointer' }}>Cancelar</button>
          <button onClick={onSave} disabled={saving} style={{ ...btnNegro, opacity:saving ? 0.7 : 1 }}>{saving ? 'Guardando...' : form.tipo === 'plan' ? (form.edit_plan_id ? 'Guardar corrección' : 'Guardar semana en los bloques') : form.edit_grupo ? 'Guardar corrección' : 'Guardar aplicacion'}</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Fertilizaciones({ campoActivo }) {
  const width = useViewportWidth()
  const isMobile = width < 1100
  const [bloques, setBloques] = useState([])
  const [productos, setProductos] = useState([])
  const [registros, setRegistros] = useState([])
  const [planes, setPlanes] = useState([])
  const [schemaPlanesDisponible, setSchemaPlanesDisponible] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [form, setForm] = useState({
    tipo: 'aplicacion',
    plan_id: '',
    estado: 'completa',
    fecha: hoy(),
    fecha_fin: sumarDias(hoy(), 6),
    nombre_plan: '',
    frecuencia: 'semanal',
    dia_semana: '1',
    tanque_litros: '200',
    tanques_cantidad: '1',
    bloques_ids: [],
    notas: '',
    soluciones: [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
  })

  const cargarDatos = async () => {
    setLoading(true)
    try {
    setError('')
    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre, unidad, stock_actual, stock_minimo, activo, categorias_producto(nombre)')
      .eq('activo', true)
      .order('nombre')
    setProductos(productosData || [])

    const consultarBloques = (conCantidad = true) => {
      const camposPlantacion = conCantidad ? 'id, activa, cantidad_plantas, densidad_plantas_m2, cultivos(nombre)' : 'id, activa, densidad_plantas_m2, cultivos(nombre)'
      let query = supabase.from('bloques').select(`id, codigo, campo_id, activo, plantaciones(${camposPlantacion})`).eq('activo', true).order('codigo')
      if (campoActivo?.id) query = query.eq('campo_id', campoActivo.id)
      return query
    }
    let bloquesResult = await consultarBloques(true)
    if (bloquesResult.error && `${bloquesResult.error.message || ''}`.toLowerCase().includes('cantidad_plantas')) {
      bloquesResult = await consultarBloques(false)
    }
    const { data: bloquesData, error: bloquesError } = bloquesResult
    if (bloquesError) {
      setError(`No se pudieron cargar los bloques: ${bloquesError.message}`)
      return
    }

    const listaBloques = bloquesData || []
    setBloques(listaBloques)

    let queryRegistros = supabase
      .from('fertilizaciones')
      .select('*, bloques(id, codigo, campo_id)')
      .order('fecha', { ascending:false })
      .limit(200)

    if (campoActivo?.id) {
      const ids = listaBloques.map(b => b.id)
      if (!ids.length) {
        setRegistros([])
        return
      }
      queryRegistros = queryRegistros.in('bloque_id', ids)
    }

    const { data: fertData, error: fertError } = await queryRegistros
    if (fertError) {
      setError(`No se pudieron cargar las fertilizaciones: ${fertError.message}`)
      return
    }
    setRegistros(fertData || [])

    let queryPlanes = supabase.from('fertilizacion_planes').select('*, bloques(codigo), plantaciones(id, cultivos(nombre))').eq('activo', true).order('created_at', { ascending:false })
    if (campoActivo?.id) queryPlanes = queryPlanes.eq('campo_id', campoActivo.id)
    const planesResult = await queryPlanes
    setPlanes(planesResult.data || [])
    setSchemaPlanesDisponible(!planesResult.error)
    } catch (e) { setError('No se pudo cargar la información. Intentá nuevamente.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    cargarDatos()
  }, [campoActivo?.id])

  const grupos = useMemo(() => {
    const mapa = new Map()
    registros.forEach(r => {
      const key = r.grupo_id || `${r.fecha || ''}|${r.created_at || r.id}|${JSON.stringify(r.soluciones || [])}|${r.notas || ''}|${r.tanque_litros || ''}|${r.tanques_cantidad || ''}`
      if (!mapa.has(key)) mapa.set(key, { key, grupo_id:r.grupo_id, fecha:r.fecha, created_at:r.created_at, notas:r.notas, soluciones:r.soluciones || [], tanque_litros:r.tanque_litros, tanques_cantidad:r.tanques_cantidad, estado:r.estado, anulada:r.anulada, items:[] })
      mapa.get(key).items.push(r)
    })
    return Array.from(mapa.values()).sort((a, b) => `${b.fecha || ''}${b.created_at || ''}`.localeCompare(`${a.fecha || ''}${a.created_at || ''}`))
  }, [registros])

  const registrosActivos = useMemo(() => registros.filter(r => !r.anulada), [registros])
  const totalBloquesAplicados = useMemo(() => new Set(registrosActivos.map(r => r.bloque_id)).size, [registrosActivos])
  const ultimaFecha = registrosActivos[0]?.fecha
  const planesVigentes = useMemo(() => planes.filter(plan => !plan.fecha_fin || plan.fecha_fin >= hoy()), [planes])

  const abrirModal = (tipo = 'aplicacion') => {
    setForm({
      tipo,
      plan_id: '',
      estado: 'completa',
      fecha: hoy(),
      fecha_fin: sumarDias(hoy(), 6),
      nombre_plan: '',
      frecuencia: 'semanal',
      dia_semana: '1',
      tanque_litros: '200',
      tanques_cantidad: '1',
      bloques_ids: bloques.length === 1 ? [bloques[0].id] : [],
      notas: '',
      soluciones: [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setModal(true)
  }

  const abrirEditarAplicacion = (grupo) => {
    const soluciones = (grupo.soluciones || []).map(sol => ({
      ...sol,
      productos:(sol.productos || []).map(p => ({
        ...p,
        cantidad:p.modo === 'por_planta' && p.dosis_por_planta ? String(p.dosis_por_planta) : String(p.cantidad || ''),
        unidad:p.modo === 'por_planta' ? (p.unidad_dosis || p.unidad || 'g') : (p.unidad || 'kg'),
      })),
    }))
    setForm({
      tipo:'aplicacion', edit_ids:grupo.items.map(i => i.id), edit_grupo:grupo,
      plan_id:grupo.items[0]?.plan_id || '', estado:grupo.estado || 'completa', fecha:grupo.fecha || hoy(),
      fecha_fin:sumarDias(hoy(), 6), nombre_plan:'', frecuencia:'semanal', dia_semana:'1',
      tanque_litros:String(grupo.tanque_litros || 200), tanques_cantidad:String(grupo.tanques_cantidad || 1),
      bloques_ids:grupo.items.map(i => i.bloque_id), notas:grupo.notas || '',
      soluciones:soluciones.length ? soluciones : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setDetalle(null)
    setModal(true)
  }

  const repetirAplicacion = (grupo) => {
    abrirEditarAplicacion(grupo)
    setForm(f => ({ ...f, edit_ids:undefined, edit_grupo:undefined, plan_id:'', fecha:hoy(), notas:f.notas ? `Repetición: ${f.notas}` : 'Repetición de aplicación' }))
  }

  const abrirEditarPlan = (plan) => {
    setForm({
      tipo:'plan', edit_plan_id:plan.id, plan_id:'', estado:'completa', fecha:plan.fecha_inicio || hoy(),
      fecha_fin:plan.fecha_fin || sumarDias(hoy(), 6), nombre_plan:plan.nombre || '', frecuencia:plan.frecuencia || 'semanal',
      dia_semana:String(plan.dia_semana ?? 1), tanque_litros:String(plan.tanque_litros || 200),
      tanques_cantidad:String(plan.tanques_cantidad || 1), bloques_ids:[plan.bloque_id], notas:plan.notas || '',
      soluciones:Array.isArray(plan.soluciones) && plan.soluciones.length ? plan.soluciones : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setModal(true)
  }

  const devolverInventarioGrupo = async (grupo, motivo = 'Correccion de fertilizacion') => {
    const totales = {}
    const solucionesBase = grupo.items[0]?.soluciones || grupo.soluciones || []
    solucionesBase.flatMap(sol => sol.productos || []).filter(p => p.modo !== 'por_planta').forEach(p => {
      if (!p.producto_id) return
      const prod = productos.find(x => x.id === p.producto_id)
      const convertido = convertirAStock(Number(p.cantidad || 0) * Number(grupo.tanques_cantidad || 1), p.unidad, prod?.unidad)
      if (convertido) totales[p.producto_id] = (totales[p.producto_id] || 0) + convertido
    })
    grupo.items.forEach(item => (item.soluciones || []).flatMap(sol => sol.productos || []).filter(p => p.modo === 'por_planta').forEach(p => {
      if (!p.producto_id) return
      const prod = productos.find(x => x.id === p.producto_id)
      const convertido = convertirAStock(p.cantidad, p.unidad, prod?.unidad)
      if (convertido) totales[p.producto_id] = (totales[p.producto_id] || 0) + convertido
    }))
    for (const [productoId, cantidad] of Object.entries(totales)) {
      const prod = productos.find(x => x.id === productoId)
      await ajustarStockSeguro({ productoId, delta:cantidad, tipo:'devolucion_fertilizacion', modulo:'Fertilizaciones', referenciaId:grupo.grupo_id || grupo.items[0]?.id, detalle:motivo, stockActual:prod?.stock_actual || 0 })
    }
  }

  const anularAplicacion = async (grupo) => {
    const motivo = motivoAnulacion.trim()
    if (!motivo) return setError('Escribí el motivo de la anulación.')
    setSaving(true); setError(''); setSuccess('')
    try {
      const { error:anularError } = await supabase.from('fertilizaciones').update({ anulada:true, anulada_at:new Date().toISOString(), anulada_motivo:motivo.trim(), updated_at:new Date().toISOString() }).in('id', grupo.items.map(i => i.id))
      if (anularError) throw anularError
      await devolverInventarioGrupo(grupo, motivo.trim())
      await registrarAuditoria({ accion:'Anulo fertilizacion', modulo:'Fertilizaciones', tabla:'fertilizaciones', registroId:grupo.grupo_id || grupo.items[0]?.id || '', detalle:motivo.trim() })
      setDetalle(null); setMotivoAnulacion(''); setSuccess('Aplicación anulada y productos devueltos al inventario.'); await cargarDatos()
    } catch (e) { setError(`No se pudo anular: ${e.message || 'error desconocido'}`) }
    setSaving(false)
  }

  const guardar = async () => {
    setError('')
    setSuccess('')
    const bloquesDestino = form.bloques_ids || []
    const solucionesLimpias = (form.soluciones || [])
      .map(sol => ({
        nombre: sol.nombre || 'Solucion',
        productos: (sol.productos || [])
          .filter(p => p.producto_id || p.nombre || p.cantidad)
          .map(p => {
            const prod = productos.find(x => x.id === p.producto_id)
            return {
              producto_id: p.producto_id || null,
              nombre: prod?.nombre || p.nombre || '',
              cantidad:p.cantidad || '',
              unidad:p.unidad || prod?.unidad || 'kg',
              modo:p.modo || 'por_tanque',
              unidad_stock:prod?.unidad || null,
            }
          })
      }))
      .filter(sol => sol.productos.length > 0)

    if (!form.fecha) return setError('Elegir una fecha.')
    if (form.tipo === 'plan' && !form.fecha_fin) return setError('Elegir la fecha final del plan.')
    if (form.tipo === 'plan' && form.fecha_fin < form.fecha) return setError('La fecha final no puede ser anterior a la fecha de inicio.')
    if (!bloquesDestino.length) return setError('Elegir al menos un bloque.')
    if (!solucionesLimpias.length) return setError('Agregar al menos un producto.')
    if (solucionesLimpias.flatMap(sol => sol.productos).some(p => !p.producto_id && !p.nombre?.trim())) {
      return setError('Escribir el nombre del producto o elegirlo desde inventario.')
    }
    if (solucionesLimpias.flatMap(sol => sol.productos).some(p => p.producto_id && convertirAStock(p.cantidad, p.unidad || p.unidad_stock, p.unidad_stock) === null)) {
      return setError('Hay una unidad que no coincide con el inventario. Usa kg/g para productos en kg o L/cc/ml para liquidos.')
    }
    const bloquesSinPlantas = bloquesDestino
      .map(id => bloques.find(b => b.id === id))
      .filter(b => !plantasDelBloque(b))
    if (solucionesLimpias.flatMap(sol => sol.productos).some(p => p.modo === 'por_planta') && bloquesSinPlantas.length) {
      return setError(`Falta cargar la cantidad de plantas en: ${bloquesSinPlantas.map(b => b?.codigo || 'bloque').join(', ')}.`)
    }

    const tanqueLitros = Math.max(0, Number(form.tanque_litros) || 0)
    const tanquesCantidad = Math.max(1, Number(form.tanques_cantidad) || 1)
    if (!tanqueLitros) return setError('Indicar la capacidad de cada tanque en litros.')

    if (form.tipo === 'plan') {
      if (!schemaPlanesDisponible) return setError('Primero hay que ejecutar el SQL de fertilizaciones recurrentes en Supabase.')
      setSaving(true)
      const planesNuevos = bloquesDestino.map(bloque_id => {
        const bloque = bloques.find(b => b.id === bloque_id)
        const plantacion = bloque?.plantaciones?.find(p => p.activa)
        const cultivo = plantacion?.cultivos?.nombre || ''
        return {
          campo_id: campoActivo?.id || bloque?.campo_id || null,
          bloque_id,
          plantacion_id: plantacion?.id || null,
          nombre: form.nombre_plan?.trim() || `${cultivo || 'Cultivo'} - ${form.frecuencia === 'diaria' ? 'diario' : 'semanal'}`,
          activo: true,
          fecha_inicio: form.fecha,
          fecha_fin: form.fecha_fin,
          frecuencia: form.frecuencia || 'semanal',
          dia_semana: form.frecuencia === 'semanal' ? Number(form.dia_semana) : null,
          tanque_litros: tanqueLitros,
          tanques_cantidad: tanquesCantidad,
          litros_preparados: tanqueLitros * tanquesCantidad,
          soluciones: solucionesLimpias.map(sol => ({ ...sol, productos:sol.productos.map(({ unidad_stock, ...p }) => p) })),
          notas: form.notas || null,
        }
      })
      let planResult
      if (form.edit_plan_id) {
        planResult = await supabase.from('fertilizacion_planes').update({ ...planesNuevos[0], updated_at:new Date().toISOString() }).eq('id', form.edit_plan_id).select('id, bloque_id, campo_id, nombre, fecha_inicio, fecha_fin, frecuencia, dia_semana')
        await supabase.from('tareas').update({ anulada:true, cancelada:true, anulada_motivo:'Plan reprogramado', updated_at:new Date().toISOString() }).eq('origen_tipo', 'fertilizacion_plan').eq('origen_id', form.edit_plan_id).eq('completada', false)
      } else {
        planResult = await supabase.from('fertilizacion_planes').insert(planesNuevos).select('id, bloque_id, campo_id, nombre, fecha_inicio, fecha_fin, frecuencia, dia_semana')
      }
      const { data:planesGuardados, error: planError } = planResult
      if (planError) { setSaving(false); return setError(`No se pudo guardar la semana: ${planError.message}`) }
      const planesCreados = planesGuardados || []
      const planPorBloque = new Map(planesCreados.map(plan => [plan.bloque_id, plan]))
      const grupoId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null
      const solucionesPorBloque = (bloque) => solucionesLimpias.map(sol => ({
        nombre:sol.nombre,
        productos:sol.productos.map(p => {
          const { unidad_stock, ...producto } = p
          if (p.modo !== 'por_planta') return producto
          return {
            ...producto,
            cantidad:Number(p.cantidad || 0) * plantasDelBloque(bloque),
            dosis_por_planta:Number(p.cantidad || 0),
            unidad_dosis:p.unidad,
            plantas_calculadas:plantasDelBloque(bloque),
          }
        }),
      }))
      const notasSemana = [form.nombre_plan?.trim() && `Semana: ${form.nombre_plan.trim()}`, form.notas].filter(Boolean).join(' · ') || null
      const aplicacionesSemana = bloquesDestino.map(bloque_id => {
        const bloque = bloques.find(b => b.id === bloque_id)
        return {
          bloque_id,
          grupo_id:grupoId,
          plantacion_id:bloque?.plantaciones?.find(p => p.activa)?.id || null,
          plan_id:planPorBloque.get(bloque_id)?.id || null,
          fecha:form.fecha,
          tanque_litros:tanqueLitros,
          tanques_cantidad:tanquesCantidad,
          estado:'completa',
          dosis_alcance:solucionesLimpias.some(sol => sol.productos.some(p => p.modo === 'por_planta')) ? 'por_planta' : 'por_tanque',
          notas:notasSemana,
          soluciones:solucionesPorBloque(bloque),
        }
      })
      const { error:aplicacionError } = await supabase.from('fertilizaciones').insert(aplicacionesSemana)
      if (aplicacionError) {
        setSaving(false)
        setError(`La semana se creó, pero no se pudo guardar en los bloques: ${aplicacionError.message}`)
        return
      }

      const descuentos = {}
      solucionesLimpias.flatMap(sol => sol.productos).forEach(p => {
        if (!p.producto_id) return
        const cantidadUso = p.modo === 'por_planta'
          ? Number(p.cantidad || 0) * bloquesDestino.reduce((total, id) => total + plantasDelBloque(bloques.find(b => b.id === id)), 0)
          : Number(p.cantidad || 0) * tanquesCantidad
        const cantidadStock = convertirAStock(cantidadUso, p.unidad, p.unidad_stock)
        if (cantidadStock > 0) descuentos[p.producto_id] = (descuentos[p.producto_id] || 0) + cantidadStock
      })
      for (const [productoId, descuento] of Object.entries(descuentos)) {
        const { data:prodActual } = await supabase.from('productos').select('stock_actual').eq('id', productoId).single()
        if (prodActual) await ajustarStockSeguro({ productoId, delta:-descuento, tipo:'consumo_fertilizacion', modulo:'Fertilizaciones', referenciaId:grupoId || form.fecha, detalle:`Semana aplicada en ${bloquesDestino.length} bloque(s)`, stockActual:prodActual.stock_actual })
      }

      if (planesCreados.length) {
        await supabase.from('fertilizacion_plan_aplicaciones').insert(planesCreados.map(plan => ({
          plan_id:plan.id,
          bloque_id:plan.bloque_id,
          plantacion_id:bloques.find(b => b.id === plan.bloque_id)?.plantaciones?.find(p => p.activa)?.id || null,
          fecha:form.fecha,
          litros_aplicados:tanqueLitros * tanquesCantidad,
          tanques_aplicados:tanquesCantidad,
          estado:'completa',
          productos:aplicacionesSemana.find(item => item.bloque_id === plan.bloque_id)?.soluciones || [],
          notas:notasSemana,
        })))
        await supabase.from('fertilizacion_planes').update({ activo:false, updated_at:new Date().toISOString() }).in('id', planesCreados.map(plan => plan.id))
      }
      await registrarAuditoria({ accion:'Registro fertilizacion semanal', modulo:'Fertilizaciones', tabla:'fertilizaciones', registroId:grupoId || '', detalle:`${bloquesDestino.length} bloques · ${form.fecha} a ${form.fecha_fin}` })
      setSaving(false)
      setModal(false)
      setSuccess(`Fertilización semanal guardada en ${bloquesDestino.length} bloque${bloquesDestino.length === 1 ? '' : 's'}. Ya aparece en cada historial.`)
      await cargarDatos()
      return
    }

    setSaving(true)
    if (form.edit_grupo) {
      try {
        const { error:reemplazoError } = await supabase.from('fertilizaciones').update({ anulada:true, anulada_at:new Date().toISOString(), anulada_motivo:'Reemplazada por edición', updated_at:new Date().toISOString() }).in('id', form.edit_ids || [])
        if (reemplazoError) throw reemplazoError
        await devolverInventarioGrupo(form.edit_grupo, 'Edición de fertilización')
      } catch (e) {
        setSaving(false)
        return setError(`No se pudo preparar la edición: ${e.message || 'error desconocido'}`)
      }
    }
    const grupoId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null
    const solucionesPorBloque = (bloque) => solucionesLimpias.map(sol => ({
      nombre:sol.nombre,
      productos:sol.productos.map(p => {
        const { unidad_stock, ...producto } = p
        if (p.modo !== 'por_planta') return producto
        const total = Number(p.cantidad || 0) * plantasDelBloque(bloque)
        return {
          ...producto,
          cantidad:total,
          dosis_por_planta:Number(p.cantidad || 0),
          unidad_dosis:p.unidad,
          plantas_calculadas:plantasDelBloque(bloque),
        }
      }),
    }))
    const payloads = bloquesDestino.map(bloque_id => {
      const bloque = bloques.find(b => b.id === bloque_id)
      return {
        bloque_id,
        grupo_id:grupoId,
        plantacion_id: bloque?.plantaciones?.find(p => p.activa)?.id || null,
        plan_id: form.plan_id || null,
        fecha: form.fecha,
        tanque_litros: tanqueLitros,
        tanques_cantidad: form.estado === 'suspendida' ? 0 : tanquesCantidad,
        estado: form.estado || 'completa',
        dosis_alcance: solucionesLimpias.some(sol => sol.productos.some(p => p.modo === 'por_planta')) ? 'por_planta' : 'por_tanque',
        notas: form.notas || null,
        soluciones: solucionesPorBloque(bloque),
      }
    })

    const { error: insertError } = await supabase.from('fertilizaciones').insert(payloads)
    setSaving(false)
    if (insertError) {
      setError(`No se pudo guardar la fertilizacion: ${insertError.message}`)
      return
    }

    const descuentos = {}
    if (form.estado !== 'suspendida') {
      solucionesLimpias.flatMap(sol => sol.productos).forEach(p => {
        if (!p.producto_id) return
        const cantidadUso = p.modo === 'por_planta'
          ? Number(p.cantidad || 0) * bloquesDestino.reduce((total, id) => total + plantasDelBloque(bloques.find(b => b.id === id)), 0)
          : Number(p.cantidad || 0) * tanquesCantidad
        const cantidadStock = convertirAStock(cantidadUso, p.unidad, p.unidad_stock)
        if (!cantidadStock || cantidadStock <= 0) return
        descuentos[p.producto_id] = (descuentos[p.producto_id] || 0) + cantidadStock
      })
    }

    for (const [productoId, descuento] of Object.entries(descuentos)) {
      const { data: prodActual } = await supabase
        .from('productos')
        .select('stock_actual')
        .eq('id', productoId)
        .single()
      if (!prodActual) continue
      await ajustarStockSeguro({
        productoId,
        delta:-descuento,
        tipo:'consumo_fertilizacion',
        modulo:'Fertilizaciones',
        referenciaId:form.plan_id || form.fecha,
        detalle:`${bloquesDestino.length} bloque(s)`,
        stockActual:prodActual.stock_actual,
      })
    }

    if (form.plan_id) {
      const { error: seguimientoError } = await supabase.from('fertilizacion_plan_aplicaciones').insert({
        plan_id: form.plan_id,
        bloque_id: bloquesDestino[0],
        plantacion_id: bloques.find(b => b.id === bloquesDestino[0])?.plantaciones?.find(p => p.activa)?.id || null,
        fecha: form.fecha,
        litros_aplicados: form.estado === 'suspendida' ? 0 : tanqueLitros * tanquesCantidad,
        tanques_aplicados: form.estado === 'suspendida' ? 0 : tanquesCantidad,
        estado: form.estado || 'completa',
        productos: payloads[0]?.soluciones || [],
        notas: form.notas || null,
      })
      if (seguimientoError) setError(`La fertilizacion se guardo, pero fallo el seguimiento del plan: ${seguimientoError.message}`)
    }

    await registrarAuditoria({
      accion: bloquesDestino.length > 1 ? 'Registro fertilizacion multiple' : 'Registro fertilizacion',
      modulo: 'Fertilizaciones',
      tabla: 'fertilizaciones',
      registroId: '',
      detalle: `${bloquesDestino.length} bloques - ${form.fecha}`,
    })

    setModal(false)
    setSuccess(form.edit_grupo ? 'Fertilización corregida correctamente.' : form.plan_id ? 'Aplicacion del plan registrada correctamente.' : 'Fertilizacion guardada correctamente.')
    cargarDatos()
  }

  const registrarDesdePlan = async (plan) => {
    setError('')
    setSuccess('')
    setSaving(true)
    const bloque = bloques.find(b => b.id === plan.bloque_id)
    const tanquesCantidad = Math.max(1, Number(plan.tanques_cantidad) || 1)
    const tanqueLitros = Number(plan.tanque_litros) || ((Number(plan.litros_preparados) || 0) / tanquesCantidad) || 0
    const soluciones = (Array.isArray(plan.soluciones) ? plan.soluciones : []).map(sol => ({
      ...sol,
      productos:(sol.productos || []).map(p => p.modo === 'por_planta' ? {
        ...p,
        cantidad:Number(p.cantidad || 0) * plantasDelBloque(bloque),
        dosis_por_planta:Number(p.cantidad || 0),
        unidad_dosis:p.unidad,
        plantas_calculadas:plantasDelBloque(bloque),
      } : p),
    }))
    const payload = {
      bloque_id:plan.bloque_id,
      plantacion_id:bloque?.plantaciones?.find(p => p.activa)?.id || plan.plantacion_id || null,
      plan_id:plan.id,
      fecha:hoy(),
      tanque_litros:tanqueLitros,
      tanques_cantidad:tanquesCantidad,
      estado:'completa',
      dosis_alcance:soluciones.some(sol => sol.productos?.some(p => p.modo === 'por_planta')) ? 'por_planta' : 'por_tanque',
      notas:[`Semana: ${plan.nombre}`, plan.notas].filter(Boolean).join(' · '),
      soluciones,
    }
    const { error:insertError } = await supabase.from('fertilizaciones').insert(payload)
    if (insertError) { setSaving(false); return setError(`No se pudo registrar la semana: ${insertError.message}`) }
    for (const p of (plan.soluciones || []).flatMap(sol => sol.productos || [])) {
      if (!p.producto_id) continue
      const producto = productos.find(item => item.id === p.producto_id)
      const cantidadUso = p.modo === 'por_planta' ? Number(p.cantidad || 0) * plantasDelBloque(bloque) : Number(p.cantidad || 0) * tanquesCantidad
      const descuento = convertirAStock(cantidadUso, p.unidad, producto?.unidad)
      if (producto && descuento > 0) await ajustarStockSeguro({ productoId:p.producto_id, delta:-descuento, tipo:'consumo_fertilizacion', modulo:'Fertilizaciones', referenciaId:plan.id, detalle:`Semana ${plan.nombre}`, stockActual:producto.stock_actual })
    }
    await supabase.from('fertilizacion_plan_aplicaciones').insert({ plan_id:plan.id, bloque_id:plan.bloque_id, plantacion_id:payload.plantacion_id, fecha:payload.fecha, litros_aplicados:tanqueLitros * tanquesCantidad, tanques_aplicados:tanquesCantidad, estado:'completa', productos:soluciones, notas:payload.notas })
    await supabase.from('fertilizacion_planes').update({ activo:false, updated_at:new Date().toISOString() }).eq('id', plan.id)
    await registrarAuditoria({ accion:'Finalizo plan semanal anterior', modulo:'Fertilizaciones', tabla:'fertilizaciones', registroId:plan.id, detalle:`Bloque ${bloque?.codigo || ''}` })
    setSaving(false)
    setSuccess(`Semana “${plan.nombre}” registrada en el bloque ${bloque?.codigo || ''}.`)
    await cargarDatos()
  }

  const pausarPlan = async (plan) => {
    setError('')
    setSuccess('')
    setSaving(true)
    const { error: pauseError } = await supabase.from('fertilizacion_planes').update({ activo:false, updated_at:new Date().toISOString() }).eq('id', plan.id)
    setSaving(false)
    if (pauseError) return setError(`No se pudo pausar el plan: ${pauseError.message}`)
    setSuccess(`Plan “${plan.nombre}” pausado.`)
    cargarDatos()
  }

  return (
    <div className="ag-page" style={{ padding:'38px clamp(16px, 4vw, 48px)', minHeight:'100vh', background:"#f6f8f7" }}>
      <div style={{ maxWidth:1220, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:18, marginBottom:20 }}>
          <div>
            <div style={{ color:'#8a948b', fontSize:13 }}>Aplicaciones reales</div>
            <h1 style={{ margin:'5px 0 0', fontSize:30, lineHeight:1.05 }}>Fertilizaciones</h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => abrirModal('plan')} disabled={!schemaPlanesDisponible} style={{ ...btnNegro, background:'#fff', color:"#08603f", border:'1px solid #dbe6da', opacity:schemaPlanesDisponible ? 1 : .55 }}><i className="ti ti-calendar-week" style={{ marginRight:7 }} />Fertilización semanal</button>
            <button onClick={() => abrirModal('aplicacion')} style={{ ...btnNegro }}><i className="ti ti-plus" style={{ marginRight:7 }} />Aplicación puntual</button>
          </div>
        </div>

        {error && <div style={{ background:'#fff1f1', border:'1px solid #ffd6d6', color:'#b52525', borderRadius:'var(--ag-radius)', padding:'12px 14px', marginBottom:12, fontSize:13 }}>{error}</div>}
        {success && <div style={{ background:'#edf8ee', border:'1px solid #cce5ce', color:"#08603f", borderRadius:'var(--ag-radius)', padding:'12px 14px', marginBottom:12, fontSize:13 }}>{success}</div>}
        {!schemaPlanesDisponible && <div style={{ background:'#fff7e8', border:'1px solid #efd49f', color:'#80580e', borderRadius:'var(--ag-radius)', padding:'12px 14px', marginBottom:12, fontSize:13 }}>Los planes diarios y semanales se habilitaran despues de ejecutar el SQL preparado para Supabase.</div>}

        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap:12, marginBottom:18 }}>
          <div style={{ ...card, padding:18, background:'#1f1f1f', color:'#fff' }}>
            <div style={{ fontSize:12, color:'#b9beb7' }}>APLICACIONES</div>
            <div style={{ fontSize:28, fontWeight:700 }}>{fmtNum(registrosActivos.length)}</div>
            <div style={{ fontSize:12, color:'#cdd2cc' }}>registros guardados</div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:12, color:'#8a948b' }}>BLOQUES APLICADOS</div>
            <div style={{ fontSize:28, fontWeight:700 }}>{fmtNum(totalBloquesAplicados)}</div>
            <div style={{ fontSize:12, color:'#8a948b' }}>con fertilizacion</div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:12, color:'#8a948b' }}>ULTIMA FECHA</div>
            <div style={{ fontSize:22, fontWeight:700 }}>{ultimaFecha ? fmtFecha(ultimaFecha) : '-'}</div>
            <div style={{ fontSize:12, color:'#8a948b' }}>ultima aplicacion</div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:12, color:'#8a948b' }}>BLOQUES ACTIVOS</div>
            <div style={{ fontSize:28, fontWeight:700 }}>{fmtNum(bloques.length)}</div>
            <div style={{ fontSize:12, color:'#8a948b' }}>disponibles</div>
          </div>
        </div>

        {schemaPlanesDisponible && (
          <div style={{ ...card, padding:18, marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}><div><div style={{ color:'#8a948b', fontSize:12 }}>PROGRAMACION</div><h2 style={{ margin:'3px 0 0', fontSize:20 }}>Planes activos</h2></div><span style={{ background:"#edf7f1", color:"#08603f", borderRadius:999, padding:'5px 10px', fontSize:12, fontWeight:700 }}>{planesVigentes.length}</span></div>
            {planesVigentes.length === 0 ? <div style={{ padding:'18px 0 4px', color:'#8a948b', fontSize:13 }}>Todavia no hay planes vigentes.</div> : planesVigentes.map((plan, index) => {
              const tanques = Number(plan.tanques_cantidad) || 1
              const litros = Number(plan.tanque_litros) || ((Number(plan.litros_preparados) || 0) / tanques)
              const frecuencia = plan.frecuencia === 'diaria' ? 'Todos los dias' : `Cada ${['domingo','lunes','martes','miercoles','jueves','viernes','sabado'][Number(plan.dia_semana)] || 'semana'}`
              return <div key={plan.id} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1.2fr 1fr auto', gap:10, alignItems:'center', padding:'14px 0', borderTop:index === 0 ? 'none' : '1px solid #f0ede8' }}><div><strong style={{ fontSize:14 }}>{plan.nombre}</strong><div style={{ color:'#687068', fontSize:12, marginTop:4 }}>{plan.bloques?.codigo || 'Sin bloque'}{plan.plantaciones?.cultivos?.nombre ? ` · ${plan.plantaciones.cultivos.nombre}` : ''}</div><div style={{ color:'#8a948b', fontSize:12, marginTop:4 }}>{fmtFecha(plan.fecha_inicio)} → {plan.fecha_fin ? fmtFecha(plan.fecha_fin) : 'Sin fecha final'}</div></div><div><strong style={{ color:"#08603f", fontSize:13 }}>{frecuencia}</strong><div style={{ color:'#687068', fontSize:12, marginTop:4 }}>{fmtNum(tanques)} tanque{tanques === 1 ? '' : 's'} × {fmtNum(litros)} L = {fmtNum(tanques * litros)} L</div></div><div style={{ display:'flex', gap:7, flexWrap:'wrap' }}><button className="ag-small-action" onClick={() => registrarDesdePlan(plan)} disabled={saving} style={{ ...btnNegro, background:"#08603f", padding:'9px 12px' }}>Finalizar semana</button><button className="ag-small-action" onClick={() => abrirEditarPlan(plan)} style={{ border:'1px solid #e3e0db', background:'#fff', color:'#1f1f1f', borderRadius:'var(--ag-radius)', padding:'9px 11px', fontWeight:700, cursor:'pointer' }}>Editar</button><button className="ag-small-action" onClick={() => pausarPlan(plan)} disabled={saving} style={{ border:'1px solid #e3e0db', background:'#fff', color:'#80580e', borderRadius:'var(--ag-radius)', padding:'9px 11px', fontWeight:700, cursor:'pointer' }}>Pausar</button></div></div>
            })}
          </div>
        )}

        <div style={{ ...card, overflow:'hidden' }}>
          <div style={{ display:isMobile ? 'none' : 'grid', gridTemplateColumns:'130px 1fr 1.4fr', gap:12, padding:'13px 16px', borderBottom:'1px solid #ece9e3', color:'#687068', fontSize:12, fontWeight:700 }}>
            <div>FECHA</div>
            <div>BLOQUES</div>
            <div>DETALLE</div>
          </div>
          {loading ? <Skeleton rows={4} label="Cargando fertilizaciones" /> : grupos.length === 0 ? (
            <div style={{ padding:38, textAlign:'center', color:'#8a948b' }}>Sin fertilizaciones registradas.</div>
          ) : grupos.map((g, idx) => (
            <div key={g.key || `${g.fecha}-${idx}`} onClick={() => setDetalle(g)} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '130px 1fr 1.4fr', gap:12, padding:'16px', borderBottom: idx === grupos.length - 1 ? 'none' : '1px solid #f0ede8', alignItems:'start', cursor:'pointer', opacity:g.anulada ? .58 : 1, background:g.anulada ? '#faf8f5' : '#fff' }}>
              <div style={{ fontWeight:700 }}>{fmtFecha(g.fecha)}</div>
              <div>
                <div style={{ fontWeight:700 }}>{g.items.length} bloque{g.items.length === 1 ? '' : 's'}</div>
                <div style={{ color:'#687068', fontSize:13 }}>{g.items.map(i => i.bloques?.codigo || 'Bloque').join(', ')}</div>
              </div>
              <div>
                <div style={{ fontSize:13, lineHeight:1.45 }}>{resumenSoluciones(g.soluciones) || 'Sin productos detallados'}</div>
                {g.tanque_litros && <div style={{ marginTop:7, color:g.anulada ? '#a33' : "#08603f", fontSize:12, fontWeight:700 }}>{g.anulada ? 'ANULADA · ' : ''}{g.tanques_cantidad || 1} tanque{Number(g.tanques_cantidad || 1) === 1 ? '' : 's'} × {fmtNum(g.tanque_litros)} L = {fmtNum(Number(g.tanque_litros) * Number(g.tanques_cantidad || 1))} L · {g.estado || 'completa'}</div>}
                {g.notas && <div style={{ marginTop:8, color:'#687068', fontSize:13 }}>{g.notas}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <ModalFertilizacion
          bloques={bloques}
          productos={productos}
          form={form}
          setForm={setForm}
          onClose={() => setModal(false)}
          onSave={guardar}
          saving={saving}
          error={error}
        />
      )}
      {detalle && (
        <Modal onClose={() => setDetalle(null)} label="Fertilizaciones" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:260, display:'grid', placeItems:'center', padding:16 }} onClick={() => setDetalle(null)}>
          <div className="ag-surface" onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth:620, background:'#fff', borderRadius:10, padding:22, maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}><div><div style={{ fontSize:12, color:'#8a948b' }}>DETALLE DE APLICACIÓN</div><h2 style={{ margin:'4px 0' }}>{fmtFecha(detalle.fecha)}</h2></div><button aria-label="Cerrar" onClick={() => setDetalle(null)} style={{ border:0, background:'#f2efeb', width:38, height:38, borderRadius:'var(--ag-radius)', cursor:'pointer' }}><i className="ti ti-x" /></button></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, margin:'16px 0' }}><div style={{ background:'#f6f8f7', padding:13, borderRadius:'var(--ag-radius)' }}><small style={{ color:'#687068' }}>Bloques</small><div style={{ fontWeight:700, marginTop:4 }}>{detalle.items.map(i => i.bloques?.codigo || 'Bloque').join(', ')}</div></div><div style={{ background:'#f6f8f7', padding:13, borderRadius:'var(--ag-radius)' }}><small style={{ color:'#687068' }}>Preparación</small><div style={{ fontWeight:700, marginTop:4 }}>{detalle.tanques_cantidad || 1} × {fmtNum(detalle.tanque_litros)} L</div></div></div>
            <div style={{ fontSize:13, lineHeight:1.6, padding:'13px 0', borderTop:'1px solid #ece9e3', borderBottom:'1px solid #ece9e3' }}>{resumenSoluciones(detalle.soluciones) || 'Sin productos detallados'}</div>
            {detalle.notas && <div style={{ marginTop:14, color:'#687068' }}>{detalle.notas}</div>}
            {!detalle.anulada && <><div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:18 }}><button onClick={() => abrirEditarAplicacion(detalle)} style={btnNegro}>Editar</button><button onClick={() => repetirAplicacion(detalle)} style={{ ...btnNegro, background:'#08603f' }}>Repetir hoy</button></div><div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid #ece9e3' }}><label style={{ display:'grid', gap:6, fontSize:12, fontWeight:700, color:'#687068' }}>Motivo para anular<input value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} placeholder="Ej: carga duplicada o aplicación cancelada" style={inputBase} /></label><button className="ag-small-action" onClick={() => anularAplicacion(detalle)} disabled={saving} style={{ marginTop:9, border:'1px solid #ffd1d1', background:'#fff', color:'#b52525', borderRadius:'var(--ag-radius)', padding:'10px 13px', fontWeight:700, cursor:'pointer' }}>Anular y devolver inventario</button></div></>}
            {detalle.anulada && <div style={{ marginTop:16, color:'#a33', fontWeight:700 }}>Esta aplicación está anulada.</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}
