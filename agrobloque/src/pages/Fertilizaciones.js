import { Modal, Skeleton } from '../components/UI'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, DateQuickField, BlockChips, resumenPie, fechaIso } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { registrarAuditoria } from '../lib/audit'
import { useCan } from '../lib/RoleContext'
import { ajustarStockSeguro, textoFaltantes } from '../lib/inventory'
import { esProductoFertilizacion, incluirSeleccionados } from '../lib/productCategories'
import { useNavigate } from 'react-router-dom'
import { useAccionNueva } from '../lib/useAccionNueva'

const UNIDADES = ['kg', 'g', 'cc', 'ml', 'L', 'unidad']
const hoy = () => fechaIso(0)
const fmtNum = (n) => Number(n || 0).toLocaleString('es-PY')
const fmtFecha = (fecha) => fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PY') : '-'
const fmtFechaLista = (fecha) => fecha
  ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PY', { weekday:'long', day:'numeric', month:'long' })
  : 'Sin fecha'
const MARCA_FIN_SEMANA = /\s*\[\[semana_fin:(\d{4}-\d{2}-\d{2})\]\]\s*/
const MARCA_ETAPA = /\s*\[\[etapa:([^\]]+)\]\]\s*/
const etapaDeNotas = (notas = '') => String(notas || '').match(MARCA_ETAPA)?.[1] || ''
const notasVisibles = (notas = '') => String(notas || '').replace(MARCA_FIN_SEMANA, '').replace(MARCA_ETAPA, '').trim()
const notasConEtapa = (notas = '', etapa = '') => `${notasVisibles(notas)}${etapa ? ` [[etapa:${etapa.trim()}]]` : ''}`.trim() || null
const finSemanaRegistro = (registro) => {
  const marcada = String(registro?.notas || '').match(MARCA_FIN_SEMANA)?.[1]
  return marcada || ''
}
const rangoSemana = (registro) => {
  const fin = finSemanaRegistro(registro)
  return fin ? `${fmtFecha(registro.fecha)} al ${fmtFecha(fin)}` : fmtFecha(registro.fecha)
}
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

// Cuánto producto va a usar la aplicación del formulario (misma cuenta que al guardar) frente a lo que hay en inventario.
// Devuelve solo los productos que no alcanzan.
const productosQueNoAlcanzan = (form, productos, bloques) => {
  const tanques = Math.max(1, Number(form.tanques_cantidad) || 1)
  const destino = form.bloques_ids || []
  const usados = new Map()
  for (const sol of form.soluciones || []) {
    for (const p of sol.productos || []) {
      const prod = p.producto_id ? productos.find(x => x.id === p.producto_id) : null
      if (!prod) continue
      for (const bloqueId of destino) {
        const bloque = bloques.find(b => b.id === bloqueId)
        const uso = p.modo === 'por_planta' ? Number(p.cantidad || 0) * plantasDelBloque(bloque) : Number(p.cantidad || 0) * tanques / (destino.length || 1)
        const descuento = convertirAStock(uso, p.unidad || prod.unidad || 'kg', prod.unidad)
        if (descuento > 0) usados.set(prod.id, { prod, usado:(usados.get(prod.id)?.usado || 0) + descuento })
      }
    }
  }
  return [...usados.values()].filter(({ prod, usado }) => usado > Number(prod.stock_actual || 0) + 1e-9)
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

// Cuerpo del formulario: se monta solo mientras la ventana está abierta, así que su estado (modo avanzado) empieza limpio cada vez.
function CuerpoFertilizacion({ bloques, productos, form, setForm }) {
  const esSemana = form.tipo === 'plan' || form.es_semanal
  const [avanzado, setAvanzado] = useState(esSemana || Boolean(form.plan_id || form.edit_grupo || form.edit_plan_id))
  const seleccionados = form.bloques_ids || []
  const alternarBloque = (bloqueId) => {
    setForm(f => {
      const actuales = new Set(f.bloques_ids || [])
      if (actuales.has(bloqueId)) actuales.delete(bloqueId)
      else actuales.add(bloqueId)
      return { ...f, bloques_ids: Array.from(actuales) }
    })
  }
  const seleccionarBloques = (lista) => setForm(f => ({ ...f, bloques_ids: [...new Set([...(f.bloques_ids || []), ...lista.map(b => b.id)])] }))
  const limpiarBloques = () => setForm(f => ({ ...f, bloques_ids: [] }))

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

  const fertilizantes = productos.filter(esProductoFertilizacion)
  const plantasTotales = seleccionados.reduce((total, id) => total + plantasDelBloque(bloques.find(b => b.id === id)), 0)
  const volumenTotal = Number(form.tanque_litros || 0) * Number(form.tanques_cantidad || 0)
  const camposPreparacion = (
    <>
      <ModalGrid>
        <ModalField label="Litros por tanque">
          <input className="apple-control apple-control--num" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" value={form.tanque_litros || ''} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, tanque_litros:e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Ej: 200" />
        </ModalField>
        <ModalField label="Cantidad de tanques">
          <input className="apple-control apple-control--num" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" value={form.tanques_cantidad || ''} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, tanques_cantidad:e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Ej: 1" />
        </ModalField>
      </ModalGrid>
      {volumenTotal > 0 && <p className="apple-note">Volumen total: <b>{fmtNum(volumenTotal)} L</b></p>}
      <ModalField label="Etapa fenológica">
        <input className="apple-control" value={form.etapa_fenologica || ''} onChange={e => setForm(f => ({ ...f, etapa_fenologica:e.target.value }))} placeholder="Ej: trasplante, crecimiento, floración o cosecha" />
      </ModalField>
      <ModalField label="Notas">
        <textarea className="apple-control" value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Ej: aplicación por goteo, lote completo, observaciones…" />
      </ModalField>
    </>
  )

  return (
    <>
      {!esSemana && !form.plan_id && <p className="apple-note"><i className="ti ti-bolt" aria-hidden="true" /> <strong>Registro rápido:</strong> elegí los bloques, el producto y la cantidad usada. Al guardar se descuenta del inventario.</p>}

      <ModalSection title="Dónde y cuándo" icon="ti-map-pin">
        {esSemana && (
          <ModalField label="Nombre de la semana">
            <input className="apple-control" value={form.nombre_plan || ''} onChange={e => setForm(f => ({ ...f, nombre_plan:e.target.value }))} placeholder="Ej: Fertilización tomate · semana 3" />
          </ModalField>
        )}
        <ModalGrid>
          <DateQuickField label={esSemana ? 'Inicio de la semana' : 'Fecha'} required value={form.fecha} onChange={fecha => setForm(f => ({ ...f, fecha, ...(f.tipo === 'plan' ? { fecha_fin:sumarDias(fecha, 6) } : {}) }))} />
          {esSemana ? (
            <ModalField label="Fin de la semana">
              <input className="apple-control" type="date" min={form.fecha} value={form.fecha_fin || ''} onChange={e => setForm(f => ({ ...f, fecha_fin:e.target.value }))} />
            </ModalField>
          ) : form.plan_id ? (
            <ModalField label="Resultado">
              <select className="apple-control" value={form.estado || 'completa'} onChange={e => setForm(f => ({ ...f, estado:e.target.value }))}>
                <option value="completa">Completa</option><option value="parcial">Parcial</option><option value="suspendida">Suspendida</option>
              </select>
            </ModalField>
          ) : null}
        </ModalGrid>
        <BlockChips
          bloques={bloques}
          seleccionados={seleccionados}
          cultivoDe={b => b.plantaciones?.find?.(p => p.activa)?.cultivos?.nombre || ''}
          onToggle={alternarBloque}
          onSelectAll={seleccionarBloques}
          onClear={limpiarBloques}
          vacio="No hay bloques cargados en este campo."
        />
        <small className="apple-field__hint">{esSemana ? 'Al guardar, la semana queda registrada en el historial de cada bloque.' : 'Se guarda un registro por bloque.'}</small>
      </ModalSection>

      <ModalSection title="Productos aplicados" icon="ti-flask" aside={avanzado ? <span className="apple-field__hint">Cantidades por tanque, salvo dosis por planta</span> : null}>
        <div className="apple-rows">
          {form.soluciones.map((sol, si) => (
            <div className={`apple-solution${avanzado ? ' apple-solution--card' : ''}`} key={si}>
              {avanzado && (
                <div className="apple-solution__head">
                  <input className="apple-control" aria-label="Nombre de la solución" value={sol.nombre} onChange={e => actualizarSolucion(si, 'nombre', e.target.value)} placeholder="Solución A" />
                  {form.soluciones.length > 1 && <button type="button" className="apple-row__remove" aria-label={`Eliminar la solución ${sol.nombre || si + 1}`} onClick={() => eliminarSolucion(si)}><i className="ti ti-trash" aria-hidden="true" /></button>}
                </div>
              )}
              {sol.productos.map((p, pi) => (
                <div className={`apple-row${avanzado ? ' apple-row--modo' : ''}`} key={pi}>
                  <div className="apple-row__name">
                    <select className="apple-control" aria-label={`Producto ${pi + 1}`} value={p.producto_id || ''} onChange={e => actualizarProducto(si, pi, 'producto_id', e.target.value)}>
                      <option value="">Sin inventario (escribir)…</option>
                      {incluirSeleccionados(productos, esProductoFertilizacion, [p.producto_id]).map(prod => <option key={prod.id} value={prod.id}>{prod.nombre} · stock {fmtNum(prod.stock_actual)} {prod.unidad || ''}</option>)}
                    </select>
                    {!p.producto_id && <input className="apple-control" aria-label="Nombre del producto" value={p.nombre || ''} onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)} placeholder="Nombre del producto" />}
                  </div>
                  {avanzado && (
                    <select className="apple-control apple-row__modo" aria-label="Forma de dosis" value={p.modo || 'por_tanque'} onChange={e => actualizarProducto(si, pi, 'modo', e.target.value)}>
                      <option value="por_tanque">Por tanque</option>
                      <option value="por_planta">Por planta</option>
                    </select>
                  )}
                  <input className="apple-control apple-control--num" aria-label={p.modo === 'por_planta' ? 'Dosis por planta' : 'Cantidad'} value={p.cantidad} onWheel={e => e.currentTarget.blur()} onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))} placeholder={p.modo === 'por_planta' ? 'Dosis/planta' : 'Cantidad'} type="text" inputMode="decimal" enterKeyHint="next" />
                  <select className="apple-control" aria-label="Unidad" value={p.unidad || 'kg'} onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button type="button" className="apple-row__remove" aria-label={`Quitar producto ${pi + 1}`} onClick={() => eliminarProducto(si, pi)} disabled={sol.productos.length === 1}><i className="ti ti-x" aria-hidden="true" /></button>
                  {p.modo === 'por_planta' && <div className="apple-row__info">Total calculado: <b>{fmtNum(plantasTotales * Number(p.cantidad || 0))} {p.unidad || 'g'}</b> para <b>{fmtNum(plantasTotales)}</b> plantas.</div>}
                </div>
              ))}
              <button type="button" className="apple-add" onClick={() => agregarProducto(si)}><i className="ti ti-plus" aria-hidden="true" />Agregar producto</button>
            </div>
          ))}
        </div>
        {fertilizantes.length === 0 && <p className="apple-note is-warn">No hay fertilizantes clasificados. Revisá la categoría del producto en Inventario o escribí el nombre.</p>}
        {avanzado && <button type="button" className="apple-link" onClick={agregarSolucion}>+ Agregar otra solución (B, C…)</button>}
        {!esSemana && form.estado !== 'suspendida' && !form.edit_grupo && productosQueNoAlcanzan(form, productos, bloques).map(({ prod, usado }) => <div className="apple-row__alert" role="status" key={prod.id}><i className="ti ti-alert-triangle" aria-hidden="true" /><span>Falta producto: de {prod.nombre} hay {fmtNum(prod.stock_actual)} {prod.unidad || ''} y esta aplicación usa {fmtNum(usado)} {prod.unidad || ''}. Se guardará igual, el stock quedará en 0 y te avisaremos para registrar la compra pendiente.</span></div>)}
      </ModalSection>

      {esSemana ? (
        <ModalSection title="Preparación y detalles" icon="ti-adjustments-horizontal">{camposPreparacion}</ModalSection>
      ) : (
        <ModalSection title="Opciones avanzadas" icon="ti-adjustments-horizontal" collapsible open={avanzado} onToggle={() => setAvanzado(v => !v)} badge={avanzado ? '' : 'tanques, dosis por planta, notas'}>{camposPreparacion}</ModalSection>
      )}
    </>
  )
}

function ModalFertilizacion({ open = true, bloques, productos, form, setForm, onClose, onSave, saving, error }) {
  const esSemana = form.tipo === 'plan' || form.es_semanal
  const titulo = esSemana ? (form.edit_grupo || form.edit_plan_id ? 'Editar plan semanal' : 'Nuevo plan semanal') : form.edit_grupo ? 'Corregir aplicación' : form.plan_id ? 'Registrar aplicación del plan' : 'Aplicación puntual del día'
  const volumen = Number(form.tanque_litros || 0) * Number(form.tanques_cantidad || 0)
  const nProductos = (form.soluciones || []).reduce((total, sol) => total + (sol.productos || []).filter(p => p.producto_id || p.nombre).length, 0)
  return (
    <UnifiedFormModal
      open={open}
      tone="agua"
      icon={esSemana ? 'ti-calendar-week' : 'ti-droplet'}
      eyebrow={esSemana ? 'Programación por bloques' : form.plan_id ? 'Aplicación del plan' : 'Fuera del plan'}
      title={titulo}
      label="Registrar fertilización"
      busy={saving}
      onClose={onClose}
      onSubmit={onSave}
      submitLabel={esSemana ? (form.edit_grupo || form.edit_plan_id ? 'Guardar cambios' : 'Guardar semana') : form.edit_grupo ? 'Guardar corrección' : 'Guardar registro'}
      error={error}
      summary={resumenPie([
        { n: (form.bloques_ids || []).length, texto: 'bloques', uno: 'bloque' },
        { n: nProductos, texto: 'productos', uno: 'producto' },
        { n: volumen > 0 ? fmtNum(volumen) : '', texto: 'L' },
      ]) || 'Elegí los bloques para empezar'}
    >{() => <CuerpoFertilizacion bloques={bloques} productos={productos} form={form} setForm={setForm} />}</UnifiedFormModal>
  )
}

export default function Fertilizaciones({ campoActivo }) {
  const can = useCan('plan_nutricional')
  const navigate = useNavigate()
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
  const edicionUrlProcesada = useRef(false)
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
    etapa_fenologica: '',
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

    let queryPlanes = supabase.from('fertilizacion_planes').select('*, bloques(codigo), plantaciones(id, cultivos(nombre))').order('created_at', { ascending:false })
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

  const gruposPorFecha = useMemo(() => grupos.reduce((acumulado, grupo) => {
    const fecha = grupo.fecha || ''
    if (!acumulado[fecha]) acumulado[fecha] = []
    acumulado[fecha].push(grupo)
    return acumulado
  }, {}), [grupos])
  const fechasDeGrupos = useMemo(() => Object.keys(gruposPorFecha).sort((a, b) => b.localeCompare(a)), [gruposPorFecha])

  const registrosActivos = useMemo(() => registros.filter(r => !r.anulada), [registros])
  const totalBloquesAplicados = useMemo(() => new Set(registrosActivos.map(r => r.bloque_id)).size, [registrosActivos])
  const ultimaFecha = registrosActivos[0]?.fecha
  const planesVigentes = useMemo(() => {
    const recetas = new Map()
    planes.forEach(plan => {
      const key = `${plan.nombre || ''}|${plan.fecha_inicio || ''}|${plan.fecha_fin || ''}|${JSON.stringify(plan.soluciones || [])}`
      if (!recetas.has(key)) recetas.set(key, plan)
    })
    return Array.from(recetas.values())
  }, [planes])

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
      etapa_fenologica: '',
      soluciones: [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setModal(true)
  }
  useAccionNueva(() => abrirModal('aplicacion'), { permitido: can.create, listo: !loading })

  const abrirEditarAplicacion = (grupo) => {
    const idsPlanes = [...new Set(grupo.items.map(item => item.plan_id).filter(Boolean))]
    const planVinculado = planes.find(plan => idsPlanes.includes(plan.id))
    const soluciones = (grupo.soluciones || []).map(sol => ({
      ...sol,
      productos:(sol.productos || []).map(p => ({
        ...p,
        cantidad:p.modo === 'por_planta' && p.dosis_por_planta ? String(p.dosis_por_planta) : String(p.cantidad || ''),
        unidad:p.modo === 'por_planta' ? (p.unidad_dosis || p.unidad || 'g') : (p.unidad || 'kg'),
      })),
    }))
    setForm({
      tipo:'aplicacion', es_semanal:idsPlanes.length > 0, edit_plan_ids:idsPlanes, edit_ids:grupo.items.map(i => i.id), edit_grupo:grupo,
      plan_id:grupo.items[0]?.plan_id || '', estado:grupo.estado || 'completa', fecha:grupo.fecha || hoy(),
      fecha_fin:finSemanaRegistro(grupo.items[0]) || planVinculado?.fecha_fin || sumarDias(grupo.fecha || hoy(), 6), nombre_plan:planVinculado?.nombre || '', frecuencia:'semanal', dia_semana:'1',
      tanque_litros:String(grupo.tanque_litros || 200), tanques_cantidad:String(grupo.tanques_cantidad || 1),
      bloques_ids:grupo.items.map(i => i.bloque_id), notas:notasVisibles(grupo.notas || ''), etapa_fenologica:etapaDeNotas(grupo.notas || ''),
      soluciones:soluciones.length ? soluciones : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setDetalle(null)
    setModal(true)
  }

  useEffect(() => {
    if (edicionUrlProcesada.current || loading || !grupos.length || typeof window === 'undefined') return
    const editarId = new URLSearchParams(window.location.search).get('editar')
    if (!editarId) return
    const grupo = grupos.find(item => item.grupo_id === editarId || item.items.some(registro => registro.id === editarId))
    if (!grupo) return
    edicionUrlProcesada.current = true
    abrirEditarAplicacion(grupo)
    window.history.replaceState({}, '', window.location.pathname)
  }, [grupos, loading])

  const repetirAplicacion = (grupo) => {
    abrirEditarAplicacion(grupo)
    setForm(f => ({ ...f, edit_ids:undefined, edit_grupo:undefined, plan_id:'', fecha:hoy(), notas:f.notas ? `Repetición: ${f.notas}` : 'Repetición de aplicación' }))
  }

  const abrirEditarPlan = (plan) => {
    setForm({
      tipo:'plan', edit_plan_id:plan.id, plan_id:'', estado:'completa', fecha:plan.fecha_inicio || hoy(),
      fecha_fin:plan.fecha_fin || sumarDias(hoy(), 6), nombre_plan:plan.nombre || '', frecuencia:plan.frecuencia || 'semanal',
      dia_semana:String(plan.dia_semana ?? 1), tanque_litros:String(plan.tanque_litros || 200),
      tanques_cantidad:String(plan.tanques_cantidad || 1), bloques_ids:[plan.bloque_id], notas:notasVisibles(plan.notas || ''), etapa_fenologica:etapaDeNotas(plan.notas || ''),
      soluciones:Array.isArray(plan.soluciones) && plan.soluciones.length ? plan.soluciones : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setModal(true)
  }

  const devolverInventarioGrupo = async (grupo, motivo = 'Correccion de fertilizacion') => {
    const origenId = grupo.grupo_id || grupo.items[0]?.grupo_id
    if (origenId) {
      const { data:revertidos, error:revertirError } = await supabase.rpc('revertir_consumos_valorizados', { p_origen_tipo:'consumo_fertilizacion', p_origen_id:origenId })
      if (!revertirError && Number(revertidos) > 0) return
    }
    for (const { producto_id:productoId, cantidad } of totalesLegado(grupo)) {
      const prod = productos.find(x => x.id === productoId)
      await ajustarStockSeguro({ productoId, delta:cantidad, tipo:'devolucion_fertilizacion', modulo:'Fertilizaciones', referenciaId:grupo.grupo_id || grupo.items[0]?.id, detalle:motivo, stockActual:prod?.stock_actual || 0 })
    }
  }

  // Si la base todavía no tiene las funciones atómicas, se usa el camino anterior (guardar en varios pasos).
  const rpcAusente = (error) => error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(error?.message || '')

  // Cuánto devolver por producto según lo guardado en la aplicación (la cuenta de siempre de la pantalla). La base solo la usa
  // para aplicaciones antiguas que no tienen ningún movimiento de inventario.
  const totalesLegado = (grupo) => {
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
    return Object.entries(totales).map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
  }

  const anularAplicacion = async (grupo) => {
    const motivo = motivoAnulacion.trim()
    if (!motivo) return setError('Escribí el motivo de la anulación.')
    setSaving(true); setError(''); setSuccess('')
    try {
      // Anular y devolver el stock en una sola operación de la base: si algo falla, no queda nada a medias.
      const { error:atomicoError } = await supabase.rpc('anular_fertilizacion', { p_ids:grupo.items.map(i => i.id), p_grupo_origen:grupo.grupo_id || grupo.items[0]?.grupo_id || null, p_motivo:motivo, p_legado:totalesLegado(grupo) })
      if (atomicoError && !rpcAusente(atomicoError)) throw atomicoError
      if (atomicoError) {
        const { error:anularError } = await supabase.from('fertilizaciones').update({ anulada:true, anulada_at:new Date().toISOString(), anulada_motivo:motivo.trim(), updated_at:new Date().toISOString() }).in('id', grupo.items.map(i => i.id))
        if (anularError) throw anularError
        await devolverInventarioGrupo(grupo, motivo.trim())
      }
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
          notas: notasConEtapa(form.notas, form.etapa_fenologica),
        }
      })
      let planResult
      if (form.edit_plan_ids?.length) {
        const resultados = await Promise.all(planesNuevos.map((planNuevo, index) => form.edit_plan_ids[index]
          ? supabase.from('fertilizacion_planes').update({ ...planNuevo, activo:true, updated_at:new Date().toISOString() }).eq('id', form.edit_plan_ids[index]).select('id, bloque_id, campo_id, nombre, fecha_inicio, fecha_fin, frecuencia, dia_semana')
          : supabase.from('fertilizacion_planes').insert(planNuevo).select('id, bloque_id, campo_id, nombre, fecha_inicio, fecha_fin, frecuencia, dia_semana')))
        planResult = { data:resultados.flatMap(resultado => resultado.data || []), error:resultados.find(resultado => resultado.error)?.error || null }
      } else if (form.edit_plan_id) {
        planResult = await supabase.from('fertilizacion_planes').update({ ...planesNuevos[0], updated_at:new Date().toISOString() }).eq('id', form.edit_plan_id).select('id, bloque_id, campo_id, nombre, fecha_inicio, fecha_fin, frecuencia, dia_semana')
        await supabase.from('tareas').update({ anulada:true, cancelada:true, anulada_motivo:'Plan reprogramado', updated_at:new Date().toISOString() }).eq('origen_tipo', 'fertilizacion_plan').eq('origen_id', form.edit_plan_id).eq('completada', false)
      } else {
        planResult = await supabase.from('fertilizacion_planes').insert(planesNuevos).select('id, bloque_id, campo_id, nombre, fecha_inicio, fecha_fin, frecuencia, dia_semana')
      }
      const { data:planesGuardados, error: planError } = planResult
      if (planError) { setSaving(false); return setError(`No se pudo guardar la semana: ${planError.message}`) }
      const planesCreados = planesGuardados || []
      await Promise.all(planesCreados.map(plan => supabase.from('tareas').update({ anulada:true, cancelada:true, anulada_motivo:'Plan reprogramado', updated_at:new Date().toISOString() }).eq('origen_tipo', 'fertilizacion_plan').eq('origen_id', plan.id).eq('completada', false)))
      const tareasPlan = planesCreados.flatMap(plan => fechasDelPlan(plan.fecha_inicio, plan.fecha_fin, plan.frecuencia, plan.dia_semana).map(fecha => ({
        tipo:'fertiriego',
        descripcion:`Fertilización planificada · ${plan.nombre}`,
        fecha_programada:fecha,
        campo_id:plan.campo_id || campoActivo?.id || null,
        bloque_id:plan.bloque_id,
        prioridad:'normal',
        responsable:null,
        completada:false,
        origen_tipo:'fertilizacion_plan',
        origen_id:plan.id,
      })))
      const { error:tareasError } = tareasPlan.length ? await supabase.from('tareas').insert(tareasPlan) : { error:null }
      await registrarAuditoria({ accion:'Creo plan semanal de fertilizacion', modulo:'Fertilizaciones', tabla:'fertilizacion_planes', registroId:planesCreados[0]?.id || '', detalle:`${bloquesDestino.length} bloques · ${form.fecha} a ${form.fecha_fin}` })
      setSaving(false)
      setModal(false)
      if (tareasError) toast.warning('Plan semanal guardado sin tareas', { description:`No se pudieron crear sus tareas: ${tareasError.message}`, duration:12000 })
      else toast.success('Plan semanal guardado', { description:`Se agregaron ${tareasPlan.length} tarea${tareasPlan.length === 1 ? '' : 's'} al calendario. El inventario se descontará al registrar cada aplicación.` })
      await cargarDatos()
      return
    }

    setSaving(true)
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
        plan_id: form.plan_ids_by_block?.[bloque_id] || form.plan_id || null,
        fecha: form.fecha,
        tanque_litros: tanqueLitros,
        tanques_cantidad: form.estado === 'suspendida' ? 0 : tanquesCantidad,
        estado: form.estado || 'completa',
        dosis_alcance: solucionesLimpias.some(sol => sol.productos.some(p => p.modo === 'por_planta')) ? 'por_planta' : 'por_tanque',
        notas: form.es_semanal ? `${notasConEtapa(form.notas, form.etapa_fenologica) || ''} [[semana_fin:${form.fecha_fin || sumarDias(form.fecha, 6)}]]`.trim() : notasConEtapa(form.notas, form.etapa_fenologica),
        soluciones: solucionesPorBloque(bloque),
      }
    })

    // Seguimiento del plan (solo al registrar una aplicación del plan) y cuánto producto descuenta cada bloque.
    const seguimientoPlan = (form.plan_id || form.plan_ids_by_block) && !form.edit_grupo ? payloads.filter(item => item.plan_id).map(item => ({
      plan_id:item.plan_id,
      bloque_id:item.bloque_id,
      plantacion_id:item.plantacion_id,
      fecha:form.fecha,
      litros_aplicados:form.estado === 'suspendida' ? 0 : tanqueLitros * tanquesCantidad,
      tanques_aplicados:form.estado === 'suspendida' ? 0 : tanquesCantidad,
      estado:form.estado || 'completa',
      productos:item.soluciones || [],
      notas:form.notas || null,
    })) : []
    const descuentosDelBloque = (payload) => {
      if (form.estado === 'suspendida') return []
      const bloque = bloques.find(b => b.id === payload.bloque_id)
      return solucionesLimpias.flatMap(sol => sol.productos).filter(p => p.producto_id).map(producto => {
        const cantidadUso = producto.modo === 'por_planta'
          ? Number(producto.cantidad || 0) * plantasDelBloque(bloque)
          : Number(producto.cantidad || 0) * tanquesCantidad / payloads.length
        return { producto_id:producto.producto_id, cantidad:convertirAStock(cantidadUso, producto.unidad, producto.unidad_stock) }
      }).filter(d => d.cantidad && d.cantidad > 0)
    }
    const faltantes = []
    // Todo en una sola operación de la base (filas, descuento de stock, seguimiento y tarea del plan): si algo falla, no se guarda nada.
    const cargaAtomica = {
      grupo_id:grupoId, fecha:form.fecha,
      aplicaciones:payloads.map(payload => ({ ...payload, detalle:`Bloque ${bloques.find(b => b.id === payload.bloque_id)?.codigo || ''}`, descuentos:descuentosDelBloque(payload) })),
      seguimiento:seguimientoPlan,
      planes_completar:[...new Set(seguimientoPlan.map(item => item.plan_id).filter(Boolean))],
    }
    const { data:atomico, error:atomicoError } = form.edit_grupo
      ? await supabase.rpc('editar_fertilizacion', { p_ids:form.edit_ids || [], p_grupo_origen:form.edit_grupo.grupo_id || form.edit_grupo.items?.[0]?.grupo_id || null, p_legado:totalesLegado(form.edit_grupo), p:cargaAtomica })
      : await supabase.rpc('registrar_fertilizacion', { p:cargaAtomica })
    if (atomicoError && !rpcAusente(atomicoError)) {
      setSaving(false)
      setError(`No se pudo guardar la fertilización: ${atomicoError.message || 'error desconocido'}`)
      return
    }
    const guardadoAtomico = !atomicoError
    if (guardadoAtomico) {
      faltantes.push(...(atomico?.faltantes || []))
      setSaving(false)
    } else {
    // Camino anterior (la base todavía no tiene las funciones atómicas): varios pasos sueltos.
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
    const { error: insertError } = await supabase.from('fertilizaciones').insert(payloads)
    setSaving(false)
    if (insertError) {
      setError(`No se pudo guardar la fertilización: ${insertError.message}`)
      return
    }

    if (form.estado !== 'suspendida') {
      for (const payload of payloads) {
        const bloque = bloques.find(b => b.id === payload.bloque_id)
        for (const producto of solucionesLimpias.flatMap(sol => sol.productos).filter(p => p.producto_id)) {
          const cantidadUso = producto.modo === 'por_planta'
            ? Number(producto.cantidad || 0) * plantasDelBloque(bloque)
            : Number(producto.cantidad || 0) * tanquesCantidad / payloads.length
          const descuento = convertirAStock(cantidadUso, producto.unidad, producto.unidad_stock)
          if (!descuento || descuento <= 0) continue
          const prodActual = productos.find(p => p.id === producto.producto_id)
          const consumo = await ajustarStockSeguro({
            productoId:producto.producto_id, delta:-descuento, tipo:'consumo_fertilizacion', modulo:'Fertilizaciones',
            referenciaId:grupoId, detalle:`Bloque ${bloque?.codigo || ''}`, stockActual:prodActual?.stock_actual || 0,
            plantacionId:payload.plantacion_id, bloqueId:payload.bloque_id, fecha:form.fecha,
          })
          if (consumo?.faltante > 0) faltantes.push({ nombre:producto.nombre || prodActual?.nombre || 'Producto', unidad:prodActual?.unidad || producto.unidad_stock, pedido:consumo.pedido, disponible:consumo.disponible, faltante:consumo.faltante })
        }
      }
    }
    }

    if (form.es_semanal && form.edit_plan_ids?.length) {
      await Promise.all(form.edit_plan_ids.map((planId, index) => {
        const bloqueId = bloquesDestino[index] || bloquesDestino[0]
        const bloque = bloques.find(b => b.id === bloqueId)
        return supabase.from('fertilizacion_planes').update({
          bloque_id:bloqueId,
          campo_id:campoActivo?.id || bloque?.campo_id || null,
          plantacion_id:bloque?.plantaciones?.find(p => p.activa)?.id || null,
          nombre:form.nombre_plan?.trim() || 'Fertilización semanal',
          fecha_inicio:form.fecha,
          fecha_fin:form.fecha_fin || sumarDias(form.fecha, 6),
          frecuencia:'semanal',
          tanque_litros:tanqueLitros,
          tanques_cantidad:tanquesCantidad,
          litros_preparados:tanqueLitros * tanquesCantidad,
          soluciones:solucionesLimpias.map(sol => ({ ...sol, productos:sol.productos.map(({ unidad_stock, ...p }) => p) })),
          notas:notasConEtapa(form.notas, form.etapa_fenologica),
          activo:false,
          updated_at:new Date().toISOString(),
        }).eq('id', planId)
      }))
    }

    if (!guardadoAtomico && (form.plan_id || form.plan_ids_by_block) && !form.edit_grupo) {
      const seguimiento = seguimientoPlan
      const { error: seguimientoError } = seguimiento.length ? await supabase.from('fertilizacion_plan_aplicaciones').insert(seguimiento) : { error:null }
      if (seguimientoError) setError(`La fertilización se guardo, pero fallo el seguimiento del plan: ${seguimientoError.message}`)
      const planIdsAplicados = [...new Set(seguimiento.map(item => item.plan_id).filter(Boolean))]
      if (planIdsAplicados.length) {
        await supabase.from('tareas').update({ completada:true, fecha_completada:form.fecha, updated_at:new Date().toISOString() }).eq('origen_tipo', 'fertilizacion_plan').in('origen_id', planIdsAplicados).eq('fecha_programada', form.fecha)
      }
    }

    await registrarAuditoria({
      accion: bloquesDestino.length > 1 ? 'Registro fertilizacion multiple' : 'Registro fertilizacion',
      modulo: 'Fertilizaciones',
      tabla: 'fertilizaciones',
      registroId: '',
      detalle: `${bloquesDestino.length} bloques - ${form.fecha}`,
    })

    setModal(false)
    const mensajeGuardado = form.edit_grupo ? (form.es_semanal ? 'Fertilización semanal actualizada en todos sus bloques.' : 'Fertilización corregida correctamente.') : form.plan_id ? 'Aplicación del plan registrada correctamente.' : 'Fertilización guardada correctamente.'
    toast.success(mensajeGuardado.replace(/\.$/, ''))
    if (faltantes.length) toast.warning('Falta producto en el inventario', { description:textoFaltantes(faltantes, (cantidad, unidad) => `${fmtNum(cantidad)}${unidad ? ` ${unidad}` : ''}`), duration:12000 })
    cargarDatos()
  }

  const registrarDesdePlan = (plan) => {
    setError('')
    setSuccess('')
    const relacionados = planes.filter(item => item.nombre === plan.nombre && item.fecha_inicio === plan.fecha_inicio && item.fecha_fin === plan.fecha_fin && JSON.stringify(item.soluciones || []) === JSON.stringify(plan.soluciones || []))
    const fechaInicio = sumarDias(plan.fecha_fin || plan.fecha_inicio || hoy(), 1)
    setForm({
      tipo:'plan', edit_plan_ids:(relacionados.length ? relacionados : [plan]).map(item => item.id), plan_id:'', estado:'completa',
      fecha:fechaInicio, fecha_fin:sumarDias(fechaInicio, 6), nombre_plan:plan.nombre || '', frecuencia:'semanal',
      dia_semana:String(plan.dia_semana ?? 1), tanque_litros:String(plan.tanque_litros || 200),
      tanques_cantidad:String(plan.tanques_cantidad || 1), bloques_ids:(relacionados.length ? relacionados : [plan]).map(item => item.bloque_id),
      notas:notasVisibles(plan.notas || ''), etapa_fenologica:etapaDeNotas(plan.notas || ''), soluciones:Array.isArray(plan.soluciones) && plan.soluciones.length ? plan.soluciones : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
    })
    setModal(true)
  }

  const aplicarPlanHoy = (plan) => {
    setError('')
    setSuccess('')
    const relacionados = planes.filter(item => item.nombre === plan.nombre && item.fecha_inicio === plan.fecha_inicio && item.fecha_fin === plan.fecha_fin && JSON.stringify(item.soluciones || []) === JSON.stringify(plan.soluciones || []))
    const seleccionados = relacionados.length ? relacionados : [plan]
    setForm({
      tipo:'aplicacion',
      plan_id:plan.id,
      plan_ids_by_block:Object.fromEntries(seleccionados.map(item => [item.bloque_id, item.id])),
      estado:'completa',
      fecha:hoy(),
      fecha_fin:'',
      nombre_plan:plan.nombre || '',
      frecuencia:'semanal',
      dia_semana:String(plan.dia_semana ?? 1),
      tanque_litros:String(plan.tanque_litros || 200),
      tanques_cantidad:String(plan.tanques_cantidad || 1),
      bloques_ids:seleccionados.map(item => item.bloque_id),
      notas:`Aplicación del plan: ${plan.nombre || 'Plan semanal'}`,
      etapa_fenologica:etapaDeNotas(plan.notas || ''),
      soluciones:Array.isArray(plan.soluciones) && plan.soluciones.length ? plan.soluciones : [{ nombre:'A', productos:[{ nombre:'', cantidad:'', unidad:'kg', modo:'por_tanque' }] }],
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
    <div className="ag-page ui-629c3b">
      <div className="ui-c53b97">
        <div className="module-switch" role="tablist" aria-label="Tipo de aplicación"><button type="button" role="tab" aria-selected="false" onClick={() => navigate('/fumigaciones')}><i className="ti ti-shield-check" />Fitosanitario</button><button type="button" role="tab" aria-selected="true" className="active"><i className="ti ti-leaf" />Nutrición y fertirriego</button></div>
        <div className="ui-9542f4">
          <div>
            <div className="ui-35a79d">Aplicaciones reales</div>
            <h1 className="ui-118f2f">Fertilizaciones</h1>
          </div>
          {can.create && <button type="button" className="bl-btn-solid" onClick={() => abrirModal('aplicacion')}><i className="ti ti-check" /> Registrar aplicación realizada</button>}
        </div>

        {error && <div className="ui-173cc6">{error}</div>}
        {success && <div className="ui-fb7aa5">{success}</div>}
        {!schemaPlanesDisponible && <div className="ui-9536bb">Los planes diarios y semanales se habilitaran después de ejecutar el SQL preparado para Supabase.</div>}

        {can.create && schemaPlanesDisponible && <details className="bl-card" style={{ marginBottom:18 }}>
          <summary style={{ cursor:'pointer', padding:16, fontWeight:700 }}><i className="ti ti-calendar-week" /> Preparar un plan para más adelante</summary>
          <div style={{ padding:'0 16px 16px' }}><p style={{ margin:'0 0 12px', color:'#667069' }}>El plan queda anotado y crea recordatorios. No descuenta inventario ni figura como realizado hasta que pulses “Aplicar hoy”.</p><button type="button" className="ag-small-action" onClick={() => abrirModal('plan')}>Preparar plan semanal</button></div>
        </details>}

        <div className="ui-9e5e94" style={{ gridTemplateColumns:isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))' }}>
          <div className="nutrition-card ui-9128d9" style={{ ...card }}>
            <div className="ui-5e0192">APLICACIONES</div>
            <div className="ui-0fd91a">{fmtNum(registrosActivos.length)}</div>
            <div className="ui-d3e9cf">registros guardados</div>
          </div>
          <div className="bl-card ui-9128d9">
            <div className="ui-5e0192">BLOQUES APLICADOS</div>
            <div className="ui-0fd91a">{fmtNum(totalBloquesAplicados)}</div>
            <div className="ui-5e0192">con fertilización</div>
          </div>
          <div className="bl-card ui-9128d9">
            <div className="ui-5e0192">ÚLTIMA FECHA</div>
            <div className="ui-02cbdf">{ultimaFecha ? fmtFecha(ultimaFecha) : '-'}</div>
            <div className="ui-5e0192">última aplicación</div>
          </div>
          <div className="bl-card ui-9128d9">
            <div className="ui-5e0192">BLOQUES ACTIVOS</div>
            <div className="ui-0fd91a">{fmtNum(bloques.length)}</div>
            <div className="ui-5e0192">disponibles</div>
          </div>
        </div>

        {schemaPlanesDisponible && (
          <div className="bl-card ui-7997ad">
            <div className="ui-fbf92c"><div><div className="ui-f8b0a0">RECETAS REUTILIZABLES</div><h2 className="ui-41629d">Planes semanales guardados</h2></div><span className="ui-e2090b">{planesVigentes.length}</span></div>
            {planesVigentes.length === 0 ? <div className="ui-10861c">Todavia no hay planes semanales guardados.</div> : planesVigentes.map((plan, index) => {
              const tanques = Number(plan.tanques_cantidad) || 1
              const litros = Number(plan.tanque_litros) || ((Number(plan.litros_preparados) || 0) / tanques)
              const frecuencia = plan.frecuencia === 'diaria' ? 'Todos los días' : `Cada ${['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][Number(plan.dia_semana)] || 'semana'}`
              return <div className="ui-8e6c1c" key={plan.id} style={{ gridTemplateColumns:isMobile ? '1fr' : '1.2fr 1fr auto', borderTop:index === 0 ? 'none' : '1px solid #f0ede8' }}><div><strong className="ui-0cf08e">{plan.nombre}</strong><div className="ui-8174dd">{plan.bloques?.codigo || 'Sin bloque'}{plan.plantaciones?.cultivos?.nombre ? ` · ${plan.plantaciones.cultivos.nombre}` : ''}</div><div className="ui-72210b">{fmtFecha(plan.fecha_inicio)} → {plan.fecha_fin ? fmtFecha(plan.fecha_fin) : 'Sin fecha final'}</div></div><div><strong className="ui-7b5575">{frecuencia}</strong><div className="ui-8174dd">{fmtNum(tanques)} tanque{tanques === 1 ? '' : 's'} × {fmtNum(litros)} L = {fmtNum(tanques * litros)} L</div></div><div className="ui-19255d">{can.create && <button className="ag-small-action ui-e6110d" onClick={() => aplicarPlanHoy(plan)} disabled={saving} style={{ ...btnNegro }}>Aplicar hoy</button>}{can.create && <button className="ag-small-action ui-51b96d" onClick={() => registrarDesdePlan(plan)}>Repetir semana</button>}{can.edit && <button className="ag-small-action ui-51b96d" onClick={() => abrirEditarPlan(plan)}>Editar plan</button>}</div></div>
            })}
          </div>
        )}

        <section className="fert-history" aria-label="Historial de fertilizaciones">
          <div className="fert-history__heading">
            <div><div className="ui-f8b0a0">APLICACIONES REALIZADAS</div><h2 className="ui-41629d">Historial de fertilizaciones</h2></div>
            <span className="ui-e2090b">{grupos.length}</span>
          </div>
          {loading ? <Skeleton rows={4} label="Cargando fertilizaciones" /> : fechasDeGrupos.length === 0 ? (
            <div className="bl-card ui-c023a0">Sin fertilizaciones registradas.</div>
          ) : fechasDeGrupos.map(fecha => (
            <div className="treatment-timeline" key={fecha || 'sin-fecha'}>
              <div className="timeline-date">
                <div className="timeline-date__line" />
                <div className="timeline-date__label">{fmtFechaLista(fecha)}</div>
                <div className="timeline-date__line" />
              </div>
              {gruposPorFecha[fecha].map((g, idx) => {
                const esPlan = g.items.some(i => i.plan_id)
                return (
                  <article className={`ag-surface timeline-entry fert-entry${g.anulada ? ' is-cancelled' : ''}`} key={g.key || `${g.fecha}-${idx}`} onClick={() => setDetalle(g)}>
                    <div className="fert-entry__topline">
                      <span className={`fert-entry__kind${esPlan ? '' : ' is-extra'}`}><i className={`ti ${esPlan ? 'ti-calendar-week' : 'ti-bolt'}`} />{esPlan ? 'Plan semanal' : 'Aplicación puntual'}</span>
                      {esPlan && <span className="fert-entry__range">{rangoSemana(g.items[0])}</span>}
                      {g.anulada && <span className="fert-entry__cancelled">Anulada</span>}
                    </div>
                    <div className="fert-entry__products">{resumenSoluciones(g.soluciones) || 'Sin productos detallados'}</div>
                    <div className="fert-entry__blocks" aria-label={`${g.items.length} bloque${g.items.length === 1 ? '' : 's'} aplicado${g.items.length === 1 ? '' : 's'}`}>
                      {g.items.map((item, itemIndex) => {
                        const bloqueCompleto = bloques.find(b => b.id === item.bloque_id)
                        const plantacionActiva = bloqueCompleto?.plantaciones?.find(p => p.activa)
                        const cultivo = plantacionActiva?.cultivos?.nombre
                        return <div className="fert-entry__block" key={item.id || `${item.bloque_id}-${itemIndex}`}><i className="ti ti-map-pin" /><span><strong>Bloque {item.bloques?.codigo || bloqueCompleto?.codigo || 'sin código'}</strong>{cultivo && <small>{cultivo}</small>}</span></div>
                      })}
                    </div>
                    <div className="fert-entry__footer">
                      <div>
                        {g.tanque_litros && <span>{g.tanques_cantidad || 1} tanque{Number(g.tanques_cantidad || 1) === 1 ? '' : 's'} × {fmtNum(g.tanque_litros)} L = {fmtNum(Number(g.tanque_litros) * Number(g.tanques_cantidad || 1))} L</span>}
                        <span className="fert-entry__status">{g.estado || 'completa'}</span>
                      </div>
                      <i className="ti ti-chevron-right" aria-hidden="true" />
                    </div>
                    {etapaDeNotas(g.notas) && <div className="phenology-pill"><i className="ti ti-seeding" />{etapaDeNotas(g.notas)}</div>}
                    {notasVisibles(g.notas) && <div className="fert-entry__notes">{notasVisibles(g.notas)}</div>}
                  </article>
                )
              })}
            </div>
          ))}
        </section>
      </div>

      <ModalFertilizacion
          open={modal}
          bloques={bloques}
          productos={productos}
          form={form}
          setForm={setForm}
          onClose={() => setModal(false)}
          onSave={guardar}
          saving={saving}
          error={error}
        />
      {detalle && (
        <Modal onClose={() => setDetalle(null)} label="Fertilizaciones" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:260, display:'grid', placeItems:'center', padding:16 }} onClick={() => setDetalle(null)}>
          <div className="ag-surface ui-3e70e0" onClick={e => e.stopPropagation()}>
            <div className="ui-9f6525"><div><div className="ui-5e0192">{detalle.items.some(i => i.plan_id) ? 'FERTILIZACIÓN SEMANAL' : 'DETALLE DE APLICACIÓN'}</div><h2 className="ui-58c65c">{detalle.items.some(i => i.plan_id) ? rangoSemana(detalle.items[0]) : fmtFecha(detalle.fecha)}</h2></div><button className="ui-52b466 ag-close-btn" aria-label="Cerrar" onClick={() => setDetalle(null)}><i className="ti ti-x" /></button></div>
            <div className="ui-091476"><div className="ui-702618"><small className="ui-ae975a">Bloques</small><div className="ui-c6f57e">{detalle.items.map(i => i.bloques?.codigo || 'Bloque').join(', ')}</div></div><div className="ui-702618"><small className="ui-ae975a">Preparación</small><div className="ui-c6f57e">{detalle.tanques_cantidad || 1} × {fmtNum(detalle.tanque_litros)} L</div></div></div>
            <div className="ui-c4d2a4">{resumenSoluciones(detalle.soluciones) || 'Sin productos detallados'}</div>
            {notasVisibles(detalle.notas) && <div className="ui-5961cf">{notasVisibles(detalle.notas)}</div>}
            {!detalle.anulada && <><div className="ui-79954a">{can.edit && <button onClick={() => abrirEditarAplicacion(detalle)} className="bl-btn-solid">{detalle.items.some(i => i.plan_id) ? 'Editar semana completa' : 'Editar'}</button>}{!detalle.items.some(i => i.plan_id) && can.create && <button onClick={() => repetirAplicacion(detalle)} className="bl-btn-solid ui-d6ff9b">Repetir hoy</button>}</div><div className="ui-b6cf07"><label className="ui-fd4239">Motivo para anular<input value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} placeholder="Ej: carga duplicada o aplicación cancelada" className="bl-input" /></label>{can.delete && <button className="ag-small-action ui-b4a187" onClick={() => anularAplicacion(detalle)} disabled={saving}>Anular y devolver inventario</button>}</div></>}
            {detalle.anulada && <div className="ui-1eb527">Esta aplicación está anulada.</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}
