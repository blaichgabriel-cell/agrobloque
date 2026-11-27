import { Modal } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { useCan } from '../lib/RoleContext'
import UnifiedFormModal, { ModalSection, ModalField, ModalGroup, ChoiceChips, resumenPie } from '../components/UnifiedFormModal'
import { toast } from 'sonner'

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
  const can = useCan('compradores')
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
  const [compradores, setCompradores] = useState([])
  const [historial, setHistorial] = useState({})
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchCompradores() }, [])

  const fetchCompradores = async () => {
    const { data, error:consultaError } = await supabase.from('compradores').select('*').order('nombre')
    if (consultaError) { setError('No se pudieron cargar los compradores. Revisá la conexión e intentá nuevamente.'); return }
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
    if (!form.nombre.trim()) { setError('Escribí el nombre del comprador.'); return }
    setSaving(true); setError('')
    const payload = { nombre:form.nombre.trim(), tipo:form.tipo, telefono:form.telefono||null, notas:form.notas||null }
    const { error:guardarError } = form.id
      ? await supabase.from('compradores').update(payload).eq('id', form.id)
      : await supabase.from('compradores').insert(payload)
    if (guardarError) { setError(`No se pudo guardar el comprador: ${guardarError.message || 'revisá la conexión.'}`); setSaving(false); return }
    await fetchCompradores(); setSaving(false); setModal(false); setForm({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' })
    toast.success(form.id ? 'Comprador actualizado' : 'Comprador registrado', { description: payload.nombre })
  }

  const eliminar = (c) => {
    setConfirmar({ nombre: c.nombre, fn: async () => {
      setError('')
      const { error:eliminarError } = await supabase.from('compradores').delete().eq('id', c.id)
      if (eliminarError) { setError(`No se pudo eliminar el comprador: ${eliminarError.message || 'revisá si tiene ventas vinculadas.'}`); setConfirmar(null); return }
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

  return (
    <div className="ag-page ui-c1c124">
      {confirmar && <ModalConfirm nombre={confirmar.nombre} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      {error && <div className="ag-feedback ag-feedback-error" role="alert">{error}</div>}

      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-f46979">
          <div>
            <div className="ui-476525">Ventas</div>
            <div className="ag-page-title ui-136b85">Compradores</div>
          </div>
          {can.create && <button className="ui-56054f" aria-label="Agregar registro" onClick={() => { setError(''); setForm({ nombre:'', tipo:'Mayorista', telefono:'', notas:'' }); setModal(true) }}>
            <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
          </button>}
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
              <div className="ui-38997f" role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => setExpandido(isOpen ? null : c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandido(isOpen ? null : c.id) } }}>
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
                    {can.edit && <button className="ag-small-action ui-80b205" onClick={() => { setError(''); setForm({...c}); setModal(true) }}>Editar</button>}
                    {can.delete && <button className="ag-small-action ui-ea5cb1" onClick={() => eliminar(c)}>Eliminar</button>}
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

      <UnifiedFormModal
        open={modal}
        tone="finanzas"
        icon="ti-building-store"
        eyebrow={form.id ? 'Editar comprador' : 'Ventas'}
        title={form.id ? 'Editar comprador' : 'Nuevo comprador'}
        label={form.id ? 'Editar comprador' : 'Nuevo comprador'}
        busy={saving}
        onClose={() => setModal(false)}
        onSubmit={guardar}
        submitLabel={form.id ? 'Guardar cambios' : 'Guardar comprador'}
        error={modal ? error : ''}
        summary={resumenPie([
          { solo: form.nombre.trim() },
          { solo: form.tipo },
        ]) || 'Escribí el nombre del comprador'}
      >{() => <>
        <ModalSection title="Comprador" icon="ti-building-store">
          <ModalField label="Nombre *"><input className="apple-control" data-autofocus value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Mercado Central" /></ModalField>
          <ModalGroup label="Tipo">
            <ChoiceChips wrap label="Tipo de comprador" value={form.tipo} onChange={tipo => setForm(f => ({ ...f, tipo }))} options={TIPOS.map(t => ({ value:t, label:t }))} />
          </ModalGroup>
          <ModalField label="Teléfono"><input className="apple-control apple-control--num" type="tel" inputMode="tel" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono:e.target.value }))} placeholder="Ej: 0981 000 000" /></ModalField>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(form.notas)} badge={form.notas ? '' : 'notas'}>
          <ModalField label="Notas"><textarea className="apple-control" value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones…" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>
    </div>
  )
}
