import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIAS = [
  { key:'Fungicida',     label:'Fungicidas',      icon:'ti-shield',    color:'#e07b00', bg:'#fff3e8' },
  { key:'Insecticida',   label:'Insecticidas',    icon:'ti-bug',       color:'#c84040', bg:'#fff0f0' },
  { key:'Fertilizante',  label:'Fertilizantes',   icon:'ti-droplet',   color:'#2980b9', bg:'#eaf4fb' },
  { key:'Foliar',        label:'Foliares',         icon:'ti-leaf',      color:'#2d8a4e', bg:'#edf7ed' },
  { key:'Hidrosoluble',  label:'Hidrosolubles',    icon:'ti-flask',     color:'#212121', bg:'#eeeeee' },
  { key:'Abono de base', label:'Abonos de base',  icon:'ti-garden-cart',color:'#212121',bg:'#eeeeee' },
  { key:'Otro',          label:'Otros',            icon:'ti-package',   color:'#555',   bg:'#f2f1ef' },
]

function ModalConfirm({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>¿Eliminar producto?</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>{mensaje}</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function Inventario() {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  const [modal, setModal] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchProductos(); fetchCategorias() }, [])

  const fetchProductos = async () => {
    const { data } = await supabase.from('productos').select('*, categorias_producto(nombre)').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const fetchCategorias = async () => {
    const { data } = await supabase.from('categorias_producto').select('*')
    setCategorias(data || [])
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
      if (form.id) await supabase.from('productos').update(payload).eq('id', form.id)
      else await supabase.from('productos').insert(payload)
      await fetchProductos(); setSaving(false); setModal(null)
      setForm({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' })
    } catch (e) { setError('Error: ' + e.message); setSaving(false) }
  }

  const ajustarStock = async (id, delta) => {
    const p = productos.find(x => x.id === id)
    if (!p) return
    await supabase.from('productos').update({ stock_actual: Math.max(0, Number(p.stock_actual) + delta) }).eq('id', id)
    fetchProductos()
  }

  const eliminar = (id, nombre) => {
    setConfirmar({ mensaje: `"${nombre}" será eliminado.`, fn: async () => {
      await supabase.from('productos').update({ activo: false }).eq('id', id)
      setConfirmar(null); fetchProductos()
    }})
  }

  const getStockColor = (p) => p.stock_actual <= 0 ? '#c84040' : p.stock_actual <= p.stock_minimo ? '#e07b00' : '#212121'
  const getStockBg = (p) => p.stock_actual <= 0 ? '#fff0f0' : p.stock_actual <= p.stock_minimo ? '#fff3e8' : '#eeeeee'
  const getStockPct = (p) => p.stock_minimo > 0 ? Math.min(100, Math.round((p.stock_actual / (p.stock_minimo * 3)) * 100)) : p.stock_actual > 0 ? 100 : 0

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }
  const catActInfo = CATEGORIAS.find(c => c.key === categoriaActiva)
  const productosCat = categoriaActiva ? getProductosCat(categoriaActiva) : []
  const bajoStockTotal = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0).length

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      {/* Vista categorías */}
      {!categoriaActiva && (
        <>
          <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Depósito</div>
                <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Inventario</div>
              </div>
              <button onClick={() => { setForm({ nombre:'', categoria_nombre:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('form') }}
                style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
              </button>
            </div>
            {bajoStockTotal > 0 && (
              <div style={{ background:'#fff3e8', borderRadius:14, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                <i className="ti ti-alert-triangle" style={{ color:'#e07b00', fontSize:16 }} aria-hidden="true"></i>
                <div style={{ fontSize:12, fontWeight:500, color:'#c8700a' }}>{bajoStockTotal} producto{bajoStockTotal>1?'s':''} con stock bajo</div>
              </div>
            )}
          </div>

          <div style={{ padding:'8px 14px 100px' }}>
            {CATEGORIAS.map(cat => {
              const prods = getProductosCat(cat.key)
              if (prods.length === 0) return null
              const badge = getBadge(cat.key)
              return (
                <div key={cat.key} onClick={() => setCategoriaActiva(cat.key)}
                  style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
                  <div style={{ width:44, height:44, borderRadius:14, background:cat.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${cat.icon}`} style={{ fontSize:20, color:cat.color }} aria-hidden="true"></i>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{cat.label}</div>
                    <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>{prods.length} producto{prods.length>1?'s':''}</div>
                  </div>
                  <div style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:20, background:badge.bg, color:badge.color }}>{badge.label}</div>
                  <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Vista productos de categoría */}
      {categoriaActiva && catActInfo && (
        <>
          <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
            <button onClick={() => setCategoriaActiva(null)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
              <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
              <span style={{ fontSize:13, color:'#212121', fontWeight:500 }}>Inventario</span>
            </button>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:catActInfo.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${catActInfo.icon}`} style={{ fontSize:20, color:catActInfo.color }} aria-hidden="true"></i>
                </div>
                <div style={{ fontSize:22, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>{catActInfo.label}</div>
              </div>
              <button onClick={() => { setForm({ nombre:'', categoria_nombre:categoriaActiva, principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('form') }}
                style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <div style={{ padding:'8px 14px 100px' }}>
            {productosCat.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin productos en esta categoría</div>
            ) : productosCat.map(p => (
              <div key={p.id} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{p.nombre}</div>
                    <div style={{ fontSize:10, color:'#9a9a9a', marginTop:2 }}>{p.principio_activo || '—'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:22, fontWeight:800, color: getStockColor(p) }}>{Number(p.stock_actual).toLocaleString('es-PY')}</div>
                    <div style={{ fontSize:9, color:'#9a9a9a' }}>{p.unidad}</div>
                  </div>
                </div>

                <div style={{ background:'#f2f1ef', borderRadius:20, height:6, overflow:'hidden', marginBottom:6 }}>
                  <div style={{ height:'100%', background: getStockColor(p), borderRadius:20, width:`${getStockPct(p)}%`, transition:'width .3s' }}></div>
                </div>

                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                  <div style={{ background: getStockBg(p), borderRadius:8, padding:'3px 10px', fontSize:10, fontWeight:600, color: getStockColor(p) }}>
                    {p.stock_actual <= 0 ? 'Sin stock' : p.stock_actual <= p.stock_minimo ? `Bajo · mín ${p.stock_minimo} ${p.unidad}` : `OK · mín ${p.stock_minimo} ${p.unidad}`}
                  </div>
                  {p.carencia_dias > 0 && (
                    <div style={{ background:'#fff3e8', borderRadius:8, padding:'3px 10px', fontSize:10, fontWeight:600, color:'#c8700a' }}>
                      {p.carencia_dias}d carencia
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button onClick={() => ajustarStock(p.id, -1)} style={{ width:32, height:32, borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>−</button>
                  <button onClick={() => ajustarStock(p.id, 1)} style={{ width:32, height:32, borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>+</button>
                  <button onClick={() => { setForm({...p, categoria_nombre: getCatNombre(p)}); setModal('form') }} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer', marginLeft:4 }}>Editar</button>
                  <button onClick={() => eliminar(p.id, p.nombre)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal producto */}
      {modal === 'form' && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</div>
            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Categoría</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
              {CATEGORIAS.map(cat => (
                <button key={cat.key} onClick={() => setForm(f => ({...f, categoria_nombre:cat.key}))}
                  style={{ padding:'7px 14px', borderRadius:20, border:'1px solid #e8e6e2', fontSize:11, fontWeight:500, cursor:'pointer', background: form.categoria_nombre===cat.key ? '#212121' : '#fff', color: form.categoria_nombre===cat.key ? '#fff' : '#555' }}>
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
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>{lbl}</div>
                <input style={inpStyle} type={type} value={form[key]||''} onChange={e => setForm(f => ({...f, [key]:e.target.value}))} placeholder={ph}/>
              </div>
            ))}

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Unidad</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
              {['kg','gramos','litros','cc','unidades'].map(u => (
                <button key={u} onClick={() => setForm(f => ({...f, unidad:u}))}
                  style={{ padding:'9px 14px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:12, fontWeight:500, cursor:'pointer', background: form.unidad===u ? '#212121' : '#fff', color: form.unidad===u ? '#fff' : '#555' }}>
                  {u}
                </button>
              ))}
            </div>

            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
