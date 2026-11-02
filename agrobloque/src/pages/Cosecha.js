import { Modal, FormHeading, Notice, Skeleton } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const parsearKg = (v) => { const n = parseFloat(String(v || '').replace(',','.')); return isNaN(n) ? 0 : n }
const fmtKg = (n) => { const num = Number(n)||0; return num % 1 === 0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY', {minimumFractionDigits:1, maximumFractionDigits:2}) }
const fechaLocal = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface ui-211525">
        <div className="ui-3e43be">¿Eliminar registro?</div>
        <div className="ui-01159a">Esta acción no se puede deshacer.</div>
        <div className="ui-9c6869">
          <button className="ag-small-action ui-395a62" onClick={onCancel}>Cancelar</button>
          <button className="ag-small-action ui-f5f413" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </Modal>
  )
}

const fechaPlantacion = (p) => p?.fecha_siembra || (p?.created_at || '').slice(0, 10)

const elegirPlantacionParaCosecha = (plantaciones = [], fechaCosecha = '') => {
  const lista = Array.isArray(plantaciones) ? plantaciones : []
  if (lista.length === 0) return null

  const anteriores = fechaCosecha
    ? lista.filter(p => {
      const fecha = fechaPlantacion(p)
      return fecha && fecha <= fechaCosecha
    })
    : []

  const candidatas = anteriores.length > 0
    ? anteriores
    : lista.filter(p => p.activa) || lista

  return [...(candidatas.length > 0 ? candidatas : lista)]
    .sort((a, b) => fechaPlantacion(b).localeCompare(fechaPlantacion(a)))[0]
}

const getCultivoCosecha = (cosecha) => {
  const plantacion = elegirPlantacionParaCosecha(cosecha?.bloques?.plantaciones, cosecha?.fecha)
  return plantacion?.cultivos?.nombre || 'Sin cultivo'
}

const getCultivoBloque = (bloque, fecha) => {
  const plantacion = elegirPlantacionParaCosecha(bloque?.plantaciones, fecha)
  return plantacion?.cultivos?.nombre || ''
}

const calidadLabel = (calidad) => calidad === 'primera'
  ? '1ra calidad'
  : calidad === 'segunda'
    ? '2da calidad'
    : 'Mixta'

function ModalDetalle({ cosecha, onClose, onEdit, onDelete }) {
  const cultivo = getCultivoCosecha(cosecha)
  const item = { display:'flex', justifyContent:'space-between', gap:16, padding:'11px 0', borderBottom:'1px solid #eeeeee' }
  const label = { fontSize:12, color:'#8d938d' }
  const value = { fontSize:13, fontWeight:700, color:'#111' }

  return (
    <Modal onClose={onClose} label="Cosecha" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:150, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="ag-surface ui-74f274" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
        <div className="ui-65048f">
          <div>
            <div className="ui-de5560">Detalle de cosecha</div>
            <div className="ui-882dd8">{cultivo}</div>
            <div className="ui-1301e2">Bloque {cosecha.bloques?.codigo} · {cosecha.fecha}</div>
          </div>
          <button className="ui-4f781a" aria-label="Cerrar" onClick={onClose}>
            <i className="ti ti-x ui-bf83cf" aria-hidden="true"></i>
          </button>
        </div>

        <div className="ui-1a76a0">
          <div className="ui-946af5">
            <div className="ui-57250f">Kilos</div>
            <div className="ag-page-title ui-0bef41">{fmtKg(cosecha.kg_total)} kg</div>
          </div>
          <div className="ui-b9340b">
            <div className="ui-de5560">Calidad</div>
            <div className="ui-94f9c9">{calidadLabel(cosecha.calidad)}</div>
          </div>
        </div>

        <div className="ui-7d9b35">
          <div style={item}><span style={label}>Producto/cultivo</span><span style={value}>{cultivo}</span></div>
          <div style={item}><span style={label}>Campo</span><span style={value}>{cosecha.bloques?.campos?.nombre || '-'}</span></div>
          <div style={item}><span style={label}>Bloque</span><span style={value}>{cosecha.bloques?.codigo || '-'}</span></div>
          <div style={item}><span style={label}>Calidad</span><span style={value}>{calidadLabel(cosecha.calidad)}</span></div>
          <div className="ui-310b5d" style={{ ...item }}><span style={label}>Uso</span><span style={value}>Produccion del bloque</span></div>
        </div>

        {cosecha.notas && (
          <div className="ui-1fe1de">
            {cosecha.notas}
          </div>
        )}

        <div className="ui-f56ef1">
          <button className="ag-small-action ui-8c497d" onClick={onEdit}>
            Editar cosecha
          </button>
          <button className="ag-small-action ui-432170" onClick={onDelete}>
            Eliminar
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Cosecha() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
  const [cosechas, setCosechas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [modal, setModal] = useState(false)
  const [modoMultiple, setModoMultiple] = useState(false)
  const [filasCosecha, setFilasCosecha] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [form, setForm] = useState({ bloque_id:'', fecha:fechaLocal(), kg_total:'', precio_kg:'', calidad:'primera', comprador_id:'', notas:'' })
  const [saving, setSaving] = useState(false)
  const [campoFiltro, setCampoFiltro] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchCampos(); fetchCosechas() }, [])
  useEffect(() => { if (campoFiltro) fetchBloques(campoFiltro) }, [campoFiltro])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const campoQr = params?.get('campo') || ''
      const bloqueQr = params?.get('bloque') || ''
      const abrirQr = params?.get('nuevo') === '1' && campoQr && bloqueQr
      const campoInicial = abrirQr && data.some(c => c.id === campoQr) ? campoQr : data[0].id
      setCampoFiltro(campoInicial)
      if (abrirQr) {
        await fetchBloques(campoInicial)
        limpiarForm()
        setForm(f => ({ ...f, bloque_id:bloqueQr }))
        setModoMultiple(false)
        setModal(true)
      }
    }
  }
  const fetchCosechas = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('cosechas')
      .select('*, bloques(codigo, campos(nombre), plantaciones(cultivos(nombre), activa, created_at, fecha_siembra))')
      .order('fecha', { ascending: false })
    if (error) setError('Error al cargar cosechas')
    else setCosechas((data || []).filter(c => !c.anulada))
    setLoading(false)
  }
  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques')
      .select('*, plantaciones(cultivos(nombre), activa, created_at, fecha_siembra)')
      .eq('campo_id', campo_id)
      .order('codigo')
    setBloques(data || [])
  }
  const crearFilaCosecha = () => ({ bloque_id:'', kg_total:'', calidad:'primera', notas:'' })
  const limpiarForm = () => {
    setForm({ bloque_id:'', fecha:fechaLocal(), kg_total:'', precio_kg:'', calidad:'primera', comprador_id:'', notas:'' })
    setFilasCosecha([crearFilaCosecha(), crearFilaCosecha()])
  }

  const abrirNuevaCosecha = () => {
    limpiarForm()
    setModoMultiple(false)
    setModal(true)
  }

  const abrirEditarCosecha = (cosecha) => {
    const campoId = campos.find(c => c.nombre === cosecha.bloques?.campos?.nombre)?.id || campoFiltro || ''
    if (campoId) setCampoFiltro(campoId)
    setForm({
      id: cosecha.id,
      bloque_id: cosecha.bloque_id || '',
      fecha: cosecha.fecha || '',
      kg_total: cosecha.kg_total || '',
      precio_kg: cosecha.precio_kg ? Number(cosecha.precio_kg).toLocaleString('es-PY') : '',
      calidad: cosecha.calidad || 'primera',
      comprador_id: cosecha.comprador_id || '',
      notas: cosecha.notas || ''
    })
    setDetalle(null)
    setModoMultiple(false)
    setModal(true)
  }

  const actualizarFilaCosecha = (idx, campo, valor) => {
    setFilasCosecha(prev => prev.map((fila, i) => i === idx ? { ...fila, [campo]: valor } : fila))
  }

  const agregarFilaCosecha = () => setFilasCosecha(prev => [...prev, crearFilaCosecha()])
  const quitarFilaCosecha = (idx) => setFilasCosecha(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const guardarMultiple = async () => {
    const filasValidas = filasCosecha
      .map(fila => ({
        bloque_id: fila.bloque_id,
        fecha: form.fecha,
        kg_total: parsearKg(fila.kg_total),
        precio_kg: 0,
        calidad: fila.calidad || 'primera',
        comprador_id: null,
        notas: fila.notas || form.notas || null,
      }))
      .filter(fila => fila.bloque_id && fila.fecha && fila.kg_total > 0)

    if (!form.fecha || filasValidas.length === 0) {
      setError('Cargá fecha y al menos una cosecha con bloque y kilos.')
      return
    }

    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('cosechas').insert(filasValidas)
      if (error) throw error
      await registrarAuditoria({
        accion: 'Registro lote de cosechas',
        modulo: 'Cosecha',
        tabla: 'cosechas',
        registroId: '',
        detalle: `${filasValidas.length} cosechas - ${filasValidas.reduce((s, f) => s + f.kg_total, 0)} kg`,
      })
      await fetchCosechas()
      setModal(false)
      setModoMultiple(false)
      setSuccess('Lote de cosechas guardado correctamente.')
      limpiarForm()
    } catch (e) {
      setError('Error al guardar lote: ' + e.message)
    }
    setSaving(false)
  }

  const guardar = async () => {
    if (modoMultiple && !form.id) {
      await guardarMultiple()
      return
    }
    if (!form.bloque_id || !form.fecha || !form.kg_total) return setError('Completá el bloque, la fecha y los kilos cosechados.')
    setSaving(true); setError('')
    try {
      const payload = {
        bloque_id: form.bloque_id, fecha: form.fecha,
        kg_total: parsearKg(form.kg_total),
        precio_kg: form.id ? parsearGs(form.precio_kg) : 0,
        calidad: form.calidad,
        comprador_id: form.id ? (form.comprador_id || null) : null,
        notas: form.notas || null
      }

      const { error } = form.id
        ? await supabase.from('cosechas').update(payload).eq('id', form.id)
        : await supabase.from('cosechas').insert(payload)
      if (error) throw error
      await registrarAuditoria({
        accion: form.id ? 'Edito cosecha' : 'Registro cosecha',
        modulo: 'Cosecha',
        tabla: 'cosechas',
        registroId: form.id || '',
        detalle: `${payload.kg_total} kg cosechados`,
      })
      await fetchCosechas(); setModal(false); setSuccess('Cosecha guardada correctamente.')
      limpiarForm()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    }
    setSaving(false)
  }

  const eliminar = (id) => {
    setConfirmar({ fn: async () => {
      await supabase.from('cosechas').update({ anulada:true, anulada_at:new Date().toISOString(), anulada_motivo:'Anulada por el usuario', updated_at:new Date().toISOString() }).eq('id', id)
      await registrarAuditoria({ accion:'Anulo cosecha', modulo:'Cosecha', tabla:'cosechas', registroId:id })
      setConfirmar(null); setDetalle(null); fetchCosechas()
    }})
  }

  const totalKg = cosechas.reduce((sum, c) => sum + (Number(c.kg_total) || 0), 0)
  const promedioKg = cosechas.length > 0 ? totalKg / cosechas.length : 0
  const bloqueSeleccionado = bloques.find(b => b.id === form.bloque_id)
  const cultivoSeleccionado = getCultivoBloque(bloqueSeleccionado, form.fecha)
  const totalKgMultiple = filasCosecha.reduce((sum, fila) => sum + parsearKg(fila.kg_total), 0)

  const inp = { width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:12, boxSizing:'border-box' }

  return (
    <div className="ag-page ui-c1c124">
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      {detalle && <ModalDetalle cosecha={detalle} onClose={() => setDetalle(null)} onEdit={() => abrirEditarCosecha(detalle)} onDelete={() => eliminar(detalle.id)} />}

      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-796b93">
          <div>
            <div className="ui-476525">Producción</div>
            <div className="ag-page-title ui-136b85">Cosecha</div>
          </div>
          <button className="ui-56054f" aria-label="Agregar registro" onClick={abrirNuevaCosecha}>
            <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
          </button>
        </div>
        {error && <div className="ui-d6d959">{error}</div>}
        <div className="ui-f66100" style={{ gap: isDesktop ? 14 : 8 }}>
          <div className="ui-07e05f">
            <div className="ui-8a137e">Total cosechado</div>
            <div className="ui-60c14a">{fmtKg(totalKg)}</div>
            <div className="ui-5ff7eb">kg · {cosechas.length} registros</div>
          </div>
          <div className="ag-surface ui-9a7f69">
            <div className="ui-081285">Promedio por registro</div>
            <div className="ui-59e9d0">
              {promedioKg > 0 ? `${fmtKg(promedioKg)} kg` : '—'}
            </div>
            <div className="ui-13b58a">solo produccion cosechada</div>
          </div>
        </div>
      </div>

      <Notice>{success}</Notice>
      <div className="ag-page-body" style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        {loading ? <Skeleton rows={4} label="Cargando cosechas" /> : cosechas.length === 0 ? (
          <div className="ui-5baa7a">Sin registros de cosecha</div>
        ) : isDesktop ? (
          <div className="ag-table-scroll harvest-table ui-a0c0d7">
            <div className="harvest-table__head ui-5d3c26">
              <span>Bloque</span>
              <span>Cultivo / campo</span>
              <span>Fecha</span>
              <span>Calidad</span>
              <span className="ui-f6e3d7">Kilos</span>
              <span className="ui-f6e3d7">Acciones</span>
            </div>
            {cosechas.map(c => {
              const cultivo = getCultivoCosecha(c)
              return (
                <div className="harvest-table__row ui-8d792c" key={c.id} onClick={() => setDetalle(c)}>
                  <div>
                    <div className="ui-62e15c">{c.bloques?.codigo || '-'}</div>
                    <div className="ui-13b58a">Bloque</div>
                  </div>
                  <div className="ui-3f9f96">
                    <div className="ui-d139ef">{cultivo}</div>
                    <div className="ui-a8396a">{c.bloques?.campos?.nombre || '-'}</div>
                  </div>
                  <div className="ui-1685e1">{c.fecha}</div>
                  <div>
                    <span className="ui-62c4cc" style={{ background: c.calidad==='primera' ? '#eeeeee' : '#fff3e8', color: c.calidad==='primera' ? '#212121' : '#c8700a' }}>
                      {calidadLabel(c.calidad)}
                    </span>
                  </div>
                  <div className="ui-f6e3d7">
                    <div className="ui-6a7a21">{fmtKg(c.kg_total)} kg</div>
                    <div className="ui-a8f171">Produccion</div>
                  </div>
                  <div className="ui-12274e">
                    <button className="table-action" aria-label="Editar" onClick={(e) => { e.stopPropagation(); abrirEditarCosecha(c) }} title="Editar">
                      <i className="ti ti-pencil ui-2592cc" aria-hidden="true"></i>
                    </button>
                    <button className="table-action table-action--danger" aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); eliminar(c.id) }} title="Eliminar">
                      <i className="ti ti-trash ui-2592cc" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="ui-d054c6">
          {cosechas.map(c => {
          const cultivo = getCultivoCosecha(c)
          return (
            <div className="ag-surface ui-78436a" key={c.id} onClick={() => setDetalle(c)} style={{ marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
              <div className="ui-f81471">
                <div>
                  <div className="ui-62e15c">Bloque {c.bloques?.codigo}</div>
                  <div className="ui-6b0aa7">{cultivo}</div>
                  <div className="ui-a8f171">{c.bloques?.campos?.nombre} · {c.fecha}</div>
                </div>
                <div className="ui-f6e3d7">
                  <div className="ui-32fa66">{fmtKg(c.kg_total)} kg</div>
                  <div className="ui-cd76a0">Produccion</div>
                </div>
              </div>
              <div className="ui-0726a3">
                <div className="ui-a2fc39">
                  {cultivo}
                </div>
                <div className="ui-f972f1" style={{ background: c.calidad==='primera' ? '#eeeeee' : '#fff3e8', color: c.calidad==='primera' ? '#212121' : '#c8700a' }}>
                  {calidadLabel(c.calidad)}
                </div>
              </div>
              {c.notas && <div className="ui-9b1d73">{c.notas}</div>}
              <div className="ui-510ea6">
                <span className="ui-5e0192">Tocar para ver detalle</span>
                <div className="ui-91294d">
                  <button className="ag-small-action ui-387856" onClick={(e) => { e.stopPropagation(); abrirEditarCosecha(c) }}>Editar</button>
                  <button className="ag-small-action ui-14c146" onClick={(e) => { e.stopPropagation(); eliminar(c.id) }}>Eliminar</button>
                </div>
              </div>
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="cosecha" titulo="Bloc de notas de cosecha" />
      </div>

      {modal && (
        <Modal busy={saving} onClose={() => setModal(false)} label="Registrar cosecha" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-7dd37e" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar cosecha' : 'Registrar cosecha'}</div>
            {error && <div className="ui-e136cb">{error}</div>}

            {!form.id && (
              <div className="ui-e960d5">
                <button className="ag-small-action ui-3a5af5" type="button" onClick={() => setModoMultiple(false)} style={{ background: !modoMultiple ? '#212121' : 'transparent', color: !modoMultiple ? '#fff' : '#777' }}>
                  Una cosecha
                </button>
                <button className="ag-small-action ui-3a5af5" type="button" onClick={() => setModoMultiple(true)} style={{ background: modoMultiple ? '#212121' : 'transparent', color: modoMultiple ? '#fff' : '#777' }}>
                  Varias juntas
                </button>
              </div>
            )}

            <FormHeading number="01" detail="Ubicación y fecha del registro">Origen de la cosecha</FormHeading>
            <label className="ag-field-label ui-74cc19">Campo
            <select style={inp} value={campoFiltro||''} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({...f, bloque_id:''})) }}>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>

            {(!modoMultiple || form.id) && (
              <>
            <div className="ui-74cc19">Bloque *</div>
            <select style={inp} value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
              <option value="">Seleccioná bloque...</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
            </select>

            {form.bloque_id && (
              <div className="ui-154470">
                Producto/cultivo: {cultivoSeleccionado || 'Sin plantacion activa registrada'}
              </div>
            )}
              </>
            )}

            <label className="ag-field-label ui-74cc19">Fecha *
            <input style={inp} type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha:e.target.value}))}/></label>

            {(!modoMultiple || form.id) ? (
              <>
            <div className="ui-74cc19">Kg cosechados * (admite decimales, ej: 1.5)</div>
            <input style={inp} type="text" inputMode="decimal" value={form.kg_total}
              onChange={e => setForm(f => ({...f, kg_total: e.target.value}))}
              placeholder="Ej: 150 o 1.5"/>

            <div className="ui-74cc19">Calidad</div>
            <div className="ui-60e304">
              {['primera','segunda','mixta'].map(q => (
                <button className="ag-small-action ui-949013" key={q} onClick={() => setForm(f => ({...f, calidad:q}))} style={{ background: form.calidad===q ? '#212121' : '#fff', color: form.calidad===q ? '#fff' : '#555' }}>
                  {q === 'primera' ? '1ra' : q === 'segunda' ? '2da' : 'Mixta'}
                </button>
              ))}
            </div>

            <div className="ui-74cc19">Notas (opcional)</div>
            <textarea className="ui-dc8f36" style={{ ...inp }} value={form.notas} onChange={e => setForm(f => ({...f, notas:e.target.value}))} placeholder="Observaciones..."/>
              </>
            ) : (
              <>
                <div className="ui-9546b4">Cosechas del lote</div>
                <div className="ui-c0b83a">
                  {filasCosecha.map((fila, idx) => {
                    const bloqueFila = bloques.find(b => b.id === fila.bloque_id)
                    const cultivoFila = getCultivoBloque(bloqueFila, form.fecha)
                    return (
                      <div className="ag-surface ui-a1c79b" key={idx}>
                        <div className="ui-b3c308">
                          <strong className="ui-3044b6">Cosecha {idx + 1}</strong>
                          {filasCosecha.length > 1 && (
                            <button className="ag-small-action ui-bf3abc" type="button" onClick={() => quitarFilaCosecha(idx)}>Quitar</button>
                          )}
                        </div>
                        <select style={inp} value={fila.bloque_id} onChange={e => actualizarFilaCosecha(idx, 'bloque_id', e.target.value)}>
                          <option value="">Bloque...</option>
                          {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                        </select>
                        {fila.bloque_id && (
                          <div className="ui-96f18a">
                            {cultivoFila || 'Sin plantacion activa registrada'}
                          </div>
                        )}
                        <input style={inp} type="text" inputMode="decimal" value={fila.kg_total} onChange={e => actualizarFilaCosecha(idx, 'kg_total', e.target.value)} placeholder="Kg cosechados"/>
                        <select style={inp} value={fila.calidad} onChange={e => actualizarFilaCosecha(idx, 'calidad', e.target.value)}>
                          <option value="primera">1ra calidad</option>
                          <option value="segunda">2da calidad</option>
                          <option value="mixta">Mixta</option>
                        </select>
                        <input className="ui-e7ec54" style={{ ...inp }} value={fila.notas} onChange={e => actualizarFilaCosecha(idx, 'notas', e.target.value)} placeholder="Nota opcional"/>
                      </div>
                    )
                  })}
                </div>
                <button className="ag-small-action ui-f58cc5" type="button" onClick={agregarFilaCosecha}>
                  + Agregar otra cosecha
                </button>
                {totalKgMultiple > 0 && (
                  <div className="ui-dbf2aa">
                    <span className="ui-aa481a">{fmtKg(totalKgMultiple)} kg en total</span>
                    <span className="ui-398ec2">Produccion</span>
                  </div>
                )}
              </>
            )}

            <button className="ag-form-submit ui-17d991" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : form.id ? 'Guardar cambios' : modoMultiple ? 'Guardar lote de cosechas' : 'Guardar cosecha'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
