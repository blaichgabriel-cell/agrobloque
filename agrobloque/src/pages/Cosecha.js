import { Modal, Skeleton } from '../components/UI'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, DateQuickField, ChoiceChips, BlockChips, resumenPie } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
import ModalConfirm from '../components/ModalConfirm'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { useCan } from '../lib/RoleContext'
import { useAccionNueva } from '../lib/useAccionNueva'

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

function ModalDetalle({ open, cosecha, onClose, onEdit, onDelete }) {
  const can = useCan('cosecha')
  const c = cosecha || {}
  const cultivo = cosecha ? getCultivoCosecha(cosecha) : ''

  return (
    <UnifiedFormModal
      open={open}
      tone="bloques"
      icon="ti-basket"
      eyebrow="Detalle de cosecha"
      title={cultivo || 'Cosecha'}
      subtitle={`Bloque ${c.bloques?.codigo || ''} · ${c.fecha || ''}`}
      label="Detalle de cosecha"
      onClose={onClose}
      onSubmit={can.edit ? onEdit : undefined}
      submitLabel={can.edit ? 'Editar cosecha' : null}
      shortcut={false}
      cancelLabel="Cerrar"
      secondary={can.delete ? <button type="button" className="apple-btn apple-btn--ghost apple-btn--dangerghost" onClick={onDelete}>Eliminar</button> : null}
      summary={cosecha ? `${fmtKg(c.kg_total)} kg · ${calidadLabel(c.calidad)}` : ''}
    >{() => <>
      <div className="apple-stats">
        <div className="apple-stat is-ok"><small>Kilos</small><strong>{fmtKg(c.kg_total)} kg</strong></div>
        <div className="apple-stat"><small>Calidad</small><strong>{calidadLabel(c.calidad)}</strong></div>
      </div>
      <dl className="apple-kv">
        <div className="apple-kv__row"><dt>Producto/cultivo</dt><dd>{cultivo}</dd></div>
        <div className="apple-kv__row"><dt>Campo</dt><dd>{c.bloques?.campos?.nombre || '—'}</dd></div>
        <div className="apple-kv__row"><dt>Bloque</dt><dd className="is-num">{c.bloques?.codigo || '—'}</dd></div>
        <div className="apple-kv__row"><dt>Calidad</dt><dd>{calidadLabel(c.calidad)}</dd></div>
        <div className="apple-kv__row"><dt>Uso</dt><dd>Producción del bloque</dd></div>
      </dl>
      {c.notas && <p className="apple-quote">{c.notas}</p>}
    </>}</UnifiedFormModal>
  )
}

const CALIDADES = [{ value:'primera', etiqueta:'1ra' }, { value:'segunda', etiqueta:'2da' }, { value:'mixta', etiqueta:'Mixta' }]

export default function Cosecha({ campoActivo = null }) {
  const can = useCan('cosecha')
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
  const [cargandoBloques, setCargandoBloques] = useState(false)
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
      const campoInicial = abrirQr && data.some(c => c.id === campoQr) ? campoQr : (data.find(c => c.id === campoActivo?.id)?.id || data[0].id)
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
    setCargandoBloques(true)
    const { data } = await supabase.from('bloques')
      .select('*, plantaciones(cultivos(nombre), activa, created_at, fecha_siembra)')
      .eq('campo_id', campo_id)
      .order('codigo')
    setBloques(data || [])
    setCargandoBloques(false)
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
  useAccionNueva(abrirNuevaCosecha, { permitido: can.create, listo: !loading })

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
        plantacion_id: bloques.find(b => b.id === fila.bloque_id)?.plantaciones?.find(p => p.activa)?.id || null,
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
      toast.success('Lote de cosechas guardado', { description:`${filasValidas.length} cosecha${filasValidas.length === 1 ? '' : 's'} · ${fmtKg(filasValidas.reduce((total, f) => total + f.kg_total, 0))} kg` })
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
        plantacion_id: bloques.find(b => b.id === form.bloque_id)?.plantaciones?.find(p => p.activa)?.id || null,
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
      await fetchCosechas(); setModal(false); toast.success(form.id ? 'Cosecha actualizada' : 'Cosecha guardada', { description:`${fmtKg(payload.kg_total)} kg · Bloque ${bloqueSeleccionado?.codigo || ''}` })
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

  return (
    <div className="ag-page ui-c1c124">
      <ModalDetalle open={Boolean(detalle)} cosecha={detalle} onClose={() => setDetalle(null)} onEdit={() => abrirEditarCosecha(detalle)} onDelete={() => eliminar(detalle.id)} />

      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-796b93">
          <div>
            <div className="ui-476525">Producción</div>
            <div className="ag-page-title ui-136b85">Cosecha</div>
          </div>
          {can.create && <button className="ui-56054f" aria-label="Agregar registro" onClick={abrirNuevaCosecha}>
            <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
          </button>}
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
            <div className="ui-13b58a">solo producción cosechada</div>
          </div>
        </div>
      </div>

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
                <div className="harvest-table__row ui-8d792c" role="button" tabIndex={0} key={c.id} onClick={() => setDetalle(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalle(c) } }}>
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
                    <div className="ui-a8f171">Producción</div>
                  </div>
                  <div className="ui-12274e">
                    {can.edit && <button className="table-action" aria-label="Editar" onClick={(e) => { e.stopPropagation(); abrirEditarCosecha(c) }} title="Editar">
                      <i className="ti ti-pencil ui-2592cc" aria-hidden="true"></i>
                    </button>}
                    {can.delete && <button className="table-action table-action--danger" aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); eliminar(c.id) }} title="Eliminar">
                      <i className="ti ti-trash ui-2592cc" aria-hidden="true"></i>
                    </button>}
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
            <div className="ag-surface ui-78436a" role="button" tabIndex={0} key={c.id} onClick={() => setDetalle(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalle(c) } }} style={{ marginBottom: isDesktop ? 0 : 8, boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.05)' : 'none' }}>
              <div className="ui-f81471">
                <div>
                  <div className="ui-62e15c">Bloque {c.bloques?.codigo}</div>
                  <div className="ui-6b0aa7">{cultivo}</div>
                  <div className="ui-a8f171">{c.bloques?.campos?.nombre} · {c.fecha}</div>
                </div>
                <div className="ui-f6e3d7">
                  <div className="ui-32fa66">{fmtKg(c.kg_total)} kg</div>
                  <div className="ui-cd76a0">Producción</div>
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
                  {can.edit && <button className="ag-small-action ui-387856" onClick={(e) => { e.stopPropagation(); abrirEditarCosecha(c) }}>Editar</button>}
                  {can.delete && <button className="ag-small-action ui-14c146" onClick={(e) => { e.stopPropagation(); eliminar(c.id) }}>Eliminar</button>}
                </div>
              </div>
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="cosecha" titulo="Bloc de notas de cosecha" />
      </div>

      <UnifiedFormModal
        open={modal}
        tone="bloques"
        icon="ti-basket"
        eyebrow={form.id ? 'Editar registro' : 'Nueva cosecha'}
        title={form.id ? 'Editar cosecha' : 'Registrar cosecha'}
        label="Registrar cosecha"
        busy={saving}
        onClose={() => setModal(false)}
        onSubmit={guardar}
        submitLabel={form.id ? 'Guardar cambios' : modoMultiple ? 'Guardar lote' : 'Guardar registro'}
        error={error}
        summary={resumenPie(modoMultiple && !form.id ? [
          { n: filasCosecha.filter(f => f.bloque_id && parsearKg(f.kg_total) > 0).length, texto: 'cosechas', uno: 'cosecha' },
          { n: totalKgMultiple > 0 ? fmtKg(totalKgMultiple) : '', texto: 'kg' },
        ] : [
          { n: bloqueSeleccionado?.codigo || '', texto: '' },
          { n: parsearKg(form.kg_total) > 0 ? fmtKg(parsearKg(form.kg_total)) : '', texto: 'kg' },
          { solo: form.kg_total || form.bloque_id ? CALIDADES.find(q => q.value === form.calidad)?.etiqueta : '' },
        ]) || 'Elegí el bloque y cargá los kilos'}
      >{() => <>
        <ModalSection title="Dónde y cuándo" icon="ti-map-pin">
          {!form.id && (
            <ModalGroup label="¿Cuántas cosechas cargás?">
              <ChoiceChips label="Modo de carga" value={modoMultiple ? 'varias' : 'una'} onChange={v => setModoMultiple(v === 'varias')} options={[{ value:'una', label:'Una cosecha', icon:'ti-basket' }, { value:'varias', label:'Varias juntas', icon:'ti-stack-2' }]} />
            </ModalGroup>
          )}
          <ModalGrid>
            <DateQuickField label="Fecha" required value={form.fecha} onChange={fecha => setForm(f => ({ ...f, fecha }))} />
            <ModalField label="Campo">
              <select className="apple-control" value={campoFiltro || ''} onChange={e => { setCampoFiltro(e.target.value); setForm(f => ({ ...f, bloque_id:'' })); setFilasCosecha(fs => fs.map(fila => ({ ...fila, bloque_id:'' }))) }}>
                {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </ModalField>
          </ModalGrid>
          {(!modoMultiple || form.id) && (
            <BlockChips single label="Bloque" bloques={bloques} seleccionados={form.bloque_id ? [form.bloque_id] : []} cargando={cargandoBloques} cultivoDe={b => getCultivoBloque(b, form.fecha)} onToggle={id => setForm(f => ({ ...f, bloque_id:id }))} vacio="Este campo no tiene bloques." />
          )}
          {(!modoMultiple || form.id) && form.bloque_id && <p className="apple-note">Producto / cultivo: <b>{cultivoSeleccionado || 'Sin plantación activa registrada'}</b></p>}
        </ModalSection>

        <ModalSection title={modoMultiple && !form.id ? 'Cosechas del lote' : 'Kilos y calidad'} icon="ti-scale">
          {(!modoMultiple || form.id) ? (
            <>
              <ModalField label="Kilos cosechados *" hint="Admite decimales: 150 o 1,5">
                <input className="apple-control apple-control--num" type="text" inputMode="decimal" enterKeyHint="done" value={form.kg_total} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, kg_total:e.target.value.replace(/[^0-9.,]/g, '') }))} placeholder="Ej: 150" />
              </ModalField>
              <ModalGroup label="Calidad">
                <ChoiceChips label="Calidad" value={form.calidad} onChange={calidad => setForm(f => ({ ...f, calidad }))} options={CALIDADES.map(q => ({ value:q.value, label:q.etiqueta }))} />
              </ModalGroup>
            </>
          ) : (
            <>
              <div className="apple-rows">
                {filasCosecha.map((fila, idx) => {
                  const cultivoFila = getCultivoBloque(bloques.find(b => b.id === fila.bloque_id), form.fecha)
                  return (
                    <div className="apple-row apple-row--cosecha" key={idx}>
                      <div className="apple-row__name">
                        <select className="apple-control" aria-label={`Bloque de la cosecha ${idx + 1}`} value={fila.bloque_id} onChange={e => actualizarFilaCosecha(idx, 'bloque_id', e.target.value)}>
                          <option value="">Bloque…</option>
                          {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                        </select>
                      </div>
                      <input className="apple-control apple-control--num" type="text" inputMode="decimal" aria-label={`Kilos de la cosecha ${idx + 1}`} value={fila.kg_total} onWheel={e => e.currentTarget.blur()} onChange={e => actualizarFilaCosecha(idx, 'kg_total', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Kg" />
                      <select className="apple-control" aria-label={`Calidad de la cosecha ${idx + 1}`} value={fila.calidad} onChange={e => actualizarFilaCosecha(idx, 'calidad', e.target.value)}>
                        {CALIDADES.map(q => <option key={q.value} value={q.value}>{q.etiqueta}</option>)}
                      </select>
                      <button type="button" className="apple-row__remove" aria-label={`Quitar cosecha ${idx + 1}`} onClick={() => quitarFilaCosecha(idx)} disabled={filasCosecha.length === 1}><i className="ti ti-x" aria-hidden="true" /></button>
                      {fila.bloque_id && <div className="apple-row__info">{cultivoFila || 'Sin plantación activa registrada'}</div>}
                    </div>
                  )
                })}
              </div>
              <button type="button" className="apple-add" onClick={agregarFilaCosecha}><i className="ti ti-plus" aria-hidden="true" />Agregar otra cosecha</button>
            </>
          )}
        </ModalSection>

        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(form.notas)} badge={form.notas ? 'nota' : ''}>
          <ModalField label="Notas" hint={modoMultiple && !form.id ? 'Se agrega a todas las cosechas del lote.' : ''}>
            <textarea className="apple-control" value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones: lluvia, personal, destino…" />
          </ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      <ModalConfirm open={Boolean(confirmar)} titulo="¿Eliminar registro?" mensaje="Esta acción no se puede deshacer." textoBoton="Eliminar cosecha" onConfirm={confirmar?.fn} onCancel={() => setConfirmar(null)} />
    </div>
  )
}
