import React, { useState, useEffect } from 'react'
import { guestToken, supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const TIPOS = {
  fumigacion: { label:'Fumigacion', icon:'ti-spray',   color:'#e07b00', bg:'#fff3e8' },
  fertiriego:  { label:'Fertiriego', icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  foliar:      { label:'Foliar',     icon:'ti-leaf',    color:'#212121', bg:'#eeeeee' },
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

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>Eliminar registro</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>Esta accion no se puede deshacer.</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

const formatFechaLabel = (fecha) => {
  const d = new Date(fecha + 'T00:00:00')
  return d.toLocaleDateString('es-PY', { weekday:'long', day:'numeric', month:'long' })
}

export default function Fumigaciones() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
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
    tanques_cantidad:'',
    tanque_litros:'',
    productos_form:[{ producto_id:'', cantidad:'', unidad_uso:'g' }],
    notas:'',
  })
  const [form, setForm] = useState(formVacio())
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const isGuest = Boolean(guestToken)

  useEffect(() => { fetchFumigaciones(); fetchCampos(); fetchProductos() }, [])

  const fetchFumigaciones = async () => {
    const { data } = await supabase.from('fumigaciones')
      .select('*, campos(nombre), fumigacion_bloques(cultivo_snapshot, plantacion_id_snapshot, bloques(codigo, plantaciones(id, activa, cultivos(nombre)))), fumigacion_productos(*, productos(nombre, carencia_dias))')
      .order('fecha', { ascending:false })
    setFumigaciones(data || [])
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
    const { data } = await supabase.from('productos').select('*').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const toggleBloque = (id) => setForm(f => ({ ...f, bloques_ids: f.bloques_ids.includes(id) ? f.bloques_ids.filter(x=>x!==id) : [...f.bloques_ids, id] }))

  const guardar = async () => {
    if (!form.fecha || form.bloques_ids.length === 0) return
    setSaving(true)
    const { data: fum } = await supabase.from('fumigaciones').insert({
      campo_id: form.campo_id || null, tipo: form.tipo, fecha: form.fecha,
      operario: form.operario || null,
      tanques_cantidad: Number(form.tanques_cantidad) || null,
      tanque_litros: Number(form.tanque_litros) || null,
      notas: form.notas || null
    }).select().single()
    if (fum) {
      await registrarAuditoria({ accion:'Registro fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:fum.id, detalle:`${form.tipo} - ${form.fecha}` })
      await supabase.from('fumigacion_bloques').insert(form.bloques_ids.map(b => {
        const bloque = bloques.find(x => x.id === b)
        return {
          fumigacion_id: fum.id,
          bloque_id: b,
          cultivo_snapshot: getCultivoBloque(bloque) || null,
          plantacion_id_snapshot: getPlantacionActivaId(bloque),
        }
      }))
      const prods = form.productos_form.filter(p => p.producto_id && p.cantidad)
      if (prods.length > 0) {
        await supabase.from('fumigacion_productos').insert(prods.map(p => {
          const prod = productos.find(x => x.id === p.producto_id)
          const descuento = convertirAStock(p.cantidad, p.unidad_uso, prod?.unidad)
          return {
            fumigacion_id: fum.id,
            producto_id: p.producto_id,
            dosis: `${p.cantidad} ${p.unidad_uso}`,
            cantidad: Number(String(p.cantidad || '').replace(',', '.')) || null,
            unidad_uso: p.unidad_uso || null,
            descuento_stock: descuento === null ? null : descuento,
          }
        }))
        for (const p of prods) {
          const prod = productos.find(x => x.id === p.producto_id)
          if (!prod) continue
          const descuento = convertirAStock(p.cantidad, p.unidad_uso, prod.unidad)
          if (!descuento || descuento <= 0) continue
          await supabase.from('productos').update({ stock_actual: Math.max(0, Number(prod.stock_actual) - descuento) }).eq('id', p.producto_id)
        }
      }
    }
    await fetchFumigaciones(); await fetchProductos()
    setSaving(false); setModal(false)
    setForm(formVacio())
  }

  const eliminar = (id) => {
    setConfirmar({ fn: async () => {
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
        await supabase
          .from('productos')
          .update({ stock_actual: item.stock_actual + item.devolver })
          .eq('id', item.producto_id)
      }

      await supabase.from('fumigaciones').delete().eq('id', id)
      await registrarAuditoria({ accion:'Elimino fumigacion', modulo:'Fumigaciones', tabla:'fumigaciones', registroId:id })
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
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Control fitosanitario</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Fumigaciones</div>
          </div>
          {!isGuest && (
            <button onClick={() => setModal(true)} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
            </button>
          )}
        </div>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
          {[['todos','Todos'],['fumigacion','Fumigacion'],['fertiriego','Fertiriego'],['foliar','Foliar']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#212121' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 14px 100px' }}>
        {fechasOrdenadas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin registros</div>
        ) : fechasOrdenadas.map(fecha => (
          <div key={fecha}>
            {/* Separador de fecha */}
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0 8px' }}>
              <div style={{ height:1, flex:1, background:'#e0ddd8' }}></div>
              <div style={{ fontSize:11, fontWeight:600, color:'#212121', textTransform:'capitalize', whiteSpace:'nowrap' }}>
                {formatFechaLabel(fecha)}
              </div>
              <div style={{ height:1, flex:1, background:'#e0ddd8' }}></div>
            </div>

            {porFecha[fecha].map(f => {
              const tipo = TIPOS[f.tipo] || TIPOS.fumigacion
              const bloquesCodes = getBloquesConCultivo(f)
              const nombresProductos = f.fumigacion_productos?.map(fp => fp.productos?.nombre).filter(Boolean).join(' + ')
              const carencia = getCarencia(f)
              const tanques = f.tanques_cantidad && f.tanque_litros ? `${fmtCantidad(f.tanques_cantidad)} tanque${Number(f.tanques_cantidad) === 1 ? '' : 's'} x ${fmtCantidad(f.tanque_litros)} L` : ''

              return (
                <div key={f.id} onClick={() => setDetalle(f)} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom:8, cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:38, height:38, borderRadius:11, background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <i className={`ti ${tipo.icon}`} style={{ fontSize:18, color:tipo.color }} aria-hidden="true"></i>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <span style={{ fontSize:10, fontWeight:600, color:tipo.color, background:tipo.bg, padding:'2px 8px', borderRadius:20 }}>{tipo.label}</span>
                        {f.campos?.nombre && <span style={{ fontSize:10, color:'#9a9a9a' }}>{f.campos.nombre}</span>}
                        {tanques && <span style={{ fontSize:10, color:'#9a9a9a' }}>· {tanques}</span>}
                        {carencia && <span style={{ fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:6, background:'#fff3e8', color:'#c8700a' }}>{carencia}d carencia</span>}
                      </div>
                      {nombresProductos && (
                        <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a', marginBottom:2 }}>{nombresProductos}</div>
                      )}
                      <div style={{ display:'flex', gap:8 }}>
                        {bloquesCodes && <div style={{ fontSize:11, color:'#9a9a9a' }}>Bloques: {bloquesCodes}</div>}
                        {f.operario && <div style={{ fontSize:11, color:'#9a9a9a' }}>· {f.operario}</div>}
                      </div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize:14, color:'#d0d0d0' }} aria-hidden="true"></i>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <NotasPanel modulo="fumigaciones" titulo="Blog de notas de fumigaciones" />
      </div>

      {/* Detalle */}
      {detalle && (
        <div style={{
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
          overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
        }} onClick={e => e.target===e.currentTarget && setDetalle(null)}>
          <div style={{
            background:'#f2f1ef',
            borderRadius: isDesktop ? 24 : '24px 24px 0 0',
            width:'100%',
            maxWidth:480,
            padding:'24px 20px 40px',
            maxHeight: isDesktop ? 'calc(100vh - 96px)' : '85vh',
            overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
            boxShadow: isDesktop ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
          }}>
            {(() => {
              const tipo = TIPOS[detalle.tipo] || TIPOS.fumigacion
              const bloquesCodes = getBloquesConCultivo(detalle)
              const carencia = getCarencia(detalle)
              return <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:tipo.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className={`ti ${tipo.icon}`} style={{ fontSize:18, color:tipo.color }} aria-hidden="true"></i>
                  </div>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a' }}>{tipo.label}</div>
                    <div style={{ fontSize:11, color:'#9a9a9a' }}>{detalle.campos?.nombre} · {detalle.fecha}</div>
                  </div>
                  {carencia && (
                    <div style={{ marginLeft:'auto', padding:'4px 12px', borderRadius:10, background:'#fff3e8', fontSize:11, fontWeight:600, color:'#c8700a' }}>
                      {carencia} dias carencia
                    </div>
                  )}
                </div>
                <div style={{ background:'#fff', borderRadius:16, padding:'12px 16px', marginBottom:10 }}>
                  {[
                    ['Fecha', detalle.fecha],
                    detalle.operario && ['Operario', detalle.operario],
                    bloquesCodes && ['Bloques', bloquesCodes],
                    detalle.tanques_cantidad && detalle.tanque_litros && ['Tanques', `${fmtCantidad(detalle.tanques_cantidad)} x ${fmtCantidad(detalle.tanque_litros)} L`],
                    detalle.notas && ['Notas', detalle.notas]
                  ].filter(Boolean).map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a' }}>{k}</div>
                      <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a', textAlign:'right', maxWidth:'60%' }}>{v}</div>
                    </div>
                  ))}
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
                {!isGuest && <button onClick={() => eliminar(detalle.id)} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:13, color:'#c84040', cursor:'pointer', marginBottom:8 }}>Eliminar registro</button>}
                <button onClick={() => setDetalle(null)} style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cerrar</button>
              </>
            })()}
          </div>
        </div>
      )}

      {/* Modal nuevo */}
      {modal && (
        <div style={{
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
          overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
        }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{
            background:'#f2f1ef',
            borderRadius: isDesktop ? 24 : '24px 24px 0 0',
            width:'100%',
            maxWidth:480,
            padding:'24px 20px 40px',
            maxHeight: isDesktop ? 'calc(100vh - 96px)' : '90vh',
            overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
            boxShadow: isDesktop ? '0 24px 70px rgba(0,0,0,0.24)' : 'none',
          }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Nuevo registro</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Tipo</div>
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {Object.entries(TIPOS).map(([k,v]) => (
                <button key={k} onClick={() => setForm(f=>({...f,tipo:k}))} style={{ flex:1, padding:9, borderRadius:12, border:'1px solid #e8e6e2', fontSize:11, fontWeight:600, cursor:'pointer', background: form.tipo===k ? '#212121' : '#fff', color: form.tipo===k ? '#fff' : '#555' }}>{v.label}</button>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha *</div>
            <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12, boxSizing:'border-box' }} type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Campo</div>
            <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.campo_id} onChange={e=>{setForm(f=>({...f,campo_id:e.target.value,bloques_ids:[]}));fetchBloques(e.target.value)}}>
              <option value="">Selecciona campo...</option>
              {campos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {bloques.length > 0 && <>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Bloques tratados *</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                {bloques.map(b=>(
                  <div key={b.id} onClick={()=>toggleBloque(b.id)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:500, cursor:'pointer', background: form.bloques_ids.includes(b.id) ? '#212121' : '#fff', color: form.bloques_ids.includes(b.id) ? '#fff' : '#555', border:'1px solid #e8e6e2' }}>{b.codigo}</div>
                ))}
              </div>
            </>}
            {operarios.length > 0 && <>
              <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Operario</div>
              <select style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }} value={form.operario} onChange={e=>setForm(f=>({...f,operario:e.target.value}))}>
                <option value="">Sin asignar</option>
                {operarios.map(o=><option key={o.id} value={o.nombre}>{o.nombre}</option>)}
              </select>
            </>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cantidad de tanques</div>
                <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', boxSizing:'border-box' }} type="number" min="0" value={form.tanques_cantidad} onChange={e=>setForm(f=>({...f,tanques_cantidad:e.target.value}))} placeholder="Ej: 3"/>
              </div>
              <div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Litros por tanque</div>
                <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', boxSizing:'border-box' }} type="number" min="0" value={form.tanque_litros} onChange={e=>setForm(f=>({...f,tanque_litros:e.target.value}))} placeholder="Ej: 20"/>
              </div>
            </div>
            {form.tanques_cantidad && form.tanque_litros && (
              <div style={{ fontSize:11, color:'#555', margin:'-6px 0 12px', paddingLeft:4 }}>
                Total preparado: {fmtCantidad((Number(form.tanques_cantidad) || 0) * (Number(form.tanque_litros) || 0))} L
              </div>
            )}
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Productos <span style={{ color:'#212121' }}>(descuenta stock automaticamente)</span></div>
            {form.productos_form.map((pf,i)=>{
              const prod = productos.find(p=>p.id===pf.producto_id)
              const descuento = prod ? convertirAStock(pf.cantidad, pf.unidad_uso, prod.unidad) : 0
              return (
                <div key={i} style={{ marginBottom:8 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1.5fr .75fr .75fr', gap:6 }}>
                    <select style={{ minWidth:0, padding:'9px 12px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }} value={pf.producto_id} onChange={e=>{const prodSel=productos.find(p=>p.id===e.target.value); const np=[...form.productos_form];np[i].producto_id=e.target.value;np[i].unidad_uso=unidadUsoDefault(prodSel?.unidad);setForm(f=>({...f,productos_form:np}))}}>
                      <option value="">Producto...</option>
                      {productos.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <input style={{ minWidth:0, padding:'9px 12px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }} value={pf.cantidad} onChange={e=>{const np=[...form.productos_form];np[i].cantidad=e.target.value;setForm(f=>({...f,productos_form:np}))}} placeholder="Cant." inputMode="decimal"/>
                    <select style={{ minWidth:0, padding:'9px 8px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }} value={pf.unidad_uso} onChange={e=>{const np=[...form.productos_form];np[i].unidad_uso=e.target.value;setForm(f=>({...f,productos_form:np}))}}>
                      {UNIDADES_USO.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {prod && <div style={{ fontSize:10, color: prod.stock_actual<=prod.stock_minimo?'#e07b00':'#212121', marginTop:3, paddingLeft:4 }}>
                    Stock: {formatearStock(prod.stock_actual, prod.unidad)}
                    {descuento === null ? ' · medida incompatible con el stock' : descuento > 0 ? ` · descuenta ${fmtCantidad(descuento)} ${prod.unidad}` : ''}
                    {prod.carencia_dias>0?` · ${prod.carencia_dias}d carencia`:''}
                  </div>}
                </div>
              )
            })}
            <button onClick={()=>setForm(f=>({...f,productos_form:[...f.productos_form,{producto_id:'',cantidad:'',unidad_uso:'g'}]}))} style={{ width:'100%', padding:9, borderRadius:12, border:'1px dashed #e8e6e2', background:'transparent', fontSize:12, color:'#9a9a9a', cursor:'pointer', marginBottom:12 }}>+ Agregar producto</button>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Notas</div>
            <textarea style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:16, minHeight:60, resize:'vertical', boxSizing:'border-box' }} value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Observaciones..."/>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving?'Guardando...':'Guardar registro'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={()=>setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
