import { Notice, Skeleton } from '../components/UI'
import ModalConfirm from '../components/ModalConfirm'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, DateQuickField, ChoiceChips, BlockChips, resumenPie } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
import React, { useState, useEffect } from 'react'
import { guestToken, supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { useCan } from '../lib/RoleContext'
import { ajustarStockSeguro, textoFaltantes } from '../lib/inventory'
import { categoriaProducto } from '../lib/productCategories'
import { useNavigate } from 'react-router-dom'

const TIPOS = {
  fumigacion: { label:'Fumigación', icon:'ti-spray',   color:'#e07b00', bg:'#fff3e8' },
  fertiriego:  { label:'Fertiriego', icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  foliar:      { label:'Foliar',     icon:'ti-leaf',    color:"#124e38", bg:'#eeeeee' },
}

const CATEGORIAS_POR_TIPO = {
  fumigacion: ['Insecticida', 'Fungicida', 'Herbicida', 'Coadyuvante'],
  fertiriego: ['Fertilizante', 'Hidrosoluble'],
  foliar: ['Foliar'],
}

const categoriaCanonica = (producto, tipo) => {
  const actual = categoriaProducto(producto)
  return (CATEGORIAS_POR_TIPO[tipo] || []).find(categoria => categoria.toLowerCase() === actual) || ''
}

const fechaLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const UNIDADES_USO = ['g', 'kg', 'cc', 'ml', 'L', 'unidades']
const OTRO_PRODUCTO = '__otro'
const productoVacio = () => ({ categoria_nombre:'', producto_id:'', producto_nombre:'', cantidad:'', unidad_uso:'g', libre:false })

const normalizarUnidad = (unidad = '') => {
  const u = String(unidad).trim().toLowerCase()
  if (['kg', 'kilo', 'kilos'].includes(u)) return 'kg'
  if (['g', 'gr', 'gramo', 'gramos'].includes(u)) return 'g'
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return 'L'
  if (['cc', 'ml'].includes(u)) return 'cc'
  if (['unidad', 'unidades', 'u'].includes(u)) return 'unidades'
  return u
}

const unidadUsoDefault = (unidadStock = '') => {
  const u = normalizarUnidad(unidadStock)
  if (u === 'kg') return 'g'
  if (u === 'L') return 'cc'
  return u || 'g'
}

const convertirAStock = (cantidad, unidadUso, unidadStock) => {
  const valor = Number(String(cantidad || '').replace(',', '.')) || 0
  const uso = normalizarUnidad(unidadUso)
  const stock = normalizarUnidad(unidadStock)
  if (valor <= 0) return 0
  if (uso === stock) return valor
  if (stock === 'kg' && uso === 'g') return valor / 1000
  if (stock === 'g' && uso === 'kg') return valor * 1000
  if (stock === 'L' && uso === 'cc') return valor / 1000
  if (stock === 'cc' && uso === 'L') return valor * 1000
  return null
}

const multiplicadorTanques = (tanques) => {
  const valor = Number(String(tanques || '').replace(',', '.')) || 0
  return valor > 0 ? valor : 1
}

const calcularDescuentoStock = (productoForm, producto, tanques) => {
  const dosisPorTanque = convertirAStock(productoForm.cantidad, productoForm.unidad_uso, producto?.unidad)
  if (dosisPorTanque === null) return null
  return dosisPorTanque * multiplicadorTanques(tanques)
}

const fmtCantidad = (n) => (Number(n) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 })

const formatearStock = (cantidad, unidad) => {
  const valor = Number(cantidad) || 0
  const u = normalizarUnidad(unidad)
  if (u === 'kg' && valor > 0 && valor < 1) return `${fmtCantidad(valor * 1000)} g`
  if (u === 'L' && valor > 0 && valor < 1) return `${fmtCantidad(valor * 1000)} cc`
  return `${fmtCantidad(valor)} ${u}`
}

const getCultivoBloque = (bloque) => {
  const activa = bloque?.plantaciones?.find(p => p.activa)
  return activa?.cultivos?.nombre || ''
}

const getPlantacionActivaId = (bloque) => {
  const activa = bloque?.plantaciones?.find(p => p.activa)
  return activa?.id || null
}

const getBloquesConCultivo = (fumigacion) => {
  return (fumigacion.fumigacion_bloques || [])
    .map(fb => {
      const codigo = fb.bloques?.codigo || ''
      const cultivo = fb.cultivo_snapshot || getCultivoBloque(fb.bloques)
      return codigo ? `${codigo}${cultivo ? ` (${cultivo})` : ''}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

const normalizarOperarios = (texto = '') =>
  String(texto)
    .split(',')
    .map(nombre => nombre.trim())
    .filter(Boolean)

const formatFechaLabel = (fecha) => {
  const d = new Date(fecha + 'T00:00:00')
  return d.toLocaleDateString('es-PY', { weekday:'long', day:'numeric', month:'long' })
}

export default function Fumigaciones({ campoActivo = null }) {
  const can = useCan('fumigaciones')
  const navigate = useNavigate()
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1100)
  const [fumigaciones, setFumigaciones] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [productos, setProductos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const formVacio = () => ({
    tipo:'fumigacion',
    fecha:'',
    campo_id:'',
    bloques_ids:[],
    bloques_tanques:{},
    bloques_litros:{},
    distribucion:'por_bloque',
    operario:'',
    operarios_nombres:[],
    tanques_cantidad:'1',
    tanque_litros:'',
    productos_form:[productoVacio()],
    notas:'',
  })
  const [form, setForm] = useState(formVacio())
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [mensajeExito, setMensajeExito] = useState('')
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(true)
  const [cargandoBloques, setCargandoBloques] = useState(false)
  const [ajusteFino, setAjusteFino] = useState(false)
  const isGuest = Boolean(guestToken)

  useEffect(() => { fetchFumigaciones(); fetchCampos(); fetchProductos() }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const media = window.matchMedia('(min-width: 1100px)')
    const actualizarVista = event => setIsDesktop(event.matches)
    setIsDesktop(media.matches)
    media.addEventListener?.('change', actualizarVista)
    return () => media.removeEventListener?.('change', actualizarVista)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const campoId = params.get('campo') || ''
    const bloqueId = params.get('bloque') || ''
    if (params.get('nuevo') !== '1' || !campoId || !bloqueId) return

    const abrirDesdeBloque = async () => {
      await fetchBloques(campoId)
      setForm({ ...formVacio(), fecha:fechaLocal(), campo_id:campoId, bloques_ids:[bloqueId], bloques_tanques:{ [bloqueId]:'1' }, bloques_litros:{} })
      setDetalle(null)
      setModal(true)
    }
    abrirDesdeBloque()
  }, [])

  const fetchFumigaciones = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('fumigaciones')
      .select('*, campos(nombre), fumigacion_bloques(bloque_id, cultivo_snapshot, plantacion_id_snapshot, bloques(codigo, plantaciones(id, activa, cultivos(nombre)))), fumigacion_productos(*, productos(nombre, unidad, precio_unitario, carencia_dias, categorias_producto(nombre)))')
      .order('fecha', { ascending:false })
    if (error) setFormError('No se pudieron cargar las fumigaciones. Intentá nuevamente.')
    else setFumigaciones((data || []).filter(f => !f.anulada))
    setLoading(false)
  }

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*')
    setCampos(data || [])
  }

  const fetchBloques = async (campo_id) => {
    setCargandoBloques(true)
    const { data: bl } = await supabase.from('bloques').select('*, plantaciones(id, activa, cultivos(nombre))').eq('campo_id', campo_id).order('codigo')
    setBloques(bl || [])
    setCargandoBloques(false)
    if (isGuest) {
      setOperarios([])
      return
    }
    const { data: ops } = await supabase.from('operarios').select('*').eq('campo_id', campo_id)
    setOperarios(ops || [])
  }

  const fetchProductos = async () => {
    const { data } = await supabase.from('productos').select('*, categorias_producto(nombre)').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const toggleBloque = (id) => setForm(f => {
    const seleccionado = f.bloques_ids.includes(id)
    const bloques_ids = seleccionado ? f.bloques_ids.filter(bloqueId => bloqueId !== id) : [...f.bloques_ids, id]
    const bloques_tanques = { ...(f.bloques_tanques || {}) }
    const bloques_litros = { ...(f.bloques_litros || {}) }
    if (seleccionado) { delete bloques_tanques[id]; delete bloques_litros[id] }
    else bloques_tanques[id] = bloques_tanques[id] || f.tanques_cantidad || '1'
    return { ...f, bloques_ids, bloques_tanques, bloques_litros }
  })

  const actualizarTanquesBloque = (bloqueId, valor) => setForm(f => ({
    ...f,
    bloques_tanques:{ ...(f.bloques_tanques || {}), [bloqueId]:valor.replace(/[^0-9]/g, '') },
  }))

  const actualizarLitrosBloque = (bloqueId, valor) => setForm(f => ({
    ...f,
    bloques_litros:{ ...(f.bloques_litros || {}), [bloqueId]:valor.replace(/[^0-9.,]/g, '') },
  }))

  const toggleOperario = (nombre) => {
    setForm(f => {
      const actuales = new Set(f.operarios_nombres?.length ? f.operarios_nombres : normalizarOperarios(f.operario))
      if (actuales.has(nombre)) actuales.delete(nombre)
      else actuales.add(nombre)
      const lista = Array.from(actuales)
      return { ...f, operarios_nombres: lista, operario: lista.join(', ') }
    })
  }

  const cerrarModal = () => {
    setModal(false)
    setForm(formVacio())
    setAjusteFino(false)
    setFormError('')
  }

  // Valores por defecto: fecha de hoy y el campo activo del sistema (editable, nunca vacío si hay campos).
  const abrirNuevo = () => {
    const campoId = campos.some(c => c.id === campoActivo?.id) ? campoActivo.id : (campos[0]?.id || '')
    setDetalle(null)
    setFormError('')
    setAjusteFino(false)
    setBloques([])
    setForm({ ...formVacio(), fecha:fechaLocal(), campo_id:campoId })
    setModal(true)
    if (campoId) fetchBloques(campoId)
  }
  const parseProductoForm = (fp, tipo) => {
    const match = String(fp.dosis || '').match(/^\s*([\d.,]+)\s*([a-zA-Z]+)?/)
    return {
      categoria_nombre: categoriaCanonica(fp.productos, tipo),
      producto_id: fp.producto_id || '',
      producto_nombre: fp.producto_nombre || fp.productos?.nombre || '',
      cantidad: fp.cantidad ?? match?.[1] ?? '',
      unidad_uso: fp.unidad_uso || match?.[2] || unidadUsoDefault(fp.productos?.unidad),
      libre: !fp.producto_id && Boolean(fp.producto_nombre),
    }
  }

  const abrirEditar = async (fumigacion) => {
    if (fumigacion.campo_id) await fetchBloques(fumigacion.campo_id)
    setForm({
      id: fumigacion.id,
      tipo: fumigacion.tipo || 'fumigacion',
      fecha: fumigacion.fecha || '',
      campo_id: fumigacion.campo_id || '',
      bloques_ids: (fumigacion.fumigacion_bloques || []).map(fb => fb.bloque_id).filter(Boolean),
      bloques_tanques: Object.fromEntries((fumigacion.fumigacion_bloques || []).map(fb => [fb.bloque_id, String(fumigacion.tanques_cantidad || 1)])),
      bloques_litros:{},
      distribucion:'por_bloque',
      operario: fumigacion.operario || '',
      operarios_nombres: normalizarOperarios(fumigacion.operario || ''),
      tanques_cantidad: fumigacion.tanques_cantidad || '',
      tanque_litros: fumigacion.tanque_litros || '',
      productos_form: (fumigacion.fumigacion_productos || []).length
        ? fumigacion.fumigacion_productos.map(fp => parseProductoForm(fp, fumigacion.tipo || 'fumigacion'))
        : [productoVacio()],
      notas: fumigacion.notas || '',
    })
    setDetalle(null)
    setAjusteFino(false)
    setModal(true)
  }

  const abrirDuplicado = async (fumigacion) => {
    if (fumigacion.campo_id) await fetchBloques(fumigacion.campo_id)
    setForm({
      id: '',
      tipo: fumigacion.tipo || 'fumigacion',
      fecha: fechaLocal(),
      campo_id: fumigacion.campo_id || '',
      bloques_ids: [],
      bloques_tanques: {},
      bloques_litros:{},
      distribucion:'por_bloque',
      operario: fumigacion.operario || '',
      operarios_nombres: normalizarOperarios(fumigacion.operario || ''),
      tanques_cantidad: fumigacion.tanques_cantidad || '',
      tanque_litros: fumigacion.tanque_litros || '',
      productos_form: (fumigacion.fumigacion_productos || []).length
        ? fumigacion.fumigacion_productos.map(fp => parseProductoForm(fp, fumigacion.tipo || 'fumigacion'))
        : [productoVacio()],
      notas: fumigacion.notas || '',
    })
    setFormError('')
    setDetalle(null)
    setAjusteFino(false)
    setModal(true)
  }

  // Validación previa al guardado (antes se hacía al pasar del paso 1 al 2 del asistente).
  const intentarGuardar = () => {
    setFormError('')
    if (!form.fecha) return setFormError('Elegí la fecha de la aplicación.')
    if (!form.campo_id) return setFormError('Elegí el campo donde se realizó el trabajo.')
    if (!form.bloques_ids.length) return setFormError('Seleccioná al menos un bloque.')
    guardar()
  }

  const cambiarTipo = (tipo) => setForm(f => f.tipo === tipo ? f : ({ ...f, tipo, productos_form:f.productos_form.map(p => ({ ...p, categoria_nombre:'', producto_id:'', producto_nombre:p.producto_id ? '' : p.producto_nombre })) }))

  const cambiarCampo = (campoId) => {
    setForm(f => ({ ...f, campo_id:campoId, bloques_ids:[], bloques_tanques:{}, bloques_litros:{} }))
    setBloques([])
    if (campoId) fetchBloques(campoId)
  }

  const cambiarDistribucion = (valor) => setForm(f => valor === 'compartido' ? { ...f, distribucion:'compartido', tanques_cantidad:f.tanques_cantidad || '1' } : { ...f, distribucion:'por_bloque' })

  const seleccionarBloques = (lista) => setForm(f => {
    const ids = new Set(f.bloques_ids)
    const bloques_tanques = { ...(f.bloques_tanques || {}) }
    lista.forEach(b => { if (!ids.has(b.id)) { ids.add(b.id); bloques_tanques[b.id] = bloques_tanques[b.id] || f.tanques_cantidad || '1' } })
    return { ...f, bloques_ids:[...ids], bloques_tanques }
  })

  const limpiarBloques = () => setForm(f => ({ ...f, bloques_ids:[], bloques_tanques:{}, bloques_litros:{} }))

  const fijarTanquesTodos = (valor) => setForm(f => ({ ...f, bloques_tanques:Object.fromEntries(f.bloques_ids.map(id => [id, valor])) }))

  const actualizarProducto = (indice, cambios) => setForm(f => ({ ...f, productos_form:f.productos_form.map((p, j) => j === indice ? { ...p, ...cambios } : p) }))

  const elegirProducto = (indice, valor) => {
    if (valor === OTRO_PRODUCTO) {
      const actual = form.productos_form[indice]
      return actualizarProducto(indice, { producto_id:'', producto_nombre:actual?.producto_id ? '' : (actual?.producto_nombre || ''), libre:true })
    }
    if (!valor) return actualizarProducto(indice, { producto_id:'', producto_nombre:'', libre:false })
    const elegido = productos.find(p => p.id === valor)
    actualizarProducto(indice, { producto_id:valor, producto_nombre:elegido?.nombre || '', unidad_uso:unidadUsoDefault(elegido?.unidad), libre:false, categoria_nombre:categoriaCanonica(elegido, form.tipo) })
  }

  const agregarProducto = () => setForm(f => ({ ...f, productos_form:[...f.productos_form, productoVacio()] }))
  const quitarProducto = (indice) => setForm(f => ({ ...f, productos_form:f.productos_form.length > 1 ? f.productos_form.filter((_, j) => j !== indice) : [productoVacio()] }))

  // Productos del inventario agrupados por categoría según el tipo de aplicación (más el elegido, si es de otra categoría).
  const gruposDeProductos = (tipo, seleccionadoId) => {
    const grupos = (CATEGORIAS_POR_TIPO[tipo] || []).map(categoria => ({ categoria, items:productos.filter(p => categoriaCanonica(p, tipo) === categoria) })).filter(g => g.items.length)
    const enGrupo = new Set(grupos.flatMap(g => g.items.map(p => p.id)))
    const extra = productos.find(p => p.id === seleccionadoId && !enGrupo.has(p.id))
    if (extra) grupos.push({ categoria:'Otros', items:[extra] })
    return grupos
  }

  const devolverStockFumigacion = async (id) => {
    const { data:revertidos, error:revertirError } = await supabase.rpc('revertir_consumos_valorizados', { p_origen_tipo:'consumo_fumigacion', p_origen_id:id })
    if (!revertirError && Number(revertidos) > 0) return
    const { data: productosUsados, error: productosError } = await supabase
      .from('fumigacion_productos')
      .select('producto_id, descuento_stock, productos(stock_actual)')
      .eq('fumigacion_id', id)
    if (productosError) throw productosError

    const devoluciones = (productosUsados || []).reduce((acc, item) => {
      const descuento = Number(item.descuento_stock) || 0
      if (!item.producto_id || descuento <= 0) return acc
      if (!acc[item.producto_id]) {
        acc[item.producto_id] = {
          producto_id: item.producto_id,
          stock_actual: Number(item.productos?.stock_actual) || 0,
          devolver: 0,
        }
      }
      acc[item.producto_id].devolver += descuento
      return acc
    }, {})

    const aplicadas = []
    try {
      for (const item of Object.values(devoluciones)) {
        await ajustarStockSeguro({ productoId:item.producto_id, delta:item.devolver, tipo:'devolucion_fumigacion', modulo:'Fumigaciones', referenciaId:id, detalle:'Edicion o anulacion de aplicacion', stockActual:item.stock_actual })
        aplicadas.push(item)
      }
    } catch (error) {
      for (const item of aplicadas.reverse()) {
        try {
          await ajustarStockSeguro({ productoId:item.producto_id, delta:-item.devolver, tipo:'reversion_devolucion_fumigacion', modulo:'Fumigaciones', referenciaId:id, detalle:'Reversion por error al anular aplicacion', stockActual:item.stock_actual + item.devolver })
        } catch (rollbackError) {
          console.error('No se pudo revertir una devolución de stock', rollbackError)
        }
      }
      throw error
    }
  }

  // Si la base todavía no tiene las funciones atómicas, se usa el camino anterior (guardar en varios pasos).
  const rpcAusente = (error) => error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(error?.message || '')

  // Bloques y productos de una aplicación, con el descuento de stock ya calculado, para las funciones atómicas de la base.
  const armarDetalleAtomico = (bloquesIds, tanquesCantidad) => ({
    bloques: bloquesIds.map(b => {
      const bloque = bloques.find(x => x.id === b)
      return { bloque_id: b, cultivo_snapshot: getCultivoBloque(bloque) || null, plantacion_id: getPlantacionActivaId(bloque) }
    }),
    productos: form.productos_form.filter(p => (p.producto_id || p.producto_nombre?.trim()) && p.cantidad).map(p => {
      const prod = productos.find(x => x.id === p.producto_id)
      const descuento = calcularDescuentoStock(p, prod, tanquesCantidad)
      return {
        producto_id: p.producto_id || null,
        producto_nombre: p.producto_id ? null : p.producto_nombre.trim(),
        dosis: `${p.cantidad} ${p.unidad_uso}`,
        cantidad: Number(String(p.cantidad || '').replace(',', '.')) || null,
        unidad_uso: p.unidad_uso || null,
        descuento_stock: descuento === null ? null : descuento,
      }
    }),
  })

  const guardarRelacionesFumigacion = async (fumigacionId, bloquesIds = form.bloques_ids, tanquesCantidad = form.tanques_cantidad, faltantes = []) => {
    if (bloquesIds.length > 0) {
      const { error: bloquesError } = await supabase.from('fumigacion_bloques').insert(bloquesIds.map(b => {
        const bloque = bloques.find(x => x.id === b)
        return {
          fumigacion_id: fumigacionId,
          bloque_id: b,
          cultivo_snapshot: getCultivoBloque(bloque) || null,
          plantacion_id_snapshot: getPlantacionActivaId(bloque),
        }
      }))
      if (bloquesError) throw bloquesError
    }

    const prods = form.productos_form.filter(p => (p.producto_id || p.producto_nombre?.trim()) && p.cantidad)
    if (prods.length === 0) return

    const { error: productosError } = await supabase.from('fumigacion_productos').insert(prods.map(p => {
      const prod = productos.find(x => x.id === p.producto_id)
      const descuento = calcularDescuentoStock(p, prod, tanquesCantidad)
      return {
        fumigacion_id: fumigacionId,
        producto_id: p.producto_id || null,
        producto_nombre: p.producto_id ? null : p.producto_nombre.trim(),
        dosis: `${p.cantidad} ${p.unidad_uso}`,
        cantidad: Number(String(p.cantidad || '').replace(',', '.')) || null,
        unidad_uso: p.unidad_uso || null,
        descuento_stock: descuento === null ? null : descuento,
      }
    }))
    if (productosError) throw productosError

    for (const p of prods.filter(item => item.producto_id)) {
      const { data: prodActual } = await supabase
        .from('productos')
        .select('stock_actual, unidad')
        .eq('id', p.producto_id)
        .single()
      const prod = prodActual || productos.find(x => x.id === p.producto_id)
      if (!prod) continue
      const descuento = calcularDescuentoStock(p, prod, tanquesCantidad)
      if (!descuento || descuento <= 0) continue
      const bloqueId = bloquesIds[0]
      const bloque = bloques.find(x => x.id === bloqueId)
      const consumo = await ajustarStockSeguro({ productoId:p.producto_id, delta:-descuento, tipo:'consumo_fumigacion', modulo:'Fumigaciones', referenciaId:fumigacionId, detalle:form.tipo || 'fumigacion', stockActual:prod.stock_actual, plantacionId:getPlantacionActivaId(bloque), bloqueId, fecha:form.fecha })
      if (consumo?.faltante > 0) faltantes.push({ nombre:productos.find(x => x.id === p.producto_id)?.nombre || p.producto_nombre || 'Producto', unidad:prod.unidad, pedido:consumo.pedido, disponible:consumo.disponible, faltante:consumo.faltante })
    }
  }

  const guardar = async () => {
    setFormError('')
    if (!form.fecha || form.bloques_ids.length === 0) return
    const compartido = !form.id && form.distribucion === 'compartido'
    const litrosTanque = Number(String(form.tanque_litros || '').replace(',', '.')) || 0
    const tanquesPreparados = Number(String(form.tanques_cantidad || '').replace(',', '.')) || 0
    const litrosPreparados = litrosTanque * tanquesPreparados
    const litrosAsignados = form.bloques_ids.reduce((total, bloqueId) => total + (Number(String(form.bloques_litros?.[bloqueId] || '').replace(',', '.')) || 0), 0)
    const litrosSobrantes = Math.max(0, litrosPreparados - litrosAsignados)
    if (compartido) {
      const bloquesSinLitros = form.bloques_ids.filter(id => (Number(String(form.bloques_litros?.[id] || '').replace(',', '.')) || 0) <= 0)
      if (!litrosTanque || !tanquesPreparados) return setFormError('Indicá cuántos tanques preparaste y cuántos litros tiene cada tanque.')
      if (bloquesSinLitros.length) return setFormError('Indicá cuántos litros recibió cada bloque seleccionado.')
      if (litrosAsignados > litrosPreparados + 0.0001) return setFormError(`Distribuiste ${fmtCantidad(litrosAsignados)} L, pero solo preparaste ${fmtCantidad(litrosPreparados)} L.`)
    } else {
      const bloquesSinTanques = form.bloques_ids.filter(id => Number(form.bloques_tanques?.[id] || (form.bloques_ids.length === 1 ? form.tanques_cantidad : 0)) <= 0)
      if (bloquesSinTanques.length) return setFormError('Indicá la cantidad de tanques utilizada en cada bloque.')
    }
    const usaProductosLibres = form.productos_form.some(p => !p.producto_id && p.producto_nombre?.trim())
    if (usaProductosLibres) {
      const { error: soporteError } = await supabase.from('fumigacion_productos').select('producto_nombre').limit(1)
      if (soporteError) {
        setFormError('No se pudo guardar el producto sin inventario. Consultá al administrador para habilitar este tipo de registro.')
        return
      }
    }
    const bloquesGuardados = [...form.bloques_ids]
    const eraEdicion = Boolean(form.id)
    const faltantes = []
    setSaving(true)
    try {
      const avisarError = (mensaje) => {
        setFormError(mensaje)
        console.error(mensaje)
      }
      const notaCompartida = compartido ? `Mezcla compartida: ${fmtCantidad(litrosPreparados)} L preparados · ${fmtCantidad(litrosAsignados)} L aplicados · ${fmtCantidad(litrosSobrantes)} L sin asignar.` : ''
      const payload = {
        campo_id: form.campo_id || null,
        tipo: form.tipo,
        fecha: form.fecha,
        operario: (form.operarios_nombres?.length ? form.operarios_nombres.join(', ') : form.operario) || null,
        tanques_cantidad: Number(form.tanques_cantidad) || null,
        tanque_litros: Number(form.tanque_litros) || null,
        notas: [form.notas, notaCompartida].filter(Boolean).join(' ') || null,
      }

      if (form.id) {
        const tanquesEdicion = Number(form.bloques_tanques?.[form.bloques_ids[0]] || form.tanques_cantidad) || null
        payload.tanques_cantidad = tanquesEdicion
        // Todo en una sola operación de la base: si algo falla, no se guarda nada (ni el stock queda a medias).
        const { data: atomico, error: atomicoError } = await supabase.rpc('editar_fumigacion', { p_id: form.id, p: { ...payload, ...armarDetalleAtomico(form.bloques_ids, tanquesEdicion) } })
        if (!atomicoError) {
          faltantes.push(...(atomico?.faltantes || []))
          await registrarAuditoria({ accion:'Edito fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:form.id, detalle:`${form.tipo} - ${form.fecha}` })
        } else if (!rpcAusente(atomicoError)) {
          avisarError(`No se pudo editar la fumigación: ${atomicoError.message || 'error desconocido'}`)
          return
        } else {
        const { data: fum, error } = await supabase
          .from('fumigaciones')
          .update(payload)
          .eq('id', form.id)
          .select()
          .single()
        if (error || !fum) {
          avisarError(`No se pudo editar la fumigación: ${error?.message || 'sin respuesta de Supabase'}`)
          return
        }
        await devolverStockFumigacion(form.id)
        await supabase.from('fumigacion_bloques').delete().eq('fumigacion_id', form.id)
        await supabase.from('fumigacion_productos').delete().eq('fumigacion_id', form.id)
        await guardarRelacionesFumigacion(fum.id, form.bloques_ids, tanquesEdicion, faltantes)
        await registrarAuditoria({ accion:'Edito fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:fum.id, detalle:`${form.tipo} - ${form.fecha}` })
        }
      } else {
        const tanquesDelBloque = (bloqueId) => {
          const litrosBloque = Number(String(form.bloques_litros?.[bloqueId] || '').replace(',', '.')) || 0
          return compartido ? litrosBloque / litrosTanque : Number(form.bloques_tanques?.[bloqueId] || form.tanques_cantidad) || 0
        }
        // Todas las fumigaciones (una por bloque) con sus productos y el descuento de stock, en una sola operación de la base.
        const { data: atomico, error: atomicoError } = await supabase.rpc('registrar_fumigaciones', { p: {
          campo_id: payload.campo_id, tipo: payload.tipo, fecha: payload.fecha, operario: payload.operario, notas: payload.notas, tanque_litros: payload.tanque_litros,
          aplicaciones: form.bloques_ids.map(bloqueId => ({ tanques_cantidad: tanquesDelBloque(bloqueId), ...armarDetalleAtomico([bloqueId], tanquesDelBloque(bloqueId)) })),
        } })
        if (!atomicoError) {
          faltantes.push(...(atomico?.faltantes || []))
          for (const nuevaId of atomico?.ids || []) await registrarAuditoria({ accion:'Registro fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:nuevaId, detalle:`${form.tipo} - ${form.fecha}` })
        } else if (!rpcAusente(atomicoError)) {
          avisarError(`No se pudo guardar la fumigación: ${atomicoError.message || 'error desconocido'}`)
          return
        } else {
        for (const bloqueId of form.bloques_ids) {
          const tanquesBloque = tanquesDelBloque(bloqueId)
          const { data: fum, error } = await supabase.from('fumigaciones').insert({ ...payload, tanques_cantidad:tanquesBloque }).select().single()
          if (error || !fum) {
            avisarError(`No se pudo guardar la fumigación: ${error?.message || 'sin respuesta de Supabase'}`)
            return
          }
          await guardarRelacionesFumigacion(fum.id, [bloqueId], tanquesBloque, faltantes)
          await registrarAuditoria({ accion:'Registro fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:fum.id, detalle:`${form.tipo} - ${form.fecha}` })
        }
        }
      }

      await fetchFumigaciones()
      await fetchProductos()
      cerrarModal()
      const codigos = bloquesGuardados
        .map(bloqueId => bloques.find(b => b.id === bloqueId)?.codigo)
        .filter(Boolean)
        .map(codigo => `Bloque ${codigo}`)
        .join(', ')
      setMensajeExito('')
      toast.success(eraEdicion ? 'Aplicación actualizada' : 'Aplicación guardada', { description:`Vinculada a ${codigos || `${bloquesGuardados.length} bloque(s)`}.${compartido ? ` Se repartieron ${fmtCantidad(litrosAsignados)} L y quedaron ${fmtCantidad(litrosSobrantes)} L sin asignar.` : ''}` })
      if (faltantes.length) toast.warning('Falta producto en el inventario', { description:textoFaltantes(faltantes, formatearStock), duration:12000 })
    } catch (error) {
      setFormError(`No se pudo completar la fumigación: ${error?.message || 'error desconocido'}`)
    } finally {
      setSaving(false)
    }
  }

  const guardarPlan = async () => {
    setFormError('')
    if (!form.fecha || !form.campo_id || form.bloques_ids.length === 0) return setFormError('Elegí la fecha, el campo y por lo menos un bloque para preparar el plan.')
    setSaving(true)
    try {
      const productosPlan = form.productos_form.map(item => item.producto_nombre || productos.find(p => p.id === item.producto_id)?.nombre).filter(Boolean).join(' + ')
      const tareas = form.bloques_ids.map(bloqueId => {
        const bloque = bloques.find(b => b.id === bloqueId)
        const tanques = Number(form.bloques_tanques?.[bloqueId] || 0)
        const litrosCompartidos = Number(String(form.bloques_litros?.[bloqueId] || '').replace(',', '.')) || 0
        return {
          tipo:'fumigacion', campo_id:form.campo_id, bloque_id:bloqueId, fecha_programada:form.fecha, prioridad:'normal', completada:false,
          descripcion:`Plan de ${TIPOS[form.tipo]?.label || 'fumigación'} · Bloque ${bloque?.codigo || ''}${form.distribucion === 'compartido' && litrosCompartidos ? ` · ${fmtCantidad(litrosCompartidos)} L de mezcla compartida` : tanques ? ` · ${tanques} tanque${tanques === 1 ? '' : 's'} de ${form.tanque_litros || 0} L` : ''}${productosPlan ? ` · ${productosPlan}` : ''}${form.notas ? ` · ${form.notas}` : ''}`,
        }
      })
      const { error } = await supabase.from('tareas').insert(tareas)
      if (error) throw error
      await registrarAuditoria({ accion:'Creo plan de fumigacion', modulo:'Fumigaciones', tabla:'tareas', registroId:'', detalle:`${form.fecha} · ${form.bloques_ids.length} bloque(s)` })
      cerrarModal()
      setMensajeExito('Plan guardado en Agenda. No se descontó inventario ni se registró como trabajo realizado.')
    } catch (error) { setFormError(`No se pudo guardar el plan: ${error.message || 'error desconocido'}`) }
    finally { setSaving(false) }
  }

  const eliminar = (id) => {
    setConfirmar({ fn: async () => {
      setFormError(''); setMensajeExito('')
      // Anular y devolver el stock en una sola operación de la base.
      const { error: atomicoError } = await supabase.rpc('anular_fumigacion', { p_id: id, p_motivo: 'Anulada por el usuario' })
      if (!atomicoError) {
        await registrarAuditoria({ accion:'Anulo fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:id })
        setConfirmar(null); setDetalle(null); setMensajeExito('Fumigación eliminada y stock devuelto correctamente.'); await fetchFumigaciones(); await fetchProductos()
        return
      }
      if (!rpcAusente(atomicoError)) {
        setFormError(`No se pudo eliminar la fumigación: ${atomicoError.message || 'error desconocido'}`)
        setConfirmar(null)
        return
      }
      const { data, error: deleteError } = await supabase.from('fumigaciones')
        .update({ anulada:true, anulada_at:new Date().toISOString(), anulada_motivo:'Anulada por el usuario', updated_at:new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (deleteError || !data?.length) {
        setFormError(`No se pudo eliminar la fumigación: ${deleteError?.message || 'Supabase no confirmó el cambio'}`)
        setConfirmar(null)
        return
      }
      try {
        await devolverStockFumigacion(id)
      } catch (stockError) {
        const { error: rollbackError } = await supabase.from('fumigaciones')
          .update({ anulada:false, anulada_at:null, anulada_motivo:null, updated_at:new Date().toISOString() })
          .eq('id', id)
        setFormError(rollbackError
          ? `No se pudo completar la eliminación ni restaurar automáticamente el registro: ${stockError.message || 'error de inventario'}`
          : `No se eliminó la fumigación porque no se pudo devolver el stock: ${stockError.message || 'error de inventario'}`)
        setConfirmar(null)
        await fetchFumigaciones(); await fetchProductos()
        return
      }
      await registrarAuditoria({ accion:'Anulo fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:id })
      setConfirmar(null); setDetalle(null); setMensajeExito('Fumigación eliminada y stock devuelto correctamente.'); await fetchFumigaciones(); await fetchProductos()
    }})
  }

  const getCarencia = (f) => {
    const hoy = new Date()
    let maxFecha = null
    f.fumigacion_productos?.forEach(fp => {
      const dias = fp.productos?.carencia_dias
      if (dias && dias > 0) {
        const fecha = new Date(f.fecha)
        fecha.setDate(fecha.getDate() + dias)
        if (!maxFecha || fecha > maxFecha) maxFecha = fecha
      }
    })
    if (!maxFecha) return null
    const restantes = Math.ceil((maxFecha - hoy) / 86400000)
    return restantes > 0 ? restantes : null
  }

  const fumisFiltradas = filtro === 'todos' ? fumigaciones : fumigaciones.filter(f => f.tipo === filtro)

  // Agrupar por fecha
  const porFecha = {}
  fumisFiltradas.forEach(f => {
    if (!porFecha[f.fecha]) porFecha[f.fecha] = []
    porFecha[f.fecha].push(f)
  })
  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a))
  const operariosElegidos = form.operarios_nombres?.length ? form.operarios_nombres : normalizarOperarios(form.operario)
  const compartidoActivo = !form.id && form.distribucion === 'compartido'
  const litrosTanqueForm = Number(String(form.tanque_litros || '').replace(',', '.')) || 0
  const litrosAsignadosForm = form.bloques_ids.reduce((total, id) => total + (Number(String(form.bloques_litros?.[id] || '').replace(',', '.')) || 0), 0)
  const tanquesSumados = form.bloques_ids.reduce((total, id) => total + (Number(form.bloques_tanques?.[id]) || 0), 0)
  const totalTanquesForm = compartidoActivo ? litrosAsignadosForm / (litrosTanqueForm || 1) : tanquesSumados
  const valoresTanques = [...new Set(form.bloques_ids.map(id => form.bloques_tanques?.[id] ?? ''))]
  const tanquesComunes = valoresTanques.length === 1 ? valoresTanques[0] : ''
  const resumenMezcla = (() => {
    if (!form.bloques_ids.length || !litrosTanqueForm) return null
    if (compartidoActivo) {
      const preparados = (Number(String(form.tanques_cantidad || '').replace(',', '.')) || 0) * litrosTanqueForm
      const sobrante = preparados - litrosAsignadosForm
      return { exceso:sobrante < 0, texto:`Preparados: ${fmtCantidad(preparados)} L · Asignados: ${fmtCantidad(litrosAsignadosForm)} L · ${sobrante >= 0 ? `Sin asignar: ${fmtCantidad(sobrante)} L` : `Exceso: ${fmtCantidad(Math.abs(sobrante))} L`}` }
    }
    if (!tanquesSumados) return null
    return { exceso:false, texto:`Total: ${fmtCantidad(tanquesSumados)} tanques · ${fmtCantidad(tanquesSumados * litrosTanqueForm)} L preparados` }
  })()

  const tipoDetalle = TIPOS[detalle?.tipo] || TIPOS.fumigacion
  const bloquesDetalle = detalle ? getBloquesConCultivo(detalle) : ''
  const carenciaDetalle = detalle ? getCarencia(detalle) : null
  return (
    <div className="ag-page phytosanitary-page ui-c1c124">

      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="module-switch" role="tablist" aria-label="Tipo de aplicación"><button type="button" role="tab" aria-selected="true" className="active"><i className="ti ti-shield-check" />Fitosanitario</button><button type="button" role="tab" aria-selected="false" onClick={() => navigate('/fertilizaciones')}><i className="ti ti-leaf" />Nutrición y fertirriego</button></div>
        <div className="ui-796b93">
          <div>
            <div className="ui-476525">Control fitosanitario</div>
            <div className="ag-page-title ui-136b85">Fumigaciones</div>
          </div>
          {!isGuest && can.create && (
            <button className="ui-56054f" aria-label="Agregar registro" onClick={abrirNuevo}>
              <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
            </button>
          )}
        </div>
        <div className="ui-66e4a0">
          {[['todos','Todos'],['fumigacion','Fumigacion'],['fertiriego','Fertiriego'],['foliar','Foliar']].map(([k,v]) => (
            <button className="ag-small-action ui-f9a370" key={k} onClick={() => setFiltro(k)} style={{ background: filtro===k ? '#0F3923' : 'rgba(15,23,42,.06)', color: filtro===k ? '#fff' : 'var(--text-secondary)' }}>{v}</button>
          ))}
        </div>
      </div>

      <div className="ag-page-body" style={{ padding: isDesktop ? '12px 36px 100px' : '12px 14px 100px' }}>
        <Notice tone="error">{!modal && formError}</Notice>
        {mensajeExito && (
          <div className="ui-8ae828">
            <span>{mensajeExito}</span>
            <button className="ui-ecf4ec" type="button" onClick={() => setMensajeExito('')} aria-label="Cerrar mensaje">×</button>
          </div>
        )}
        {loading ? <Skeleton rows={4} label="Cargando aplicaciones" /> : fechasOrdenadas.length === 0 ? (
          <div className="ui-5baa7a">Sin registros</div>
        ) : fechasOrdenadas.map(fecha => (
          <div className="treatment-timeline" key={fecha}>
            {/* Separador de fecha */}
            <div className="timeline-date">
              <div className="timeline-date__line"></div>
              <div className="timeline-date__label">
                {formatFechaLabel(fecha)}
              </div>
              <div className="timeline-date__line"></div>
            </div>

            {porFecha[fecha].map(f => {
              const tipo = TIPOS[f.tipo] || TIPOS.fumigacion
              const bloquesCodes = getBloquesConCultivo(f)
              const nombresProductos = f.fumigacion_productos?.map(fp => fp.productos?.nombre || fp.producto_nombre).filter(Boolean).join(' + ')
              const carencia = getCarencia(f)
              const tanques = f.tanques_cantidad && f.tanque_litros ? `${fmtCantidad(f.tanques_cantidad)} tanque${Number(f.tanques_cantidad) === 1 ? '' : 's'} x ${fmtCantidad(f.tanque_litros)} L` : ''

              return (
                <div className="ag-surface timeline-entry ui-d788bc" role="button" tabIndex={0} key={f.id} onClick={() => setDetalle(f)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalle(f) } }} style={{ padding: isDesktop ? '16px 18px' : '14px 16px', marginBottom: isDesktop ? 10 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
                  <div className="ui-c36754">
                    <div className="ui-f67a29" style={{ background:tipo.bg }}>
                      <i className={`${`ti ${tipo.icon}`} ui-bf83cf`} style={{ color:tipo.color }} aria-hidden="true"></i>
                    </div>
                    <div className="ui-89bd09">
                      <div className="fm-entry-meta">
                        <span className="ui-d01780" style={{ color:tipo.color, background:tipo.bg }}>{tipo.label}</span>
                        {f.campos?.nombre && <span className="ui-93a7e1">{f.campos.nombre}</span>}
                        {tanques && <span className="ui-93a7e1">{tanques}</span>}
                        {carencia && <span className="ui-80adc3">{carencia}d carencia</span>}
                      </div>
                      {nombresProductos && (
                        <div className="ui-07ad0f">{nombresProductos}</div>
                      )}
                      <div className="ui-9c6869">
                        {bloquesCodes && <div className="ui-93a7e1">Bloques: {bloquesCodes}</div>}
                        {f.operario && <div className="ui-93a7e1">· {f.operario}</div>}
                      </div>
                    </div>
                    <i className="ti ti-chevron-right ui-2ed188" aria-hidden="true"></i>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <NotasPanel modulo="fumigaciones" titulo="Bloc de notas de fumigaciones" />
      </div>

      {/* Detalle */}
      <UnifiedFormModal
        open={Boolean(detalle)}
        tone="alerta"
        icon={tipoDetalle.icon}
        eyebrow="Detalle de aplicación"
        title={tipoDetalle.label}
        subtitle={`${detalle?.campos?.nombre || ''} · ${detalle?.fecha || ''}`}
        label="Detalle de aplicación"
        onClose={() => setDetalle(null)}
        onSubmit={!isGuest && can.edit ? () => abrirEditar(detalle) : undefined}
        submitLabel={!isGuest && can.edit ? 'Editar registro' : null}
        shortcut={false}
        cancelLabel="Cerrar"
        secondary={!isGuest && (can.create || can.delete) ? <>
          {can.create && <button type="button" className="apple-btn apple-btn--ghost" onClick={() => abrirDuplicado(detalle)}>Duplicar</button>}
          {can.delete && <button type="button" className="apple-btn apple-btn--ghost apple-btn--dangerghost" onClick={() => eliminar(detalle.id)}>Eliminar</button>}
        </> : null}
        summary={detalle ? resumenPie([
          { n: detalle.fumigacion_productos?.length || 0, texto: 'productos', uno: 'producto' },
          { solo: carenciaDetalle ? `${carenciaDetalle} días de carencia` : '' },
        ]) : null}
      >{() => detalle && <>
        {carenciaDetalle && <div className="apple-stats"><div className="apple-stat is-warn"><small>Carencia</small><strong>{carenciaDetalle} días</strong></div></div>}
        <dl className="apple-kv">
          {[
            ['Fecha', detalle.fecha],
            detalle.operario && ['Operario', detalle.operario],
            bloquesDetalle && ['Bloques', bloquesDetalle],
            detalle.tanques_cantidad && detalle.tanque_litros && ['Tanques', `${fmtCantidad(detalle.tanques_cantidad)} x ${fmtCantidad(detalle.tanque_litros)} L`],
          ].filter(Boolean).map(([k, v]) => <div className="apple-kv__row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {detalle.fumigacion_productos?.length > 0 && (
          <ModalSection title="Productos usados" icon="ti-flask">
            <div className="apple-list">
              {detalle.fumigacion_productos.map(fp => (
                <div className="apple-list__row" key={fp.id}>
                  <div className="apple-list__main">
                    <strong>{fp.productos?.nombre || fp.producto_nombre || 'Producto'}</strong>
                    <small>{fp.dosis || '—'}{Number(fp.descuento_stock) > 0 ? ` · descontó ${fmtCantidad(fp.descuento_stock)} ${fp.productos?.unidad || ''}` : ''}</small>
                  </div>
                </div>
              ))}
            </div>
            <p className="apple-note">Costo de insumos: <b>Gs. {detalle.fumigacion_productos.reduce((total, fp) => total + Number(fp.descuento_stock || 0) * Number(fp.productos?.precio_unitario || 0), 0).toLocaleString('es-PY')}</b></p>
          </ModalSection>
        )}
        {detalle.notas && <p className="apple-quote">{detalle.notas}</p>}
      </>}</UnifiedFormModal>

      {/* Registrar o editar una aplicación: una sola pantalla */}
      <UnifiedFormModal
        open={modal}
        tone="alerta"
        icon={TIPOS[form.tipo]?.icon || 'ti-spray'}
        eyebrow={form.id ? 'Editar registro' : 'Nueva aplicación'}
        title={form.id ? 'Actualizar aplicación' : 'Registrar aplicación'}
        label="Registrar aplicación"
        busy={saving}
        onClose={cerrarModal}
        onSubmit={intentarGuardar}
        submitLabel={form.id ? 'Guardar cambios' : 'Guardar registro'}
        error={formError}
        summary={resumenPie([
          { n: form.bloques_ids.length, texto: 'bloques', uno: 'bloque' },
          { n: form.productos_form.filter(p => p.producto_id || p.producto_nombre?.trim()).length, texto: 'productos', uno: 'producto' },
          { n: totalTanquesForm, texto: 'tanques', uno: 'tanque' },
        ]) || 'Elegí los bloques para empezar'}
      >{() => <>
        <ModalSection title="Dónde y cuándo" icon="ti-map-pin">
          <ModalGroup label="Tipo de aplicación">
            <ChoiceChips label="Tipo de aplicación" value={form.tipo} onChange={cambiarTipo} options={Object.entries(TIPOS).map(([value, t]) => ({ value, label: t.label, icon: t.icon }))} />
          </ModalGroup>
          <ModalGrid>
            <DateQuickField label="Fecha" required value={form.fecha} onChange={fecha => setForm(f => ({ ...f, fecha }))} />
            <ModalField label="Campo">
              <select className="apple-control" value={form.campo_id} onChange={e => cambiarCampo(e.target.value)}>
                {!form.campo_id && <option value="">Elegí el campo…</option>}
                {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </ModalField>
          </ModalGrid>
          <BlockChips
            bloques={bloques}
            seleccionados={form.bloques_ids}
            cargando={cargandoBloques}
            cultivoDe={getCultivoBloque}
            onToggle={toggleBloque}
            onSelectAll={seleccionarBloques}
            onClear={limpiarBloques}
            vacio={form.campo_id ? 'Este campo no tiene bloques cargados.' : 'Elegí un campo para ver sus bloques.'}
          />
        </ModalSection>

        <ModalSection title="Mezcla e insumos" icon="ti-flask">
          {!form.id && form.bloques_ids.length > 1 && (
            <ModalGroup label="¿Cómo se repartió la mezcla?">
              <ChoiceChips label="Reparto de la mezcla" value={form.distribucion === 'compartido' ? 'compartido' : 'por_bloque'} onChange={cambiarDistribucion} options={[{ value:'por_bloque', label:'Por bloque', icon:'ti-layout-grid' }, { value:'compartido', label:'Compartido', icon:'ti-share' }]} />
              {form.distribucion === 'compartido' && <small className="apple-field__hint">Una misma preparación alcanzó para varios bloques: indicá los litros que recibió cada uno.</small>}
            </ModalGroup>
          )}
          <ModalGrid>
            <ModalField label="Litros por tanque">
              <input className="apple-control apple-control--num" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" value={form.tanque_litros} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, tanque_litros:e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Ej: 200" />
            </ModalField>
            {form.distribucion === 'compartido' && !form.id ? (
              <ModalField label="Tanques preparados">
                <input className="apple-control apple-control--num" type="text" inputMode="decimal" enterKeyHint="next" value={form.tanques_cantidad} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, tanques_cantidad:e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="Ej: 2" />
              </ModalField>
            ) : (
              <ModalField label={form.bloques_ids.length > 1 ? 'Tanques en cada bloque' : 'Tanques usados'}>
                <input className="apple-control apple-control--num" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" value={tanquesComunes} onWheel={e => e.currentTarget.blur()} onChange={e => fijarTanquesTodos(e.target.value.replace(/[^0-9]/g, ''))} placeholder={form.bloques_ids.length > 1 && tanquesComunes === '' && form.bloques_ids.some(id => form.bloques_tanques?.[id]) ? 'Varía' : 'Ej: 4'} disabled={!form.bloques_ids.length} />
              </ModalField>
            )}
          </ModalGrid>
          {form.bloques_ids.length > 1 && (
            <button type="button" className="apple-link" onClick={() => setAjusteFino(v => !v)} aria-expanded={ajusteFino}>{ajusteFino ? 'Ocultar el detalle por bloque' : form.distribucion === 'compartido' && !form.id ? 'Litros que recibió cada bloque' : 'Ajustar tanques bloque por bloque'}</button>
          )}
          {(ajusteFino || (form.distribucion === 'compartido' && !form.id)) && form.bloques_ids.length > 1 && (
            <div className="apple-mini-grid">
              {form.bloques_ids.map(bloqueId => {
                const bloque = bloques.find(b => b.id === bloqueId)
                const compartido = form.distribucion === 'compartido' && !form.id
                return <label className="apple-mini" key={bloqueId}>
                  <b title={bloque?.codigo || ''}>{bloque?.codigo || '—'}</b>
                  <input className="apple-bare" type="text" inputMode={compartido ? 'decimal' : 'numeric'} enterKeyHint="next" aria-label={`${compartido ? 'Litros' : 'Tanques'} del bloque ${bloque?.codigo || ''}`} value={(compartido ? form.bloques_litros?.[bloqueId] : form.bloques_tanques?.[bloqueId]) || ''} onWheel={e => e.currentTarget.blur()} onChange={e => compartido ? actualizarLitrosBloque(bloqueId, e.target.value) : actualizarTanquesBloque(bloqueId, e.target.value)} placeholder={compartido ? 'L' : '0'} />
                </label>
              })}
            </div>
          )}
          {resumenMezcla && <p className={`apple-note${resumenMezcla.exceso ? ' is-danger' : ''}`}>{resumenMezcla.texto}</p>}

          <ModalGroup label="Productos" aside={<span className="apple-field__hint">Dosis por tanque</span>}>
            <div className="apple-rows">
              {form.productos_form.map((pf, i) => {
                const prod = productos.find(p => p.id === pf.producto_id)
                const descuento = prod ? calcularDescuentoStock(pf, prod, totalTanquesForm) : 0
                const libre = Boolean(pf.libre || (!pf.producto_id && pf.producto_nombre))
                const grupos = gruposDeProductos(form.tipo, pf.producto_id)
                return (
                  <div className="apple-row" key={i}>
                    <div className="apple-row__name">
                      <select className="apple-control" aria-label={`Producto ${i + 1}`} value={pf.producto_id || (libre ? OTRO_PRODUCTO : '')} onChange={e => elegirProducto(i, e.target.value)}>
                        <option value="">Elegir producto…</option>
                        {grupos.map(g => <optgroup key={g.categoria} label={g.categoria}>{g.items.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>)}
                        <option value={OTRO_PRODUCTO}>Otro (sin inventario)…</option>
                      </select>
                      {libre && <input className="apple-control" aria-label="Nombre del producto" value={pf.producto_nombre || ''} onChange={e => actualizarProducto(i, { producto_nombre:e.target.value })} placeholder="Nombre del producto" />}
                    </div>
                    <input className="apple-control apple-control--num" aria-label="Dosis por tanque" value={pf.cantidad} onWheel={e => e.currentTarget.blur()} onChange={e => actualizarProducto(i, { cantidad:e.target.value.replace(/[^0-9.,]/g, '') })} placeholder="Dosis" inputMode="decimal" enterKeyHint="next" />
                    <select className="apple-control" aria-label="Unidad de la dosis" value={pf.unidad_uso} onChange={e => actualizarProducto(i, { unidad_uso:e.target.value })}>
                      {UNIDADES_USO.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button type="button" className="apple-row__remove" aria-label={`Quitar producto ${i + 1}`} onClick={() => quitarProducto(i)} disabled={form.productos_form.length === 1 && !pf.producto_id && !pf.producto_nombre && !pf.cantidad}><i className="ti ti-x" aria-hidden="true" /></button>
                    {prod && <div className={`apple-row__info${Number(prod.stock_actual) <= Number(prod.stock_minimo) ? ' is-low' : ''}`}>
                      Stock: <b>{formatearStock(prod.stock_actual, prod.unidad)}</b>
                      {descuento === null ? ' · medida incompatible con el stock' : descuento > 0 ? <> · descuenta <b>{formatearStock(descuento, prod.unidad)}</b></> : ''}
                      {prod.carencia_dias > 0 ? ` · ${prod.carencia_dias} d de carencia` : ''}
                    </div>}
                    {!form.id && prod && descuento > 0 && descuento > Number(prod.stock_actual || 0) + 1e-9 && <div className="apple-row__alert" role="status"><i className="ti ti-alert-triangle" aria-hidden="true" /><span>Falta producto: hay {formatearStock(prod.stock_actual, prod.unidad)} y esta aplicación usa {formatearStock(descuento, prod.unidad)}. Se guardará igual, el stock quedará en 0 y te avisaremos para registrar la compra pendiente.</span></div>}
                  </div>
                )
              })}
            </div>
            <button type="button" className="apple-add" onClick={agregarProducto}><i className="ti ti-plus" aria-hidden="true" />Agregar producto</button>
          </ModalGroup>
        </ModalSection>

        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(form.id && (form.operario || form.notas))} badge={[operariosElegidos.length ? `${operariosElegidos.length} operario${operariosElegidos.length === 1 ? '' : 's'}` : '', form.notas ? 'nota' : ''].filter(Boolean).join(' · ')}>
          {operarios.length > 0 && (
            <ModalGroup label="Operarios">
              <div className="apple-person">
                {operarios.map(o => <button type="button" key={o.id} className="apple-chip" aria-pressed={operariosElegidos.includes(o.nombre)} onClick={() => toggleOperario(o.nombre)}>{o.nombre}</button>)}
              </div>
            </ModalGroup>
          )}
          <ModalField label="Notas">
            <textarea className="apple-control" value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones: clima, plaga, repetir en…" />
          </ModalField>
          {!form.id && (
            <div className="apple-plan">
              <i className="ti ti-calendar-plus" aria-hidden="true" />
              <div><strong>¿Todavía no se realizó?</strong><p>Guardalo en la Agenda sin descontar inventario.</p></div>
              <button type="button" className="apple-btn apple-btn--soft" onClick={guardarPlan} disabled={saving}>Guardar como plan</button>
            </div>
          )}
        </ModalSection>
      </>}</UnifiedFormModal>

      <ModalConfirm open={Boolean(confirmar)} titulo="¿Eliminar registro?" mensaje="Esta acción no se puede deshacer. El stock usado se devuelve al inventario." textoBoton="Eliminar registro" onConfirm={confirmar?.fn} onCancel={() => setConfirmar(null)} />
    </div>
  )
}
