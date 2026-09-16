import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { registrarAuditoria } from '../lib/audit'

const UNIDADES = ['kg', 'g', 'cc', 'ml', 'L', 'unidad']
const hoy = () => new Date().toISOString().split('T')[0]
const fmtNum = (n) => Number(n || 0).toLocaleString('es-PY')
const fmtFecha = (fecha) => fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PY') : '-'

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
  borderRadius: 8,
  padding: '11px 12px',
  boxSizing: 'border-box',
  background: '#fff',
  fontSize: 14,
}

const btnNegro = {
  border: 'none',
  background: '#1f1f1f',
  color: '#fff',
  borderRadius: 8,
  padding: '11px 14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const card = {
  background: '#fff',
  border: "1px solid #e2e9e5",
  borderRadius: 8,
  boxShadow: 'none',
}

const productoTexto = (producto) => {
  const nombre = producto?.nombre || 'Producto'
  const cantidad = producto?.cantidad ? `${producto.cantidad} ${producto.unidad || ''}`.trim() : ''
  return cantidad ? `${nombre} (${cantidad})` : nombre
}

const resumenSoluciones = (soluciones = []) => soluciones
  .map(sol => {
    const productos = (sol.productos || []).filter(p => p.nombre || p.cantidad).map(productoTexto)
    if (!productos.length) return null
    return `${sol.nombre || 'Solucion'}: ${productos.join(', ')}`
  })
  .filter(Boolean)
  .join(' | ')

function ModalFertilizacion({ bloques, productos, form, setForm, onClose, onSave, saving }) {
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
    setForm(f => ({ ...f, soluciones: [...f.soluciones, { nombre, productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }] }))
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
      soluciones[si] = { ...soluciones[si], productos: [...soluciones[si].productos, { nombre: '', cantidad: '', unidad: 'kg' }] }
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
        actual.unidad = prod?.unidad || actual.unidad || 'kg'
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
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:250, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'34px 16px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:900, background:'#f7f6f3', borderRadius:8, padding:20, boxShadow:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#8a948b' }}>{form.tipo === 'plan' ? 'Programacion reutilizable' : 'Aplicacion real'}</div>
            <h2 style={{ margin:'2px 0 0', fontSize:24 }}>{form.tipo === 'plan' ? 'Nuevo plan recurrente' : form.plan_id ? 'Registrar aplicacion del plan' : 'Nueva fertilizacion'}</h2>
          </div>
          <button onClick={onClose} style={{ border:'none', background:'#fff', borderRadius:8, width:40, height:40, cursor:'pointer' }}>
            <i className="ti ti-x" style={{ fontSize:20 }} />
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:10, marginBottom:14 }}>
          {form.tipo === 'plan' && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700, gridColumn:isMobile ? '1 / -1' : 'span 2' }}>Nombre del plan<input value={form.nombre_plan || ''} onChange={e => setForm(f => ({ ...f, nombre_plan:e.target.value }))} placeholder="Ej: Tomate produccion" style={inputBase} /></label>}
          {form.tipo === 'plan' && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Frecuencia<select value={form.frecuencia || 'semanal'} onChange={e => setForm(f => ({ ...f, frecuencia:e.target.value }))} style={inputBase}><option value="diaria">Todos los dias</option><option value="semanal">Una vez por semana</option></select></label>}
          {form.tipo === 'plan' && form.frecuencia === 'semanal' && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Dia<select value={form.dia_semana ?? 1} onChange={e => setForm(f => ({ ...f, dia_semana:e.target.value }))} style={inputBase}>{['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'].map((d,i) => <option key={d} value={i}>{d}</option>)}</select></label>}
          <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>
            {form.tipo === 'plan' ? 'Fecha de inicio' : 'Fecha'}
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha:e.target.value }))} style={inputBase} />
          </label>
          <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Litros por tanque<input type="number" min="1" step="1" value={form.tanque_litros || ''} onChange={e => setForm(f => ({ ...f, tanque_litros:e.target.value }))} style={inputBase} /></label>
          <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Cantidad de tanques<input type="number" min="1" step="1" value={form.tanques_cantidad || ''} onChange={e => setForm(f => ({ ...f, tanques_cantidad:e.target.value }))} style={inputBase} /></label>
          {form.plan_id && <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700 }}>Resultado<select value={form.estado || 'completa'} onChange={e => setForm(f => ({ ...f, estado:e.target.value }))} style={inputBase}><option value="completa">Completa</option><option value="parcial">Parcial</option><option value="suspendida">Suspendida</option></select></label>}
          <div style={{ display:'grid', alignContent:'center', background:"#edf7f1", border:'1px solid #d6e8d4', borderRadius:8, padding:'10px 12px' }}><span style={{ fontSize:11, color:'#69706a' }}>VOLUMEN TOTAL</span><strong style={{ fontSize:18, color:"#08603f" }}>{fmtNum(Number(form.tanque_litros || 0) * Number(form.tanques_cantidad || 0))} L</strong></div>
          <div style={{ display:'grid', gap:8, gridColumn:'1 / -1' }}>
            <div style={{ fontSize:12, color:'#687068', fontWeight:700 }}>Bloques</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {bloques.map(b => {
                const activo = (form.bloques_ids || []).includes(b.id)
                const cultivo = b.plantaciones?.find?.(p => p.activa)?.cultivos?.nombre
                return (
                  <button key={b.id} onClick={() => alternarBloque(b.id)} style={{
                    border: activo ? '1px solid #1f1f1f' : '1px solid #e3e0db',
                    background: activo ? '#1f1f1f' : '#fff',
                    color: activo ? '#fff' : '#343a36',
                    borderRadius: 999,
                    padding: '9px 12px',
                    cursor:'pointer',
                    fontWeight:700,
                  }}>
                    {b.codigo}{cultivo ? ` - ${cultivo}` : ''}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize:12, color:'#8a948b' }}>{(form.bloques_ids || []).length} bloques seleccionados. {form.tipo === 'plan' ? 'Se crea un plan para cada plantacion activa.' : 'Se guarda un registro por bloque.'}</div>
          </div>
        </div>

        <div style={{ fontSize:12, fontWeight:700, color:"#08603f", margin:'2px 0 9px' }}>Las cantidades siguientes son por cada tanque.</div>
        <div style={{ display:'grid', gap:12 }}>
          {form.soluciones.map((sol, si) => (
            <div key={si} style={{ ...card, padding:14, boxShadow:'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:10 }}>
                <input value={sol.nombre} onChange={e => actualizarSolucion(si, 'nombre', e.target.value)} placeholder="Solucion A" style={{ ...inputBase, maxWidth:180, fontWeight:700 }} />
                {form.soluciones.length > 1 && (
                  <button onClick={() => eliminarSolucion(si)} style={{ border:'1px solid #ffd1d1', background:'#fff', color:'#d42f2f', borderRadius:8, padding:'9px 11px', cursor:'pointer' }}>Eliminar</button>
                )}
              </div>
              <div style={{ display:'grid', gap:8 }}>
                {sol.productos.map((p, pi) => (
                  <div key={pi} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : '1fr 120px 110px 38px', gap:8, alignItems:'center' }}>
                    <div style={{ display:'grid', gap:6 }}>
                      <select value={p.producto_id || ''} onChange={e => actualizarProducto(si, pi, 'producto_id', e.target.value)} style={inputBase}>
                        <option value="">Sin inventario</option>
                        {productos.map(prod => <option key={prod.id} value={prod.id}>{prod.nombre} - stock {fmtNum(prod.stock_actual)} {prod.unidad || ''}</option>)}
                      </select>
                      {!p.producto_id && <input value={p.nombre || ''} onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)} placeholder="Escribir producto" style={{ ...inputBase, background:'#f7fbf7', borderColor:'#d6dfd6' }} />}
                    </div>
                    <input value={p.cantidad} onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value)} placeholder="Cantidad" type="number" step="0.01" style={inputBase} />
                    <select value={p.unidad || 'kg'} onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)} style={inputBase}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button onClick={() => eliminarProducto(si, pi)} disabled={sol.productos.length === 1} style={{ border:'none', background:'#f2efeb', borderRadius:8, height:38, cursor: sol.productos.length === 1 ? 'not-allowed' : 'pointer' }}>
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => agregarProducto(si)} style={{ marginTop:10, border:'1px solid #e3e0db', background:'#fff', borderRadius:8, padding:'9px 12px', fontWeight:700, cursor:'pointer' }}>+ Producto</button>
            </div>
          ))}
        </div>

        <button onClick={agregarSolucion} style={{ marginTop:12, border:'1px solid #e3e0db', background:'#fff', borderRadius:8, padding:'10px 13px', fontWeight:700, cursor:'pointer' }}>+ Solucion</button>

        <label style={{ display:'grid', gap:6, fontSize:12, color:'#687068', fontWeight:700, marginTop:14 }}>
          Notas
          <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Ej: aplicacion por goteo, lote completo, observaciones..." style={{ ...inputBase, minHeight:86, resize:'vertical' }} />
        </label>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:16 }}>
          <button onClick={onClose} style={{ border:'1px solid #e3e0db', background:'#fff', borderRadius:8, padding:'11px 14px', fontWeight:700, cursor:'pointer' }}>Cancelar</button>
          <button onClick={onSave} disabled={saving} style={{ ...btnNegro, opacity:saving ? 0.7 : 1 }}>{saving ? 'Guardando...' : form.tipo === 'plan' ? 'Guardar plan recurrente' : 'Guardar aplicacion'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Fertilizaciones({ campoActivo }) {
  const width = useViewportWidth()
  const isMobile = width < 760
  const [bloques, setBloques] = useState([])
  const [productos, setProductos] = useState([])
  const [registros, setRegistros] = useState([])
  const [planes, setPlanes] = useState([])
  const [schemaPlanesDisponible, setSchemaPlanesDisponible] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    tipo: 'aplicacion',
    plan_id: '',
    estado: 'completa',
    fecha: hoy(),
    nombre_plan: '',
    frecuencia: 'semanal',
    dia_semana: '1',
    tanque_litros: '200',
    tanques_cantidad: '1',
    bloques_ids: [],
    notas: '',
    soluciones: [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg' }] }],
  })

  const cargarDatos = async () => {
    setError('')
    const { data: productosData } = await supabase
      .from('productos')
      .select('id, nombre, unidad, stock_actual, stock_minimo, activo')
      .eq('activo', true)
      .order('nombre')
    setProductos(productosData || [])

    let queryBloques = supabase
      .from('bloques')
      .select('id, codigo, campo_id, activo, plantaciones(id, activa, cultivos(nombre))')
      .eq('activo', true)
      .order('codigo')

    if (campoActivo?.id) queryBloques = queryBloques.eq('campo_id', campoActivo.id)
    const { data: bloquesData, error: bloquesError } = await queryBloques
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
  }

  useEffect(() => {
    cargarDatos()
  }, [campoActivo?.id])

  const grupos = useMemo(() => {
    const mapa = new Map()
    registros.forEach(r => {
      const key = `${r.fecha || ''}|${r.created_at || r.id}|${JSON.stringify(r.soluciones || [])}|${r.notas || ''}|${r.tanque_litros || ''}|${r.tanques_cantidad || ''}`
      if (!mapa.has(key)) mapa.set(key, { fecha:r.fecha, created_at:r.created_at, notas:r.notas, soluciones:r.soluciones || [], tanque_litros:r.tanque_litros, tanques_cantidad:r.tanques_cantidad, estado:r.estado, items:[] })
      mapa.get(key).items.push(r)
    })
    return Array.from(mapa.values()).sort((a, b) => `${b.fecha || ''}${b.created_at || ''}`.localeCompare(`${a.fecha || ''}${a.created_at || ''}`))
  }, [registros])

  const totalBloquesAplicados = useMemo(() => new Set(registros.map(r => r.bloque_id)).size, [registros])
  const ultimaFecha = registros[0]?.fecha

  const abrirModal = (tipo = 'aplicacion') => {
    setForm({
      tipo,
      plan_id: '',
      estado: 'completa',
      fecha: hoy(),
      nombre_plan: '',
      frecuencia: 'semanal',
      dia_semana: '1',
      tanque_litros: '200',
      tanques_cantidad: '1',
      bloques_ids: bloques.length === 1 ? [bloques[0].id] : [],
      notas: '',
      soluciones: [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg' }] }],
    })
    setModal(true)
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
            const descuentoStock = prod ? convertirAStock(p.cantidad, p.unidad || prod.unidad, prod.unidad) : null
            return {
              producto_id: p.producto_id || null,
              nombre: prod?.nombre || p.nombre || '',
              cantidad:p.cantidad || '',
              unidad:p.unidad || prod?.unidad || 'kg',
              descuento_stock: descuentoStock === null ? null : descuentoStock,
            }
          })
      }))
      .filter(sol => sol.productos.length > 0)

    if (!form.fecha) return setError('Elegir una fecha.')
    if (!bloquesDestino.length) return setError('Elegir al menos un bloque.')
    if (!solucionesLimpias.length) return setError('Agregar al menos un producto.')
    if (solucionesLimpias.flatMap(sol => sol.productos).some(p => !p.producto_id && !p.nombre?.trim())) {
      return setError('Escribir el nombre del producto o elegirlo desde inventario.')
    }
    if (solucionesLimpias.flatMap(sol => sol.productos).some(p => p.producto_id && p.descuento_stock === null)) {
      return setError('Hay una unidad que no coincide con el inventario. Usa kg/g para productos en kg o L/cc/ml para liquidos.')
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
          frecuencia: form.frecuencia || 'semanal',
          dia_semana: form.frecuencia === 'semanal' ? Number(form.dia_semana) : null,
          tanque_litros: tanqueLitros,
          tanques_cantidad: tanquesCantidad,
          litros_preparados: tanqueLitros * tanquesCantidad,
          soluciones: solucionesLimpias,
          notas: form.notas || null,
        }
      })
      const { error: planError } = await supabase.from('fertilizacion_planes').insert(planesNuevos)
      setSaving(false)
      if (planError) return setError(`No se pudo guardar el plan: ${planError.message}`)
      setModal(false)
      setSuccess(`Plan ${form.frecuencia === 'diaria' ? 'diario' : 'semanal'} guardado correctamente.`)
      await cargarDatos()
      return
    }

    setSaving(true)
    const payloads = bloquesDestino.map(bloque_id => ({
      bloque_id,
      plantacion_id: bloques.find(b => b.id === bloque_id)?.plantaciones?.find(p => p.activa)?.id || null,
      plan_id: form.plan_id || null,
      fecha: form.fecha,
      tanque_litros: tanqueLitros,
      tanques_cantidad: form.estado === 'suspendida' ? 0 : tanquesCantidad,
      estado: form.estado || 'completa',
      dosis_alcance: 'por_tanque',
      notas: form.notas || null,
      soluciones: solucionesLimpias,
    }))

    const { error: insertError } = await supabase.from('fertilizaciones').insert(payloads)
    setSaving(false)
    if (insertError) {
      setError(`No se pudo guardar la fertilizacion: ${insertError.message}`)
      return
    }

    const descuentos = solucionesLimpias
      .flatMap(sol => sol.productos)
      .reduce((acc, p) => {
        const cantidad = (Number(p.descuento_stock) || 0) * (form.estado === 'suspendida' ? 0 : tanquesCantidad)
        if (!p.producto_id || cantidad <= 0) return acc
        acc[p.producto_id] = (acc[p.producto_id] || 0) + cantidad
        return acc
      }, {})

    for (const [productoId, descuento] of Object.entries(descuentos)) {
      const { data: prodActual } = await supabase
        .from('productos')
        .select('stock_actual')
        .eq('id', productoId)
        .single()
      if (!prodActual) continue
      await supabase
        .from('productos')
        .update({ stock_actual: Math.max(0, Number(prodActual.stock_actual) - descuento) })
        .eq('id', productoId)
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
        productos: solucionesLimpias,
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
    setSuccess(form.plan_id ? 'Aplicacion del plan registrada correctamente.' : 'Fertilizacion guardada correctamente.')
    cargarDatos()
  }

  const registrarDesdePlan = (plan) => {
    setError('')
    setSuccess(`Revisa la cantidad realmente preparada para “${plan.nombre}” y guarda la aplicacion.`)
    setForm({
      tipo: 'aplicacion',
      plan_id: plan.id,
      estado: 'completa',
      fecha: hoy(),
      nombre_plan: '',
      frecuencia: plan.frecuencia || 'semanal',
      dia_semana: String(plan.dia_semana ?? 1),
      tanque_litros: String(plan.tanque_litros || 200),
      tanques_cantidad: String(plan.tanques_cantidad || 1),
      bloques_ids: [plan.bloque_id],
      notas: `Aplicacion del plan ${plan.nombre}. ${plan.notas || ''}`.trim(),
      soluciones: Array.isArray(plan.soluciones) && plan.soluciones.length
        ? plan.soluciones
        : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg' }] }],
    })
    setModal(true)
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
    <div style={{ padding:'38px clamp(16px, 4vw, 48px)', minHeight:'100vh', background:"#f6f8f7" }}>
      <div style={{ maxWidth:1220, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:18, marginBottom:20 }}>
          <div>
            <div style={{ color:'#8a948b', fontSize:13 }}>Aplicaciones reales</div>
            <h1 style={{ margin:'5px 0 0', fontSize:30, lineHeight:1.05 }}>Fertilizaciones</h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => abrirModal('plan')} disabled={!schemaPlanesDisponible} style={{ ...btnNegro, background:'#fff', color:"#08603f", border:'1px solid #dbe6da', opacity:schemaPlanesDisponible ? 1 : .55 }}><i className="ti ti-calendar-repeat" style={{ marginRight:7 }} />Nuevo plan</button>
            <button onClick={() => abrirModal('aplicacion')} style={{ ...btnNegro }}><i className="ti ti-plus" style={{ marginRight:7 }} />Aplicacion</button>
          </div>
        </div>

        {error && <div style={{ background:'#fff1f1', border:'1px solid #ffd6d6', color:'#b52525', borderRadius:8, padding:'12px 14px', marginBottom:12, fontSize:13 }}>{error}</div>}
        {success && <div style={{ background:'#edf8ee', border:'1px solid #cce5ce', color:"#08603f", borderRadius:8, padding:'12px 14px', marginBottom:12, fontSize:13 }}>{success}</div>}
        {!schemaPlanesDisponible && <div style={{ background:'#fff7e8', border:'1px solid #efd49f', color:'#80580e', borderRadius:8, padding:'12px 14px', marginBottom:12, fontSize:13 }}>Los planes diarios y semanales se habilitaran despues de ejecutar el SQL preparado para Supabase.</div>}

        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap:12, marginBottom:18 }}>
          <div style={{ ...card, padding:18, background:'#1f1f1f', color:'#fff' }}>
            <div style={{ fontSize:11, color:'#b9beb7' }}>APLICACIONES</div>
            <div style={{ fontSize:28, fontWeight:700 }}>{fmtNum(registros.length)}</div>
            <div style={{ fontSize:12, color:'#cdd2cc' }}>registros guardados</div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:11, color:'#8a948b' }}>BLOQUES APLICADOS</div>
            <div style={{ fontSize:28, fontWeight:700 }}>{fmtNum(totalBloquesAplicados)}</div>
            <div style={{ fontSize:12, color:'#8a948b' }}>con fertilizacion</div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:11, color:'#8a948b' }}>ULTIMA FECHA</div>
            <div style={{ fontSize:22, fontWeight:700 }}>{ultimaFecha ? fmtFecha(ultimaFecha) : '-'}</div>
            <div style={{ fontSize:12, color:'#8a948b' }}>ultima aplicacion</div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:11, color:'#8a948b' }}>BLOQUES ACTIVOS</div>
            <div style={{ fontSize:28, fontWeight:700 }}>{fmtNum(bloques.length)}</div>
            <div style={{ fontSize:12, color:'#8a948b' }}>disponibles</div>
          </div>
        </div>

        {schemaPlanesDisponible && (
          <div style={{ ...card, padding:18, marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}><div><div style={{ color:'#8a948b', fontSize:12 }}>PROGRAMACION</div><h2 style={{ margin:'3px 0 0', fontSize:20 }}>Planes activos</h2></div><span style={{ background:"#edf7f1", color:"#08603f", borderRadius:999, padding:'5px 10px', fontSize:12, fontWeight:700 }}>{planes.length}</span></div>
            {planes.length === 0 ? <div style={{ padding:'18px 0 4px', color:'#8a948b', fontSize:13 }}>Todavia no hay planes recurrentes.</div> : planes.map((plan, index) => {
              const tanques = Number(plan.tanques_cantidad) || 1
              const litros = Number(plan.tanque_litros) || ((Number(plan.litros_preparados) || 0) / tanques)
              const frecuencia = plan.frecuencia === 'diaria' ? 'Todos los dias' : `Cada ${['domingo','lunes','martes','miercoles','jueves','viernes','sabado'][Number(plan.dia_semana)] || 'semana'}`
              return <div key={plan.id} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1.2fr 1fr auto', gap:10, alignItems:'center', padding:'14px 0', borderTop:index === 0 ? 'none' : '1px solid #f0ede8' }}><div><strong style={{ fontSize:14 }}>{plan.nombre}</strong><div style={{ color:'#687068', fontSize:12, marginTop:4 }}>{plan.bloques?.codigo || 'Sin bloque'}{plan.plantaciones?.cultivos?.nombre ? ` · ${plan.plantaciones.cultivos.nombre}` : ''}</div></div><div><strong style={{ color:"#08603f", fontSize:13 }}>{frecuencia}</strong><div style={{ color:'#687068', fontSize:12, marginTop:4 }}>{fmtNum(tanques)} tanque{tanques === 1 ? '' : 's'} × {fmtNum(litros)} L = {fmtNum(tanques * litros)} L</div></div><div style={{ display:'flex', gap:7 }}><button onClick={() => registrarDesdePlan(plan)} style={{ ...btnNegro, background:"#08603f", padding:'9px 12px' }}>Registrar hoy</button><button onClick={() => pausarPlan(plan)} disabled={saving} style={{ border:'1px solid #e3e0db', background:'#fff', color:'#80580e', borderRadius:8, padding:'9px 11px', fontWeight:700, cursor:'pointer' }}>Pausar</button></div></div>
            })}
          </div>
        )}

        <div style={{ ...card, overflow:'hidden' }}>
          <div style={{ display:isMobile ? 'none' : 'grid', gridTemplateColumns:'130px 1fr 1.4fr', gap:12, padding:'13px 16px', borderBottom:'1px solid #ece9e3', color:'#687068', fontSize:12, fontWeight:700 }}>
            <div>FECHA</div>
            <div>BLOQUES</div>
            <div>DETALLE</div>
          </div>
          {grupos.length === 0 ? (
            <div style={{ padding:38, textAlign:'center', color:'#8a948b' }}>Sin fertilizaciones registradas.</div>
          ) : grupos.map((g, idx) => (
            <div key={`${g.fecha}-${idx}`} style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '130px 1fr 1.4fr', gap:12, padding:'16px', borderBottom: idx === grupos.length - 1 ? 'none' : '1px solid #f0ede8', alignItems:'start' }}>
              <div style={{ fontWeight:700 }}>{fmtFecha(g.fecha)}</div>
              <div>
                <div style={{ fontWeight:700 }}>{g.items.length} bloque{g.items.length === 1 ? '' : 's'}</div>
                <div style={{ color:'#687068', fontSize:13 }}>{g.items.map(i => i.bloques?.codigo || 'Bloque').join(', ')}</div>
              </div>
              <div>
                <div style={{ fontSize:13, lineHeight:1.45 }}>{resumenSoluciones(g.soluciones) || 'Sin productos detallados'}</div>
                {g.tanque_litros && <div style={{ marginTop:7, color:"#08603f", fontSize:12, fontWeight:700 }}>{g.tanques_cantidad || 1} tanque{Number(g.tanques_cantidad || 1) === 1 ? '' : 's'} × {fmtNum(g.tanque_litros)} L = {fmtNum(Number(g.tanque_litros) * Number(g.tanques_cantidad || 1))} L · {g.estado || 'completa'}</div>}
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
        />
      )}
    </div>
  )
}
