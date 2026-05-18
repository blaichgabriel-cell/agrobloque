import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS = {
  fumigacion: { label:'Fumigación', icon:'ti-spray', color:'#e07b00', bg:'#fff3e8' },
  fertiriego: { label:'Fertiriego', icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  foliar: { label:'Foliar', icon:'ti-leaf', color:'#2d6a2d', bg:'#edf7ed' },
}

export default function Fumigaciones() {
  const [fumigaciones, setFumigaciones] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [productos, setProductos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [form, setForm] = useState({ tipo:'fumigacion', fecha:'', campo_id:'', bloques_ids:[], operario:'', productos_form:[{ producto_id:'', dosis:'' }], notas:'' })
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => { fetchFumigaciones(); fetchCampos(); fetchProductos() }, [])

  const fetchFumigaciones = async () => {
    const { data } = await supabase.from('fumigaciones').select('*, campos(nombre), fumigacion_bloques(bloques(codigo)), fumigacion_productos(*, productos(nombre))').order('fecha', { ascending:false })
    setFumigaciones(data || [])
  }

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*')
    setCampos(data || [])
  }

  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campo_id).order('codigo')
    setBloques(data || [])
    setOperarios([])
    const { data: ops } = await supabase.from('operarios').select('*').eq('campo_id', campo_id)
    setOperarios(ops || [])
  }

  const fetchProductos = async () => {
    const { data } = await supabase.from('productos').select('*').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const toggleBloque = (id) => {
    setForm(f => ({ ...f, bloques_ids: f.bloques_ids.includes(id) ? f.bloques_ids.filter(x => x!==id) : [...f.bloques_ids, id] }))
  }

  const parsearDosis = (dosis) => {
    if (!dosis) return 0
    const num = parseFloat(String(dosis).replace(',', '.'))
    return isNaN(num) ? 0 : num
  }

  const guardar = async () => {
    if (!form.fecha || form.bloques_ids.length === 0) return
    setSaving(true)

    const { data: fum } = await supabase.from('fumigaciones').insert({
      campo_id: form.campo_id || null,
      tipo: form.tipo,
      fecha: form.fecha,
      operario: form.operario || null,
      notas: form.notas || null
    }).select().single()

    if (fum) {
      await supabase.from('fumigacion_bloques').insert(
        form.bloques_ids.map(b => ({ fumigacion_id: fum.id, bloque_id: b }))
      )

      const prods = form.productos_form.filter(p => p.producto_id)
      if (prods.length > 0) {
        await supabase.from('fumigacion_productos').insert(
          prods.map(p => ({ fumigacion_id: fum.id, producto_id: p.producto_id, dosis: p.dosis || null }))
        )

        for (const p of prods) {
          if (!p.producto_id || !p.dosis) continue
          const dosisParsed = parsearDosis(p.dosis)
          if (dosisParsed <= 0) continue
          const producto = productos.find(x => x.id === p.producto_id)
          if (!producto) continue
          const nuevoStock = Math.max(0, Number(producto.stock_actual) - dosisParsed)
          await supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', p.producto_id)
        }
      }
    }

    await fetchFumigaciones()
    await fetchProductos()
    setSaving(false)
    setModal(false)
    setForm({ tipo:'fumigacion', fecha:'', campo_id:'', bloques_ids:[], operario:'', productos_form:[{ producto_id:'', dosis:'' }], notas:'' })
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return
    await supabase.from('fumigaciones').delete().eq('id', id)
    setDetalle(null)
    fetchFumigaciones()
  }

  const fumisFiltradas = filtro === 'todos' ? fumigaciones : fumigaciones.filter(f => f.tipo === filtro)

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Control fitosanitario</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Fumigaciones</div>
          </div>
          <button onClick={() => setModal(true)} style={{ width:40, height:40, borderRadius:14, background:'#0a0a0a', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', marginTop:2 }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
          {[['todos','Todos'],['fumigacion','Fumigación'],['fertiriego','Fertiriego'],['foliar','Foliar']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#0a0a0a' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 14px 100px' }}>
        {fumisFiltradas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin registros</div>
        ) : fumisFiltradas.map(f => {
          const tipo = TIPOS[f.tipo] || TIPOS.fumigacion
          const bloquesCodes = f.fumigacion_bloques?.map(fb => fb.bloques?.codigo).filter(Boolean).join(', ')
          return (
            <div key={f.id} onClick={() => setDetalle(f)} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8, cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${tipo.icon}`} style={{ fontSize:16, color:tipo.color }} aria-hidden="true"></i>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a' }}>{tipo.label}</div>
                  <div style={{ fontSize:10, color:'#9a9a9a', marginTop:1 }}>{f.fecha}{f.operario ? ' · ' + f.operario : ''}</div>
                </div>
                <div style={{ fontSize:11, color:'#9a9a9a' }}>{f.campos?.nombre}</div>
                <i className="ti ti-chevron-right" style={{ fontSize:14, color:'#d0d0d0' }} aria-hidden="true"></i>
              </div>
              {bloquesCodes && <div style={{ fontSize:11, color:'#555', marginTop:8 }}>Bloques: {bloquesCodes}</div>}
            </div>
          )
        })}
      </div>

      {/* DETALLE de fumigación */}
      {detalle && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setDetalle(null)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'85vh', overflowY:'auto' }}>
            {(() => {
              const tipo = TIPOS[detalle.tipo] || TIPOS.fumigacion
              const bloquesCodes = detalle.fumigacion_bloques?.map(fb => fb.bloques?.codigo).filter(Boolean).join(', ')
              return <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className={`ti ${tipo.icon}`} style={{ fontSize:18, color:tipo.color }} aria-hidden="true"></i>
                  </div>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a' }}>{tipo.label}</div>
                    <div style={{ fontSize:11, color:'#9a9a9a' }}>{detalle.campos?.nombre}</div>
                  </div>
                </div>

                <div style={{ background:'#fff', borderRadius:16, padding:'12px 16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                    <div style={{ fontSize:12, color:'#9a9a9a' }}>Fecha</div>
                    <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{detalle.fecha}</div>
                  </div>
                  {detalle.operario && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a' }}>Operario</div>
                      <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{detalle.operario}</div>
                    </div>
                  )}
                  {bloquesCodes && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a' }}>Bloques</div>
                      <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a', textAlign:'right', maxWidth:'60%' }}>{bloquesCodes}</div>
                    </div>
                  )}
                  {detalle.notas && (
                    <div style={{ padding:'8px 0' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Notas</div>
                      <div style={{ fontSize:12, color:'#0a0a0a' }}>{detalle.notas}</div>
                    </div>
                  )}
                </div>

                {detalle.fumigacion_productos?.length > 0 && (
                  <div style={{ background:'#fff', borderRadius:16, padding:'12px 16px', marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#9a9a9a', marginBottom:8 }}>PRODUCTOS USADOS</div>
                    {detalle.fumigacion_productos.map(fp => (
                      <div key={fp.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                        <div style={{ fontSize:13, color:'#0a0a0a' }}>{fp.productos?.nombre}</div>
                        <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>{fp.dosis || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => eliminar(detalle.id)} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:13, color:'#c84040', cursor:'pointer', marginBottom:8 }}>Eliminar registro</button>
                <button onClick={() => setDetalle(null)} style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cerrar</button>
              </>
            })()}
          </div>
        </div>
      )}

      {/* FORMULARIO nuevo registro */}
      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Nuevo registro</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Tipo</div>
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {Object.entries(TIPOS).map(([k,v]) => (
                <button key={k} onClick={() => setForm(f => ({...f, tipo:k}))} style={{ flex:1, padding:9, borderRadius:12, border:'1px solid #e8e6e2', fontSize:11, fontWeight:600, cursor:'pointer', background: form.tipo===k ? '#0a0a0a' : '#fff', color: form.tipo===k ? '#fff' : '#555' }}>{v.label}</button>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha *</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Campo</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.campo_id} onChange={e => { setForm(f => ({...f, campo_id:e.target.value, bloques_ids:[]})); fetchBloques(e.target.value) }}>
              <option value="">Seleccioná campo...</option>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {bloques.length > 0 && <>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloques tratados * (seleccioná uno o más)</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                {bloques.map(b => (
                  <div key={b.id} onClick={() => toggleBloque(b.id)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', background: form.bloques_ids.includes(b.id) ? '#0a0a0a' : '#fff', color: form.bloques_ids.includes(b.id) ? '#fff' : '#555', border:'1px solid #e8e6e2' }}>{b.codigo}</div>
                ))}
              </div>
            </>}
            {operarios.length > 0 && <>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Operario</div>
              <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.operario} onChange={e => setForm(f => ({...f, operario:e.target.value}))}>
                <option value="">Sin asignar</option>
                {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
              </select>
            </>}
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Productos usados <span style={{ color:'#2d6a2d' }}>(la dosis descontará el stock automáticamente)</span></div>
            {form.productos_form.map((pf, i) => {
              const prod = productos.find(p => p.id === pf.producto_id)
              return (
                <div key={i} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <select style={{ flex:2, padding:'9px 12px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }} value={pf.producto_id} onChange={e => { const np = [...form.productos_form]; np[i].producto_id=e.target.value; setForm(f => ({...f, productos_form:np})) }}>
                      <option value="">Producto...</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <input style={{ flex:1, padding:'9px 12px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }} value={pf.dosis} onChange={e => { const np = [...form.productos_form]; np[i].dosis=e.target.value; setForm(f => ({...f, productos_form:np})) }} placeholder={prod ? `Dosis (${prod.unidad})` : 'Dosis'}/>
                  </div>
                  {prod && (
                    <div style={{ fontSize:10, color: prod.stock_actual <= prod.stock_minimo ? '#e07b00' : '#2d6a2d', marginTop:3, paddingLeft:4 }}>
                      Stock disponible: {Number(prod.stock_actual).toLocaleString()} {prod.unidad}
                    </div>
                  )}
                </div>
              )
            })}
            <button onClick={() => setForm(f => ({...f, productos_form:[...f.productos_form,{producto_id:'',dosis:''}]}))} style={{ width:'100%', padding:9, borderRadius:12, border:'1px dashed #e8e6e2', background:'transparent', fontSize:12, color:'#9a9a9a', cursor:'pointer', marginBottom:12 }}>+ Agregar producto</button>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Notas</div>
            <textarea style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16, minHeight:60, resize:'vertical' }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#0a0a0a', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar registro'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
