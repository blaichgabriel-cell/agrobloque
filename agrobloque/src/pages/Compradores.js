import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'

const TIPOS = ['Mayorista','Mercado','Particular','Exportador','Otro']

function ModalConfirm({ nombre, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>¿Eliminar comprador?</div>
        <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>"{nombre}" y su historial serán eliminados.</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function Compradores() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [compradores, setCompradores] = useState([])
  const [historial, setHistorial] = useState({})
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [expandido, setExpandido] = useState(null)

  useEffect(() => { fetchCompradores() }, [])

  const fetchCompradores = async () => {
    const { data } = await supabase.from('compradores').select('*').order('nombre')
    setCompradores(data || [])
    if (data?.length > 0) fetchHistorial(data)
  }

  const fetchHistorial = async (comps) => {
    const ids = comps.map(c => c.id)
    const { data } = await supabase
      .from('cosechas')
      .select('comprador_id, kg_total, precio_kg, fecha, bloques(codigo, plantaciones(cultivos(nombre), activa))')
      .in('comprador_id', ids)
      .order('fecha', { ascending: false })

    const mapa = {}
    ;(data || []).forEach(c => {
      if (!mapa[c.comprador_id]) mapa[c.comprador_id] = []
      mapa[c.comprador_id].push(c)
    })
    setHistorial(mapa)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    if (form.id) {
      await supabase.from('compradores').update({ nombre:form.nombre, tipo:form.tipo, telefono:form.telefono||null, notas:form.notas||null }).eq('id', form.id)
    } else {
      await supabase.from('compradores').insert({ nombre:form.nombre, tipo:form.tipo, telefono:form.telefono||null, notas:form.notas||null })
    }
    await fetchCompradores(); setSaving(false); setModal(false)
    setForm({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' })
  }

  const eliminar = (c) => {
    setConfirmar({ nombre: c.nombre, fn: async () => {
      await supabase.from('compradores').delete().eq('id', c.id)
      setConfirmar(null); fetchCompradores()
    }})
  }

  const getStats = (id) => {
    const h = historial[id] || []
    const kg = h.reduce((s, c) => s + Number(c.kg_total), 0)
    const ingresos = h.reduce((s, c) => s + Number(c.kg_total) * Number(c.precio_kg || 0), 0)
    const precios = h.filter(c => c.precio_kg > 0).map(c => Number(c.precio_kg))
    const precioProm = precios.length > 0 ? Math.round(precios.reduce((s, p) => s + p, 0) / precios.length) : 0
    return { kg, ingresos, precioProm, operaciones: h.length }
  }

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:12 }
  const lblStyle = { fontSize:10, color:'#9a9a9a', marginBottom:6, display:'block' }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm nombre={confirmar.nombre} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div style={{ background:'#f2f1ef', padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Ventas</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Compradores</div>
          </div>
          <button onClick={() => { setForm({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' }); setModal(true) }} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        {compradores.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>
            Sin compradores registrados.<br/>
            <span style={{ fontSize:11 }}>Agregá compradores para asignarlos en cada cosecha.</span>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {compradores.map(c => {
          const stats = getStats(c.id)
          const isOpen = expandido === c.id
          return (
            <div key={c.id} style={{ background:'#fff', borderRadius:20, padding:'14px 16px', marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={() => setExpandido(isOpen ? null : c.id)}>
                <div style={{ width:40, height:40, borderRadius:12, background:'#eeeeee', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className="ti ti-building-store" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{c.nombre}</div>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginTop:1 }}>{c.tipo}{c.telefono ? ' · ' + c.telefono : ''}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  {stats.operaciones > 0 ? (
                    <>
                      <div style={{ fontSize:13, fontWeight:700, color:'#212121' }}>{stats.kg.toLocaleString()} kg</div>
                      <div style={{ fontSize:10, color:'#9a9a9a' }}>{stats.operaciones} operaciones</div>
                    </>
                  ) : (
                    <div style={{ fontSize:11, color:'#c0c0c0' }}>Sin historial</div>
                  )}
                </div>
                <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize:14, color:'#d0d0d0' }} aria-hidden="true"></i>
              </div>

              {isOpen && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #f2f1ef' }}>
                  {stats.operaciones > 0 && (
                    <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                      <div style={{ flex:1, background:'#f2f1ef', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:3 }}>Total kg</div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a' }}>{stats.kg.toLocaleString()}</div>
                      </div>
                      <div style={{ flex:1, background:'#eeeeee', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:3 }}>Precio prom</div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#212121' }}>Gs. {stats.precioProm.toLocaleString()}</div>
                      </div>
                      <div style={{ flex:1, background:'#f2f1ef', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:3 }}>Ingresos</div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#0a0a0a' }}>Gs. {Math.round(stats.ingresos/1000)}k</div>
                      </div>
                    </div>
                  )}

                  {/* Últimas operaciones */}
                  {(historial[c.id] || []).slice(0, 4).map((h, i) => {
                    const cultivo = h.bloques?.plantaciones?.find(p => p.activa)?.cultivos?.nombre
                    return (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f2f1ef' }}>
                        <div>
                          <div style={{ fontSize:11, color:'#0a0a0a' }}>{cultivo || 'Bloque ' + h.bloques?.codigo} · {h.kg_total} kg</div>
                          <div style={{ fontSize:10, color:'#9a9a9a' }}>{h.fecha}</div>
                        </div>
                        {h.precio_kg > 0 && <div style={{ fontSize:11, fontWeight:600, color:'#212121' }}>Gs. {Number(h.precio_kg).toLocaleString()}/kg</div>}
                      </div>
                    )
                  })}

                  <div style={{ display:'flex', gap:6, marginTop:12 }}>
                    <button onClick={() => { setForm({...c}); setModal(true) }} style={{ flex:1, padding:'8px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:12, color:'#555', cursor:'pointer' }}>Editar</button>
                    <button onClick={() => eliminar(c)} style={{ flex:1, padding:'8px', borderRadius:10, border:'1px solid #ffcccc', background:'transparent', fontSize:12, color:'#c84040', cursor:'pointer' }}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="compradores" titulo="Blog de notas de compradores" />
      </div>

      {modal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'80vh', overflowY:'auto', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{form.id ? 'Editar comprador' : 'Nuevo comprador'}</div>
            <label style={lblStyle}>Nombre *</label>
            <input style={inpStyle} value={form.nombre} onChange={e => setForm(f => ({...f, nombre:e.target.value}))} placeholder="Ej: Mercado Central"/>
            <label style={lblStyle}>Tipo</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
              {TIPOS.map(t => (
                <button key={t} onClick={() => setForm(f => ({...f, tipo:t}))} style={{ padding:'8px 14px', borderRadius:20, border:'1px solid #e8e6e2', fontSize:12, fontWeight:500, cursor:'pointer', background: form.tipo===t ? '#212121' : '#fff', color: form.tipo===t ? '#fff' : '#555' }}>{t}</button>
              ))}
            </div>
            <label style={lblStyle}>Teléfono (opcional)</label>
            <input style={inpStyle} value={form.telefono} onChange={e => setForm(f => ({...f, telefono:e.target.value}))} placeholder="Ej: 0981 000 000"/>
            <label style={lblStyle}>Notas (opcional)</label>
            <textarea style={{ ...inpStyle, minHeight:60, resize:'vertical' }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>
            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
