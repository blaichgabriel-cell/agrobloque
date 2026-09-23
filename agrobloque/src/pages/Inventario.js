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

const CATEGORIAS = [
  { key:'Fungicida',     label:'Fungicidas',      icon:'ti-shield',    color:'#e07b00', bg:'#fff3e8' },
  { key:'Insecticida',   label:'Insecticidas',    icon:'ti-bug',       color:'#c84040', bg:'#fff0f0' },
  { key:'Fertilizante',  label:'Fertilizantes',   icon:'ti-droplet',   color:'#2980b9', bg:'#eaf4fb' },
  { key:'Foliar',        label:'Foliares',         icon:'ti-leaf',      color:'#2d8a4e', bg:'#edf7ed' },
  { key:'Hidrosoluble',  label:'Hidrosolubles',    icon:'ti-flask',     color:"#124e38", bg:'#eeeeee' },
  { key:'Abono de base', label:'Abonos de base',  icon:'ti-garden-cart',color:"#124e38",bg:'#eeeeee' },
  { key:'Otro',          label:'Otros',            icon:'ti-package',   color:'#555',   bg:'#f2f1ef' },
]

function ModalConfirm({ mensaje, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface" style={{ background:'#fff', borderRadius:'var(--ag-radius)', padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:"#182c25", marginBottom:8, textAlign:'center' }}>¿Eliminar producto?</div>
        <div style={{ fontSize:13, color:"#697970", textAlign:'center', marginBottom:20 }}>{mensaje}</div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="ag-small-action" onClick={onCancel} style={{ flex:1, padding:12, borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'transparent', fontSize:13, color:"#697970", cursor:'pointer' }}>Cancelar</button>
          <button className="ag-small-action" onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:'var(--ag-radius)', border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
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

  const getProductosCat = (catKey) => productos.filter(p => getCatNombre(p) === catKey)

  const getBajoStock = (catKey) => getProductosCat(catKey).filter(p => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0).length

  const getSinStock = (catKey) => getProductosCat(catKey).filter(p => p.stock_actual <= 0).length

  const getBadge = (catKey) => {
    const sin = getSinStock(catKey)
    const bajo = getBajoStock(catKey)
    if (sin > 0) return { label: `✗ Sin stock`, bg:'#fff0f0', color:'#c84040' }
    if (bajo > 0) return { label: `⚠ Stock bajo`, bg:'#fff3e8', color:'#c8700a' }
    return { label: '✓ OK', bg:'#eeeeee', color:'#555' }
  }

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

  const getStockColor = (p) => p.stock_actual <= 0 ? '#c84040' : p.stock_actual <= p.stock_minimo ? '#e07b00' : '#212121'
  const getStockBg = (p) => p.stock_actual <= 0 ? '#fff0f0' : p.stock_actual <= p.stock_minimo ? '#fff3e8' : '#eeeeee'
  const getStockPct = (p) => p.stock_minimo > 0 ? Math.min(100, Math.round((p.stock_actual / (p.stock_minimo * 3)) * 100)) : p.stock_actual > 0 ? 100 : 0

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12, boxSizing:'border-box' }
  const catActInfo = CATEGORIAS.find(c => c.key === categoriaActiva)
  const productosCat = categoriaActiva ? getProductosCat(categoriaActiva) : []
  const bajoStockTotal = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0).length

  return (
    <div className="ag-page" style={{ background:"#f6f8f7", minHeight:'100vh' }}>
      {confirmar && <ModalConfirm mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      {/* Vista categorías */}
      {!categoriaActiva && (
        <>
          <div className="ag-page-header" style={{ background:"#f6f8f7", padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:12, color:"#697970", marginBottom:4 }}>Depósito</div>
                <div className="ag-page-title" style={{ fontSize:24, fontWeight:700, color:"#182c25", letterSpacing:-.5 }}>Inventario</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button aria-label="Actualizar" onClick={sincronizarAbonosManual} disabled={sincronizandoAbonos}
                  title="Sincronizar abonos de base"
                  style={{ width:40, height:40, borderRadius:'var(--ag-radius)', background: sincronizandoAbonos ? '#888' : '#fff', border:"1px solid #e2e9e5", display:'flex', alignItems:'center', justifyContent:'center', cursor: sincronizandoAbonos ? 'default' : 'pointer' }}>
                  <i className={`ti ${sincronizandoAbonos ? 'ti-loader-2' : 'ti-refresh'}`} style={{ color:"#124e38", fontSize:20 }} aria-hidden="true"></i>
                </button>
                <button aria-label="Agregar registro" onClick={() => { setForm({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('form') }}
                  style={{ width:40, height:40, borderRadius:'var(--ag-radius)', background:"#124e38", border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                  <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
                </button>
              </div>
            </div>
            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:'var(--ag-radius)', marginBottom:10 }}>{error}</div>}
            {bajoStockTotal > 0 && (
              <div style={{ background:'#fff3e8', borderRadius:'var(--ag-radius)', padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                <i className="ti ti-alert-triangle" style={{ color:'#e07b00', fontSize:16 }} aria-hidden="true"></i>
                <div style={{ fontSize:12, fontWeight:500, color:'#c8700a' }}>{bajoStockTotal} producto{bajoStockTotal>1?'s':''} con stock bajo</div>
              </div>
            )}
          </div>

          <div className="ag-page-body" style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
            <div className="ag-record-grid" style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(3, minmax(240px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {CATEGORIAS.map(cat => {
              const prods = getProductosCat(cat.key)
              if (prods.length === 0) return null
              const badge = getBadge(cat.key)
              return (
                <div className="ag-surface" key={cat.key} onClick={() => setCategoriaActiva(cat.key)}
                  style={{ background:'#fff', borderRadius:'var(--ag-radius)', padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, display:'flex', alignItems:'center', gap:12, cursor:'pointer', boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
                  <div style={{ width:44, height:44, borderRadius:'var(--ag-radius)', background:cat.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${cat.icon}`} style={{ fontSize:20, color:cat.color }} aria-hidden="true"></i>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#182c25" }}>{cat.label}</div>
                    <div style={{ fontSize:12, color:"#697970", marginTop:2 }}>{prods.length} producto{prods.length>1?'s':''}</div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:'var(--ag-radius)', background:badge.bg, color:badge.color }}>{badge.label}</div>
                  <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
                </div>
              )
            })}
            </div>
          </div>
        </>
      )}

      {/* Vista productos de categoría */}
      {categoriaActiva && catActInfo && (
        <>
          <div className="ag-page-header" style={{ background:"#f6f8f7", padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
            <button className="ag-small-action" onClick={() => setCategoriaActiva(null)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
              <i className="ti ti-arrow-left" style={{ fontSize:18, color:"#124e38" }} aria-hidden="true"></i>
              <span style={{ fontSize:13, color:"#124e38", fontWeight:500 }}>Inventario</span>
            </button>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:'var(--ag-radius)', background:catActInfo.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${catActInfo.icon}`} style={{ fontSize:20, color:catActInfo.color }} aria-hidden="true"></i>
                </div>
                <div style={{ fontSize:22, fontWeight:700, color:"#182c25", letterSpacing:-.5 }}>{catActInfo.label}</div>
              </div>
              <button aria-label="Agregar registro" onClick={() => { setForm({ nombre:'', categoria_nombre:categoriaActiva, principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('form') }}
                style={{ width:40, height:40, borderRadius:'var(--ag-radius)', background:"#124e38", border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <div className="ag-page-body" style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
            {productosCat.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:"#697970", fontSize:13 }}>Sin productos en esta categoría</div>
            ) : (
              <div className="ag-record-grid" style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(320px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
              {productosCat.map(p => {
              const stockVisible = formatearStock(p.stock_actual, p.unidad)
              return (
              <div className="ag-surface" key={p.id} style={{ background:'#fff', borderRadius:'var(--ag-radius)', padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#182c25" }}>{p.nombre}</div>
                    <div style={{ fontSize:12, color:"#697970", marginTop:2 }}>{p.principio_activo || '—'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:22, fontWeight:700, color: getStockColor(p) }}>{stockVisible.cantidad}</div>
                    <div style={{ fontSize:12, color:"#697970" }}>{stockVisible.unidad}</div>
                  </div>
                </div>

                <div style={{ background:"#f6f8f7", borderRadius:'var(--ag-radius)', height:6, overflow:'hidden', marginBottom:6 }}>
                  <div style={{ height:'100%', background: getStockColor(p), borderRadius:'var(--ag-radius)', width:`${getStockPct(p)}%`, transition:'width .3s' }}></div>
                </div>

                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                  <div style={{ background: getStockBg(p), borderRadius:'var(--ag-radius)', padding:'3px 10px', fontSize:12, fontWeight:600, color: getStockColor(p) }}>
                    {p.stock_actual <= 0 ? 'Sin stock' : p.stock_actual <= p.stock_minimo ? `Bajo - min ${formatearCantidadConUnidad(p.stock_minimo, p.unidad)}` : `OK - min ${formatearCantidadConUnidad(p.stock_minimo, p.unidad)}`}
                  </div>
                  {p.carencia_dias > 0 && (
                    <div style={{ background:'#fff3e8', borderRadius:'var(--ag-radius)', padding:'3px 10px', fontSize:12, fontWeight:600, color:'#c8700a' }}>
                      {p.carencia_dias}d carencia
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button onClick={() => ajustarStock(p.id, -1)} style={{ width:32, height:32, borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:"#f6f8f7", fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>−</button>
                  <button onClick={() => ajustarStock(p.id, 1)} style={{ width:32, height:32, borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:"#f6f8f7", fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>+</button>
                  <button className="ag-small-action" onClick={() => { setForm({...p, categoria_nombre: getCatNombre(p)}); setModal('form') }} style={{ padding:'5px 12px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'transparent', fontSize:12, color:'#555', cursor:'pointer', marginLeft:4 }}>Editar</button>
                  <button className="ag-small-action" onClick={() => eliminar(p.id, p.nombre)} style={{ padding:'5px 12px', borderRadius:'var(--ag-radius)', border:'1px solid #ffcccc', background:'transparent', fontSize:12, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
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
        {movimientos.length > 0 && <section style={{ background:'#fff', border:'1px solid #e2e9e5', borderRadius:'var(--ag-radius)', padding:18, marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#182c25', marginBottom:12 }}>Movimientos recientes</div>
          {movimientos.map(m => <div key={m.id} style={{ display:'grid', gridTemplateColumns:isDesktop ? '1fr auto auto' : '1fr auto', gap:10, padding:'10px 0', borderTop:'1px solid #eef1ee', alignItems:'center' }}>
            <div><strong style={{ fontSize:13 }}>{m.productos?.nombre || 'Producto'}</strong><div style={{ fontSize:12, color:'#697970', marginTop:3 }}>{m.detalle || m.modulo || m.tipo}</div></div>
            <strong style={{ color:Number(m.cantidad) >= 0 ? '#08603f' : '#c84040', fontSize:13 }}>{Number(m.cantidad) >= 0 ? '+' : ''}{fmtNumero(m.cantidad)} {m.productos?.unidad || ''}</strong>
            {isDesktop && <time style={{ fontSize:12, color:'#8a948b' }}>{new Date(m.created_at).toLocaleString('es-PY')}</time>}
          </div>)}
        </section>}
        <NotasPanel modulo="inventario" titulo="Notas del inventario" />
      </div>

      {/* Modal producto */}
      {modal === 'form' && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div style={{ background:"#f6f8f7", borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:700, color:"#182c25", marginBottom:20 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</div>
            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:'var(--ag-radius)', marginBottom:12 }}>{error}</div>}

            <div style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Categoría</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
              {CATEGORIAS.map(cat => (
                <button className="ag-small-action" key={cat.key} onClick={() => setForm(f => ({...f, categoria_nombre:cat.key}))}
                  style={{ padding:'7px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", fontSize:12, fontWeight:500, cursor:'pointer', background: form.categoria_nombre===cat.key ? '#212121' : '#fff', color: form.categoria_nombre===cat.key ? '#fff' : '#555' }}>
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
                <label className="ag-field-label" style={{ fontSize:12, color:"#697970", marginBottom:6 }}>{lbl}
                <input style={inpStyle} type={type} value={form[key]||''} onChange={e => setForm(f => ({...f, [key]:e.target.value}))} placeholder={ph}/></label>
              </div>
            ))}

            <div style={{ fontSize:12, color:"#697970", marginBottom:6 }}>Unidad</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
              {['kg','gramos','litros','cc','unidades'].map(u => (
                <button className="ag-small-action" key={u} onClick={() => setForm(f => ({...f, unidad:u}))}
                  style={{ padding:'9px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", fontSize:12, fontWeight:500, cursor:'pointer', background: form.unidad===u ? '#212121' : '#fff', color: form.unidad===u ? '#fff' : '#555' }}>
                  {u}
                </button>
              ))}
            </div>

            <button className="ag-small-action" style={{ width:'100%', padding:14, borderRadius:'var(--ag-radius)', background:"#124e38", border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button className="ag-small-action" style={{ width:'100%', padding:12, borderRadius:'var(--ag-radius)', background:'transparent', border:"1px solid #e2e9e5", fontSize:13, color:"#697970", cursor:'pointer', marginTop:8 }} onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
