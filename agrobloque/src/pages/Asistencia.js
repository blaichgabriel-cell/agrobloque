import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { useCan } from '../lib/RoleContext'
import UnifiedFormModal, { ModalSection, ModalField, resumenPie } from '../components/UnifiedFormModal'
import { toast } from 'sonner'

const CAMPO_STORAGE_KEY = 'agrobloque-campo-activo'
const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_CORTO = ['L','M','M','J','V','S']

const fechaLocal = (date = new Date()) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getLunes = (offset = 0) => {
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  const dia = hoy.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diff + offset * 7)
  lunes.setHours(12, 0, 0, 0)
  return lunes
}

const formatFecha = (d) => fechaLocal(d)
const formatLabel = (d) => d.toLocaleDateString('es-PY', { day:'numeric', month:'short' })
const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

const getCampoGuardado = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(CAMPO_STORAGE_KEY)
}

export default function Asistencia() {
  const can = useCan('asistencia')
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
  const [campoActivo, setCampoActivo] = useState(null)
  const [campos, setCampos] = useState([])
  const [operarios, setOperarios] = useState([])
  const [registros, setRegistros] = useState({})
  const [inputs, setInputs] = useState({})
  const [adelantos, setAdelantos] = useState([])
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [modalAdelanto, setModalAdelanto] = useState(null)
  const [modalHistorial, setModalHistorial] = useState(null)
  const [modalEditarAdelanto, setModalEditarAdelanto] = useState(null)
  const [modalPersonal, setModalPersonal] = useState(false)
  const [nombrePersonal, setNombrePersonal] = useState('')
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [formAdelanto, setFormAdelanto] = useState({ monto:'', descripcion:'' })
  const [formEditarAdelanto, setFormEditarAdelanto] = useState({ monto:'', descripcion:'' })
  const [notasDia, setNotasDia] = useState({})
  const [fechaNotaActiva, setFechaNotaActiva] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [savingAdelanto, setSavingAdelanto] = useState(false)
  const [error, setError] = useState('')
  const saveTimers = useRef({})

  const lunes = getLunes(semanaOffset)
  const diasFechas = DIAS.map((_, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i); return formatFecha(d)
  })
  const fechaNotaActual = fechaNotaActiva || diasFechas[0]
  const indiceNotaActivo = Math.max(0, diasFechas.indexOf(fechaNotaActual))

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => () => Object.values(saveTimers.current).forEach(clearTimeout), [])
  useEffect(() => { if (campoActivo) { fetchOperarios(); fetchRegistros(); fetchNotasDia() } }, [campoActivo, semanaOffset])
  useEffect(() => {
    setFechaNotaActiva(prev => diasFechas.includes(prev) ? prev : diasFechas[0])
  }, [campoActivo?.id, semanaOffset])

  const fetchCampos = async () => {
    const { data, error } = await supabase.from('campos').select('*').order('nombre')
    if (error) { setError(`No se pudieron cargar los campos: ${error.message}`); return }
    const lista = data || []
    setCampos(lista)
    if (lista.length > 0) {
      const guardado = getCampoGuardado()
      setCampoActivo(lista.find(c => c.id === guardado) || lista[0])
    }
  }

  const seleccionarCampo = (campo) => {
    setCampoActivo(campo)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CAMPO_STORAGE_KEY, campo.id)
    }
  }

  const fetchOperarios = async () => {
    const { data, error } = await supabase.from('operarios').select('*').eq('campo_id', campoActivo.id).eq('activo', true).order('orden', { ascending: true })
    if (error) {
      setError(`No se pudo cargar la lista de personal: ${error.message}`)
      return
    }
    setOperarios(data || [])
    if (data) fetchAdelantos(data)
  }

  const agregarPersonal = async () => {
    const nombre = nombrePersonal.trim()
    if (!nombre || !campoActivo) return
    setSavingPersonal(true)
    setError('')
    try {
      const siguienteOrden = operarios.reduce((max, o) => Math.max(max, Number(o.orden) || 0), 0) + 1
      const { error } = await supabase.from('operarios').insert({
        nombre,
        campo_id: campoActivo.id,
        orden: siguienteOrden,
        activo: true,
      })
      if (error) throw error
      setNombrePersonal('')
      await fetchOperarios()
      toast.success('Persona agregada', { description: nombre })
    } catch (e) {
      setError(`No se pudo agregar a ${nombre}: ${e.message || 'error sin detalle'}`)
    }
    setSavingPersonal(false)
  }

  const sacarPersonal = async (operario) => {
    const confirmado = typeof window === 'undefined' || window.confirm(`¿Sacar a ${operario.nombre} de la lista de asistencia?\n\nSus asistencias, adelantos y pagos anteriores se conservarán.`)
    if (!confirmado) return
    setSavingPersonal(true)
    setError('')
    try {
      const { error } = await supabase.from('operarios').update({ activo:false }).eq('id', operario.id)
      if (error) throw error
      await fetchOperarios()
      toast.success('Persona sacada de la lista', { description: operario.nombre })
    } catch (e) {
      setError(`No se pudo sacar a ${operario.nombre}: ${e.message || 'error sin detalle'}`)
    }
    setSavingPersonal(false)
  }

  const fetchRegistros = async () => {
    const { data, error } = await supabase.from('asistencia').select('*').in('fecha', diasFechas)
    if (error) { setError(`No se pudo cargar la asistencia: ${error.message}`); return }
    const mapa = {}
    const newInputs = {}
    ;(data || []).forEach(a => {
      const key = `${a.operario_id}_${a.fecha}`
      mapa[key] = { id: a.id, monto: a.monto }
      newInputs[key] = a.monto > 0 ? fmtGs(a.monto) : ''
    })
    setRegistros(mapa)
    setInputs(newInputs)
  }

  const fetchNotasDia = async () => {
    if (!campoActivo) return
    const { data, error } = await supabase
      .from('asistencia_notas_dia')
      .select('*')
      .eq('campo_id', campoActivo.id)
      .in('fecha', diasFechas)

    if (error) {
      setError(`No se pudieron cargar los trabajos realizados: ${error.message}`)
      return
    }

    const mapa = {}
    ;(data || []).forEach(n => { mapa[n.fecha] = n })
    setNotasDia(mapa)
  }

  const fetchAdelantos = async (ops) => {
    const ids = ops.map(o => o.id)
    if (!ids.length) {
      setAdelantos([])
      return
    }
    const { data, error } = await supabase.from('adelantos').select('*').in('operario_id', ids).order('fecha', { ascending: false })
    if (error) { setError(`No se pudieron cargar los adelantos: ${error.message}`); return }
    setAdelantos((data || []).filter(a => !a.anulado))
  }

  const getKey = (operario_id, fecha) => `${operario_id}_${fecha}`

  const handleChange = (operario_id, fecha, diaIdx, value) => {
    const raw = value.replace(/[^0-9]/g, '')
    const fmt = raw ? parseInt(raw, 10).toLocaleString('es-PY') : ''
    const key = getKey(operario_id, fecha)
    setInputs(prev => ({ ...prev, [key]: fmt }))

    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      const monto = parsearGs(fmt)
      const existing = registros[key]
      try {
        if (existing) {
          const { error } = await supabase.from('asistencia').update({ monto }).eq('id', existing.id)
          if (error) throw error
        } else {
          const { data, error } = await supabase.from('asistencia').insert({
            operario_id, fecha, dia_semana: DIAS[diaIdx], monto, estado: 'presente'
          }).select().single()
          if (error) throw error
          if (data) setRegistros(prev => ({ ...prev, [key]: { id: data.id, monto: data.monto } }))
        }
      } catch (e) {
        setError('Error al guardar asistencia')
      }
    }, 1200)
  }

  const getMonto = (operario_id, fecha) => inputs[getKey(operario_id, fecha)] || ''

  const getTotalSemana = (operario_id) =>
    diasFechas.reduce((sum, f) => sum + parsearGs(inputs[getKey(operario_id, f)] || '0'), 0)

  const getTotalGeneral = () => operarios.reduce((sum, o) => sum + getTotalSemana(o.id), 0)

  const guardarNotaDia = async () => {
    if (!campoActivo) return
    const fecha = fechaNotaActual
    const texto = (notasDia[fecha]?.trabajos || '').trim()
    setSavingNota(true)
    setError('')
    try {
      const payload = {
        campo_id: campoActivo.id,
        fecha,
        dia_semana: DIAS[indiceNotaActivo],
        trabajos: texto,
        updated_at: new Date().toISOString(),
      }
      let resultado
      const existenteId = notasDia[fecha]?.id

      if (existenteId) {
        resultado = await supabase
          .from('asistencia_notas_dia')
          .update(payload)
          .eq('id', existenteId)
          .select()
          .single()
      } else {
        const buscado = await supabase
          .from('asistencia_notas_dia')
          .select('id')
          .eq('campo_id', campoActivo.id)
          .eq('fecha', fecha)
          .maybeSingle()

        if (buscado.error) throw buscado.error

        resultado = buscado.data?.id
          ? await supabase
            .from('asistencia_notas_dia')
            .update(payload)
            .eq('id', buscado.data.id)
            .select()
            .single()
          : await supabase
            .from('asistencia_notas_dia')
            .insert(payload)
            .select()
            .single()
      }

      if (resultado.error) throw resultado.error
      if (resultado.data) setNotasDia(prev => ({ ...prev, [fecha]: resultado.data }))
    } catch (e) {
      setError(`Error al guardar trabajos del día: ${e.message || 'sin detalle'}`)
    }
    setSavingNota(false)
  }

  const actualizarNotaDia = (texto) => {
    const fecha = fechaNotaActual
    setNotasDia(prev => ({
      ...prev,
      [fecha]: {
        ...(prev[fecha] || { campo_id: campoActivo?.id, fecha, dia_semana: DIAS[indiceNotaActivo] }),
        trabajos: texto,
      },
    }))
  }

  const limpiarMarcaPagado = (descripcion = '') => String(descripcion).replace(/\[PAGADO[^\]]*\]/g, '').trim()
  const getFechaPagoAdelanto = (adelanto) => {
    const match = String(adelanto?.descripcion || '').match(/\[PAGADO\s*([0-9-]+)?\]/)
    return match?.[1] || ''
  }
  const esAdelantoPagado = (adelanto) => (adelanto.descripcion || '').includes('[PAGADO')
  const getAdelantosOperario = (operario_id) => adelantos.filter(a => a.operario_id === operario_id)
  const getAdelantosPendientesOperario = (operario_id) => getAdelantosOperario(operario_id).filter(a => !esAdelantoPagado(a))
  const getAdelantosPagadosOperario = (operario_id) => getAdelantosOperario(operario_id).filter(esAdelantoPagado)
  const getTotalAdelantos = (operario_id) => getAdelantosPendientesOperario(operario_id).reduce((s, a) => s + Number(a.monto), 0)
  const getTotalAdelantosPagados = (operario_id) => getAdelantosPagadosOperario(operario_id).reduce((s, a) => s + Number(a.monto), 0)

  const guardarAdelanto = async () => {
    const monto = parsearGs(formAdelanto.monto)
    if (!monto) { setError('Cargá el monto del adelanto.'); return }
    setSavingAdelanto(true)
    setError('')
    try {
      const { error } = await supabase.from('adelantos').insert({
        operario_id: modalAdelanto.id,
        fecha: fechaLocal(),
        monto, descripcion: formAdelanto.descripcion || null
      })
      if (error) throw error
      setModalAdelanto(null)
      setFormAdelanto({ monto:'', descripcion:'' })
      fetchAdelantos(operarios)
      toast.success('Adelanto registrado', { description: `${modalAdelanto.nombre} · Gs. ${fmtGs(monto)}` })
    } catch (e) { setError('Error al guardar adelanto') }
    setSavingAdelanto(false)
  }

  const eliminarAdelanto = async (id) => {
    setError('')
    const { error } = await supabase.from('adelantos').update({ anulado:true, anulado_at:new Date().toISOString(), anulado_motivo:'Anulado por el usuario', updated_at:new Date().toISOString() }).eq('id', id)
    if (error) { setError(`No se pudo anular el adelanto: ${error.message}`); return }
    fetchAdelantos(operarios)
  }

  const abrirEditarAdelanto = (adelanto) => {
    setError('')
    setModalEditarAdelanto(adelanto)
    setFormEditarAdelanto({
      monto: fmtGs(adelanto.monto),
      descripcion: limpiarMarcaPagado(adelanto.descripcion || ''),
    })
  }

  const guardarEdicionAdelanto = async () => {
    if (!modalEditarAdelanto) return
    const monto = parsearGs(formEditarAdelanto.monto)
    if (!monto) { setError('Cargá el monto del adelanto.'); return }
    setSavingAdelanto(true)
    setError('')
    try {
      const estabaPagado = esAdelantoPagado(modalEditarAdelanto)
      const fechaPago = getFechaPagoAdelanto(modalEditarAdelanto)
      const descripcionBase = (formEditarAdelanto.descripcion || '').trim()
      const descripcion = `${descripcionBase}${estabaPagado ? ` [PAGADO${fechaPago ? ` ${fechaPago}` : ''}]` : ''}`.trim() || null
      const { error } = await supabase
        .from('adelantos')
        .update({ monto, descripcion })
        .eq('id', modalEditarAdelanto.id)
      if (error) throw error
      setModalEditarAdelanto(null)
      setFormEditarAdelanto({ monto:'', descripcion:'' })
      fetchAdelantos(operarios)
      toast.success('Adelanto actualizado', { description: `Gs. ${fmtGs(monto)}` })
    } catch (e) {
      setError('Error al editar adelanto')
    }
    setSavingAdelanto(false)
  }

  const marcarPagado = async (adelanto) => {
    if (esAdelantoPagado(adelanto)) return
    const descripcion = `${limpiarMarcaPagado(adelanto.descripcion || '')} [PAGADO ${fechaLocal()}]`.trim()
    setError('')
    const { error } = await supabase.from('adelantos').update({ descripcion }).eq('id', adelanto.id)
    if (error) { setError(`No se pudo marcar el adelanto como pagado: ${error.message}`); return }
    fetchAdelantos(operarios)
  }

  return (
    <div className="ag-page ui-c1c124">
      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-476525">Control semanal</div>
        <div className="ui-d73a43">
          <div className="ag-page-title ui-136b85">Asistencia y pagos</div>
          {can.create && <button className="ag-small-action ui-5a0a19" onClick={() => { setError(''); setNombrePersonal(''); setModalPersonal(true) }} disabled={!campoActivo}>+ Personal</button>}
        </div>
        {error && <div className="ui-d6d959">{error}</div>}
        <div className="ui-ed8328">
          {campos.map(c => (
            <button className="ag-small-action ui-4aef65" key={c.id} onClick={() => seleccionarCampo(c)} style={{ background: campoActivo?.id===c.id ? '#0F3923' : 'transparent', color: campoActivo?.id===c.id ? '#fff' : 'var(--text-secondary)' }}>
              {c.nombre}
            </button>
          ))}
        </div>
        <div className="ui-fb4d82">
          <button className="ag-small-action ui-9353eb" onClick={() => setSemanaOffset(o => o-1)}>← Anterior</button>
          <div className="ui-00c1fb">{formatLabel(lunes)} — {formatLabel(new Date(lunes.getTime() + 5*86400000))}</div>
          <button className="ag-small-action ui-9353eb" onClick={() => setSemanaOffset(o => o+1)}>Siguiente →</button>
        </div>
      </div>

      <div className="ag-page-body" style={{ padding: isDesktop ? '12px 36px 100px' : '12px 14px 100px' }}>
        {operarios.map(op => (
          <div className="ui-672de4" key={op.id} style={{ boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
            <div className="ui-0d89cb">
              <div className="ui-788a2f">{op.nombre}</div>
              <div className="ui-398ec2">Gs. {fmtGs(getTotalSemana(op.id))}</div>
            </div>
            <div className="ui-4584e8">
              {DIAS.map((dia, i) => (
                <div className="ui-a0b904" key={dia}>
                  <label className="ag-field-label ui-0fb2c5">{DIAS_CORTO[i]}
                  <input className="ui-28daf6"
                    type="text" inputMode="numeric"
                    value={getMonto(op.id, diasFechas[i])}
                    onChange={e => handleChange(op.id, diasFechas[i], i, e.target.value)}
                    disabled={!can.edit}
                    placeholder="0"
                   
                  /></label>
                </div>
              ))}
            </div>
            <div className="ui-231bd9">
              <button className="ui-59fc42" onClick={() => setModalHistorial(op)}>
                Adelantos pendientes: <span className="ui-e634e6" style={{ color: getTotalAdelantos(op.id) > 0 ? '#c84040' : 'var(--text-secondary)' }}>Gs. {fmtGs(getTotalAdelantos(op.id))}</span> →
              </button>
              {can.create && <button className="ag-small-action ui-d51170" onClick={() => { setError(''); setFormAdelanto({ monto:'', descripcion:'' }); setModalAdelanto(op) }}>+ Adelanto</button>}
            </div>
          </div>
        ))}

        <div className="ui-254c54">
          <div className="ui-9a9517">Total semanal del campo</div>
          <div className="ui-de1272">Gs. {fmtGs(getTotalGeneral())}</div>
        </div>

        <div className="ag-surface ui-bba581">
          <div className="ui-54b4ad">
            <div>
              <div className="ui-62e15c">Trabajos realizados</div>
              <div className="ui-a8f171">Bitacora diaria vinculada a la asistencia</div>
            </div>
            {can.edit && <button className="ag-small-action ui-46b168" onClick={guardarNotaDia} disabled={savingNota}>
              {savingNota ? 'Guardando...' : 'Guardar'}
            </button>}
          </div>
          <div className="ui-3ea765">
            {DIAS.map((dia, i) => {
              const fecha = diasFechas[i]
              const activo = fechaNotaActual === fecha
              const tieneNota = Boolean((notasDia[fecha]?.trabajos || '').trim())
              return (
                <button className="ag-small-action ui-d34507" key={dia} onClick={() => setFechaNotaActiva(fecha)} style={{ background: activo ? '#0F3923' : tieneNota ? '#edf6ec' : '#f8f8f6', color: activo ? '#fff' : tieneNota ? '#176a25' : '#687068' }}>
                  {DIAS_CORTO[i]}
                </button>
              )
            })}
          </div>
          <textarea className="ui-5452f4"
            value={notasDia[fechaNotaActual]?.trabajos || ''}
            onChange={e => actualizarNotaDia(e.target.value)}
            disabled={!can.edit}
            placeholder="Ej: limpieza de canteros, riego, cosecha parcial, preparación de sustrato..."
           
          />
        </div>
        <NotasPanel modulo="asistencia" titulo="Bloc de notas de asistencia" />
      </div>

      {/* Administrar personal */}
      <UnifiedFormModal
        open={modalPersonal}
        tone="bloques"
        icon="ti-users"
        eyebrow="Asistencia"
        title={`Personal de ${campoActivo?.nombre || 'este campo'}`}
        subtitle="Agregá personas nuevas o sacá de la lista a quienes ya no trabajan aquí."
        label="Administrar personal"
        busy={savingPersonal}
        onClose={() => setModalPersonal(false)}
        onSubmit={agregarPersonal}
        submitDisabled={!nombrePersonal.trim()}
        submitLabel="Agregar persona"
        cancelLabel="Cerrar"
        error={modalPersonal ? error : ''}
        summary={resumenPie([{ n: operarios.length, texto: 'personas en la lista', uno: 'persona en la lista' }]) || 'Todavía no hay personal'}
      >{() => <>
        <ModalSection title="Nueva persona" icon="ti-user-plus">
          <ModalField label="Nombre y apellido"><input className="apple-control" data-autofocus value={nombrePersonal} onChange={e => setNombrePersonal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (nombrePersonal.trim() && !savingPersonal) agregarPersonal() } }} placeholder="Ej: Juan Pérez" /></ModalField>
        </ModalSection>
        <ModalSection title={`En la lista (${operarios.length})`} icon="ti-list">
          {operarios.length === 0 ? <p className="apple-empty">Todavía no hay personal en este campo.</p> : (
            <div className="apple-list">
              {operarios.map(op => (
                <div className="apple-list__row" key={op.id}>
                  <div className="apple-list__main"><strong>{op.nombre}</strong></div>
                  <div className="apple-list__actions"><button type="button" className="apple-mini-btn apple-mini-btn--danger" onClick={() => sacarPersonal(op)} disabled={savingPersonal}>Sacar</button></div>
                </div>
              ))}
            </div>
          )}
          <p className="apple-note">Al sacar una persona no se borran sus registros anteriores.</p>
        </ModalSection>
      </>}</UnifiedFormModal>

      {/* Historial de adelantos */}
      <UnifiedFormModal
        open={Boolean(modalHistorial)}
        tone="bloques"
        icon="ti-cash"
        eyebrow="Adelantos"
        title={modalHistorial ? modalHistorial.nombre : ''}
        label="Adelantos"
        onClose={() => setModalHistorial(null)}
        submitLabel={null}
        cancelLabel="Cerrar"
        summary={modalHistorial ? resumenPie([
          { solo: `Pendiente Gs. ${fmtGs(getTotalAdelantos(modalHistorial.id))}` },
          { solo: `Pagados Gs. ${fmtGs(getTotalAdelantosPagados(modalHistorial.id))}` },
        ]) : null}
      >{() => modalHistorial && <>
        {getAdelantosOperario(modalHistorial.id).length === 0 ? <p className="apple-empty">Sin adelantos registrados.</p> : <>
          {getAdelantosPendientesOperario(modalHistorial.id).length > 0 && (
            <ModalSection title="Pendientes" icon="ti-hourglass">
              <div className="apple-list">
                {getAdelantosPendientesOperario(modalHistorial.id).map(a => (
                  <div className="apple-list__row" key={a.id}>
                    <div className="apple-list__main">
                      <strong className="apple-list__money">Gs. {fmtGs(a.monto)}</strong>
                      <small>{a.fecha}{limpiarMarcaPagado(a.descripcion || '') ? ` · ${limpiarMarcaPagado(a.descripcion || '')}` : ''}</small>
                    </div>
                    {can.edit && <div className="apple-list__actions">
                      <button type="button" className="apple-mini-btn" onClick={() => abrirEditarAdelanto(a)}>Editar</button>
                      <button type="button" className="apple-mini-btn apple-mini-btn--ok" onClick={() => marcarPagado(a)}><i className="ti ti-check" aria-hidden="true" />Pagado</button>
                      <button type="button" className="apple-mini-btn apple-mini-btn--danger" onClick={() => eliminarAdelanto(a.id)}>Eliminar</button>
                    </div>}
                  </div>
                ))}
              </div>
            </ModalSection>
          )}
          {getAdelantosPagadosOperario(modalHistorial.id).length > 0 && (
            <ModalSection title="Historial de pagados" icon="ti-circle-check">
              <div className="apple-list">
                {getAdelantosPagadosOperario(modalHistorial.id).map(a => (
                  <div className="apple-list__row is-done" key={a.id}>
                    <div className="apple-list__main">
                      <strong className="apple-list__money">Gs. {fmtGs(a.monto)}<span className="apple-tag">Pagado</span></strong>
                      <small>{a.fecha} · {getFechaPagoAdelanto(a) ? `pagado el ${getFechaPagoAdelanto(a)}` : 'pago registrado'}{limpiarMarcaPagado(a.descripcion || '') ? ` · ${limpiarMarcaPagado(a.descripcion || '')}` : ''}</small>
                    </div>
                  </div>
                ))}
              </div>
            </ModalSection>
          )}
        </>}
      </>}</UnifiedFormModal>

      {/* Editar adelanto */}
      <UnifiedFormModal
        open={Boolean(modalEditarAdelanto)}
        tone="bloques"
        icon="ti-pencil"
        eyebrow="Editar adelanto"
        title={modalHistorial?.nombre || 'Editar adelanto'}
        label="Editar adelanto"
        busy={savingAdelanto}
        onClose={() => setModalEditarAdelanto(null)}
        onSubmit={guardarEdicionAdelanto}
        submitLabel="Guardar cambios"
        error={modalEditarAdelanto ? error : ''}
        summary={parsearGs(formEditarAdelanto.monto) > 0 ? <>Gs. <b>{fmtGs(parsearGs(formEditarAdelanto.monto))}</b></> : 'Monto del adelanto'}
      >{() => <>
        <ModalSection title="Adelanto" icon="ti-cash">
          <ModalField label="Monto (Gs.) *"><input className="apple-control apple-control--num" data-autofocus type="text" inputMode="numeric" value={formEditarAdelanto.monto} onWheel={e => e.currentTarget.blur()} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setFormEditarAdelanto(f => ({ ...f, monto: r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 50.000" /></ModalField>
          <ModalField label="Descripción"><input className="apple-control" type="text" value={formEditarAdelanto.descripcion} onChange={e => setFormEditarAdelanto(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Adelanto quincena (opcional)" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      {/* Nuevo adelanto */}
      <UnifiedFormModal
        open={Boolean(modalAdelanto)}
        tone="bloques"
        icon="ti-cash"
        eyebrow="Registrar adelanto"
        title={modalAdelanto?.nombre || 'Registrar adelanto'}
        label="Registrar adelanto"
        busy={savingAdelanto}
        onClose={() => setModalAdelanto(null)}
        onSubmit={guardarAdelanto}
        submitLabel="Guardar adelanto"
        error={modalAdelanto ? error : ''}
        summary={parsearGs(formAdelanto.monto) > 0 ? <>Gs. <b>{fmtGs(parsearGs(formAdelanto.monto))}</b></> : 'Monto del adelanto'}
      >{() => <>
        <ModalSection title="Adelanto" icon="ti-cash">
          <ModalField label="Monto (Gs.) *"><input className="apple-control apple-control--num" data-autofocus type="text" inputMode="numeric" value={formAdelanto.monto} onWheel={e => e.currentTarget.blur()} onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setFormAdelanto(f => ({ ...f, monto: r ? parseInt(r, 10).toLocaleString('es-PY') : '' })) }} placeholder="Ej: 50.000" /></ModalField>
          <ModalField label="Descripción"><input className="apple-control" type="text" value={formAdelanto.descripcion} onChange={e => setFormAdelanto(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Adelanto quincena (opcional)" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>
    </div>
  )
}
