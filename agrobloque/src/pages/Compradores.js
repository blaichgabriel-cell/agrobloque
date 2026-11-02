import { Modal } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'

const TIPOS = ['Mayorista','Mercado','Particular','Exportador','Otro']

function ModalConfirm({ nombre, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface ui-211525">
        <div className="ui-3e43be">¿Eliminar comprador?</div>
        <div className="ui-01159a">"{nombre}" y su historial serán eliminados.</div>
        <div className="ui-9c6869">
          <button className="ag-small-action ui-395a62" onClick={onCancel}>Cancelar</button>
          <button className="ag-small-action ui-f5f413" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Compradores() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
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
    setHistorial({})
  }

  const fetchHistorial = async (comps) => {
    const ids = comps.map(c => c.id)
    const { data } = await supabase
      .from('ventas')
      .select('comprador_id, producto, kg_total, precio_kg, total, estado_cobro, monto_cobrado, fecha, bloques(codigo)')
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
    const ingresos = h.reduce((s, c) => s + (Number(c.total) || Number(c.kg_total) * Number(c.precio_kg || 0)), 0)
    const precios = h.filter(c => c.precio_kg > 0).map(c => Number(c.precio_kg))
    const precioProm = precios.length > 0 ? Math.round(precios.reduce((s, p) => s + p, 0) / precios.length) : 0
    return { kg, ingresos, precioProm, operaciones: h.length }
  }

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12 }
  const lblStyle = { fontSize:12, color:"#697970", marginBottom:6, display:'block' }

  return (
    <div className="ag-page ui-c1c124">
      {confirmar && <ModalConfirm nombre={confirmar.nombre} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-f46979">
          <div>
            <div className="ui-476525">Ventas</div>
            <div className="ag-page-title ui-136b85">Compradores</div>
          </div>
          <button className="ui-56054f" aria-label="Agregar registro" onClick={() => { setForm({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' }); setModal(true) }}>
            <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div className="ag-page-body" style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        {compradores.length === 0 ? (
          <div className="ui-5baa7a">
            Sin compradores registrados.<br/>
            <span className="ui-6b9c17">Agrega compradores para conservar sus datos de contacto.</span>
          </div>
        ) : (
          <div className="ag-record-grid ui-998b74" style={{ gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {compradores.map(c => {
          const stats = getStats(c.id)
          const isOpen = expandido === c.id
          return (
            <div className="ag-surface ui-9a7f69" key={c.id} style={{ marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
              <div className="ui-38997f" onClick={() => setExpandido(isOpen ? null : c.id)}>
                <div className="ui-f9ef33">
                  <i className="ti ti-building-store ui-b45e7d" aria-hidden="true"></i>
                </div>
                <div className="ui-da5cd6">
                  <div className="ui-788a2f">{c.nombre}</div>
                  <div className="ui-046ab9">{c.tipo}{c.telefono ? ' · ' + c.telefono : ''}</div>
                </div>
                <div className="ui-f6e3d7">
                  {stats.operaciones > 0 ? (
                    <>
                      <div className="ui-199f15">{stats.kg.toLocaleString()} kg</div>
                      <div className="ui-93a7e1">{stats.operaciones} operaciones</div>
                    </>
                  ) : (
                    <div className="ui-612696">Contacto</div>
                  )}
                </div>
                <i className={`${`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} ui-2ed188`} aria-hidden="true"></i>
              </div>

              {isOpen && (
                <div className="ui-cdbc20">
                  {stats.operaciones > 0 && (
                    <div className="ui-60e304">
                      <div className="ui-362c49">
                        <div className="ui-2ed576">Total kg</div>
                        <div className="ui-788a2f">{stats.kg.toLocaleString()}</div>
                      </div>
                      <div className="ui-e31e6d">
                        <div className="ui-2ed576">Precio prom</div>
                        <div className="ui-398ec2">Gs. {stats.precioProm.toLocaleString()}</div>
                      </div>
                      <div className="ui-362c49">
                        <div className="ui-2ed576">Ingresos</div>
                        <div className="ui-3d66b7">Gs. {Math.round(stats.ingresos/1000)}k</div>
                      </div>
                    </div>
                  )}

                  {/* Últimas operaciones */}
                  {(historial[c.id] || []).slice(0, 4).map((h, i) => {
                    return (
                      <div className="ui-34edf3" key={i}>
                        <div>
                          <div className="ui-8dc166">{h.producto || 'Venta'}{h.bloques?.codigo ? ' - Bloque ' + h.bloques.codigo : ''} · {h.kg_total} kg</div>
                          <div className="ui-93a7e1">{h.fecha}</div>
                        </div>
                        {h.precio_kg > 0 && <div className="ui-bbdbab">Gs. {Number(h.precio_kg).toLocaleString()}/kg</div>}
                      </div>
                    )
                  })}

                  <div className="ui-c49781">
                    <button className="ag-small-action ui-80b205" onClick={() => { setForm({...c}); setModal(true) }}>Editar</button>
                    <button className="ag-small-action ui-ea5cb1" onClick={() => eliminar(c)}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="compradores" titulo="Bloc de notas de compradores" />
      </div>

      {modal && (
        <Modal onClose={() => setModal(false)} label="Compradores" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-ab5655" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar comprador' : 'Nuevo comprador'}</div>
            <label style={lblStyle}>Nombre *</label>
            <input style={inpStyle} value={form.nombre} onChange={e => setForm(f => ({...f, nombre:e.target.value}))} placeholder="Ej: Mercado Central"/>
            <label style={lblStyle}>Tipo</label>
            <div className="ui-1e850e">
              {TIPOS.map(t => (
                <button className="ag-small-action ui-0b12f2" key={t} onClick={() => setForm(f => ({...f, tipo:t}))} style={{ background: form.tipo===t ? '#212121' : '#fff', color: form.tipo===t ? '#fff' : '#555' }}>{t}</button>
              ))}
            </div>
            <label style={lblStyle}>Teléfono (opcional)</label>
            <input style={inpStyle} value={form.telefono} onChange={e => setForm(f => ({...f, telefono:e.target.value}))} placeholder="Ej: 0981 000 000"/>
            <label style={lblStyle}>Notas (opcional)</label>
            <textarea className="ui-dc8f36" style={{ ...inpStyle }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>
            <button className="ag-small-action ui-17d991" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
