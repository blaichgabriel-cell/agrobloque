import { Modal } from '../components/UI'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { useCan } from '../lib/RoleContext'

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
  useEffect(() => { if (campoActivo) { fetchOperarios(); fetchRegistros(); fetchNotasDia() } }, [campoActivo, semanaOffset])
  useEffect(() => {
    setFechaNotaActiva(prev => diasFechas.includes(prev) ? prev : diasFechas[0])
  }, [campoActivo?.id, semanaOffset])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
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
    } catch (e) {
      setError(`No se pudo sacar a ${operario.nombre}: ${e.message || 'error sin detalle'}`)
    }
    setSavingPersonal(false)
  }

  const fetchRegistros = async () => {
    const { data } = await supabase.from('asistencia').select('*').in('fecha', diasFechas)
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
    const { data } = await supabase.from('adelantos').select('*').in('operario_id', ids).order('fecha', { ascending: false })
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
          await supabase.from('asistencia').update({ monto }).eq('id', existing.id)
        } else {
          const { data } = await supabase.from('asistencia').insert({
            operario_id, fecha, dia_semana: DIAS[diaIdx], monto, estado: 'presente'
          }).select().single()
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
    if (!monto) return
    setSavingAdelanto(true)
    try {
      await supabase.from('adelantos').insert({
        operario_id: modalAdelanto.id,
        fecha: fechaLocal(),
        monto, descripcion: formAdelanto.descripcion || null
      })
      setModalAdelanto(null)
      setFormAdelanto({ monto:'', descripcion:'' })
      fetchAdelantos(operarios)
    } catch (e) { setError('Error al guardar adelanto') }
    setSavingAdelanto(false)
  }

  const eliminarAdelanto = async (id) => {
    await supabase.from('adelantos').update({ anulado:true, anulado_at:new Date().toISOString(), anulado_motivo:'Anulado por el usuario', updated_at:new Date().toISOString() }).eq('id', id)
    fetchAdelantos(operarios)
  }

  const abrirEditarAdelanto = (adelanto) => {
    setModalEditarAdelanto(adelanto)
    setFormEditarAdelanto({
      monto: fmtGs(adelanto.monto),
      descripcion: limpiarMarcaPagado(adelanto.descripcion || ''),
    })
  }

  const guardarEdicionAdelanto = async () => {
    if (!modalEditarAdelanto) return
    const monto = parsearGs(formEditarAdelanto.monto)
    if (!monto) return
    setSavingAdelanto(true)
    try {
      const estabaPagado = esAdelantoPagado(modalEditarAdelanto)
      const fechaPago = getFechaPagoAdelanto(modalEditarAdelanto)
      const descripcionBase = (formEditarAdelanto.descripcion || '').trim()
      const descripcion = `${descripcionBase}${estabaPagado ? ` [PAGADO${fechaPago ? ` ${fechaPago}` : ''}]` : ''}`.trim() || null
      await supabase
        .from('adelantos')
        .update({ monto, descripcion })
        .eq('id', modalEditarAdelanto.id)
      setModalEditarAdelanto(null)
      setFormEditarAdelanto({ monto:'', descripcion:'' })
      fetchAdelantos(operarios)
    } catch (e) {
      setError('Error al editar adelanto')
    }
    setSavingAdelanto(false)
  }

  const marcarPagado = async (adelanto) => {
    if (esAdelantoPagado(adelanto)) return
    const descripcion = `${limpiarMarcaPagado(adelanto.descripcion || '')} [PAGADO ${fechaLocal()}]`.trim()
    await supabase.from('adelantos').update({ descripcion }).eq('id', adelanto.id)
    fetchAdelantos(operarios)
  }

  return (
    <div className="ag-page ui-c1c124">
      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-476525">Control semanal</div>
        <div className="ui-d73a43">
          <div className="ag-page-title ui-136b85">Asistencia y pagos</div>
          {can.create && <button className="ag-small-action ui-5a0a19" onClick={() => setModalPersonal(true)} disabled={!campoActivo}>+ Personal</button>}
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
              {can.create && <button className="ag-small-action ui-d51170" onClick={() => setModalAdelanto(op)}>+ Adelanto</button>}
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

      {modalPersonal && (
        <Modal onClose={() => setModalPersonal(false)} label="Administrar personal" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:120, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-6332f9" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-99efa8">Personal de {campoActivo?.nombre}</div>
            <div className="ui-d824a8">Agregá personas nuevas o sacá de la lista a quienes ya no trabajan aquí.</div>
            <label className="ag-field-label ui-82a45a">Nombre y apellido</label>
            <div className="ui-248550">
              <input className="ui-de0344" autoFocus value={nombrePersonal} onChange={e => setNombrePersonal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') agregarPersonal() }} placeholder="Ej: Juan Pérez" />
              <button className="ag-small-action ui-f65358" onClick={agregarPersonal} disabled={savingPersonal || !nombrePersonal.trim()} style={{ opacity: savingPersonal || !nombrePersonal.trim() ? .55 : 1 }}>{savingPersonal ? 'Guardando...' : 'Agregar'}</button>
            </div>
            <div className="ui-288c85">En la lista ({operarios.length})</div>
            {operarios.length === 0 ? (
              <div className="ui-0144f1">Todavía no hay personal en este campo.</div>
            ) : operarios.map(op => (
              <div className="ui-285ad0" key={op.id}>
                <span className="ui-7fbfd2">{op.nombre}</span>
                <button className="ag-small-action ui-0da0e1" onClick={() => sacarPersonal(op)} disabled={savingPersonal}>Sacar</button>
              </div>
            ))}
            <div className="ui-506fc3">Al sacar una persona no se borran sus registros anteriores.</div>
            <button className="ag-small-action ui-9252c4" onClick={() => setModalPersonal(false)}>Cerrar</button>
          </div>
        </Modal>
      )}

      {/* Modal historial adelantos */}
      {modalHistorial && (
        <Modal onClose={() => setModalHistorial(null)} label="Asistencia" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-ab5655" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-99efa8">Adelantos — {modalHistorial.nombre}</div>
            <div className="ui-fe1408">Pendiente: Gs. {fmtGs(getTotalAdelantos(modalHistorial.id))} | Pagados: Gs. {fmtGs(getTotalAdelantosPagados(modalHistorial.id))}</div>
            {getAdelantosOperario(modalHistorial.id).length === 0 ? (
              <div className="ui-3ad9f2">Sin adelantos registrados</div>
            ) : <>
              {getAdelantosPendientesOperario(modalHistorial.id).length > 0 && <div className="ui-c49d1f">Pendientes</div>}
              {getAdelantosPendientesOperario(modalHistorial.id).map(a => (
              <div className="ag-surface ui-0beb00" key={a.id}>
                <div className="ui-9b26fa">
                  <div className="ui-e4e660" style={{ color: esAdelantoPagado(a) ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    Gs. {fmtGs(a.monto)}
                    {esAdelantoPagado(a) && <span className="ui-b97a0d">Pagado</span>}
                  </div>
                  <div className="ui-93a7e1">{a.fecha}</div>
                </div>
                {esAdelantoPagado(a) && <div className="ui-e512bf">{getFechaPagoAdelanto(a) ? `Pagado: ${getFechaPagoAdelanto(a)}` : 'Pagado'}</div>}
                {limpiarMarcaPagado(a.descripcion || '') && <div className="ui-9546b4">{limpiarMarcaPagado(a.descripcion || '')}</div>}
                {can.edit && <div className="ui-27070b">
                  <button className="ag-small-action ui-0365b4" onClick={() => abrirEditarAdelanto(a)}>Editar</button>
                  <button className="ag-small-action ui-6e0c7e" onClick={() => marcarPagado(a)}>✓ Marcar pagado</button>
                  <button className="ag-small-action ui-14c146" onClick={() => eliminarAdelanto(a.id)}>Eliminar</button>
                </div>}
              </div>
              ))}
              {getAdelantosPagadosOperario(modalHistorial.id).length > 0 && <div className="ui-ef7e2c">Historial de pagados</div>}
              {getAdelantosPagadosOperario(modalHistorial.id).map(a => (
                <div className="ui-8c1eea" key={a.id}>
                  <div className="ui-87fd17">
                    <div className="ui-d8fe22">Gs. {fmtGs(a.monto)} <span className="ui-f84a8e">Pagado</span></div>
                    <div className="ui-a6dec4">{a.fecha}</div>
                  </div>
                  <div className="ui-691940">{getFechaPagoAdelanto(a) ? `Pagado el ${getFechaPagoAdelanto(a)}` : 'Pago registrado'}</div>
                  {limpiarMarcaPagado(a.descripcion || '') && <div className="ui-a6dec4">{limpiarMarcaPagado(a.descripcion || '')}</div>}
                </div>
              ))}
            </>}
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModalHistorial(null)}>Cerrar</button>
          </div>
        </Modal>
      )}

      {/* Modal editar adelanto */}
      {modalEditarAdelanto && (
        <Modal onClose={() => setModalEditarAdelanto(null)} label="Asistencia" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:110, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-72e3b5" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0' }}>
            <div className="ui-99efa8">Editar adelanto</div>
            <div className="ui-fe1408">{modalHistorial?.nombre || ''}</div>
            <label className="ag-field-label ui-74cc19">Monto (Gs.)
            <input className="ui-8dcd88"
              type="text" inputMode="numeric" value={formEditarAdelanto.monto}
              onChange={e => { const r=e.target.value.replace(/[^0-9]/g,''); setFormEditarAdelanto(f=>({...f,monto:r?parseInt(r,10).toLocaleString('es-PY'):''})) }}
              placeholder="Ej: 50.000"/></label>
            <label className="ag-field-label ui-74cc19">Descripción (opcional)
            <input className="ui-5e4c6e"
              type="text" value={formEditarAdelanto.descripcion} onChange={e => setFormEditarAdelanto(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Adelanto quincena"/></label>
            <button className="ag-small-action ui-17d991" onClick={guardarEdicionAdelanto} disabled={savingAdelanto}>{savingAdelanto ? 'Guardando...' : 'Guardar cambios'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModalEditarAdelanto(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Modal nuevo adelanto */}
      {modalAdelanto && (
        <Modal onClose={() => setModalAdelanto(null)} label="Asistencia" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-72e3b5" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0' }}>
            <div className="ui-99efa8">Registrar adelanto</div>
            <div className="ui-fe1408">{modalAdelanto.nombre}</div>
            <label className="ag-field-label ui-74cc19">Monto (Gs.)
            <input className="ui-8dcd88"
              type="text" inputMode="numeric" value={formAdelanto.monto}
              onChange={e => { const r=e.target.value.replace(/[^0-9]/g,''); setFormAdelanto(f=>({...f,monto:r?parseInt(r,10).toLocaleString('es-PY'):''})) }}
              placeholder="Ej: 50.000"/></label>
            <label className="ag-field-label ui-74cc19">Descripción (opcional)
            <input className="ui-5e4c6e"
              type="text" value={formAdelanto.descripcion} onChange={e => setFormAdelanto(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Adelanto quincena"/></label>
            <button className="ag-small-action ui-17d991" onClick={guardarAdelanto} disabled={savingAdelanto}>{savingAdelanto ? 'Guardando...' : 'Guardar adelanto'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModalAdelanto(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
