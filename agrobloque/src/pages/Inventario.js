import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIAS = ['Fungicida','Insecticida','Fertilizante','Herbicida','Abono','Otro']

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
  const [modal, setModal] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ nombre:'', categoria_id:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => { fetchProductos(); fetchCategorias() }, [])

  const fetchProductos = async () => {
    const { data } = await supabase.from('productos').select('*, categorias_producto(nombre)').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const fetchCategorias = async () => {
    const { data } = await supabase.from('categorias_producto').select('*')
    setCategorias(data || [])
  }

  const guardar = async () => {
    if (!form.nombre) return
    setSaving(true)
    const payload = {
      nombre: form.nombre, categoria_id: form.categoria_id||null,
      principio_activo: form.principio_activo||null, unidad: form.unidad,
      stock_actual: Number(form.stock_actual)||0, stock_minimo: Number(form.stock_minimo)||0,
      carencia_dias: Number(form.carencia_dias)||0, notas: form.notas||null
    }
    if (form.id) await supabase.from('productos').update(payload).eq('id', form.id)
    else await supabase.from('productos').insert(payload)
    await fetchProductos(); setSaving(false); setModal(null)
    setForm({ nombre:'', categoria_id:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' })
  }

  const ajustarStock = async (id, delta) => {
    const p = productos.find(x => x.id === id)
    if (!p) return
    await supabase.from('productos').update({ stock_actual: Math.max(0, Number(p.stock_actual) + delta) }).eq('id', id)
    fetchProductos()
  }

  const eliminar = (id, nombre) => {
    setConfirmar({ mensaje: `"${nombre}" será eliminado del inventario.`, fn: async () => {
      await supabase.from('productos').update({ activo: false }).eq('id', id)
      setConfirmar(null); fetchProductos()
    }})
  }

  const getStockColor = (p) => p.stock_actual <= 0 ? '#c84040' : p.stock_actual <= p.stock_minimo ? '#e07b00' : '#A0785A'
  const getStockBg = (p) => p.stock_actual <= 0 ? '#fff0f0' : p.stock_actual <= p.stock_minimo ? '#fff3e8' : '#f2ebe4'

  const productosFiltrados = filtro === 'todos' ? productos
    : filtro === 'bajo' ? productos.filter(p => p.stock_actual <= p.stock_minimo)
    : productos.filter(p => p.categorias_producto?.nombre === filtro)
  const bajoStock = productos.filter(p => p.stock_actual <= p.stock_minimo).length

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Depósito</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Inventario</div>
          </div>
          <button onClick={() => { setForm({ nombre:'', categoria_id:'', principio_activo:'', unidad:'kg', stock_actual:'', stock_minimo:'', carencia_dias:'', notas:'' }); setModal('nuevo') }} style={{ width:40, height:40, borderRadius:14, background:'#A0785A', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        {bajoStock > 0 && (
          <div style={{ background:'#fff3e8', borderRadius:14, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <i className="ti ti-alert-triangle" style={{ color:'#e07b00', fontSize:16 }} aria-hidden="true"></i>
            <div style={{ fontSize:12, fontWeight:500, color:'#c8700a' }}>{bajoStock} producto{bajoStock>1?'s':''} con stock bajo</div>
          </div>
        )}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
          {['todos','bajo',...CATEGORIAS].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===f ? '#A0785A' : '#e8e6e2', color: filtro===f ? '#fff' : '#9a9a9a' }}>
              {f === 'todos' ? 'Todos' : f === 'bajo' ? '⚠ Stock bajo' : f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 14px 100px' }}>
        {productosFiltrados.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin productos</div>
        ) : productosFiltrados.map(p => (
          <div key={p.id} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{p.nombre}</div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginTop:2 }}>{p.categorias_producto?.nombre}{p.principio_activo ? ' · ' + p.principio_activo : ''}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:22, fontWeight:800, color: getStockColor(p) }}>{Number(p.stock_actual).toLocaleString()}</div>
                <div style={{ fontSize:9, color:'#9a9a9a' }}>{p.unidad}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
              <div style={{ background: getStockBg(p), borderRadius:8, padding:'4px 10px', display:'inline-block' }}>
                <div style={{ fontSize:10, fontWeight:600, color: getStockColor(p) }}>
                  {p.stock_actual <= 0 ? 'Sin stock' : p.stock_actual <= p.stock_minimo ? `Stock bajo · mín: ${p.stock_minimo} ${p.unidad}` : `Stock OK · mín: ${p.stock_minimo} ${p.unidad}`}
                </div>
              </div>
              {p.carencia_dias > 0 && (
                <div style={{ background:'#fff3e8', borderRadius:8, padding:'4px 10px' }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'#c8700a' }}>
                    <i className="ti ti-shield-check" style={{ fontSize:10, marginRight:3 }} aria-hidden="true"></i>
                    {p.carencia_dias}d carencia
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <button onClick={() => ajustarStock(p.id, -1)} style={{ width:32, height:32, borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>−</button>
              <button onClick={() => ajustarStock(p.id, 1)} style={{ width:32, height:32, borderRadius:10, border:'1px solid #e8e6e2', background:'#f2f1ef', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>+</button>
              <button onClick={() => { setForm({...p, categoria_id: p.categoria_id||'', carencia_dias: p.carencia_dias||''}); setModal('nuevo') }} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer', marginLeft:4 }}>Editar</button>
              <button onClick={() => eliminar(p.id, p.nombre)} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:11, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</div>
            {[
              ['Nombre *','nombre','text','Ej: Fungicida Captan'],
              ['Principio activo','principio_activo','text','Ej: Captan 80%'],
              ['Stock actual','stock_actual','number','0'],
              ['Stock mínimo (alerta)','stock_minimo','number','0'],
              ['Días de carencia','carencia_dias','number','Ej: 7'],
              ['Notas','notas','text','Opcional'],
            ].map(([lbl,key,type,ph]) => (
              <div key={key}>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>{lbl}</div>
                <input style={inpStyle} type={type} value={form[key]||''} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} placeholder={ph}/>
              </div>
            ))}
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Categoría</div>
            <select style={inpStyle} value={form.categoria_id||''} onChange={e => setForm(f => ({...f, categoria_id:e.target.value}))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Unidad</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
              {['kg','gramos','litros','cc','unidades'].map(u => (
                <button key={u} onClick={() => setForm(f => ({...f, unidad:u}))} style={{ padding:'9px 14px', borderRadius:12, border:'1px solid #e8e6e2', fontSize:12, fontWeight:500, cursor:'pointer', background: form.unidad===u ? '#A0785A' : '#fff', color: form.unidad===u ? '#fff' : '#555' }}>{u}</button>
              ))}
            </div>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#A0785A', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
