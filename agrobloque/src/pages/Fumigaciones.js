import { Modal, FormHeading, Notice, Skeleton } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { guestToken, supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { useCan } from '../lib/RoleContext'
import { ajustarStockSeguro } from '../lib/inventory'
import { categoriaProducto, incluirSeleccionados } from '../lib/productCategories'
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

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface ui-211525">
        <div className="ui-3e43be">Eliminar registro</div>
        <div className="ui-01159a">Esta acción no se puede deshacer.</div>
        <div className="ui-9c6869">
          <button className="ag-small-action ui-395a62" onClick={onCancel}>Cancelar</button>
          <button className="ag-small-action ui-f5f413" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </Modal>
  )
}

const formatFechaLabel = (fecha) => {
  const d = new Date(fecha + 'T00:00:00')
  return d.toLocaleDateString('es-PY', { weekday:'long', day:'numeric', month:'long' })
}

export default function Fumigaciones() {
  const can = useCan('fumigaciones')
  const navigate = useNavigate()
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
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
    operario:'',
    operarios_nombres:[],
    tanques_cantidad:'',
    tanque_litros:'',
    productos_form:[{ categoria_nombre:'', producto_id:'', producto_nombre:'', cantidad:'', unidad_uso:'g' }],
    notas:'',
  })
  const [form, setForm] = useState(formVacio())
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [mensajeExito, setMensajeExito] = useState('')
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(true)
  const isGuest = Boolean(guestToken)

  useEffect(() => { fetchFumigaciones(); fetchCampos(); fetchProductos() }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const campoId = params.get('campo') || ''
    const bloqueId = params.get('bloque') || ''
    if (params.get('nuevo') !== '1' || !campoId || !bloqueId) return

    const abrirDesdeBloque = async () => {
      await fetchBloques(campoId)
      setForm({ ...formVacio(), fecha:fechaLocal(), campo_id:campoId, bloques_ids:[bloqueId] })
      setDetalle(null)
      setModal(true)
    }
    abrirDesdeBloque()
  }, [])

  const fetchFumigaciones = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('fumigaciones')
      .select('*, campos(nombre), fumigacion_bloques(bloque_id, cultivo_snapshot, plantacion_id_snapshot, bloques(codigo, plantaciones(id, activa, cultivos(nombre)))), fumigacion_productos(*, productos(nombre, unidad, carencia_dias, categorias_producto(nombre)))')
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
    const { data: bl } = await supabase.from('bloques').select('*, plantaciones(id, activa, cultivos(nombre))').eq('campo_id', campo_id).order('codigo')
    setBloques(bl || [])
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

  const toggleBloque = (id) => setForm(f => ({ ...f, bloques_ids: f.bloques_ids.includes(id) ? f.bloques_ids.filter(x=>x!==id) : [...f.bloques_ids, id] }))

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
  }

  const abrirNuevo = () => {
    setDetalle(null)
    setForm(formVacio())
    setModal(true)
  }

  const parseProductoForm = (fp, tipo) => {
    const match = String(fp.dosis || '').match(/^\s*([\d.,]+)\s*([a-zA-Z]+)?/)
    return {
      categoria_nombre: categoriaCanonica(fp.productos, tipo),
      producto_id: fp.producto_id || '',
      producto_nombre: fp.producto_nombre || fp.productos?.nombre || '',
      cantidad: fp.cantidad ?? match?.[1] ?? '',
      unidad_uso: fp.unidad_uso || match?.[2] || unidadUsoDefault(fp.productos?.unidad),
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
      operario: fumigacion.operario || '',
      operarios_nombres: normalizarOperarios(fumigacion.operario || ''),
      tanques_cantidad: fumigacion.tanques_cantidad || '',
      tanque_litros: fumigacion.tanque_litros || '',
      productos_form: (fumigacion.fumigacion_productos || []).length
        ? fumigacion.fumigacion_productos.map(fp => parseProductoForm(fp, fumigacion.tipo || 'fumigacion'))
        : [{ categoria_nombre:'', producto_id:'', producto_nombre:'', cantidad:'', unidad_uso:'g' }],
      notas: fumigacion.notas || '',
    })
    setDetalle(null)
    setModal(true)
  }

  const devolverStockFumigacion = async (id) => {
    const { data: productosUsados } = await supabase
      .from('fumigacion_productos')
      .select('producto_id, descuento_stock, productos(stock_actual)')
      .eq('fumigacion_id', id)

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

    for (const item of Object.values(devoluciones)) {
      await ajustarStockSeguro({ productoId:item.producto_id, delta:item.devolver, tipo:'devolucion_fumigacion', modulo:'Fumigaciones', referenciaId:id, detalle:'Edicion o anulacion de aplicacion', stockActual:item.stock_actual })
    }
  }

  const guardarRelacionesFumigacion = async (fumigacionId) => {
    if (form.bloques_ids.length > 0) {
      const { error: bloquesError } = await supabase.from('fumigacion_bloques').insert(form.bloques_ids.map(b => {
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
      const descuento = calcularDescuentoStock(p, prod, form.tanques_cantidad)
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
      const descuento = calcularDescuentoStock(p, prod, form.tanques_cantidad)
      if (!descuento || descuento <= 0) continue
      await ajustarStockSeguro({ productoId:p.producto_id, delta:-descuento, tipo:'consumo_fumigacion', modulo:'Fumigaciones', referenciaId:fumigacionId, detalle:form.tipo || 'fumigacion', stockActual:prod.stock_actual })
    }
  }

  const guardar = async () => {
    setFormError('')
    if (!form.fecha || form.bloques_ids.length === 0) return
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
    setSaving(true)
    try {
      const avisarError = (mensaje) => {
        setFormError(mensaje)
        console.error(mensaje)
      }
      const payload = {
        campo_id: form.campo_id || null,
        tipo: form.tipo,
        fecha: form.fecha,
        operario: (form.operarios_nombres?.length ? form.operarios_nombres.join(', ') : form.operario) || null,
        tanques_cantidad: Number(form.tanques_cantidad) || null,
        tanque_litros: Number(form.tanque_litros) || null,
        notas: form.notas || null,
      }

      if (form.id) {
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
        await guardarRelacionesFumigacion(fum.id)
        await registrarAuditoria({ accion:'Edito fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:fum.id, detalle:`${form.tipo} - ${form.fecha}` })
      } else {
        const { data: fum, error } = await supabase.from('fumigaciones').insert(payload).select().single()
        if (error || !fum) {
          avisarError(`No se pudo guardar la fumigación: ${error?.message || 'sin respuesta de Supabase'}`)
          return
        }
        await guardarRelacionesFumigacion(fum.id)
        await registrarAuditoria({ accion:'Registro fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:fum.id, detalle:`${form.tipo} - ${form.fecha}` })
      }

      await fetchFumigaciones()
      await fetchProductos()
      cerrarModal()
      const codigos = bloquesGuardados
        .map(bloqueId => bloques.find(b => b.id === bloqueId)?.codigo)
        .filter(Boolean)
        .map(codigo => `Bloque ${codigo}`)
        .join(', ')
      setMensajeExito(`${eraEdicion ? 'Fumigación actualizada' : 'Fumigación guardada'} y vinculada a ${codigos || `${bloquesGuardados.length} bloque(s)`}. Ya aparece en la lista general.`)
    } catch (error) {
      setFormError(`No se pudo completar la fumigación: ${error?.message || 'error desconocido'}`)
    } finally {
      setSaving(false)
    }
  }

  const eliminar = (id) => {
    setConfirmar({ fn: async () => {
      await devolverStockFumigacion(id)
      await supabase.from('fumigaciones').update({ anulada:true, anulada_at:new Date().toISOString(), anulada_motivo:'Anulada por el usuario', updated_at:new Date().toISOString() }).eq('id', id)
      await registrarAuditoria({ accion:'Anulo fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:id })
      setConfirmar(null); setDetalle(null); fetchFumigaciones(); fetchProductos()
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

  return (
    <div className="ag-page phytosanitary-page ui-c1c124">
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

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
                <div className="ag-surface timeline-entry ui-d788bc" key={f.id} onClick={() => setDetalle(f)} style={{ padding: isDesktop ? '16px 18px' : '14px 16px', marginBottom: isDesktop ? 10 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
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
      {detalle && (
        <Modal onClose={() => setDetalle(null)} label="Fumigaciones" style={{
          position:'fixed',
          top:0,
          left:0,
          right:0,
          bottom:0,
          background:'rgba(0,0,0,0.4)',
          zIndex:100,
          display:'flex',
          alignItems: isDesktop ? 'center' : 'flex-end',
          justifyContent:'center',
          padding: isDesktop ? '24px' : 0,
          overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
        }} onClick={e => e.target===e.currentTarget && setDetalle(null)}>
          <div className="ui-0cdbc3" style={{ borderRadius: isDesktop ? 24 : '24px 24px 0 0', maxHeight: isDesktop ? 'calc(100vh - 96px)' : '85vh', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none', boxShadow: isDesktop ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            {(() => {
              const tipo = TIPOS[detalle.tipo] || TIPOS.fumigacion
              const bloquesCodes = getBloquesConCultivo(detalle)
              const carencia = getCarencia(detalle)
              return <>
                <div className="ui-2c78f8">
                  <div className="ui-e46614" style={{ background:tipo.bg }}>
                    <i className={`${`ti ${tipo.icon}`} ui-bf83cf`} style={{ color:tipo.color }} aria-hidden="true"></i>
                  </div>
                  <div>
                    <div className="ui-fe27f2">{tipo.label}</div>
                    <div className="ui-93a7e1">{detalle.campos?.nombre} · {detalle.fecha}</div>
                  </div>
                  {carencia && (
                    <div className="ui-d2a157">
                      {carencia} días carencia
                    </div>
                  )}
                </div>
                <div className="ag-surface ui-81623a">
                  {[
                    ['Fecha', detalle.fecha],
                    detalle.operario && ['Operario', detalle.operario],
                    bloquesCodes && ['Bloques', bloquesCodes],
                    detalle.tanques_cantidad && detalle.tanque_litros && ['Tanques', `${fmtCantidad(detalle.tanques_cantidad)} x ${fmtCantidad(detalle.tanque_litros)} L`],
                    detalle.notas && ['Notas', detalle.notas]
                  ].filter(Boolean).map(([k,v]) => (
                    <div className="ui-a7a997" key={k}>
                      <div className="ui-93a7e1">{k}</div>
                      <div className="ui-6903eb">{v}</div>
                    </div>
                  ))}
                </div>
                {detalle.fumigacion_productos?.length > 0 && (
                  <div className="ag-surface ui-81623a">
                    <div className="ui-5ec059">PRODUCTOS USADOS</div>
                    {detalle.fumigacion_productos.map(fp => (
                      <div className="ui-a7a997" key={fp.id}>
                        <div className="ui-7b80c9">{fp.productos?.nombre || fp.producto_nombre || 'Producto'}</div>
                        <div className="ui-197309">{fp.dosis || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!isGuest && can.edit && <button className="ag-small-action ui-6988cd" onClick={() => abrirEditar(detalle)}>Editar registro</button>}
                {!isGuest && can.delete && <button className="ag-small-action ui-939a40" onClick={() => eliminar(detalle.id)}>Eliminar registro</button>}
                <button className="ag-small-action ui-3e2cc4" onClick={() => setDetalle(null)}>Cerrar</button>
              </>
            })()}
          </div>
        </Modal>
      )}

      {/* Modal nuevo */}
      {modal && (
        <Modal busy={saving} onClose={cerrarModal} label="Registrar aplicación" style={{
          position:'fixed',
          top:0,
          left:0,
          right:0,
          bottom:0,
          background:'rgba(0,0,0,0.4)',
          zIndex:100,
          display:'flex',
          alignItems: isDesktop ? 'center' : 'flex-end',
          justifyContent:'center',
          padding: isDesktop ? '24px' : 0,
          overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
        }}>
          <div className="ui-0cdbc3" style={{ borderRadius: isDesktop ? 24 : '24px 24px 0 0', maxHeight: isDesktop ? 'calc(100vh - 96px)' : '90vh', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none', boxShadow: isDesktop ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar registro' : 'Nuevo registro'}</div>
            <Notice tone="error">{formError}</Notice><FormHeading number="01" detail="Tipo de trabajo y ubicación">Aplicación</FormHeading>
            <div className="ui-74cc19">Tipo</div>
            <div className="ui-62b09f">
              {Object.entries(TIPOS).map(([k,v]) => (
                <button className="ag-small-action ui-371bfd" key={k} onClick={() => setForm(f=>f.tipo === k ? f : ({...f,tipo:k,productos_form:f.productos_form.map(p => ({ ...p, categoria_nombre:'', producto_id:'', producto_nombre:p.producto_id ? '' : p.producto_nombre }))}))} style={{ background: form.tipo===k ? '#0F3923' : '#fff', color: form.tipo===k ? '#fff' : '#555' }}>{v.label}</button>
              ))}
            </div>
            <label className="ag-field-label ui-74cc19">Fecha *
            <input className="ui-8dcd88" type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/></label>
            <label className="ag-field-label ui-74cc19">Campo
            <select className="ui-2c08cb" value={form.campo_id} onChange={e=>{setForm(f=>({...f,campo_id:e.target.value,bloques_ids:[]}));fetchBloques(e.target.value)}}>
              <option value="">Selecciona campo...</option>
              {campos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            {bloques.length > 0 && <>
              <div className="ui-74cc19">Bloques tratados *</div>
              <div className="ui-1e850e">
                {bloques.map(b=>{
                  const cultivo = getCultivoBloque(b)
                  const activo = form.bloques_ids.includes(b.id)
                  return (
                    <div className="ui-ed8e79" key={b.id} onClick={()=>toggleBloque(b.id)} style={{ background: activo ? '#0F3923' : '#fff', color: activo ? '#fff' : '#555' }}>
                      <div>{b.codigo}</div>
                      <div className="ui-c0a65d" style={{ opacity: activo ? 0.78 : 0.7 }}>{cultivo || 'Sin cultivo'}</div>
                    </div>
                  )
                })}
              </div>
            </>}
            {operarios.length > 0 && <>
              <div className="ui-74cc19">Operarios</div>
              <div className="ui-cddf61">
                {operarios.map(o => {
                  const activo = form.operarios_nombres?.includes(o.nombre) || normalizarOperarios(form.operario).includes(o.nombre)
                  return (
                    <button className="ag-small-action ui-a61bd8" key={o.id} type="button" onClick={() => toggleOperario(o.nombre)} style={{ background: activo ? '#0F3923' : '#fff', color: activo ? '#fff' : '#555' }}>
                      {o.nombre}
                    </button>
                  )
                })}
              </div>
              <div className="ui-315e0e">Podes seleccionar uno o varios.</div>
            </>}
            <FormHeading number="02" detail="Volumen preparado para esta aplicación">Preparación</FormHeading>
            <div className="ui-180a1c">
              <div>
                <label className="ag-field-label ui-74cc19">Cantidad de tanques
                <input className="ui-2720fa" type="number" min="0" value={form.tanques_cantidad} onChange={e=>setForm(f=>({...f,tanques_cantidad:e.target.value}))} placeholder="Ej: 3"/></label>
              </div>
              <div>
                <label className="ag-field-label ui-74cc19">Litros por tanque
                <input className="ui-2720fa" type="number" min="0" value={form.tanque_litros} onChange={e=>setForm(f=>({...f,tanque_litros:e.target.value}))} placeholder="Ej: 20"/></label>
              </div>
            </div>
            {form.tanques_cantidad && form.tanque_litros && (
              <div className="ui-afd779">
                Total preparado: {fmtCantidad((Number(form.tanques_cantidad) || 0) * (Number(form.tanque_litros) || 0))} L
              </div>
            )}
            <FormHeading number="03" detail="Cantidad, unidad y efecto sobre el stock">Productos utilizados</FormHeading>
            <div className="ui-74cc19">Productos <span className="ui-d6202d">(primero elegí la categoría)</span></div>
            {form.productos_form.map((pf,i)=>{
              const prod = productos.find(p=>p.id===pf.producto_id)
              const descuento = prod ? calcularDescuentoStock(pf, prod, form.tanques_cantidad) : 0
              return (
                <div className="ui-d51702" key={i}>
                  <div className="ag-product-row ui-820f1c">
                    <div className="ui-d40836">
                      <label className="ag-field-label">Categoría
                      <select className="ui-ed7c13" value={pf.categoria_nombre || ''} onChange={e=>{const np=[...form.productos_form];np[i].categoria_nombre=e.target.value;np[i].producto_id='';np[i].producto_nombre='';setForm(f=>({...f,productos_form:np}))}}>
                        <option value="">Elegir categoría</option>
                        {(CATEGORIAS_POR_TIPO[form.tipo] || []).map(categoria=><option key={categoria} value={categoria}>{categoria}</option>)}
                      </select></label>
                      <label className="ag-field-label">Producto
                      <select className="ui-ed7c13" value={pf.producto_id} disabled={!pf.categoria_nombre} onChange={e=>{const prodSel=productos.find(p=>p.id===e.target.value); const np=[...form.productos_form];np[i].producto_id=e.target.value;np[i].producto_nombre=prodSel?.nombre || '';np[i].unidad_uso=unidadUsoDefault(prodSel?.unidad);setForm(f=>({...f,productos_form:np}))}}>
                        <option value="">{pf.categoria_nombre ? 'Sin inventario / escribir otro' : 'Primero elegí la categoría'}</option>
                        {incluirSeleccionados(productos, p => categoriaProducto(p) === String(pf.categoria_nombre || '').toLowerCase(), [pf.producto_id]).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select></label>
                      {pf.categoria_nombre && productos.filter(p => categoriaProducto(p) === pf.categoria_nombre.toLowerCase()).length === 0 && !pf.producto_id && <div className="ui-6d5651">No hay productos en esta categoría. Podés escribir uno o cargarlo primero en Inventario.</div>}
                      {pf.categoria_nombre && !pf.producto_id && <input className="ui-6f9704" value={pf.producto_nombre || ''} onChange={e=>{const np=[...form.productos_form];np[i].producto_nombre=e.target.value;setForm(f=>({...f,productos_form:np}))}} placeholder={`Escribir ${pf.categoria_nombre.toLowerCase()}`} />}
                    </div>
                    <input className="ui-ed7c13" value={pf.cantidad} onChange={e=>{const np=[...form.productos_form];np[i].cantidad=e.target.value;setForm(f=>({...f,productos_form:np}))}} placeholder="Cant." inputMode="decimal"/>
                    <select className="ui-e2752f" value={pf.unidad_uso} onChange={e=>{const np=[...form.productos_form];np[i].unidad_uso=e.target.value;setForm(f=>({...f,productos_form:np}))}}>
                      {UNIDADES_USO.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {prod && <div className="ui-d57e4f" style={{ color: prod.stock_actual<=prod.stock_minimo?'#e07b00':'#0F3923' }}>
                    Stock: {formatearStock(prod.stock_actual, prod.unidad)}
                    {descuento === null ? ' · medida incompatible con el stock' : descuento > 0 ? ` · descuenta ${formatearStock(descuento, prod.unidad)}` : ''}
                    {prod.carencia_dias>0?` · ${prod.carencia_dias}d carencia`:''}
                  </div>}
                </div>
              )
            })}
            <button className="ag-small-action ui-a0449e" onClick={()=>setForm(f=>({...f,productos_form:[...f.productos_form,{categoria_nombre:'',producto_id:'',producto_nombre:'',cantidad:'',unidad_uso:'g'}]}))}>+ Agregar producto</button>
            <label className="ag-field-label ui-74cc19">Notas
            <textarea className="ui-641669" value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Observaciones..."/></label>
            <button className="ag-form-submit ui-17d991" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Guardar registro'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={cerrarModal}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
