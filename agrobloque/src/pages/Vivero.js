import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'
import { blurNumberInputOnWheel, formatLocaleInteger, parseLocaleInteger } from '../lib/numbers'

const estados = ['sembrado', 'germinando', 'listo', 'trasplantado', 'descartado']
const hoy = () => new Date().toISOString().split('T')[0]
const num = (v) => parseLocaleInteger(v, 0)
const pct = (a, b) => b > 0 ? Math.round((num(a) / num(b)) * 100) : 0

const formInicial = {
  campo_id: '',
  fecha_siembra: hoy(),
  cultivo: '',
  variedad: '',
  semilla: '',
  cantidad_semillas: '',
  bandejas: '',
  sustrato: '',
  abono_sustrato: '',
  proveedor: '',
  precio_compra: '',
  fotos: [],
  fecha_estimada_trasplante: '',
  fecha_real_trasplante: '',
  germinadas: '',
  perdidas: '',
  estado: 'sembrado',
  notas: '',
}

const tratamientoInicial = {
  fecha: hoy(),
  tipo: '',
  producto: '',
  dosis: '',
  responsable: '',
  notas: '',
}

const trasplanteInicial = {
  bloque_id: '',
  fecha_real_trasplante: hoy(),
  cantidad_plantas: '',
  finalizar_lote: true,
}

function ViveroIcon({ size = 24, color = '#2f741f' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21V10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12C8.2 12 5.4 9.7 4.5 6.2C8.2 6 11.1 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12C15.8 12 18.6 9.7 19.5 6.2C15.8 6 12.9 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 21H17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const optimizarFoto = (archivo) => new Promise((resolve, reject) => {
  const lector = new FileReader()
  lector.onerror = () => reject(new Error('No se pudo leer la imagen.'))
  lector.onload = () => {
    const imagen = new Image()
    imagen.onerror = () => reject(new Error('El archivo no es una imagen válida.'))
    imagen.onload = () => {
      const maximo = 1400
      const escala = Math.min(1, maximo / Math.max(imagen.width, imagen.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(imagen.width * escala))
      canvas.height = Math.max(1, Math.round(imagen.height * escala))
      canvas.getContext('2d').drawImage(imagen, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    imagen.src = lector.result
  }
  lector.readAsDataURL(archivo)
})

export default function Vivero() {
  const navigate = useNavigate()
  const fotosRef = useRef(null)
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [lotes, setLotes] = useState([])
  const [tratamientos, setTratamientos] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [modalTratamiento, setModalTratamiento] = useState(false)
  const [modalTrasplante, setModalTrasplante] = useState(false)
  const [form, setForm] = useState(formInicial)
  const [tratForm, setTratForm] = useState(tratamientoInicial)
  const [trasForm, setTrasForm] = useState(trasplanteInicial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCampos()
    fetchBloques()
    fetchLotes()
  }, [])

  useEffect(() => {
    if (detalle) fetchTratamientos(detalle.id)
  }, [detalle?.id])

  const resumen = useMemo(() => {
    const activos = lotes.filter(l => !['trasplantado', 'descartado'].includes(l.estado)).length
    const semillas = lotes.reduce((s, l) => s + num(l.cantidad_semillas), 0)
    const germinadas = lotes.reduce((s, l) => s + num(l.germinadas), 0)
    const perdidas = lotes.reduce((s, l) => s + num(l.perdidas), 0)
    return { activos, semillas, germinadas, perdidas, germinacion: pct(germinadas, semillas) }
  }, [lotes])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
    if (data?.length > 0) setForm(f => ({ ...f, campo_id: f.campo_id || data[0].id }))
  }

  const fetchLotes = async () => {
    const { data, error } = await supabase
      .from('vivero_lotes')
      .select('*, campos(nombre)')
      .order('fecha_siembra', { ascending: false })

    if (error) {
      setError('Falta ejecutar el SQL de vivero en Supabase.')
      setLotes([])
      return
    }

    setError('')
    setLotes((data || []).filter(l => !l.archivado))
  }

  const fetchBloques = async () => {
    const { data } = await supabase
      .from('bloques')
      .select('id, codigo, campo_id, tipo, campos(nombre)')
      .order('codigo')
    setBloques(data || [])
  }

  const fetchTratamientos = async (loteId) => {
    const { data } = await supabase
      .from('vivero_tratamientos')
      .select('*')
      .eq('lote_id', loteId)
      .order('fecha', { ascending: false })
    setTratamientos((data || []).filter(t => !t.anulado))
  }

  const abrirNuevo = () => {
    setForm({ ...formInicial, campo_id: campos[0]?.id || '' })
    setModal(true)
  }

  const abrirEditar = (lote) => {
    setForm({
      id: lote.id,
      campo_id: lote.campo_id || '',
      fecha_siembra: lote.fecha_siembra || hoy(),
      cultivo: lote.cultivo || '',
      variedad: lote.variedad || '',
      semilla: lote.semilla || '',
      cantidad_semillas: formatLocaleInteger(lote.cantidad_semillas),
      bandejas: formatLocaleInteger(lote.bandejas),
      sustrato: lote.sustrato || '',
      abono_sustrato: lote.abono_sustrato || '',
      proveedor: lote.proveedor || '',
      precio_compra: formatLocaleInteger(lote.precio_compra),
      fotos: Array.isArray(lote.fotos) ? lote.fotos : [],
      fecha_estimada_trasplante: lote.fecha_estimada_trasplante || '',
      fecha_real_trasplante: lote.fecha_real_trasplante || '',
      germinadas: formatLocaleInteger(lote.germinadas),
      perdidas: formatLocaleInteger(lote.perdidas),
      estado: lote.estado || 'sembrado',
      notas: lote.notas || '',
    })
    setDetalle(null)
    setModal(true)
  }

  const guardarLote = async () => {
    if (!form.fecha_siembra || !form.cultivo.trim()) return
    setSaving(true)
    const payload = {
      campo_id: form.campo_id || null,
      fecha_siembra: form.fecha_siembra,
      cultivo: form.cultivo.trim(),
      variedad: form.variedad || null,
      semilla: form.semilla || null,
      cantidad_semillas: num(form.cantidad_semillas),
      bandejas: num(form.bandejas),
      sustrato: form.sustrato || null,
      abono_sustrato: form.abono_sustrato || null,
      proveedor: form.proveedor || null,
      precio_compra: form.precio_compra ? num(form.precio_compra) : null,
      fotos: Array.isArray(form.fotos) ? form.fotos : [],
      fecha_estimada_trasplante: form.fecha_estimada_trasplante || null,
      fecha_real_trasplante: form.fecha_real_trasplante || null,
      germinadas: num(form.germinadas),
      perdidas: num(form.perdidas),
      estado: form.estado,
      notas: form.notas || null,
    }

    const res = form.id
      ? await supabase.from('vivero_lotes').update(payload).eq('id', form.id)
      : await supabase.from('vivero_lotes').insert(payload)

    if (res.error) setError('No se pudo guardar el lote. Revisa el SQL de Supabase.')
    else {
      await registrarAuditoria({
        accion: form.id ? 'Edito lote de vivero' : 'Registro lote de vivero',
        modulo: 'Vivero',
        tabla: 'vivero_lotes',
        registroId: form.id || '',
        detalle: `${payload.cultivo} ${payload.variedad || ''}`,
      })
      setModal(false)
      await fetchLotes()
    }
    setSaving(false)
  }

  const agregarFotos = async (event) => {
    const archivos = Array.from(event.target.files || [])
    event.target.value = ''
    if (!archivos.length) return
    const disponibles = Math.max(0, 6 - (form.fotos || []).length)
    if (!disponibles) {
      setError('Podés guardar hasta 6 fotos por lote.')
      return
    }
    try {
      const nuevas = await Promise.all(archivos.slice(0, disponibles).map(async archivo => ({
        id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,
        nombre:archivo.name,
        fecha:hoy(),
        url:await optimizarFoto(archivo),
      })))
      setForm(actual => ({ ...actual, fotos:[...(actual.fotos || []), ...nuevas] }))
      setError(archivos.length > disponibles ? `Se agregaron ${disponibles} fotos. El máximo por lote es 6.` : '')
    } catch (err) {
      setError(err.message || 'No se pudieron preparar las fotos.')
    }
  }

  const quitarFoto = (fotoId) => setForm(actual => ({ ...actual, fotos:(actual.fotos || []).filter(foto => foto.id !== fotoId) }))

  const eliminarLote = async (id) => {
    if (!window.confirm('¿Archivar este lote de vivero? El historial se conservará.')) return
    await supabase.from('vivero_lotes').update({ archivado:true, updated_at:new Date().toISOString() }).eq('id', id)
    await registrarAuditoria({ accion:'Archivo lote de vivero', modulo:'Vivero', tabla:'vivero_lotes', registroId:id })
    setDetalle(null)
    fetchLotes()
  }

  const guardarTratamiento = async () => {
    if (!detalle || !tratForm.fecha || !tratForm.tipo.trim()) return
    setSaving(true)
    const payload = {
      lote_id: detalle.id,
      fecha: tratForm.fecha,
      tipo: tratForm.tipo,
      producto: tratForm.producto || null,
      dosis: tratForm.dosis || null,
      responsable: tratForm.responsable || null,
      notas: tratForm.notas || null,
      updated_at:new Date().toISOString(),
    }
    const { error } = tratForm.id ? await supabase.from('vivero_tratamientos').update(payload).eq('id', tratForm.id) : await supabase.from('vivero_tratamientos').insert(payload)
    if (!error) {
      await registrarAuditoria({ accion:tratForm.id ? 'Edito tratamiento de vivero' : 'Registro tratamiento de vivero', modulo:'Vivero', tabla:'vivero_tratamientos', registroId:tratForm.id || detalle.id, detalle:tratForm.tipo })
      setTratForm(tratamientoInicial)
      setModalTratamiento(false)
      fetchTratamientos(detalle.id)
    } else setError('No se pudo guardar el tratamiento.')
    setSaving(false)
  }

  const editarTratamiento = (t) => {
    setTratForm({ id:t.id, fecha:t.fecha || hoy(), tipo:t.tipo || '', producto:t.producto || '', dosis:t.dosis || '', responsable:t.responsable || '', notas:t.notas || '' })
    setModalTratamiento(true)
  }

  const anularTratamiento = async (t) => {
    if (!window.confirm('¿Anular este tratamiento? El historial se conservará.')) return
    await supabase.from('vivero_tratamientos').update({ anulado:true, anulado_at:new Date().toISOString(), anulado_motivo:'Anulado por el usuario', updated_at:new Date().toISOString() }).eq('id', t.id)
    await registrarAuditoria({ accion:'Anulo tratamiento de vivero', modulo:'Vivero', tabla:'vivero_tratamientos', registroId:t.id, detalle:t.tipo })
    fetchTratamientos(detalle.id)
  }

  const obtenerOCrearCultivo = async (nombreCultivo) => {
    const nombre = (nombreCultivo || '').trim()
    if (!nombre) throw new Error('Falta el cultivo del lote.')

    const { data: existentes } = await supabase
      .from('cultivos')
      .select('id, nombre')
      .ilike('nombre', nombre)
      .limit(1)

    if (existentes?.[0]?.id) return existentes[0].id

    const { data: nuevo, error } = await supabase
      .from('cultivos')
      .insert({ nombre })
      .select('id')
      .single()

    if (error) throw error
    return nuevo.id
  }

  const abrirTrasplante = (lote) => {
    const cantidadSugerida = num(lote.germinadas) || Math.max(num(lote.cantidad_semillas) - num(lote.perdidas), 0)
    setDetalle(lote)
    setTrasForm({
      bloque_id: '',
      fecha_real_trasplante: lote.fecha_real_trasplante || hoy(),
      cantidad_plantas: formatLocaleInteger(cantidadSugerida),
      finalizar_lote: true,
    })
    setError('')
    setModalTrasplante(true)
  }

  const guardarTrasplante = async () => {
    if (!detalle || !trasForm.bloque_id || !trasForm.fecha_real_trasplante) return
    setSaving(true)
    setError('')

    try {
      const bloque = bloques.find(b => b.id === trasForm.bloque_id)
      const cultivoId = await obtenerOCrearCultivo(detalle.cultivo)

      await supabase
        .from('plantaciones')
        .update({ activa: false })
        .eq('bloque_id', trasForm.bloque_id)
        .eq('activa', true)

      let plantacionResult = await supabase
        .from('plantaciones')
        .insert({
          bloque_id: trasForm.bloque_id,
          cultivo_id: cultivoId,
          notas: detalle.variedad ? `Variedad: ${detalle.variedad}` : null,
          fecha_siembra: trasForm.fecha_real_trasplante,
          cantidad_plantas: trasForm.cantidad_plantas ? num(trasForm.cantidad_plantas) : null,
          activa: true,
        })
        .select('id')
        .single()

      if (plantacionResult.error && `${plantacionResult.error.message || ''}`.toLowerCase().includes('cantidad_plantas')) {
        plantacionResult = await supabase.from('plantaciones').insert({
          bloque_id:trasForm.bloque_id,
          cultivo_id:cultivoId,
          notas:detalle.variedad ? `Variedad: ${detalle.variedad}` : null,
          fecha_siembra:trasForm.fecha_real_trasplante,
          densidad_plantas_m2:trasForm.cantidad_plantas ? num(trasForm.cantidad_plantas) : null,
          activa:true,
        }).select('id').single()
      }
      const { data:plantacion, error:plantacionError } = plantacionResult

      if (plantacionError) throw plantacionError

      const { error: loteError } = await supabase
        .from('vivero_lotes')
        .update({
          fecha_real_trasplante: trasForm.fecha_real_trasplante,
          estado: trasForm.finalizar_lote ? 'trasplantado' : 'listo',
          bloque_id: trasForm.bloque_id,
          plantacion_id: plantacion.id,
          cantidad_trasplantada: num(trasForm.cantidad_plantas),
        })
        .eq('id', detalle.id)

      if (loteError) throw loteError

      await registrarAuditoria({
        accion: 'Trasplanto lote de vivero',
        modulo: 'Vivero',
        tabla: 'plantaciones',
        registroId: plantacion.id,
        detalle: `${detalle.cultivo} -> bloque ${bloque?.codigo || ''}`,
      })

      setModalTrasplante(false)
      setDetalle(null)
      await fetchLotes()
    } catch (err) {
      setError(`No se pudo trasplantar el lote: ${err.message || 'revisa Supabase'}`)
    }

    setSaving(false)
  }

  return (
    <div className="ag-page bl-module-page" data-tone="agua">
      <header className="bl-page-head">
        <div className="bl-page-title">
          <span className="bl-page-icon" aria-hidden="true"><ViveroIcon size={24} color="#fff" /></span>
          <div><small>Plantinero</small><h1 className="ag-page-title">Vivero</h1></div>
        </div>
        <button className="ag-primary" aria-label="Agregar lote" onClick={abrirNuevo}><i className="ti ti-plus" aria-hidden="true" />Nuevo lote</button>
      </header>

      {error && <div className="ag-feedback ag-feedback-error" role="alert">{error}</div>}

      <div className="bl-kpi-row">
        <Stat label="Lotes activos" value={resumen.activos} sub={`${lotes.length} totales`} />
        <Stat label="Germinación" value={`${resumen.germinacion}%`} sub={`${resumen.germinadas} de ${resumen.semillas}`} />
        <Stat label="Pérdidas" value={resumen.perdidas} sub="plantines" />
        <Stat label="Semillas" value={resumen.semillas} sub="sembradas" />
      </div>

      <div className="ag-page-body">
        {lotes.length === 0 ? (
          <div className="empty-state"><span className="empty-state__icon"><i className="ti ti-seeding" aria-hidden="true" /></span><div><strong>Sin lotes de vivero</strong><p>Registrá el primer lote con «Nuevo lote».</p></div></div>
        ) : (
          <div className="bl-card-grid">
            {lotes.map(lote => {
              const germ = Math.min(100, pct(lote.germinadas, lote.cantidad_semillas))
              return (
                <button className="ag-surface nursery-lot-card" key={lote.id} onClick={() => setDetalle(lote)} data-state={lote.estado}>
                  {Array.isArray(lote.fotos) && lote.fotos[0]?.url && <span className="nursery-lot-photo"><img src={lote.fotos[0].url} alt={`Plantines de ${lote.cultivo}`} loading="lazy" /><small><i className="ti ti-photo" aria-hidden="true" /> {lote.fotos.length}</small></span>}
                  <span className="nursery-lot-head">
                    <span className="nursery-ring" style={{ '--p': germ }} role="img" aria-label={`Germinación ${germ}%`}><b className="mono">{germ}%</b></span>
                    <span className="nursery-lot-title"><strong>{lote.cultivo}</strong><em>{lote.variedad || 'Sin variedad'}</em><small className="mono">{lote.fecha_siembra} · {lote.campos?.nombre || 'Sin campo'}</small></span>
                    <span className="nursery-state">{lote.estado}</span>
                  </span>
                  <span className="nursery-lot-data">
                    <Mini label="Semillas" value={lote.cantidad_semillas || 0} />
                    <Mini label="Germinadas" value={lote.germinadas || 0} />
                    <Mini label="Pérdidas" value={lote.perdidas || 0} />
                  </span>
                  <span className="germination-progress"><span><b style={{ width:`${germ}%` }} /></span><small><span>Germinación</span><strong className="numeric-data">{germ}%</strong></small></span>
                </button>
              )
            })}
          </div>
        )}

        <NotasPanel modulo="vivero" titulo="Bloc de notas del vivero" />
      </div>

      {detalle && (
        <div className="bl-overlay" onClick={e => e.target === e.currentTarget && setDetalle(null)}>
          <div className="bl-sheet">
            <div className="ui-60c2bd">
              <div>
                <div className="ui-93a7e1">Detalle de lote</div>
                <div className="ui-02cbdf">{detalle.cultivo}</div>
                <div className="ui-d239cf">{detalle.variedad || 'Sin variedad'}</div>
              </div>
              <button aria-label="Cerrar" onClick={() => setDetalle(null)} className="bl-icon-btn ag-close-btn"><i className="ti ti-x" /></button>
            </div>

            <div className="ui-d87c39">
              <Info label="Fecha siembra" value={detalle.fecha_siembra} />
              <Info label="Fecha estimada trasplante" value={detalle.fecha_estimada_trasplante || '-'} />
              <Info label="Fecha real trasplante" value={detalle.fecha_real_trasplante || '-'} />
              <Info label="Semilla" value={detalle.semilla || '-'} />
              <Info label="Sustrato" value={detalle.sustrato || '-'} />
              <Info label="Abono en sustrato" value={detalle.abono_sustrato || '-'} />
              <Info label="Comprado a" value={detalle.proveedor || '-'} />
              <Info label="Precio de compra" value={detalle.precio_compra ? `Gs. ${Number(detalle.precio_compra).toLocaleString('es-PY')}` : '-'} />
              <Info label="Bandejas" value={detalle.bandejas || 0} />
              <Info label="Germinacion" value={`${pct(detalle.germinadas, detalle.cantidad_semillas)}%`} />
              <Info label="Perdidas" value={detalle.perdidas || 0} last />
            </div>

            {detalle.notas && <div className="ui-9c4127">{detalle.notas}</div>}

            {Array.isArray(detalle.fotos) && detalle.fotos.length > 0 && <div className="nursery-photo-gallery"><div className="bl-label">Fotos de los plantines</div><div>{detalle.fotos.map(foto => <img key={foto.id || foto.url} src={foto.url} alt={foto.nombre || `Plantines de ${detalle.cultivo}`} loading="lazy" />)}</div></div>}

            {detalle.bloque_id ? (
              <button className="ui-fa3e1c" onClick={() => navigate(`/bloque/${detalle.bloque_id}`)} style={{ ...primaryBtn }}>
                Ver bloque trasplantado
              </button>
            ) : detalle.estado !== 'trasplantado' && (
              <button className="ui-606a6c" onClick={() => abrirTrasplante(detalle)} style={{ ...primaryBtn }}>
                Trasplantar a bloque
              </button>
            )}

            <div className="ui-b3c308">
              <div className="ui-9535b3">Tratamientos</div>
              <button className="ag-small-action ui-8ab10c" onClick={() => { setTratForm(tratamientoInicial); setModalTratamiento(true) }}>+ Tratamiento</button>
            </div>
            {tratamientos.length === 0 ? (
              <div className="ui-c0d22a">Sin tratamientos registrados.</div>
            ) : tratamientos.map(t => (
              <div className="ui-190117" key={t.id}>
                <div className="ui-843e0a">{t.tipo}</div>
                <div className="ui-a8f171">{t.fecha}{t.producto ? ` · ${t.producto}` : ''}{t.dosis ? ` · ${t.dosis}` : ''}</div>
                {t.notas && <div className="ui-e396da">{t.notas}</div>}
                <div className="ui-e396ba"><button className="ag-small-action ui-794ba0" onClick={() => editarTratamiento(t)} style={{ ...secondaryBtn }}>Editar</button><button className="ag-small-action ui-794ba0" onClick={() => anularTratamiento(t)} style={{ ...dangerBtn }}>Anular</button></div>
              </div>
            ))}

            <div className="ui-0a45a3">
              <button onClick={() => abrirEditar(detalle)} className="bl-btn bl-btn--ghost">Editar lote</button>
              <button onClick={() => eliminarLote(detalle.id)} className="bl-btn bl-btn--danger">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="bl-overlay">
          <div className="bl-sheet">
            <div className="ui-9c155f">{form.id ? 'Editar lote' : 'Nuevo lote de vivero'}</div>
            <p className="nursery-form-intro">Guardá el origen, costo y evidencia visual del lote desde el primer día.</p>
            <Select label="Campo" value={form.campo_id} onChange={v => setForm(f => ({ ...f, campo_id:v }))} options={campos.map(c => [c.id, c.nombre])} />
            <Field label="Fecha de siembra *" type="date" value={form.fecha_siembra} onChange={v => setForm(f => ({ ...f, fecha_siembra:v }))} />
            <Field label="Cultivo/semilla *" value={form.cultivo} onChange={v => setForm(f => ({ ...f, cultivo:v }))} placeholder="Ej: Tomate" />
            <Field label="Variedad" value={form.variedad} onChange={v => setForm(f => ({ ...f, variedad:v }))} placeholder="Ej: Sheila, Nathalie" />
            <Field label="Detalle de semilla" value={form.semilla} onChange={v => setForm(f => ({ ...f, semilla:v }))} placeholder="Marca, lote o procedencia" />
            <div className="ui-f56ef1">
              <Field label="Proveedor / vendedor" value={form.proveedor} onChange={v => setForm(f => ({ ...f, proveedor:v }))} placeholder="Nombre de la persona o empresa" />
              <Field label="Precio de compra (Gs.)" type="number" value={form.precio_compra} onChange={v => setForm(f => ({ ...f, precio_compra:v }))} placeholder="Ej: 250.000" />
            </div>
            <div className="nursery-photo-uploader">
              <input ref={fotosRef} type="file" accept="image/*" multiple onChange={agregarFotos} />
              <div className="nursery-photo-uploader__head"><div><strong>Fotos de los plantines</strong><span>Hasta 6 imágenes. Se optimizan antes de guardar.</span></div><button type="button" className="bl-btn bl-btn--ghost" onClick={() => fotosRef.current?.click()}><i className="ti ti-camera-plus" aria-hidden="true" /> Agregar fotos</button></div>
              {(form.fotos || []).length > 0 ? <div className="nursery-photo-preview">{form.fotos.map(foto => <figure key={foto.id || foto.url}><img src={foto.url} alt={foto.nombre || 'Plantines'} /><button type="button" aria-label="Quitar foto" onClick={() => quitarFoto(foto.id)}><i className="ti ti-x" aria-hidden="true" /></button></figure>)}</div> : <div className="nursery-photo-empty"><i className="ti ti-photo" aria-hidden="true" /><span>Todavía no agregaste fotos a este lote.</span></div>}
            </div>
            <div className="ui-f56ef1">
              <Field label="Cantidad semillas" type="number" value={form.cantidad_semillas} onChange={v => setForm(f => ({ ...f, cantidad_semillas:v }))} />
              <Field label="Bandejas" type="number" value={form.bandejas} onChange={v => setForm(f => ({ ...f, bandejas:v }))} />
            </div>
            <Field label="Sustrato" value={form.sustrato} onChange={v => setForm(f => ({ ...f, sustrato:v }))} placeholder="Ej: turba + perlita" />
            <Field label="Abono incorporado al sustrato" value={form.abono_sustrato} onChange={v => setForm(f => ({ ...f, abono_sustrato:v }))} placeholder="Ej: 15-15-15, humus, compost" />
            <div className="ui-f56ef1">
              <Field label="Trasplante estimado" type="date" value={form.fecha_estimada_trasplante} onChange={v => setForm(f => ({ ...f, fecha_estimada_trasplante:v }))} />
              <Field label="Trasplante real" type="date" value={form.fecha_real_trasplante} onChange={v => setForm(f => ({ ...f, fecha_real_trasplante:v }))} />
            </div>
            <div className="ui-f56ef1">
              <Field label="Germinadas" type="number" value={form.germinadas} onChange={v => setForm(f => ({ ...f, germinadas:v }))} />
              <Field label="Perdidas" type="number" value={form.perdidas} onChange={v => setForm(f => ({ ...f, perdidas:v }))} />
            </div>
            <Select label="Estado" value={form.estado} onChange={v => setForm(f => ({ ...f, estado:v }))} options={estados.map(e => [e, e])} />
            <Field label="Notas" textarea value={form.notas} onChange={v => setForm(f => ({ ...f, notas:v }))} placeholder="Observaciones del lote..." />
            <button onClick={guardarLote} disabled={saving} className="bl-btn bl-btn--primary">{saving ? 'Guardando...' : 'Guardar lote'}</button>
            <button onClick={() => setModal(false)} className="bl-btn bl-btn--ghost">Cancelar</button>
          </div>
        </div>
      )}

      {modalTratamiento && (
        <div className="bl-overlay">
          <div className="bl-sheet">
            <div className="ui-9c155f">{tratForm.id ? 'Editar tratamiento' : 'Nuevo tratamiento'}</div>
            <Field label="Fecha *" type="date" value={tratForm.fecha} onChange={v => setTratForm(f => ({ ...f, fecha:v }))} />
            <Field label="Tipo *" value={tratForm.tipo} onChange={v => setTratForm(f => ({ ...f, tipo:v }))} placeholder="Ej: fungicida, fertilizante, enraizante" />
            <Field label="Producto" value={tratForm.producto} onChange={v => setTratForm(f => ({ ...f, producto:v }))} />
            <Field label="Dosis" value={tratForm.dosis} onChange={v => setTratForm(f => ({ ...f, dosis:v }))} />
            <Field label="Responsable" value={tratForm.responsable} onChange={v => setTratForm(f => ({ ...f, responsable:v }))} />
            <Field label="Notas" textarea value={tratForm.notas} onChange={v => setTratForm(f => ({ ...f, notas:v }))} />
            <button onClick={guardarTratamiento} disabled={saving} className="bl-btn bl-btn--primary">{saving ? 'Guardando...' : tratForm.id ? 'Guardar cambios' : 'Guardar tratamiento'}</button>
            <button onClick={() => setModalTratamiento(false)} className="bl-btn bl-btn--ghost">Cancelar</button>
          </div>
        </div>
      )}

      {modalTrasplante && detalle && (
        <div className="bl-overlay">
          <div className="bl-sheet">
            <div className="ui-d26ea9">Trasplantar a bloque</div>
            <div className="ui-67972d">
              {detalle.cultivo}{detalle.variedad ? ` - ${detalle.variedad}` : ''} · {detalle.campos?.nombre || 'Sin campo'}
            </div>
            {error && <div className="ui-99ac05">{error}</div>}
            <Select
              label="Bloque destino *"
              value={trasForm.bloque_id}
              onChange={v => setTrasForm(f => ({ ...f, bloque_id:v }))}
              options={bloques
                .filter(b => !detalle.campo_id || b.campo_id === detalle.campo_id)
                .map(b => [b.id, `${b.codigo} - ${b.campos?.nombre || 'Sin campo'}`])}
            />
            <Field label="Fecha real de trasplante *" type="date" value={trasForm.fecha_real_trasplante} onChange={v => setTrasForm(f => ({ ...f, fecha_real_trasplante:v }))} />
            <Field label="Cantidad de plantas" type="number" value={trasForm.cantidad_plantas} onChange={v => setTrasForm(f => ({ ...f, cantidad_plantas:v }))} />
            <label className="ui-e68140">
              <input
                type="checkbox"
                checked={!!trasForm.finalizar_lote}
                onChange={e => setTrasForm(f => ({ ...f, finalizar_lote:e.target.checked }))}
              />
              Marcar lote como trasplantado
            </label>
            <button onClick={guardarTrasplante} disabled={saving} className="bl-btn bl-btn--primary">{saving ? 'Trasplantando...' : 'Crear plantacion en mapa'}</button>
            <button onClick={() => setModalTrasplante(false)} className="bl-btn bl-btn--ghost">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="kpi-card nursery-kpi">
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value numeric-data">{value}</div>
      <div className="kpi-card__detail">{sub}</div>
    </div>
  )
}

function Mini({ label, value }) {
  return <span className="nursery-datum"><span>{label}</span><strong className="numeric-data">{value}</strong></span>
}

function Info({ label, value, last }) {
  return <div className="ui-4a6b0f" style={{ borderBottom:last ? 'none' : '1px solid #e8e8e8' }}><span className="ui-5e0192">{label}</span><strong className="ui-d4a5ed">{value}</strong></div>
}

// Los enteros se escriben como texto: un <input type="number"> descarta "41.497" o "1.000.000".
function Field({ label, value, onChange, type = 'text', placeholder = '', textarea }) {
  const entero = type === 'number'
  return (
    <label className="bl-field">
      <div className="bl-label">{label}</div>
      {textarea ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="bl-input bl-textarea" />
      ) : entero ? (
        <input type="text" inputMode="numeric" autoComplete="off" value={value ?? ''} onChange={e => onChange(e.target.value.replace(/[^0-9.,\s]/g, ''))} onBlur={() => onChange(formatLocaleInteger(value))} onWheel={blurNumberInputOnWheel} placeholder={placeholder || 'Ej: 1.000'} className="bl-input mono" />
      ) : (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="bl-input" />
      )}
    </label>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="ui-fa9aec">
      <div className="bl-label">{label}</div>
      <select value={value || ''} onChange={e => onChange(e.target.value)} className="bl-input">
        <option value="">Sin asignar</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

const primaryBtn = { width:'100%', padding:14, borderRadius:'var(--ag-radius)', background:"#124e38", border:'none', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }
const secondaryBtn = { width:'100%', padding:12, borderRadius:'var(--ag-radius)', background:'transparent', border:'1px solid #d9ddd8', color:'#555', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }
const dangerBtn = { ...secondaryBtn, border:'1px solid #ffcccc', color:'#c84040', background:'#fff0f0' }
