import { Modal } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { ajustarStockSeguro } from '../lib/inventory'

const ABONO_BASE_CATEGORIA = 'Abono de base'
const normalizarNombre = (valor) => String(valor || '').trim().toLowerCase()
const fmtNumero = (n, decimales = 3) => (Number(n) || 0).toLocaleString('es-PY', { maximumFractionDigits: decimales })

const normalizarUnidad = (unidad = '') => {
  const u = String(unidad).trim().toLowerCase()
  if (['kg', 'kilo', 'kilos'].includes(u)) return 'kg'
  if (['g', 'gr', 'gramo', 'gramos'].includes(u)) return 'g'
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return 'L'
  if (['cc', 'ml'].includes(u)) return 'cc'
  if (['unidad', 'unidades', 'u'].includes(u)) return 'unidades'
  return u || 'unidades'
}

const formatearStock = (cantidad, unidad) => {
  const valor = Number(cantidad) || 0
  const u = normalizarUnidad(unidad)

  if (u === 'kg' && valor > 0 && valor < 1) {
    return { cantidad: fmtNumero(valor * 1000, 0), unidad: 'g' }
  }
  if (u === 'L' && valor > 0 && valor < 1) {
    return { cantidad: fmtNumero(valor * 1000, 0), unidad: 'cc' }
  }
  return { cantidad: fmtNumero(valor), unidad: u }
}

const formatearCantidadConUnidad = (cantidad, unidad) => {
  const stock = formatearStock(cantidad, unidad)
  return `${stock.cantidad} ${stock.unidad}`
}

const PRODUCT_CATEGORIES = [
  { key:'Semillas',      label:'Semillas',        icon:'ti-seeding',   color:'#3d7a35', bg:'#edf6e9' },
  { key:'Plantines',     label:'Plantines',       icon:'ti-plant-2',   color:'#4f8c42', bg:'#edf6e9' },
  { key:'Fungicida',     label:'Fungicidas',      icon:'ti-shield',    color:'#e07b00', bg:'#fff3e8' },
  { key:'Insecticida',   label:'Insecticidas',    icon:'ti-bug',       color:'#c84040', bg:'#fff0f0' },
  { key:'Herbicida',     label:'Herbicidas',      icon:'ti-plant',     color:'#8a5a32', bg:'#f7f1ea' },
  { key:'Coadyuvante',   label:'Coadyuvantes',    icon:'ti-flask-2',   color:'#6c5aa8', bg:'#f1eff9' },
  { key:'Fertilizante',  label:'Fertilizantes',   icon:'ti-droplet',   color:'#2980b9', bg:'#eaf4fb' },
  { key:'Foliar',        label:'Foliares',         icon:'ti-leaf',      color:'#2d8a4e', bg:'#edf7ed' },
  { key:'Hidrosoluble',  label:'Hidrosolubles',    icon:'ti-flask',     color:"#124e38", bg:'#eeeeee' },
  { key:'Abono de base', label:'Abonos de base',  icon:'ti-garden-cart',color:"#124e38",bg:'#eeeeee' },
  { key:'Herramientas',  label:'Herramientas',    icon:'ti-tool',      color:'#54616f', bg:'#eef1f4' },
  { key:'Otro',          label:'Otros',            icon:'ti-package',   color:'#555',   bg:'#f2f1ef' },
]

const INVENTORY_GROUPS = [
  { key:'semillas', label:'Semillas y plantines', icon:'ti-seeding', color:'#3d7a35', bg:'#edf6e9', defaultCategory:'Semillas', matches:['semilla','plantin','plantín','bandeja'] },
  { key:'nutricion', label:'Fertilizantes y nutrientes', icon:'ti-leaf', color:'#08795b', bg:'#e7f5ef', defaultCategory:'Fertilizante', matches:['fertilizante','foliar','hidrosoluble','abono de base','nutriente'] },
  { key:'fitosanitarios', label:'Agroquímicos / fitosanitarios', icon:'ti-shield-check', color:'#a4650c', bg:'#fff3dc', defaultCategory:'Fungicida', matches:['fungicida','insecticida','herbicida','coadyuvante','agroquímico','fitosanitario'] },
  { key:'insumos', label:'Insumos y herramientas', icon:'ti-tool', color:'#54616f', bg:'#eef1f4', defaultCategory:'Otro', matches:[] },
]

const INVENTORY_TONES = { semillas:'bloques', nutricion:'agua', fitosanitarios:'alerta', insumos:'neutral' }

function ModalConfirm({ mensaje, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface ui-211525">
        <div className="ui-3e43be">¿Eliminar producto?</div>
        <div className="ui-01159a">{mensaje}</div>
        <div className="ui-9c6869">
          <button className="ag-small-action ui-395a62" onClick={onCancel}>Cancelar</button>
          <button className="ag-small-action ui-f5f413" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Inventario() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  const [modal, setModal] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [sincronizandoAbonos, setSincronizandoAbonos] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { fetchProductos(); fetchCategorias(); fetchMovimientos() }, [])

  const asegurarCategoriaProducto = async () => {
    const { data: existente } = await supabase
      .from('categorias_producto')
      .select('id')
      .eq('nombre', ABONO_BASE_CATEGORIA)
      .maybeSingle()

    if (existente?.id) return existente.id

    const { data: creada } = await supabase
      .from('categorias_producto')
      .insert({ nombre: ABONO_BASE_CATEGORIA })
      .select('id')
      .single()

    return creada?.id || null
  }

  const sincronizarAbonoBase = async (nombre, categoriaNombre, nombreAnterior = '') => {
    if (categoriaNombre !== ABONO_BASE_CATEGORIA) return
    const nombreLimpio = String(nombre || '').trim()
    if (!nombreLimpio) return

    const nombres = [nombreLimpio, nombreAnterior].filter(Boolean)
    const { data: existentes } = await supabase
      .from('abonos')
      .select('id, nombre')
      .in('nombre', nombres)

    const abono = (existentes || []).find(a =>
      normalizarNombre(a.nombre) === normalizarNombre(nombreAnterior) ||
      normalizarNombre(a.nombre) === normalizarNombre(nombreLimpio)
    )

    if (abono) {
      await supabase.from('abonos').update({ nombre: nombreLimpio }).eq('id', abono.id)
    } else {
      await supabase.from('abonos').insert({ nombre: nombreLimpio })
    }
  }

  const sincronizarAbonosBase = async () => {
    const { data: abonosData } = await supabase.from('abonos').select('nombre').order('nombre')
    if (!abonosData || abonosData.length === 0) return

    const categoriaId = await asegurarCategoriaProducto()
    if (!categoriaId) return

    const { data: productosData } = await supabase
      .from('productos')
      .select('nombre')
      .eq('categoria_id', categoriaId)

    const nombresExistentes = new Set((productosData || []).map(p => normalizarNombre(p.nombre)))
    const faltantes = abonosData
      .map(a => String(a.nombre || '').trim())
      .filter(nombre => nombre && !nombresExistentes.has(normalizarNombre(nombre)))

    if (faltantes.length === 0) return

    await supabase.from('productos').insert(faltantes.map(nombre => ({
      nombre,
      categoria_id: categoriaId,
      unidad: 'kg',
      stock_actual: 0,
      stock_minimo: 0,
      carencia_dias: 0,
      activo: true,
    })))
  }

  const sincronizarAbonosManual = async () => {
    setSincronizandoAbonos(true)
    setError('')
    try {
      await sincronizarAbonosBase()
      await Promise.all([fetchProductos(), fetchCategorias()])
      setCategoriaActiva(ABONO_BASE_CATEGORIA)
    } catch (e) {
      setError('Error al sincronizar abonos: ' + e.message)
    }
    setSincronizandoAbonos(false)
  }

  const fetchProductos = async () => {
    const { data } = await supabase.from('productos').select('*, categorias_producto(nombre)').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const fetchCategorias = async () => {
    const { data } = await supabase.from('categorias_producto').select('*')
    setCategorias(data || [])
  }

  const fetchMovimientos = async () => {
    const { data, error:movError } = await supabase.from('inventario_movimientos').select('id, cantidad, stock_nuevo, tipo, modulo, detalle, created_at, productos(nombre, unidad)').order('created_at', { ascending:false }).limit(12)
    if (!movError) setMovimientos(data || [])
  }

  const getCatNombre = (p) => p.categorias_producto?.nombre || 'Otro'

  const getGrupoProducto = p => {
    const nombre = getCatNombre(p).toLowerCase()
    return INVENTORY_GROUPS.find(group => group.matches.some(match => nombre.includes(match)))?.key || 'insumos'
  }

  const getProductosCat = (catKey) => productos.filter(p => getGrupoProducto(p) === catKey)




  const guardar = async () => {
    if (!form.nombre) return
    setSaving(true); setError('')
    try {
      // Buscar o crear categoría
      let categoria_id = null
      if (form.categoria_nombre) {
        const cat = categorias.find(c => c.nombre === form.categoria_nombre)
        if (cat) {
          categoria_id = cat.id
        } else {
          const { data: newCat } = await supabase.from('categorias_producto').insert({ nombre: form.categoria_nombre }).select().single()
          if (newCat) { categoria_id = newCat.id; await fetchCategorias() }
        }
      }
      const payload = {
        nombre: form.nombre, categoria_id,
        principio_activo: form.principio_activo || null, unidad: form.unidad,
        stock_actual: Number(form.stock_actual) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        carencia_dias: Number(form.carencia_dias) || 0,
        notas: form.notas || null
      }
      const anterior = form.id ? productos.find(p => p.id === form.id)?.nombre : ''
      if (form.id) await supabase.from('productos').update(payload).eq('id', form.id)
      else await supabase.from('productos').insert(payload)
      await sincronizarAbonoBase(form.nombre, form.categoria_nombre, anterior)
      await registrarAuditoria({
        accion: form.id ? 'Edito producto' : 'Registro producto',
        modulo: 'Inventario',
        tabla: 'productos',
        registroId: form.id || '',
        detalle: `${payload.nombre} - stock ${payload.stock_actual}`,
      })
      await fetchProductos(); setSaving(false); setModal(null)
      setForm({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' })
    } catch (e) { setError('Error: ' + e.message); setSaving(false) }
  }

  const ajustarStock = async (id, delta) => {
    const p = productos.find(x => x.id === id)
    if (!p) return
    setError('')
    try {
      await ajustarStockSeguro({ productoId:id, delta, tipo:'ajuste_manual', modulo:'Inventario', referenciaId:id, detalle:p.nombre, stockActual:p.stock_actual })
      await registrarAuditoria({ accion:'Ajusto stock', modulo:'Inventario', tabla:'productos', registroId:id, detalle:`${p.nombre}: ${delta > 0 ? '+' : ''}${delta}` })
      await Promise.all([fetchProductos(), fetchMovimientos()])
    } catch (e) {
      setError(`No se pudo ajustar el stock: ${e.message || 'error desconocido'}`)
    }
  }

  const eliminar = (id, nombre) => {
    setConfirmar({ mensaje: `"${nombre}" será eliminado.`, fn: async () => {
      await supabase.from('productos').update({ activo: false }).eq('id', id)
      await registrarAuditoria({ accion:'Desactivo producto', modulo:'Inventario', tabla:'productos', registroId:id, detalle:nombre })
      setConfirmar(null); fetchProductos()
    }})
  }

  const getStockColor = (p) => p.stock_actual <= 0 ? '#c84040' : p.stock_actual <= p.stock_minimo ? '#e07b00' : 'var(--text-primary)'
  const getStockBg = (p) => p.stock_actual <= 0 ? '#fff0f0' : p.stock_actual <= p.stock_minimo ? '#fff3e8' : '#eeeeee'
  const getStockPct = (p) => p.stock_minimo > 0 ? Math.min(100, Math.round((p.stock_actual / (p.stock_minimo * 3)) * 100)) : p.stock_actual > 0 ? 100 : 0

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12, boxSizing:'border-box' }
  const catActInfo = INVENTORY_GROUPS.find(c => c.key === categoriaActiva)
  const productosCat = categoriaActiva ? getProductosCat(categoriaActiva).filter(p => `${p.nombre} ${p.principio_activo || ''}`.toLowerCase().includes(busqueda.toLowerCase())) : []
  const bajoStockTotal = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0).length

  return (
    <div className="ag-page bl-module-page">
      {confirmar && <ModalConfirm mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      {/* Vista categorías */}
      {!categoriaActiva && (
        <>
          <header className="bl-page-head" data-tone="neutral">
            <div className="bl-page-title">
              <span className="bl-page-icon" aria-hidden="true"><i className="ti ti-box" /></span>
              <div><small>Depósito</small><h1 className="ag-page-title">Inventario</h1></div>
            </div>
            <div className="bl-head-actions">
              <button className="bl-icon-btn" aria-label="Sincronizar abonos de base" title="Sincronizar abonos de base" onClick={sincronizarAbonosManual} disabled={sincronizandoAbonos}><i className={`ti ${sincronizandoAbonos ? 'ti-loader-2' : 'ti-refresh'}`} aria-hidden="true" /></button>
              <button className="ag-primary" onClick={() => { setForm({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('form') }}><i className="ti ti-plus" aria-hidden="true" />Nuevo producto</button>
            </div>
          </header>
          {error && <div className="ag-feedback ag-feedback-error" role="alert">{error}</div>}
          {bajoStockTotal > 0 && <div className="bl-stock-alert" role="status"><i className="ti ti-alert-triangle" aria-hidden="true" />{bajoStockTotal} producto{bajoStockTotal > 1 ? 's' : ''} con stock bajo o agotado</div>}

          <div className="inventory-groups">
            {INVENTORY_GROUPS.map(cat => {
              const prods = getProductosCat(cat.key)
              const agotados = prods.filter(p => Number(p.stock_actual) <= 0)
              const bajos = prods.filter(p => Number(p.stock_actual) > 0 && Number(p.stock_minimo) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo))
              const ok = prods.length - agotados.length - bajos.length
              const criticos = [...agotados, ...bajos].slice(0, 3)
              const share = n => prods.length ? `${n / prods.length * 100}%` : '0%'
              return (
                <button className="ag-surface inventory-group-card" key={cat.key} data-tone={INVENTORY_TONES[cat.key]} onClick={() => { setBusqueda(''); setCategoriaActiva(cat.key) }} disabled={!prods.length}>
                  <span className="inventory-group-head">
                    <span className="bl-page-icon" aria-hidden="true"><i className={`ti ${cat.icon}`} /></span>
                    <span><strong>{cat.label}</strong><small>{prods.length ? `${prods.length} producto${prods.length > 1 ? 's' : ''}` : 'Sin productos cargados'}</small></span>
                    <i className="ti ti-chevron-right" aria-hidden="true" />
                  </span>
                  <span className="stock-health" role="img" aria-label={`${ok} con stock, ${bajos.length} bajos, ${agotados.length} agotados`}>
                    <b className="is-ok" style={{ width:share(ok) }} /><b className="is-low" style={{ width:share(bajos.length) }} /><b className="is-out" style={{ width:share(agotados.length) }} />
                  </span>
                  <span className="stock-legend"><span className="is-ok"><i />{ok} OK</span><span className="is-low"><i />{bajos.length} bajos</span><span className="is-out"><i />{agotados.length} agotados</span></span>
                  {criticos.length > 0 && <span className="stock-critical">{criticos.map(p => <span key={p.id} className={Number(p.stock_actual) <= 0 ? 'is-out' : 'is-low'}><span>{p.nombre}</span><b className="mono">{Number(p.stock_actual || 0).toLocaleString('es-PY')} {p.unidad || ''}</b><span className="stock-level"><i style={{ width:`${getStockPct(p)}%` }} /></span></span>)}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Vista productos de categoría */}
      {categoriaActiva && catActInfo && (
        <>
          <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
            <button className="ag-small-action ui-7347f9" onClick={() => setCategoriaActiva(null)}>
              <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
              <span className="ui-fe5017">Inventario</span>
            </button>
            <div className="ui-fb4d82">
              <div className="ui-c36754">
                <div className="ui-e46614" style={{ background:catActInfo.bg }}>
                  <i className={`${`ti ${catActInfo.icon}`} ui-e5e6f8`} style={{ color:catActInfo.color }} aria-hidden="true"></i>
                </div>
                <div className="ui-edab21">{catActInfo.label}</div>
              </div>
              <button className="ui-56054f" aria-label="Agregar registro" onClick={() => { setForm({ nombre:'', categoria_nombre:catActInfo.defaultCategory, principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('form') }}
               >
                <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
              </button>
            </div>
            <label className="inventory-search"><i className="ti ti-search" aria-hidden="true" /><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={`Buscar en ${catActInfo.label.toLowerCase()}…`} /></label>
          </div>

          <div className="ag-page-body" style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
            {productosCat.length === 0 ? (
              <div className="ui-5baa7a">Sin productos en esta categoría</div>
            ) : (
              <div className="ag-record-grid ui-998b74" style={{ gridTemplateColumns: isDesktop ? 'repeat(2, minmax(320px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
              {productosCat.map(p => {
              const stockVisible = formatearStock(p.stock_actual, p.unidad)
              return (
              <div className="ag-surface ui-9a7f69" key={p.id} style={{ marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
                <div className="ui-f81471">
                  <div className="ui-da5cd6">
                    <div className="ui-788a2f" title={p.nombre}>{p.nombre}</div>
                    <div className="ui-a8f171">{p.principio_activo || '—'}</div>
                  </div>
                  <div className="ui-f6e3d7">
                    <div className="ui-02cbdf" style={{ color: getStockColor(p) }}>{stockVisible.cantidad}</div>
                    <div className="ui-93a7e1">{stockVisible.unidad}</div>
                  </div>
                </div>

                <div className="ui-94804d">
                  <div className="ui-b874b9" style={{ background: getStockColor(p), width:`${getStockPct(p)}%` }}></div>
                </div>

                <div className="ui-7c2fd3">
                  <div className="ui-64e4ed" style={{ background: getStockBg(p), color: getStockColor(p) }}>
                    {p.stock_actual <= 0 ? 'Sin stock' : p.stock_actual <= p.stock_minimo ? `Bajo - min ${formatearCantidadConUnidad(p.stock_minimo, p.unidad)}` : `OK - min ${formatearCantidadConUnidad(p.stock_minimo, p.unidad)}`}
                  </div>
                  {p.carencia_dias > 0 && (
                    <div className="ui-e010db">
                      {p.carencia_dias}d carencia
                    </div>
                  )}
                </div>

                <div className="ui-f60339">
                  <button className="ui-b7a1ba" onClick={() => ajustarStock(p.id, -1)}>−</button>
                  <button className="ui-b7a1ba" onClick={() => ajustarStock(p.id, 1)}>+</button>
                  <button className="ag-small-action ui-922ea3" onClick={() => { setForm({...p, categoria_nombre: getCatNombre(p)}); setModal('form') }}>Editar</button>
                  <button className="ag-small-action ui-14c146" onClick={() => eliminar(p.id, p.nombre)}>Eliminar</button>
                </div>
              </div>
              )
              })}
              </div>
            )}
          </div>
        </>
      )}

      <div className="ag-page-body" style={{ padding: isDesktop ? '0 36px 100px' : '0 14px 100px' }}>
        {movimientos.length > 0 && <section className="ui-123417">
          <div className="ui-f951e6">Movimientos recientes</div>
          {movimientos.map(m => <div className="ui-c6e460" key={m.id} style={{ gridTemplateColumns:isDesktop ? '1fr auto auto' : '1fr auto' }}>
            <div><strong className="ui-3044b6">{m.productos?.nombre || 'Producto'}</strong><div className="ui-13b58a">{m.detalle || m.modulo || m.tipo}</div></div>
            <strong className="ui-3044b6" style={{ color:Number(m.cantidad) >= 0 ? '#08603f' : '#c84040' }}>{Number(m.cantidad) >= 0 ? '+' : ''}{fmtNumero(m.cantidad)} {m.productos?.unidad || ''}</strong>
            {isDesktop && <time className="ui-5e0192">{new Date(m.created_at).toLocaleString('es-PY')}</time>}
          </div>)}
        </section>}
        <NotasPanel modulo="inventario" titulo="Notas del inventario" />
      </div>

      {/* Modal producto */}
      {modal === 'form' && (
        <div className="ui-66d878" style={{ alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end' }}>
          <div className="ui-7dd37e" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar producto' : 'Nuevo producto'}</div>
            {error && <div className="ui-e136cb">{error}</div>}

            <div className="ui-74cc19">Categoría</div>
            <div className="ui-395b5b">
              {PRODUCT_CATEGORIES.map(cat => (
                <button className="ag-small-action ui-e36b2f" key={cat.key} onClick={() => setForm(f => ({...f, categoria_nombre:cat.key}))}
                  style={{ background: form.categoria_nombre===cat.key ? '#212121' : '#fff', color: form.categoria_nombre===cat.key ? '#fff' : '#555' }}>
                  {cat.label}
                </button>
              ))}
            </div>

            {[
              ['Nombre *', 'nombre', 'text', 'Ej: Acetamix'],
              ['Principio activo', 'principio_activo', 'text', 'Ej: Acetamiprid'],
              ['Stock actual', 'stock_actual', 'number', '0'],
              ['Stock mínimo (alerta)', 'stock_minimo', 'number', '0'],
              ['Días de carencia', 'carencia_dias', 'number', 'Ej: 7'],
              ['Notas', 'notas', 'text', 'Opcional'],
            ].map(([lbl, key, type, ph]) => (
              <div key={key}>
                <label className="ag-field-label ui-74cc19">{lbl}
                <input style={inpStyle} type={type} value={form[key]||''} onChange={e => setForm(f => ({...f, [key]:e.target.value}))} placeholder={ph}/></label>
              </div>
            ))}

            <div className="ui-74cc19">Unidad</div>
            <div className="ui-1e69e2">
              {['kg','gramos','litros','cc','unidades'].map(u => (
                <button className="ag-small-action ui-45ba57" key={u} onClick={() => setForm(f => ({...f, unidad:u}))}
                  style={{ background: form.unidad===u ? '#212121' : '#fff', color: form.unidad===u ? '#fff' : '#555' }}>
                  {u}
                </button>
              ))}
            </div>

            <button className="ag-small-action ui-17d991" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
