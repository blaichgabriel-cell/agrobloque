import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Skeleton, Modal } from '../components/UI'
import QRCode from 'qrcode'
import { esAdministradorGeneral } from '../lib/plataforma'
import { supabase } from '../lib/supabase'
import { registrarAuditoria } from '../lib/audit'
import { formatLocaleInteger, parseLocaleInteger } from '../lib/numbers'
import { useCan } from '../lib/RoleContext'
import NotasPanel from '../components/NotasPanel'

const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / 86400000)
}
const fmtGs = (n) => Math.round(Number(n)||0).toLocaleString('es-PY')
const fmtKg = (n) => { const num=Number(n)||0; return num%1===0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY',{minimumFractionDigits:1,maximumFractionDigits:2}) }
const escapeHtml = (valor) => String(valor ?? '').replace(/[&<>'"]/g, caracter => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[caracter])
const MARCA_FIN_SEMANA = /\s*\[\[semana_fin:(\d{4}-\d{2}-\d{2})\]\]\s*/
const notasFertilizacionVisibles = (notas = '') => String(notas || '').replace(MARCA_FIN_SEMANA, '').trim()
const sumarDiasFecha = (fecha, dias) => {
  const valor = new Date(`${fecha}T12:00:00`)
  valor.setDate(valor.getDate() + dias)
  return valor.toISOString().split('T')[0]
}
const fechaCorta = (fecha) => fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-PY', { day:'numeric', month:'short', year:'numeric' }) : '-'
const rangoFertilizacion = (fertilizacion) => {
  if (!fertilizacion?.plan_id) return fertilizacion?.fecha || '-'
  const finMarcado = String(fertilizacion.notas || '').match(MARCA_FIN_SEMANA)?.[1]
  const fin = finMarcado || sumarDiasFecha(fertilizacion.fecha, 6)
  return `${fechaCorta(fertilizacion.fecha)} al ${fechaCorta(fin)}`
}
const fmtAbonoPlantacion = (abono) => {
  if (!abono?.cantidad) return '-'
  const unidad = abono.unidad || 'kg'
  const alcance = (abono.alcance || 'total') === 'por_tablon' ? 'por tablon' : 'total'
  return `${abono.cantidad} ${unidad} ${alcance}`
}

const CAUSAS_MUERTE = ['Enfermedad','Dumping off','Esclerotinia','Insectos','Hormigas','Gusanos','Clima','Riego','Otra']
const UNIDADES = ['kg','g','cc','ml','L','unidad']

function ModalConfirm({ titulo, mensaje, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface ui-211525">
        <div className="ui-3e43be">{titulo}</div>
        {mensaje && <div className="ui-01159a">{mensaje}</div>}
        <div className="ui-9c6869">
          <button className="ag-small-action ui-395a62" onClick={onCancel}>Cancelar</button>
          <button className="ag-small-action ui-f5f413" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </Modal>
  )
}

export default function FichaBloque() {
  const can = useCan('mapa')
  const canFert = useCan('plan_nutricional')
  const canFum = useCan('fumigaciones')
  const canCos = useCan('cosecha')
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [bloque, setBloque] = useState(null)
  const [plantacionActiva, setPlantacionActiva] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cosechasCiclo, setCosechasCiclo] = useState([])
  const [costosCiclo, setCostosCiclo] = useState({ loading:true, total:0, insumos:0, fumigaciones:0, fertilizaciones:0, manuales:0, consumos:[], costosManuales:[], error:'' })
  const [detalleCostos, setDetalleCostos] = useState(null)
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const [showInformeOpciones, setShowInformeOpciones] = useState(false)
  const [estadoInforme, setEstadoInforme] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [cosechaError, setCosechaError] = useState('')
  const [cosechaSuccess, setCosechaSuccess] = useState('')
  const [incidencias, setIncidencias] = useState([])
  const [fotos, setFotos] = useState([])
  const [fotoPendiente, setFotoPendiente] = useState(null)
  const [fotoDescripcion, setFotoDescripcion] = useState('')
  const [fotoError, setFotoError] = useState('')
  const [muertes, setMuertes] = useState([])
  const [cultivos, setCultivos] = useState([])
  const [abonos, setAbonos] = useState([])
  const [abonosPlantacion, setAbonosPlantacion] = useState([])
  const [bloquesCampo, setBloquesCampo] = useState([])

  // Fertilizacion
  const [fertilizaciones, setFertilizaciones] = useState([])
  const [planSemanal, setPlanSemanal] = useState(null)
  const [aplicacionesPlan, setAplicacionesPlan] = useState([])
  const [showPlanSemanal, setShowPlanSemanal] = useState(false)
  const [showAplicarPlan, setShowAplicarPlan] = useState(false)
  const [showNuevaFertilizacion, setShowNuevaFertilizacion] = useState(false)
  const [formFert, setFormFert] = useState({
    fecha: new Date().toISOString().split('T')[0],
    bloques_ids: [],
    notas: '',
    soluciones: [
      { nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }
    ]
  })
  const [formPlan, setFormPlan] = useState({
    nombre: 'Plan semanal',
    fecha_inicio: new Date().toISOString().split('T')[0],
    litros_preparados: '',
    notas: '',
    soluciones: [
      { nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }
    ],
  })
  const [formAplicacionPlan, setFormAplicacionPlan] = useState({
    fecha: new Date().toISOString().split('T')[0],
    litros_aplicados: '',
    responsable: '',
    notas: '',
  })
  const [savingFert, setSavingFert] = useState(false)
  const [fertDetalle, setFertDetalle] = useState(null)
  const [confirmarElimFert, setConfirmarElimFert] = useState(null)

  const [seccion, setSeccion] = useState('plantacion')
  const [historialDetalle, setHistorialDetalle] = useState(null)
  const [historialCiclo, setHistorialCiclo] = useState(null)
  const [historialCicloLoading, setHistorialCicloLoading] = useState(false)
  const [historialCicloError, setHistorialCicloError] = useState('')
  const [incidenciaDetalle, setIncidenciaDetalle] = useState(null)

  const [showEditarPlantacion, setShowEditarPlantacion] = useState(false)
  const [showEditarNombre, setShowEditarNombre] = useState(false)
  const [nombreBloque, setNombreBloque] = useState('')
  const [nombreBloqueError, setNombreBloqueError] = useState('')
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [showMuerte, setShowMuerte] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  const [form, setForm] = useState({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
  const [formMuerte, setFormMuerte] = useState({ cantidad:'', causa:'Enfermedad', descripcion:'' })
  const [nuevoCultivoNombre, setNuevoCultivoNombre] = useState('')
  const [cultivoRapidoError, setCultivoRapidoError] = useState('')
  const [cultivosLoading, setCultivosLoading] = useState(false)
  const [plantacionFormError, setPlantacionFormError] = useState('')
  const [nuevoAbonoNombre, setNuevoAbonoNombre] = useState('')
  const [abonoRapidoError, setAbonoRapidoError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [puedeVerQr, setPuedeVerQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrError, setQrError] = useState('')

  useEffect(() => { let activo=true; esAdministradorGeneral().then(valor => { if (activo) setPuedeVerQr(valor) }); return () => { activo=false } }, [])
  const [mensajeExito, setMensajeExito] = useState('')
  const [showQuickActions, setShowQuickActions] = useState(false)

  const abrirEditarNombre = () => {
    setNombreBloque(bloque?.codigo || '')
    setNombreBloqueError('')
    setShowEditarNombre(true)
  }

  const guardarNombreBloque = async () => {
    const nuevoNombre = nombreBloque.trim()
    if (!nuevoNombre) return setNombreBloqueError('Escribí un nombre para el bloque.')
    const repetido = bloquesCampo.some(item => item.id !== bloque.id && String(item.codigo || '').trim().toLowerCase() === nuevoNombre.toLowerCase())
    if (repetido) return setNombreBloqueError('Ya existe otro bloque con ese nombre en este campo.')
    if (nuevoNombre === String(bloque.codigo || '').trim()) return setShowEditarNombre(false)
    setSaving(true); setNombreBloqueError('')
    const nombreAnterior = bloque.codigo
    const { error } = await supabase.from('bloques').update({ codigo:nuevoNombre }).eq('id', bloque.id)
    if (error) {
      setNombreBloqueError(error.code === '23505' ? 'Ya existe otro bloque con ese nombre.' : `No se pudo cambiar el nombre: ${error.message || 'intentá nuevamente.'}`)
      setSaving(false)
      return
    }
    setBloque(actual => ({ ...actual, codigo:nuevoNombre }))
    setBloquesCampo(actual => actual.map(item => item.id === bloque.id ? { ...item, codigo:nuevoNombre } : item).sort((a,b) => String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric:true })))
    await registrarAuditoria({ accion:'Edito nombre de bloque', modulo:'Bloque', tabla:'bloques', registroId:bloque.id, detalle:`${nombreAnterior} → ${nuevoNombre}` })
    setSaving(false); setShowEditarNombre(false); setMensajeExito(`El bloque ahora se llama ${nuevoNombre}.`)
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      const main = document.querySelector('[data-app-scroll]')
      if (main) main.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    setSeccion('plantacion')
    setHistorialDetalle(null)
    setHistorialCiclo(null)
    setHistorialCicloError('')
    setFertDetalle(null)
    setIncidenciaDetalle(null)
    fetchData()
  }, [id])

  useEffect(() => {
    if (!bloque || typeof window === 'undefined') return
    const url = `${window.location.origin}/bloque/${id}`
    setQrError('')
    QRCode.toDataURL(url, { width:720, margin:2, errorCorrectionLevel:'H' })
      .then(setQrDataUrl)
      .catch(() => setQrError('No se pudo generar el QR de este bloque.'))
  }, [bloque, id])

  const abrirCargaRapida = (modulo) => {
    if (!bloque) return
    if (modulo === 'fertilizacion') {
      setSeccion('fertilizacion')
      abrirNuevaFertilizacion()
      return
    }
    navigate(`/${modulo}?nuevo=1&campo=${encodeURIComponent(bloque.campo_id || '')}&bloque=${encodeURIComponent(id)}`)
  }

  const archivoQr = () => {
    // Convertir sin await mantiene activo el toque requerido por Safari para compartir.
    const bytes = Uint8Array.from(atob(qrDataUrl.split(',')[1]), c => c.charCodeAt(0))
    const nombre = `QR-${bloque.campos?.nombre || 'Campo'}-${bloque.codigo || id}.png`.replace(/[^a-zA-Z0-9._-]+/g, '-')
    return new File([bytes], nombre, { type:'image/png' })
  }

  const compartirQr = async () => {
    if (!qrDataUrl) return
    setQrError('')
    try {
      const files = [archivoQr()]
      if (!navigator.canShare?.({ files })) {
        setQrError('Este navegador no permite compartir la imagen. Proba Descargar o mantené presionado el QR para guardarlo.')
        return
      }
      await navigator.share({ files })
    } catch (error) {
      if (error.name !== 'AbortError') setQrError('No se pudo compartir el QR. Proba Descargar o mantené presionado el QR para guardarlo.')
    }
  }

  const descargarQr = () => {
    if (!qrDataUrl) return
    setQrError('')
    try {
      const archivo = archivoQr()
      const url = URL.createObjectURL(archivo)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = archivo.name
      document.body.appendChild(enlace)
      try {
        enlace.click()
      } finally {
        enlace.remove()
        // Safari necesita tiempo para iniciar la lectura del archivo.
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
    } catch (error) {
      setQrError('No se pudo iniciar la descarga. Proba Compartir / Guardar o mantené presionado el QR para guardarlo.')
    }
  }

  const imprimirQr = () => {
    if (!qrDataUrl) return
    const ventana = window.open('', '_blank', 'width=520,height=720')
    if (!ventana) {
      setQrError('El navegador bloqueó la impresión. Habilita las ventanas emergentes y probá de nuevo.')
      return
    }
    const escapar = (valor) => String(valor || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
    const campo = escapar(bloque.campos?.nombre || 'Campo')
    const codigo = escapar(bloque.codigo)
    ventana.document.write(`<!doctype html><html><head><title>QR Bloque ${codigo}</title><style>body{font-family:Arial,sans-serif;margin:0;display:flex;justify-content:center}.etiqueta{width:360px;text-align:center;border:2px solid #111;border-radius:18px;padding:24px;margin:20px}.marca{font-size:14px;font-weight:800;letter-spacing:1px}.campo{font-size:18px;margin-top:14px}.bloque{font-size:32px;font-weight:900;margin:4px 0 10px}.qr{width:290px;height:290px}.ayuda{font-size:13px;margin-top:10px}@media print{.etiqueta{margin:0}}</style></head><body><div class="etiqueta"><div class="marca">AGROBLOQUE</div><div class="campo">${campo}</div><div class="bloque">Bloque ${codigo}</div><img class="qr" src="${qrDataUrl}" alt="QR del bloque"/><div class="ayuda">Escanear para ver el bloque y registrar trabajos</div></div><script>window.onload=()=>window.print()</script></body></html>`)
    ventana.document.close()
  }

  const fetchData = async () => {
    setCostosCiclo(actual => ({ ...actual, loading:true, error:'' }))
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)
    if (b?.campo_id) {
      const { data: bloquesDelCampo } = await supabase
        .from('bloques')
        .select('id, codigo, tipo, activo, plantaciones(activa, cultivos(nombre))')
        .eq('campo_id', b.campo_id)
        .eq('activo', true)
        .order('codigo')
      setBloquesCampo(bloquesDelCampo || [])
    } else {
      setBloquesCampo([])
    }

    const { data: plantas } = await supabase.from('plantaciones')
      .select('*, cultivos(nombre), plantacion_abonos(*, abonos(nombre))').eq('bloque_id', id).order('created_at', { ascending: false })
    if (plantas) {
      const activa = plantas.find(p => p.activa) || null
      setPlantacionActiva(activa)
      setHistorial(plantas.filter(p => !p.activa))

      if (activa) {
        const { data: ab } = await supabase.from('plantacion_abonos').select('*, abonos(nombre)').eq('plantacion_id', activa.id)
        setAbonosPlantacion(ab || [])

        const { data: cos } = await supabase.from('cosechas')
          .select('*')
          .eq('bloque_id', id)
          .gte('fecha', activa.fecha_siembra || '2000-01-01')
          .order('fecha', { ascending: false })
        setCosechasCiclo((cos || []).filter(cosecha => !cosecha.anulada))

        const { data: fumBloques } = await supabase.from('fumigacion_bloques')
          .select('fumigaciones(id, fecha, notas, tipo, operario, tanques_cantidad, tanque_litros, campos(nombre), fumigacion_bloques(bloque_id, bloques(codigo)), fumigacion_productos(*, productos(nombre, unidad, carencia_dias)))')
          .eq('bloque_id', id)
        const inc = (fumBloques || [])
          .map(fb => fb.fumigaciones)
          .filter(Boolean)
          .sort((a, b) => b.fecha.localeCompare(a.fecha))
        setIncidencias(inc)

        const { data: fts } = await supabase.from('fotos_bloque')
          .select('*').eq('bloque_id', id).eq('plantacion_id', activa.id)
          .order('created_at', { ascending: false })
        const fotosIds = (fts || []).map(foto => foto.id)
        const { data: descripcionesFotos } = fotosIds.length ? await supabase.from('notas_modulo')
          .select('referencia_id,contenido')
          .eq('modulo', 'fotos_bloque')
          .eq('referencia_tipo', 'foto_bloque')
          .in('referencia_id', fotosIds) : { data:[] }
        const descripcionPorFoto = Object.fromEntries((descripcionesFotos || []).map(nota => [nota.referencia_id, nota.contenido]))
        setFotos((fts || []).map(foto => ({ ...foto, descripcion:descripcionPorFoto[foto.id] || '' })))

        const { data: mts } = await supabase.from('muertes_plantas')
          .select('*').eq('bloque_id', id).eq('plantacion_id', activa.id)
          .order('fecha', { ascending: false })
        setMuertes(mts || [])

        const [consumosResultado, costosResultado] = await Promise.all([
          supabase.from('consumos_valorizados')
            .select('id, fecha, cantidad_stock, costo_unitario, costo_total, origen_tipo, origen_id, anulado, productos(nombre, unidad)')
            .eq('plantacion_id', activa.id),
          supabase.from('costos')
            .select('id, monto, fecha, tipo, descripcion, plantacion_id, anulada')
            .eq('bloque_id', id)
            .gte('fecha', activa.fecha_siembra || '2000-01-01'),
        ])
        const consumos = (consumosResultado.data || []).filter(item => !item.anulado)
        const manuales = (costosResultado.data || []).filter(item => !item.anulada && (!item.plantacion_id || item.plantacion_id === activa.id))
        const fumigaciones = consumos.filter(item => item.origen_tipo === 'consumo_fumigacion').reduce((suma, item) => suma + Number(item.costo_total || 0), 0)
        const fertilizaciones = consumos.filter(item => item.origen_tipo === 'consumo_fertilizacion').reduce((suma, item) => suma + Number(item.costo_total || 0), 0)
        const insumos = consumos.reduce((suma, item) => suma + Number(item.costo_total || 0), 0)
        const manualesTotal = manuales.reduce((suma, item) => suma + Number(item.monto || 0), 0)
        setCostosCiclo({
          loading:false,
          total:insumos + manualesTotal,
          insumos,
          fumigaciones,
          fertilizaciones,
          manuales:manualesTotal,
          consumos,
          costosManuales:manuales,
          error:consumosResultado.error || costosResultado.error ? 'No se pudieron consultar todos los costos del ciclo.' : '',
        })
      } else {
        setCostosCiclo({ loading:false, total:0, insumos:0, fumigaciones:0, fertilizaciones:0, manuales:0, consumos:[], costosManuales:[], error:'' })
      }
    }

    // Fertilizaciones del bloque (todas, independiente de plantacion)
    const { data: ferts } = await supabase.from('fertilizaciones')
      .select('*')
      .eq('bloque_id', id)
      .order('fecha', { ascending: false })
    setFertilizaciones(ferts || [])

    const { data: planes } = await supabase.from('fertilizacion_planes')
      .select('*')
      .eq('bloque_id', id)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(1)
    const plan = (planes || [])[0] || null
    setPlanSemanal(plan)
    if (plan) {
      const { data: apps } = await supabase.from('fertilizacion_plan_aplicaciones')
        .select('*')
        .eq('plan_id', plan.id)
        .order('fecha', { ascending: false })
      setAplicacionesPlan(apps || [])
    } else {
      setAplicacionesPlan([])
    }
  }

  const fetchCultivos = async () => {
    const { data } = await supabase.from('cultivos').select('*').order('nombre')
    setCultivos(data || [])
  }

  const fetchAbonos = async () => {
    const { data } = await supabase.from('abonos').select('*').order('nombre')
    setAbonos(data || [])
  }

  const abrirNuevaPlantacion = async () => {
    setCultivosLoading(true)
    const [{ data: cultivosData, error: cultivosError }, { data: abonosData, error: abonosError }] = await Promise.all([
      supabase.from('cultivos').select('*').order('nombre'),
      supabase.from('abonos').select('*').order('nombre')
    ])
    setCultivos(cultivosData || [])
    setAbonos(abonosData || [])
    setForm({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
    setNuevoCultivoNombre('')
    setCultivoRapidoError(cultivosError ? `No se pudo cargar el catálogo de cultivos: ${cultivosError.message}` : '')
    setAbonoRapidoError(abonosError ? `No se pudo cargar el catálogo de abonos: ${abonosError.message}` : '')
    setCultivosLoading(false)
    setPlantacionFormError('')
    setShowNuevaPlantacion(true)
  }

  const abrirEditarPlantacion = async () => {
    const [{ data: cultivosData }, { data: abonosData }] = await Promise.all([
      supabase.from('cultivos').select('*').order('nombre'),
      supabase.from('abonos').select('*').order('nombre')
    ])
    setCultivos(cultivosData || [])
    setAbonos(abonosData || [])

    const cultivo = (cultivosData || []).find(c => c.nombre === plantacionActiva?.cultivos?.nombre)
    const abIds = abonosPlantacion.map(a => a.abono_id)
    const abCants = {}
    abonosPlantacion.forEach(a => {
      abCants[a.abono_id] = a.cantidad || ''
      abCants[`${a.abono_id}_unidad`] = a.unidad || 'kg'
      abCants[`${a.abono_id}_alcance`] = a.alcance || 'total'
    })
    setForm({
      cultivo_id: cultivo?.id || '',
      variedad_texto: plantacionActiva?.notas?.replace('Variedad: ','') || '',
      fecha_siembra: plantacionActiva?.fecha_siembra || '',
      cantidad_plantas: plantacionActiva?.cantidad_plantas ?? plantacionActiva?.densidad_plantas_m2 ?? '',
      abonos_ids: abIds,
      abonos_cantidades: abCants
    })
    setNuevoCultivoNombre('')
    setCultivoRapidoError('')
    setShowEditarPlantacion(true)
  }

  const agregarCultivoRapido = async (nombreSugerido = '') => {
    const nombre = String(nombreSugerido || nuevoCultivoNombre).trim()
    if (!nombre) return null

    const existente = cultivos.find(c => (c.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
    if (existente) {
      setForm(f => ({ ...f, cultivo_id: existente.id }))
      setNuevoCultivoNombre('')
      setCultivoRapidoError('')
      return existente.id
    }

    const { data, error } = await supabase
      .from('cultivos')
      .insert({ nombre })
      .select('*')
      .single()

    if (error) {
      setCultivoRapidoError(`No se pudo agregar el cultivo: ${error.message}`)
      return null
    }

    const lista = [...cultivos, data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    setCultivos(lista)
    setForm(f => ({ ...f, cultivo_id: data.id }))
    setNuevoCultivoNombre('')
    setCultivoRapidoError('')
    return data.id
  }

  const toggleAbono = (abonoId) => {
    setForm(f => ({
      ...f,
      abonos_ids: f.abonos_ids.includes(abonoId) ? f.abonos_ids.filter(x => x!==abonoId) : [...f.abonos_ids, abonoId]
    }))
  }

  const guardarPlantacionCompatible = async (payload, plantacionId = null) => {
    const ejecutar = (datos) => plantacionId
      ? supabase.from('plantaciones').update(datos).eq('id', plantacionId).select().single()
      : supabase.from('plantaciones').insert(datos).select().single()
    let resultado = await ejecutar(payload)
    const texto = `${resultado.error?.message || ''} ${resultado.error?.details || ''}`.toLowerCase()
    if (resultado.error && (texto.includes('cantidad_plantas') || resultado.error.code === 'PGRST204')) {
      const { cantidad_plantas, ...compatibilidad } = payload
      resultado = await ejecutar({ ...compatibilidad, densidad_plantas_m2:cantidad_plantas || null })
    }
    if (resultado.error) throw resultado.error
    return resultado.data
  }

  const guardarNuevaPlantacion = async () => {
    setPlantacionFormError('')
    let cultivoId = form.cultivo_id
    if (!cultivoId && nuevoCultivoNombre.trim()) cultivoId = await agregarCultivoRapido()
    if (!cultivoId) {
      setPlantacionFormError('Seleccioná un cultivo o escribí uno nuevo antes de guardar.')
      return
    }
    if (!form.fecha_siembra) {
      setPlantacionFormError('Completá la fecha de siembra antes de guardar.')
      return
    }
    setSaving(true)
    let nueva = null
    try {
      let abonosIds = [...form.abonos_ids]
      if (nuevoAbonoNombre.trim()) {
        const abonoPendienteId = await agregarAbonoRapido()
        if (!abonoPendienteId) throw new Error('No se pudo agregar el abono escrito.')
        if (!abonosIds.includes(abonoPendienteId)) abonosIds.push(abonoPendienteId)
      }
      if (plantacionActiva) {
        const { error } = await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
        if (error) throw error
      }
      nueva = await guardarPlantacionCompatible({
        bloque_id: id, cultivo_id: cultivoId,
        notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
        fecha_siembra: form.fecha_siembra,
        cantidad_plantas: form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null,
        activa: true
      })
      if (nueva && abonosIds.length > 0) {
        const { error } = await supabase.from('plantacion_abonos').insert(
          abonosIds.map(ab => ({
            plantacion_id: nueva.id, abono_id: ab,
            cantidad: form.abonos_cantidades[ab] || null,
            unidad: form.abonos_cantidades[`${ab}_unidad`] || 'kg',
            alcance: form.abonos_cantidades[`${ab}_alcance`] || 'total'
          }))
        )
        if (error) throw error
      }
      setShowNuevaPlantacion(false)
      await registrarAuditoria({ accion:'Registro plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:nueva?.id || '', detalle:`Bloque ${bloque?.codigo || ''}` })
      await fetchData()
    } catch (error) {
      if (nueva?.id) await supabase.from('plantaciones').update({ activa: false }).eq('id', nueva.id)
      if (plantacionActiva) await supabase.from('plantaciones').update({ activa: true }).eq('id', plantacionActiva.id)
      setPlantacionFormError(`No se pudo guardar la plantación: ${error.message || 'intentá nuevamente.'}`)
    } finally {
      setSaving(false)
    }
  }

  const guardarEditarPlantacion = async () => {
    if (!plantacionActiva || !form.cultivo_id || !form.fecha_siembra) return
    setSaving(true); setPlantacionFormError('')
    try {
      await guardarPlantacionCompatible({ cultivo_id:form.cultivo_id, notas:form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null, fecha_siembra:form.fecha_siembra, cantidad_plantas:form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null }, plantacionActiva.id)
      const { error:eliminarError } = await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
      if (eliminarError) throw eliminarError
      if (form.abonos_ids.length > 0) {
        const { error:abonosError } = await supabase.from('plantacion_abonos').insert(form.abonos_ids.map(ab => ({ plantacion_id:plantacionActiva.id, abono_id:ab, cantidad:form.abonos_cantidades[ab] || null, unidad:form.abonos_cantidades[`${ab}_unidad`] || 'kg', alcance:form.abonos_cantidades[`${ab}_alcance`] || 'total' })))
        if (abonosError) throw abonosError
      }
      setShowEditarPlantacion(false)
      await registrarAuditoria({ accion:'Edito plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:plantacionActiva.id, detalle:`Bloque ${bloque?.codigo || ''}` })
      await fetchData()
    } catch (error) { setPlantacionFormError(`No se pudo guardar la edición: ${error.message || 'revisá la conexión.'}`) }
    finally { setSaving(false) }
  }

  const finalizarPlantacionActiva = () => {
    if (!plantacionActiva) return
    setConfirmar({
      titulo: 'Resumen antes de finalizar',
      mensaje: `Bloque ${bloque?.codigo || ''}: ${fmtKg(totalKgCiclo)} kg cosechados y Gs. ${fmtGs(costosCiclo.total)} de costo acumulado (fumigaciones Gs. ${fmtGs(costosCiclo.fumigaciones)}, fertilizaciones Gs. ${fmtGs(costosCiclo.fertilizaciones)} y gastos directos Gs. ${fmtGs(costosCiclo.manuales)}). La plantación pasará al historial y no se borrará ningún dato.`,
      fn: async () => {
        const { error } = await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
        if (error) { setMensajeExito(`No se pudo finalizar la plantación: ${error.message || 'revisá la conexión.'}`); setConfirmar(null); return }
        await registrarAuditoria({ accion:'Finalizo plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:plantacionActiva.id, detalle:`Bloque ${bloque?.codigo || ''}` })
        setConfirmar(null)
        setSeccion('historial')
        fetchData()
      }
    })
  }

  const eliminarPlantacionActiva = () => {
    if (!plantacionActiva) return
    setConfirmar({
      titulo: 'Eliminar plantación?',
      mensaje: 'Se borrara definitivamente la plantación activa y sus abonos, fotos y muertes registradas. No se puede deshacer.',
      fn: async () => {
        await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
        await supabase.from('fotos_bloque').delete().eq('plantacion_id', plantacionActiva.id)
        await supabase.from('muertes_plantas').delete().eq('plantacion_id', plantacionActiva.id)
        await supabase.from('plantaciones').delete().eq('id', plantacionActiva.id)
        await registrarAuditoria({ accion:'Elimino plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:plantacionActiva.id, detalle:`Bloque ${bloque?.codigo || ''}` })
        setConfirmar(null)
        setSeccion('plantacion')
        fetchData()
      }
    })
  }

  const eliminarHistorial = (plantacionId) => {
    setConfirmar({ titulo:'Eliminar ciclo?', mensaje:'Se eliminara este ciclo del historial. No se puede deshacer.', fn: async () => {
      await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionId)
      await supabase.from('plantaciones').delete().eq('id', plantacionId)
      setConfirmar(null); setHistorialDetalle(null); fetchData()
    }})
  }

  const guardarMuerte = async () => {
    if (!parseLocaleInteger(formMuerte.cantidad, null)) return
    setSaving(true)
    await supabase.from('muertes_plantas').insert({
      bloque_id: id, plantacion_id: plantacionActiva?.id,
      cantidad: parseLocaleInteger(formMuerte.cantidad, null),
      causa: formMuerte.causa,
      descripcion: formMuerte.descripcion || null,
      fecha: new Date().toISOString().split('T')[0]
    })
    setSaving(false); setShowMuerte(false)
    setFormMuerte({ cantidad:'', causa:'Enfermedad', descripcion:'' })
    fetchData()
  }

  const seleccionarFoto = (e) => {
    const file = e.target.files[0]; if (!file) return
    setFotoPendiente(file)
    setFotoDescripcion('')
    setFotoError('')
    e.target.value = ''
  }

  const subirFoto = async () => {
    const file = fotoPendiente; if (!file) return
    setSaving(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const { data:fotoGuardada, error } = await supabase.from('fotos_bloque').insert({
        bloque_id: id, plantacion_id: plantacionActiva?.id,
        url: ev.target.result,
        fecha: new Date().toISOString().split('T')[0],
      }).select('id').single()
      if (error) { setSaving(false); return setFotoError('No se pudo guardar la foto.') }
      if (fotoDescripcion.trim()) {
        const { error:descripcionError } = await supabase.from('notas_modulo').insert({
          modulo:'fotos_bloque', referencia_tipo:'foto_bloque', referencia_id:fotoGuardada.id,
          fecha:new Date().toISOString().split('T')[0], titulo:'Descripción de foto', contenido:fotoDescripcion.trim(),
        })
        if (descripcionError) {
          await supabase.from('fotos_bloque').delete().eq('id', fotoGuardada.id)
          setSaving(false)
          return setFotoError('No se pudo guardar la descripción. Intentá nuevamente.')
        }
      }
      setSaving(false)
      setFotoPendiente(null)
      setFotoDescripcion('')
      fetchData()
    }
    reader.readAsDataURL(file)
  }

  const eliminarFoto = async (fotoId) => {
    await supabase.from('notas_modulo').delete().eq('modulo', 'fotos_bloque').eq('referencia_tipo', 'foto_bloque').eq('referencia_id', fotoId)
    await supabase.from('fotos_bloque').delete().eq('id', fotoId)
    fetchData()
  }

  // --- FERTILIZACION

  const agregarSolucion = () => {
    const letras = ['A','B','C','D','E','F']
    const usadas = formFert.soluciones.map(s => s.nombre)
    const siguiente = letras.find(l => !usadas.includes(l)) || `S${formFert.soluciones.length + 1}`
    setFormFert(f => ({
      ...f,
      soluciones: [...f.soluciones, { nombre: siguiente, productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }]
    }))
  }

  const agregarAbonoRapido = async () => {
    const nombre = nuevoAbonoNombre.trim()
    if (!nombre) return null

    const existente = abonos.find(a => (a.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
    if (existente) {
      setForm(f => ({ ...f, abonos_ids: f.abonos_ids.includes(existente.id) ? f.abonos_ids : [...f.abonos_ids, existente.id] }))
      setNuevoAbonoNombre('')
      setAbonoRapidoError('')
      return existente.id
    }

    const { data, error } = await supabase.from('abonos').insert({ nombre }).select('*').single()
    if (error) {
      setAbonoRapidoError(`No se pudo agregar el abono: ${error.message}`)
      return null
    }
    setAbonos(lista => [...lista, data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')))
    setForm(f => ({ ...f, abonos_ids: [...f.abonos_ids, data.id] }))
    setNuevoAbonoNombre('')
    setAbonoRapidoError('')
    return data.id
  }

  const abrirNuevaFertilizacion = () => {
    setFormFert({
      fecha: new Date().toISOString().split('T')[0],
      bloques_ids: [id],
      notas: '',
      soluciones: [{ nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }],
    })
    setShowNuevaFertilizacion(true)
  }

  const alternarBloqueFertilizacion = (bloqueId) => {
    setFormFert(f => {
      const actuales = new Set(f.bloques_ids || [])
      if (actuales.has(bloqueId)) actuales.delete(bloqueId)
      else actuales.add(bloqueId)
      return { ...f, bloques_ids: Array.from(actuales) }
    })
  }

  const eliminarSolucion = (si) => {
    setFormFert(f => ({ ...f, soluciones: f.soluciones.filter((_,i) => i !== si) }))
  }

  const agregarProducto = (si) => {
    setFormFert(f => {
      const sols = [...f.soluciones]
      sols[si] = { ...sols[si], productos: [...sols[si].productos, { nombre: '', cantidad: '', unidad: 'kg' }] }
      return { ...f, soluciones: sols }
    })
  }

  const eliminarProducto = (si, pi) => {
    setFormFert(f => {
      const sols = [...f.soluciones]
      sols[si] = { ...sols[si], productos: sols[si].productos.filter((_,i) => i !== pi) }
      return { ...f, soluciones: sols }
    })
  }

  const actualizarProducto = (si, pi, campo, valor) => {
    setFormFert(f => {
      const sols = [...f.soluciones]
      const prods = [...sols[si].productos]
      prods[pi] = { ...prods[pi], [campo]: valor }
      sols[si] = { ...sols[si], productos: prods }
      return { ...f, soluciones: sols }
    })
  }

  const actualizarProductoPlan = (si, pi, campo, valor) => {
    setFormPlan(f => {
      const sols = [...f.soluciones]
      const prods = [...sols[si].productos]
      prods[pi] = { ...prods[pi], [campo]: valor }
      sols[si] = { ...sols[si], productos: prods }
      return { ...f, soluciones: sols }
    })
  }

  const agregarSolucionPlan = () => {
    const letras = ['A','B','C','D','E','F']
    const usadas = formPlan.soluciones.map(s => s.nombre)
    const siguiente = letras.find(l => !usadas.includes(l)) || `S${formPlan.soluciones.length + 1}`
    setFormPlan(f => ({
      ...f,
      soluciones: [...f.soluciones, { nombre: siguiente, productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }]
    }))
  }

  const eliminarSolucionPlan = (si) => {
    setFormPlan(f => ({ ...f, soluciones: f.soluciones.filter((_,i) => i !== si) }))
  }

  const agregarProductoPlan = (si) => {
    setFormPlan(f => {
      const sols = [...f.soluciones]
      sols[si] = { ...sols[si], productos: [...sols[si].productos, { nombre: '', cantidad: '', unidad: 'kg' }] }
      return { ...f, soluciones: sols }
    })
  }

  const eliminarProductoPlan = (si, pi) => {
    setFormPlan(f => {
      const sols = [...f.soluciones]
      sols[si] = { ...sols[si], productos: sols[si].productos.filter((_,i) => i !== pi) }
      return { ...f, soluciones: sols }
    })
  }

  const abrirPlanSemanal = () => {
    if (planSemanal) {
      setFormPlan({
        id: planSemanal.id,
        nombre: planSemanal.nombre || 'Plan semanal',
        fecha_inicio: planSemanal.fecha_inicio || new Date().toISOString().split('T')[0],
        litros_preparados: planSemanal.litros_preparados || '',
        notas: planSemanal.notas || '',
        soluciones: Array.isArray(planSemanal.soluciones) && planSemanal.soluciones.length > 0
          ? planSemanal.soluciones
          : [{ nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }],
      })
    } else {
      setFormPlan({
        nombre: 'Plan semanal',
        fecha_inicio: new Date().toISOString().split('T')[0],
        litros_preparados: '',
        notas: '',
        soluciones: [{ nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }],
      })
    }
    setShowPlanSemanal(true)
  }

  const guardarPlanSemanal = async () => {
    if (!formPlan.nombre || !formPlan.fecha_inicio) return
    setSavingFert(true)
    const payload = {
      bloque_id: id,
      nombre: formPlan.nombre,
      fecha_inicio: formPlan.fecha_inicio,
      litros_preparados: formPlan.litros_preparados || null,
      notas: formPlan.notas || null,
      soluciones: formPlan.soluciones,
      activo: true,
    }
    if (formPlan.id) await supabase.from('fertilizacion_planes').update(payload).eq('id', formPlan.id)
    else await supabase.from('fertilizacion_planes').insert(payload)
    await registrarAuditoria({ accion: formPlan.id ? 'Edito plan semanal' : 'Creo plan semanal', modulo:'Bloque', tabla:'fertilizacion_planes', registroId:formPlan.id || '', detalle:`Bloque ${bloque?.codigo || ''}` })
    setSavingFert(false)
    setShowPlanSemanal(false)
    fetchData()
  }

  const desactivarPlanSemanal = async () => {
    if (!planSemanal?.id) return
    await supabase.from('fertilizacion_planes').update({ activo:false }).eq('id', planSemanal.id)
    await registrarAuditoria({ accion:'Desactivo plan semanal', modulo:'Bloque', tabla:'fertilizacion_planes', registroId:planSemanal.id, detalle:`Bloque ${bloque?.codigo || ''}` })
    fetchData()
  }

  const abrirAplicarPlan = () => {
    setFormAplicacionPlan({
      fecha: new Date().toISOString().split('T')[0],
      litros_aplicados: '',
      responsable: '',
      notas: '',
    })
    setShowAplicarPlan(true)
  }

  const guardarAplicacionPlan = async () => {
    if (!planSemanal?.id || !formAplicacionPlan.fecha) return
    setSavingFert(true)
    await supabase.from('fertilizacion_plan_aplicaciones').insert({
      plan_id: planSemanal.id,
      bloque_id: id,
      fecha: formAplicacionPlan.fecha,
      litros_aplicados: formAplicacionPlan.litros_aplicados || null,
      responsable: formAplicacionPlan.responsable || null,
      notas: formAplicacionPlan.notas || null,
    })
    await registrarAuditoria({ accion:'Aplico plan semanal', modulo:'Bloque', tabla:'fertilizacion_plan_aplicaciones', registroId:planSemanal.id, detalle:`Bloque ${bloque?.codigo || ''} - ${formAplicacionPlan.litros_aplicados || 0} L` })
    setSavingFert(false)
    setShowAplicarPlan(false)
    fetchData()
  }

  const guardarFertilizacion = async () => {
    if (!formFert.fecha) return
    const bloquesDestino = (formFert.bloques_ids || []).length ? formFert.bloques_ids : [id]
    setSavingFert(true)
    const { error } = await supabase.from('fertilizaciones').insert(bloquesDestino.map(bloqueId => ({
      bloque_id: bloqueId,
      fecha: formFert.fecha,
      notas: formFert.notas || null,
      soluciones: formFert.soluciones
    })))
    if (error) {
      setSavingFert(false)
      if (typeof window !== 'undefined') window.alert(`No se pudo guardar la fertilización: ${error.message}`)
      return
    }
    await registrarAuditoria({
      accion: bloquesDestino.length > 1 ? 'Registro fertilizacion multiple' : 'Registro fertilizacion',
      modulo:'Bloque',
      tabla:'fertilizaciones',
      registroId:'',
      detalle:`${bloquesDestino.length} bloque${bloquesDestino.length === 1 ? '' : 's'} - ${formFert.fecha}`,
    })
    setSavingFert(false)
    setShowNuevaFertilizacion(false)
    const codigos = bloquesDestino
      .map(bloqueId => bloquesCampo.find(b => b.id === bloqueId)?.codigo || (bloqueId === id ? bloque?.codigo : null))
      .filter(Boolean)
      .map(codigo => `Bloque ${codigo}`)
      .join(', ')
    setMensajeExito(`Fertilización guardada y vinculada a ${codigos || `${bloquesDestino.length} bloque(s)`}. También aparece en Fertilizaciones generales.`)
    fetchData()
  }

  const eliminarFertilizacion = async (fertId) => {
    await supabase.from('fertilizaciones').delete().eq('id', fertId)
    setFertDetalle(null)
    setConfirmarElimFert(null)
    fetchData()
  }

  const eliminarCosecha = (cosecha) => {
    setCosechaError('')
    setCosechaSuccess('')
    setConfirmar({
      titulo:'Eliminar cosecha?',
      mensaje:`Se quitara la cosecha de ${fmtKg(cosecha.kg_total)} kg del ${cosecha.fecha}. No se puede deshacer.`,
      fn: async () => {
        try {
          const { data, error } = await supabase
            .from('cosechas')
            .update({
              anulada:true,
              anulada_at:new Date().toISOString(),
              anulada_motivo:'Anulada por el usuario desde el bloque',
              updated_at:new Date().toISOString(),
            })
            .eq('id', cosecha.id)
            .select('id')
            .maybeSingle()

          if (error) throw error
          if (!data) throw new Error('El registro no se elimino. Revisa tus permisos para editar cosechas.')

          setCosechasCiclo(actuales => actuales.filter(item => item.id !== cosecha.id))
          await registrarAuditoria({
            accion:'Anulo cosecha',
            modulo:'Cosecha',
            tabla:'cosechas',
            registroId:cosecha.id,
            detalle:`Bloque ${bloque?.codigo || ''} - ${fmtKg(cosecha.kg_total)} kg`,
          })
          setConfirmar(null)
          setCosechaSuccess('Cosecha eliminada correctamente.')
          await fetchData()
        } catch (error) {
          setConfirmar(null)
          setCosechaError(`No se pudo eliminar la cosecha: ${error.message || 'error desconocido'}`)
        }
      },
    })
  }

  //

  const getVariedad = (p) => {
    if (!p?.notas) return null
    return p.notas.startsWith('Variedad: ') ? p.notas.replace('Variedad: ', '') : null
  }

  const abrirHistorialDetalle = async (plantacion) => {
    setHistorialDetalle(plantacion)
    setHistorialCiclo(null)
    setHistorialCicloError('')
    setHistorialCicloLoading(true)

    const inicio = plantacion.fecha_siembra || '2000-01-01'
    const ciclos = [plantacionActiva, ...historial]
      .filter(Boolean)
      .filter(ciclo => ciclo.fecha_siembra)
      .sort((a, b) => String(a.fecha_siembra).localeCompare(String(b.fecha_siembra)))
    const siguiente = ciclos.find(ciclo => String(ciclo.fecha_siembra) > String(inicio))
    const finExclusivo = siguiente?.fecha_siembra || null
    const conPeriodo = (query, campo = 'fecha') => {
      let resultado = query.gte(campo, inicio)
      if (finExclusivo) resultado = resultado.lt(campo, finExclusivo)
      return resultado
    }
    const dentroDelPeriodo = (fecha) => fecha && fecha >= inicio && (!finExclusivo || fecha < finExclusivo)

    const resultados = await Promise.all([
      conPeriodo(supabase.from('cosechas').select('id, fecha, kg_total, calidad, notas, precio_kg, anulada, compradores(nombre)').eq('bloque_id', id)).order('fecha', { ascending:false }),
      supabase.from('fumigacion_bloques').select('fumigaciones(id, fecha, tipo, operario, notas, tanques_cantidad, tanque_litros, anulada, fumigacion_productos(*, productos(nombre, unidad, carencia_dias)))').eq('bloque_id', id),
      conPeriodo(supabase.from('fertilizaciones').select('id, fecha, notas, soluciones, anulada, plan_id').eq('bloque_id', id)).order('fecha', { ascending:false }),
      supabase.from('muertes_plantas').select('id, fecha, cantidad, causa, descripcion').eq('plantacion_id', plantacion.id).order('fecha', { ascending:false }),
      supabase.from('fotos_bloque').select('id, fecha, url').eq('plantacion_id', plantacion.id).order('fecha', { ascending:false }),
      conPeriodo(supabase.from('costos').select('id, fecha, tipo, descripcion, monto').eq('bloque_id', id)).order('fecha', { ascending:false }),
      conPeriodo(supabase.from('ventas').select('id, fecha, producto, kg_total, precio_kg, total, monto_cobrado, estado_cobro, compradores(nombre)').eq('bloque_id', id)).order('fecha', { ascending:false }),
    ])

    const errores = resultados.map(r => r.error?.message).filter(Boolean)
    const fumigacionesCiclo = (resultados[1].data || [])
      .map(item => item.fumigaciones)
      .filter(fumigacion => fumigacion && dentroDelPeriodo(fumigacion.fecha) && !fumigacion.anulada)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

    const fotosHistoricasBase = resultados[4].data || []
    const idsFotosHistoricas = fotosHistoricasBase.map(foto => foto.id)
    const { data:descripcionesHistoricas } = idsFotosHistoricas.length ? await supabase.from('notas_modulo').select('referencia_id,contenido').eq('modulo', 'fotos_bloque').eq('referencia_tipo', 'foto_bloque').in('referencia_id', idsFotosHistoricas) : { data:[] }
    const descripcionHistoricaPorFoto = Object.fromEntries((descripcionesHistoricas || []).map(nota => [nota.referencia_id, nota.contenido]))

    setHistorialCiclo({
      inicio,
      finExclusivo,
      cosechas:(resultados[0].data || []).filter(item => !item.anulada),
      fumigaciones:fumigacionesCiclo,
      fertilizaciones:(resultados[2].data || []).filter(item => !item.anulada),
      muertes:resultados[3].data || [],
      fotos:fotosHistoricasBase.map(foto => ({ ...foto, descripcion:descripcionHistoricaPorFoto[foto.id] || '' })),
      costos:resultados[5].data || [],
      ventas:resultados[6].data || [],
    })
    setHistorialCicloError(errores.length ? 'Algunos datos del ciclo no se pudieron consultar. Se muestra toda la información disponible.' : '')
    setHistorialCicloLoading(false)
  }

  const totalKgCiclo = cosechasCiclo.reduce((s, c) => s + Number(c.kg_total), 0)
  const cantidadPlantasActiva = Number(plantacionActiva?.cantidad_plantas ?? plantacionActiva?.densidad_plantas_m2 ?? 0)

  const descargarFichaTecnica = async () => {
    if (!bloque || exportandoPdf) return
    setExportandoPdf(true)
    setPdfError('')
    try {
      const desde = plantacionActiva?.fecha_siembra || null
      const fumigacionesInforme = (incidencias || []).filter(item => !desde || item.fecha >= desde)
      const fertilizacionesInforme = (fertilizaciones || []).filter(item => !item.anulada && (!desde || item.fecha >= desde))
      const filaVacia = (columnas, texto) => `<tr><td colspan="${columnas}" class="muted">${escapeHtml(texto)}</td></tr>`
      const productosFumigacion = item => (item.fumigacion_productos || []).map(producto => `${producto.productos?.nombre || producto.producto_nombre || 'Producto'}${producto.dosis ? ` · ${producto.dosis}${producto.unidad ? ` ${producto.unidad}` : ''}` : ''}`).join(', ')
      const productosFertilizacion = item => (item.soluciones || []).flatMap(solucion => (solucion.productos || []).map(producto => `${producto.nombre || 'Producto'} ${producto.cantidad || ''} ${producto.unidad || ''}`.trim())).join(', ')
      const bases = (abonosPlantacion || []).map(item => ({ nombre:item.abonos?.nombre || 'Base', cantidad:fmtAbonoPlantacion(item) }))
      const html = `
        <p class="report-kicker">Informe de bloque</p>
        <div class="report-title-row"><h1>Bloque ${escapeHtml(bloque.codigo)}</h1><span class="status-pill">${plantacionActiva ? 'En producción' : 'Sin cultivo activo'}</span></div>
        <div class="crop-title">${escapeHtml(plantacionActiva?.cultivos?.nombre || 'Sin cultivo')}${getVariedad(plantacionActiva) ? ` · ${escapeHtml(getVariedad(plantacionActiva))}` : ''}</div>
        <p class="field-name">${escapeHtml(bloque.campos?.nombre || 'Campo sin especificar')}</p>
        <div class="metric-row"><div class="metric"><span>Plantas</span><strong>${cantidadPlantasActiva ? cantidadPlantasActiva.toLocaleString('es-PY') : '-'}</strong></div><div class="metric"><span>Días en campo</span><strong>${plantacionActiva ? diasDesde(plantacionActiva.fecha_siembra) ?? '-' : '-'}</strong></div><div class="metric"><span>Siembra</span><strong>${escapeHtml(plantacionActiva?.fecha_siembra || '-')}</strong></div><div class="metric"><span>Pérdidas</span><strong>${totalMuertes ? totalMuertes.toLocaleString('es-PY') : '0'}</strong></div></div>
        <h2>Base utilizada</h2>
        <table><thead><tr><th>Producto / abono</th><th>Cantidad y alcance</th></tr></thead><tbody>${bases.length ? bases.map(item => `<tr><td>${escapeHtml(item.nombre)}</td><td>${escapeHtml(item.cantidad)}</td></tr>`).join('') : filaVacia(2, 'No se registró una base para este cultivo.')}</tbody></table>
        <h2>Fertilizaciones realizadas</h2>
        <table><thead><tr><th>Fecha</th><th>Productos y cantidades</th><th>Observaciones</th></tr></thead><tbody>${fertilizacionesInforme.length ? fertilizacionesInforme.map(item => `<tr><td>${escapeHtml(item.fecha || '-')}</td><td>${escapeHtml(productosFertilizacion(item) || '-')}</td><td>${escapeHtml(notasFertilizacionVisibles(item.notas) || '-')}</td></tr>`).join('') : filaVacia(3, 'Sin fertilizaciones registradas en este cultivo.')}</tbody></table>
        <h2>Fumigaciones realizadas</h2>
        <table><thead><tr><th>Fecha</th><th>Productos y dosis</th><th>Aplicación</th><th>Observaciones</th></tr></thead><tbody>${fumigacionesInforme.length ? fumigacionesInforme.map(item => `<tr><td>${escapeHtml(item.fecha || '-')}</td><td>${escapeHtml(productosFumigacion(item) || '-')}</td><td>${escapeHtml(item.tanques_cantidad && item.tanque_litros ? `${item.tanques_cantidad} × ${item.tanque_litros} L` : '-')}</td><td>${escapeHtml(item.notas || '-')}</td></tr>`).join('') : filaVacia(4, 'Sin fumigaciones registradas en este cultivo.')}</tbody></table>
        ${estadoInforme.trim() ? `<h2>Estado actual</h2><div class="state-box"><span class="state-check">✓</span><div>${escapeHtml(estadoInforme.trim())}</div></div>` : ''}
        <div class="report-footer"><span><strong>AgroBloque</strong> · ${escapeHtml(bloque.campos?.nombre || 'Ficha técnica')}</span><span>Ficha técnica del cultivo</span></div>`
      const { descargarPdfHtml } = await import('../lib/pdfReports')
      await descargarPdfHtml(`ficha-tecnica-bloque-${bloque.codigo}`, html, { variant:'block-clean' })
      setShowInformeOpciones(false)
    } catch (error) {
      setPdfError(`No se pudo generar la ficha técnica: ${error.message || 'intentá nuevamente.'}`)
    } finally {
      setExportandoPdf(false)
    }
  }

  const descargarInformeBloque = async () => {
    if (!bloque || exportandoPdf) return
    setExportandoPdf(true)
    setPdfError('')
    try {
      const { data:notasBloque, error:notasError } = await supabase.from('notas_modulo')
        .select('id,fecha,titulo,contenido,created_at')
        .in('modulo', ['bloc_notas','agenda'])
        .eq('referencia_tipo', 'bloque')
        .eq('referencia_id', bloque.id)
        .order('created_at', { ascending:false })
      if (notasError) throw notasError

      const desde = plantacionActiva?.fecha_siembra || null
      const fumigacionesInforme = (incidencias || []).filter(item => !desde || item.fecha >= desde)
      const fertilizacionesInforme = (fertilizaciones || []).filter(item => !item.anulada && (!desde || item.fecha >= desde))
      const filaVacia = (columnas, texto) => `<tr><td colspan="${columnas}" class="muted">${escapeHtml(texto)}</td></tr>`
      const productosFumigacion = fumigacion => (fumigacion.fumigacion_productos || []).map(item => {
        const nombre = item.productos?.nombre || item.producto_nombre || 'Producto'
        const dosis = item.dosis ? ` (${item.dosis}${item.unidad ? ` ${item.unidad}` : ''})` : ''
        return `${nombre}${dosis}`
      }).join(', ')
      const productosFertilizacion = fertilizacion => (fertilizacion.soluciones || []).flatMap(solucion => (solucion.productos || []).map(producto => `${producto.nombre || 'Producto'} ${producto.cantidad || ''} ${producto.unidad || ''}`.trim())).join(', ')
      const costosDetalle = [
        ...(costosCiclo.consumos || []).map(item => ({ fecha:item.fecha, concepto:item.productos?.nombre || (item.origen_tipo === 'consumo_fumigacion' ? 'Fumigación' : 'Fertilización'), detalle:`${fmtKg(item.cantidad_stock)} ${item.productos?.unidad || ''} × Gs. ${fmtGs(item.costo_unitario)}`, monto:item.costo_total })),
        ...(costosCiclo.costosManuales || []).map(item => ({ fecha:item.fecha, concepto:item.descripcion || item.tipo || 'Gasto directo', detalle:item.tipo || '', monto:item.monto })),
      ].sort((a,b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))

      const html = `
        <p class="report-kicker">Informe completo de bloque</p>
        <div class="report-title-row"><h1>Bloque ${escapeHtml(bloque.codigo)}</h1><span class="status-pill">${plantacionActiva ? 'En producción' : 'Sin cultivo activo'}</span></div>
        <div class="crop-title">${escapeHtml(plantacionActiva?.cultivos?.nombre || 'Sin cultivo')}${getVariedad(plantacionActiva) ? ` · ${escapeHtml(getVariedad(plantacionActiva))}` : ''}</div>
        <p class="field-name">${escapeHtml(bloque.campos?.nombre || 'Campo sin especificar')}</p>
        <h2>Resumen actual</h2>
        <table><tbody>
          <tr><th>Cultivo</th><td>${escapeHtml(plantacionActiva?.cultivos?.nombre || 'Sin cultivo activo')}</td><th>Variedad</th><td>${escapeHtml(getVariedad(plantacionActiva) || '-')}</td></tr>
          <tr><th>Fecha de siembra</th><td>${escapeHtml(plantacionActiva?.fecha_siembra || '-')}</td><th>Edad</th><td>${plantacionActiva ? `${diasDesde(plantacionActiva.fecha_siembra) ?? '-'} días` : '-'}</td></tr>
          <tr><th>Plantas activas</th><td>${cantidadPlantasActiva ? cantidadPlantasActiva.toLocaleString('es-PY') : '-'}</td><th>Cosecha del ciclo</th><td>${fmtKg(totalKgCiclo)} kg</td></tr>
          <tr><th>Costo acumulado</th><td>Gs. ${fmtGs(costosCiclo.total)}</td><th>Fotos registradas</th><td>${fotos.length}</td></tr>
        </tbody></table>
        <h2>Costos del ciclo</h2>
        <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Detalle / precio usado</th><th class="right">Monto</th></tr></thead><tbody>${costosDetalle.length ? costosDetalle.map(item => `<tr><td>${escapeHtml(item.fecha || '-')}</td><td>${escapeHtml(item.concepto)}</td><td>${escapeHtml(item.detalle)}</td><td class="right">Gs. ${fmtGs(item.monto)}</td></tr>`).join('') : filaVacia(4, 'Sin costos registrados en el ciclo actual.')}<tr class="total"><td colspan="3">TOTAL DEL CICLO</td><td class="right">Gs. ${fmtGs(costosCiclo.total)}</td></tr></tbody></table>
        <h2>Fumigaciones</h2>
        <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Productos</th><th>Preparación / responsable</th></tr></thead><tbody>${fumigacionesInforme.length ? fumigacionesInforme.map(item => `<tr><td>${escapeHtml(item.fecha)}</td><td>${escapeHtml(item.tipo || 'Fumigación')}</td><td>${escapeHtml(productosFumigacion(item) || '-')}</td><td>${escapeHtml([item.tanques_cantidad && item.tanque_litros ? `${item.tanques_cantidad} × ${item.tanque_litros} L` : '', item.operario, item.notas].filter(Boolean).join(' · ') || '-')}</td></tr>`).join('') : filaVacia(4, 'Sin fumigaciones registradas en el ciclo actual.')}</tbody></table>
        <h2>Fertilizaciones</h2>
        <table><thead><tr><th>Fecha</th><th>Productos</th><th>Observaciones</th></tr></thead><tbody>${fertilizacionesInforme.length ? fertilizacionesInforme.map(item => `<tr><td>${escapeHtml(item.fecha)}</td><td>${escapeHtml(productosFertilizacion(item) || '-')}</td><td>${escapeHtml(notasFertilizacionVisibles(item.notas) || '-')}</td></tr>`).join('') : filaVacia(3, 'Sin fertilizaciones registradas en el ciclo actual.')}</tbody></table>
        <h2>Cosechas</h2>
        <table><thead><tr><th>Fecha</th><th class="right">Cantidad</th><th>Calidad</th><th>Observaciones</th></tr></thead><tbody>${cosechasCiclo.length ? cosechasCiclo.map(item => `<tr><td>${escapeHtml(item.fecha)}</td><td class="right">${fmtKg(item.kg_total)} kg</td><td>${escapeHtml(item.calidad || '-')}</td><td>${escapeHtml(item.notas || '-')}</td></tr>`).join('') : filaVacia(4, 'Sin cosechas registradas en el ciclo actual.')}</tbody></table>
        <h2>Registro fotográfico</h2>
        <table><thead><tr><th>Fecha</th><th>Descripción</th></tr></thead><tbody>${fotos.length ? fotos.map(item => `<tr><td>${escapeHtml(item.fecha || '-')}</td><td>${escapeHtml(item.descripcion || 'Sin descripción')}</td></tr>`).join('') : filaVacia(2, 'Sin fotos registradas en el ciclo actual.')}</tbody></table>
        <h2>Notas asignadas al bloque</h2>
        <table><thead><tr><th>Fecha</th><th>Título</th><th>Nota</th></tr></thead><tbody>${(notasBloque || []).length ? (notasBloque || []).map(item => `<tr><td>${escapeHtml(item.fecha || '-')}</td><td>${escapeHtml(item.titulo || '-')}</td><td>${escapeHtml(item.contenido || '-')}</td></tr>`).join('') : filaVacia(3, 'Sin notas asignadas a este bloque.')}</tbody></table>
        <h2>Ciclos anteriores</h2>
        <table><thead><tr><th>Cultivo</th><th>Siembra</th><th>Estado</th></tr></thead><tbody>${historial.length ? historial.map(item => `<tr><td>${escapeHtml(item.cultivos?.nombre || 'Cultivo')}${getVariedad(item) ? ` · ${escapeHtml(getVariedad(item))}` : ''}</td><td>${escapeHtml(item.fecha_siembra || '-')}</td><td>Finalizado</td></tr>`).join('') : filaVacia(3, 'Este bloque todavía no tiene ciclos anteriores.')}</tbody></table>${estadoInforme.trim() ? `<h2>Estado actual</h2><div class="state-box"><span class="state-check">✓</span><div>${escapeHtml(estadoInforme.trim())}</div></div>` : ''}<div class="report-footer"><span><strong>AgroBloque</strong> · ${escapeHtml(bloque.campos?.nombre || 'Informe de bloque')}</span><span>Informe completo</span></div>`
      const { descargarPdfHtml } = await import('../lib/pdfReports')
      await descargarPdfHtml(`informe-bloque-${bloque.codigo}`, html, { variant:'block-clean' })
      setShowInformeOpciones(false)
    } catch (error) {
      setPdfError(`No se pudo generar el PDF: ${error.message || 'intentá nuevamente.'}`)
    } finally {
      setExportandoPdf(false)
    }
  }
  const kgPorPlanta = cantidadPlantasActiva && totalKgCiclo > 0
    ? (totalKgCiclo / cantidadPlantasActiva).toFixed(2)
    : null
  const totalMuertes = muertes.reduce((s, m) => s + Number(m.cantidad), 0)

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:'var(--ag-radius)', border:"1px solid #e2e9e5", background:'#fff', fontSize:13, color:"#182c25", marginBottom:10, boxSizing:'border-box' }

  if (!bloque) return (
    <div className="ag-page ui-44f558">
      <Skeleton rows={5} label="Cargando ficha del bloque" />
    </div>
  )

  // Vista detalle de fertilizacion
  if (fertDetalle) {
    const esMasReciente = fertilizaciones.length > 0 && fertilizaciones[0].id === fertDetalle.id
    const esAnterior = fertilizaciones.length > 1 && fertilizaciones[1].id === fertDetalle.id
    return (
      <div className="ag-block-page ui-c1c124">
        {confirmarElimFert && (
          <ModalConfirm
            titulo="Eliminar fertilización?"
            mensaje="Se eliminara este registro. No se puede deshacer."
            onConfirm={() => eliminarFertilizacion(confirmarElimFert)}
            onCancel={() => setConfirmarElimFert(null)}
          />
        )}
        <div className="ui-327143">
          <button className="ag-small-action ui-7347f9" onClick={() => setFertDetalle(null)}>
            <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
            <span className="ui-fe5017">Fertilización</span>
          </button>
          <div className="ui-82e63f">
            <div className="ui-882dd8">{rangoFertilizacion(fertDetalle)}</div>
            {esMasReciente && <span className="ui-c28681">ACTUAL</span>}
            {esAnterior && <span className="ui-e7ea3c">ANTERIOR</span>}
          </div>
          <div className="ui-93a7e1">Bloque {bloque.codigo}</div>
        </div>
        <div className="ui-1a3247">
          {(fertDetalle.soluciones || []).map((sol, si) => (
            <div className="ag-surface ui-49272e" key={si}>
              <div className="ui-1f5c91">
                Solución {sol.nombre}
              </div>
              {(sol.productos || []).map((prod, pi) => (
                <div className="ui-efee8d" key={pi}>
                  <div className="ui-7b80c9">{prod.nombre || '-'}</div>
                  <div className="ui-076bb2">{prod.cantidad} {prod.unidad}</div>
                </div>
              ))}
            </div>
          ))}
          {notasFertilizacionVisibles(fertDetalle.notas) && (
            <div className="ag-surface ui-f3f33f">
              <div className="ui-476525">NOTAS</div>
              <div className="ui-7b80c9">{notasFertilizacionVisibles(fertDetalle.notas)}</div>
            </div>
          )}
          {canFert.edit && <button className="ag-small-action ui-a20b62" onClick={() => navigate(`/fertilizaciones?editar=${encodeURIComponent(fertDetalle.grupo_id || fertDetalle.id)}`)}
           >
            <i className="ti ti-pencil ui-52eaee" aria-hidden="true"></i>
            {fertDetalle.plan_id ? 'Editar semana completa' : 'Editar fertilización'}
          </button>}
          <button className="ag-small-action ui-ee3408" onClick={() => setConfirmarElimFert(fertDetalle.id)}
           >
            Eliminar este registro
          </button>
        </div>
      </div>
    )
  }

  // Vista detalle de ciclo historico
  if (historialDetalle) {
    const cosechasHistoricas = historialCiclo?.cosechas || []
    const fumigacionesHistoricas = historialCiclo?.fumigaciones || []
    const fertilizacionesHistoricas = historialCiclo?.fertilizaciones || []
    const muertesHistoricas = historialCiclo?.muertes || []
    const ventasHistoricas = historialCiclo?.ventas || []
    const costosHistoricos = historialCiclo?.costos || []
    const fotosHistoricas = historialCiclo?.fotos || []
    const plantasIniciales = Number(historialDetalle.cantidad_plantas ?? historialDetalle.densidad_plantas_m2 ?? 0)
    const kilosCosechados = cosechasHistoricas.reduce((total, cosecha) => total + Number(cosecha.kg_total || 0), 0)
    const plantasPerdidas = muertesHistoricas.reduce((total, muerte) => total + Number(muerte.cantidad || 0), 0)
    const ingresoTotal = ventasHistoricas.reduce((total, venta) => total + Number(venta.total || (Number(venta.kg_total || 0) * Number(venta.precio_kg || 0))), 0)
    const costoTotal = costosHistoricos.reduce((total, costo) => total + Number(costo.monto || 0), 0)
    const finVisible = historialCiclo?.finExclusivo ? sumarDiasFecha(historialCiclo.finExclusivo, -1) : null
    return (
      <div className="ag-page ui-c1c124 cycle-history-page">
        {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
        <div className="ui-327143 cycle-history-head">
          <button className="ag-small-action ui-7347f9" onClick={() => setHistorialDetalle(null)}>
            <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
            <span className="ui-fe5017">Historial</span>
          </button>
          <div className="ui-72161c">
            {historialDetalle.cultivos?.nombre}{getVariedad(historialDetalle) ? `  -  ${getVariedad(historialDetalle)}` : ''}
          </div>
          <div className="ui-93a7e1">Bloque {bloque.codigo} · {historialDetalle.fecha_siembra || 'Sin fecha'}{finVisible ? ` al ${finVisible}` : ''}</div>
        </div>
        <div className="ui-1a3247 cycle-history-content">
          {historialCicloError && <div className="ag-feedback ag-feedback-error">{historialCicloError}</div>}

          <div className="ag-surface ui-49272e cycle-history-overview">
            <div className="ui-486335">Datos del ciclo</div>
            <div className="cycle-history-data-grid">
              {[
                ['Cultivo', historialDetalle.cultivos?.nombre || '-'],
                ['Variedad', getVariedad(historialDetalle) || '-'],
                ['Fecha siembra', historialDetalle.fecha_siembra || '-'],
                ['Fin del ciclo', finVisible || 'Sin fecha registrada'],
                ['Plantas iniciales', plantasIniciales ? plantasIniciales.toLocaleString('es-PY') : '-'],
                ['Plantas perdidas', plantasPerdidas.toLocaleString('es-PY')],
              ].map(([k,v]) => <div className="cycle-history-datum" key={k}><span>{k}</span><strong>{v}</strong></div>)}
            </div>
          </div>

          {historialCicloLoading ? <Skeleton rows={6} label="Cargando el historial completo del ciclo" /> : <>
            <div className="cycle-history-kpis">
              <div className="kpi-card cycle-history-kpi"><span className="kpi-card__label">Rendimiento total</span><strong className="kpi-card__value numeric-data">{fmtKg(kilosCosechados)} kg</strong><small className="kpi-card__detail">{cosechasHistoricas.length} cosecha{cosechasHistoricas.length === 1 ? '' : 's'}</small></div>
              <div className="kpi-card cycle-history-kpi"><span className="kpi-card__label">Rendimiento por planta</span><strong className="kpi-card__value numeric-data">{plantasIniciales && kilosCosechados ? `${fmtKg(kilosCosechados / plantasIniciales)} kg` : '-'}</strong><small className="kpi-card__detail">sobre la cantidad inicial</small></div>
              <div className="kpi-card cycle-history-kpi"><span className="kpi-card__label">Ingresos registrados</span><strong className="kpi-card__value numeric-data cycle-history-money"><span className="cycle-history-money__currency">Gs.</span><span>{fmtGs(ingresoTotal)}</span></strong><small className="kpi-card__detail">{ventasHistoricas.length} venta{ventasHistoricas.length === 1 ? '' : 's'}</small></div>
              <div className="kpi-card cycle-history-kpi"><span className="kpi-card__label">Resultado directo</span><strong className="kpi-card__value numeric-data cycle-history-money"><span className="cycle-history-money__currency">Gs.</span><span>{fmtGs(ingresoTotal - costoTotal)}</span></strong><small className="kpi-card__detail">ingresos menos costos cargados</small></div>
            </div>

            <CycleSection icon="ti-cut" title="Cosechas y rendimiento" count={cosechasHistoricas.length} empty="No se registraron cosechas en este ciclo.">
              {cosechasHistoricas.map(cosecha => <CycleRow key={cosecha.id} date={cosecha.fecha} title={`${fmtKg(cosecha.kg_total)} kg${cosecha.calidad ? ` · ${cosecha.calidad}` : ''}`} detail={[cosecha.compradores?.nombre, cosecha.precio_kg ? `Gs. ${fmtGs(cosecha.precio_kg)}/kg` : '', cosecha.notas].filter(Boolean).join(' · ')} />)}
            </CycleSection>

            <CycleSection icon="ti-spray" title="Fumigaciones" count={fumigacionesHistoricas.length} empty="No se registraron fumigaciones en este ciclo.">
              {fumigacionesHistoricas.map(fumigacion => {
                const productos = (fumigacion.fumigacion_productos || []).map(item => `${item.productos?.nombre || item.producto_nombre || 'Producto'}${item.dosis ? ` · ${item.dosis}` : ''}`).join(' + ')
                const caldo = fumigacion.tanques_cantidad && fumigacion.tanque_litros ? `${fumigacion.tanques_cantidad} × ${fumigacion.tanque_litros} L` : ''
                return <CycleRow key={fumigacion.id} date={fumigacion.fecha} title={fumigacion.tipo || 'Fumigación'} detail={[productos, caldo, fumigacion.operario, fumigacion.notas].filter(Boolean).join(' · ')} />
              })}
            </CycleSection>

            <CycleSection icon="ti-leaf" title="Fertilizaciones" count={fertilizacionesHistoricas.length} empty="No se registraron fertilizaciones en este ciclo.">
              {fertilizacionesHistoricas.map(fertilizacion => {
                const productos = (fertilizacion.soluciones || []).map(solucion => `${solucion.nombre ? `Sol. ${solucion.nombre}: ` : ''}${(solucion.productos || []).map(producto => `${producto.nombre || 'Producto'} ${producto.cantidad || ''} ${producto.unidad || ''}`.trim()).join(' + ')}`).join(' · ')
                return <CycleRow key={fertilizacion.id} date={fertilizacion.fecha} title={productos || 'Fertilización registrada'} detail={notasFertilizacionVisibles(fertilizacion.notas)} />
              })}
            </CycleSection>

            <CycleSection icon="ti-chart-line" title="Ventas y costos" count={ventasHistoricas.length + costosHistoricos.length} empty="No se registraron ventas ni costos directos en este ciclo.">
              {[...ventasHistoricas.map(venta => ({ id:`v-${venta.id}`, fecha:venta.fecha, titulo:`Venta · Gs. ${fmtGs(venta.total || (Number(venta.kg_total || 0) * Number(venta.precio_kg || 0)))}`, detalle:[venta.producto, venta.compradores?.nombre, venta.estado_cobro].filter(Boolean).join(' · ') })), ...costosHistoricos.map(costo => ({ id:`c-${costo.id}`, fecha:costo.fecha, titulo:`Costo · Gs. ${fmtGs(costo.monto)}`, detalle:[costo.tipo, costo.descripcion].filter(Boolean).join(' · ') }))].sort((a,b) => String(b.fecha).localeCompare(String(a.fecha))).map(item => <CycleRow key={item.id} date={item.fecha} title={item.titulo} detail={item.detalle} />)}
            </CycleSection>

            <CycleSection icon="ti-heart-broken" title="Pérdidas de plantas" count={muertesHistoricas.length} empty="No se registraron pérdidas de plantas en este ciclo.">
              {muertesHistoricas.map(muerte => <CycleRow key={muerte.id} date={muerte.fecha} title={`${Number(muerte.cantidad || 0).toLocaleString('es-PY')} planta${Number(muerte.cantidad) === 1 ? '' : 's'} · ${muerte.causa || 'Sin causa'}`} detail={muerte.descripcion} />)}
            </CycleSection>

            {fotosHistoricas.length > 0 && <section className="ag-surface cycle-history-section"><div className="cycle-history-section__head"><span><i className="ti ti-photo" aria-hidden="true" /><strong>Fotos del ciclo</strong></span><em>{fotosHistoricas.length}</em></div><div className="cycle-history-photos">{fotosHistoricas.map(foto => <figure key={foto.id}><img src={foto.url} alt={foto.descripcion || `Registro del ${foto.fecha || 'ciclo'}`} loading="lazy" />{foto.descripcion && <figcaption>{foto.descripcion}</figcaption>}</figure>)}</div></section>}
          </>}

          <div className="ag-surface ui-49272e">
            <div className="ui-486335">Abonos de base utilizados</div>
            {(historialDetalle.plantacion_abonos || []).length > 0 ? historialDetalle.plantacion_abonos.map(abono => (
              <div className="ui-1eefd4" key={abono.id || abono.abono_id}>
                <div className="ui-076bb2">{abono.abonos?.nombre || 'Abono'}</div>
                <div className="ui-62cb6b">{fmtAbonoPlantacion(abono)}</div>
              </div>
            )) : <div className="ui-1685e1">No se registraron abonos de base en este ciclo.</div>}
          </div>
          {can.delete && <button className="ag-small-action ui-a3fc3f" onClick={() => eliminarHistorial(historialDetalle.id)}
           >
            Eliminar este ciclo del historial
          </button>}
        </div>
      </div>
    )
  }

  const sectionMeta = {
    plantacion:['ti-seeding', 'Resumen del cultivo', 'Datos principales, rendimiento y gestión del ciclo actual.'],
    fertilizacion:['ti-leaf', 'Nutrición del bloque', 'Plan semanal y aplicaciones realizadas en este cultivo.'],
    cosechas:['ti-cut', 'Cosechas del ciclo', 'Producción registrada y rendimiento acumulado.'],
    incidencias:['ti-spray', 'Control fitosanitario', 'Fumigaciones, tratamientos y pérdidas de plantas.'],
    fotos:['ti-photo', 'Registro fotográfico', 'Evolución visual del cultivo durante el ciclo.'],
    historial:['ti-history', 'Ciclos anteriores', 'Consulta los cultivos que ocuparon este bloque.'],
  }
  const [sectionIcon, sectionTitle, sectionDescription] = sectionMeta[seccion]

  return (
    <div className="ag-page block-detail-modern ui-c1c124">
      {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      {showEditarNombre && <Modal busy={saving} onClose={() => setShowEditarNombre(false)} label="Editar nombre del bloque" style={{ position:'fixed', inset:0, zIndex:220, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}><div className="ag-surface ui-211525" style={{ width:'min(430px, 100%)' }}><div className="ui-3e43be">Editar nombre del bloque</div><div className="ui-01159a">Este nombre se actualizará en mapas, aplicaciones, costos e historiales vinculados.</div>{nombreBloqueError && <div className="ag-feedback ag-feedback-error" role="alert">{nombreBloqueError}</div>}<label className="ag-field-label">Nombre<input className="bl-input" autoFocus value={nombreBloque} onChange={e => setNombreBloque(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardarNombreBloque() }} maxLength={50} placeholder="Ej: A-1" /></label><div className="ui-9c6869"><button className="ag-small-action ui-395a62" onClick={() => setShowEditarNombre(false)} disabled={saving}>Cancelar</button><button className="ag-small-action ui-f5f413" onClick={guardarNombreBloque} disabled={saving}>{saving ? 'Guardando…' : 'Guardar nombre'}</button></div></div></Modal>}
      <input className="ui-cb4589" type="file" accept="image/*" ref={fileRef} onChange={seleccionarFoto} />
      {fotoPendiente && <Modal busy={saving} onClose={() => { setFotoPendiente(null); setFotoError('') }} label="Describir foto" style={{ position:'fixed', inset:0, zIndex:230, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}><div className="ag-surface ui-211525" style={{ width:'min(480px, 100%)' }}><div className="ui-3e43be">Agregar foto al bloque</div><div className="ui-01159a">La descripción es opcional y quedará visible junto a la foto.</div>{fotoError && <div className="ag-feedback ag-feedback-error" role="alert">{fotoError}</div>}<label className="ag-field-label">Descripción (opcional)<textarea className="bl-input photo-description-input" autoFocus value={fotoDescripcion} onChange={e => setFotoDescripcion(e.target.value)} maxLength={300} placeholder="Ej: Planta con 35 días; se observan manchas en las hojas" /></label><div className="ui-9c6869"><button className="ag-small-action ui-395a62" onClick={() => setFotoPendiente(null)} disabled={saving}>Cancelar</button><button className="ag-small-action ui-f5f413" onClick={subirFoto} disabled={saving}>{saving ? 'Guardando…' : 'Guardar foto'}</button></div></div></Modal>}
      {detalleCostos && <Modal onClose={() => setDetalleCostos(null)} label="Detalle de costos" style={{ position:'fixed', inset:0, zIndex:225, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}><div className="ag-surface block-cost-detail"><div className="block-cost-detail__head"><div><small>HISTORIAL DEL CICLO</small><h2>{detalleCostos === 'fumigaciones' ? 'Fumigaciones' : detalleCostos === 'fertilizaciones' ? 'Fertilizaciones' : 'Gastos directos'}</h2></div><button className="ag-small-action" onClick={() => setDetalleCostos(null)} aria-label="Cerrar"><i className="ti ti-x" /></button></div><CostDetailList tipo={detalleCostos} costos={costosCiclo} /></div></Modal>}
      {showInformeOpciones && <Modal busy={exportandoPdf} onClose={() => !exportandoPdf && setShowInformeOpciones(false)} label="Elegir informe" style={{ position:'fixed', inset:0, zIndex:228, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}><div className="ag-surface block-report-picker"><div className="block-report-picker__head"><div><small>DESCARGAR DATOS DEL BLOQUE</small><h2>¿Qué informe necesitás?</h2><p>Elegí la ficha técnica para compartir con el ingeniero o el informe completo para administración.</p></div><button type="button" className="ag-small-action" aria-label="Cerrar" onClick={() => setShowInformeOpciones(false)} disabled={exportandoPdf}><i className="ti ti-x" /></button></div>{pdfError && <div className="ag-feedback ag-feedback-error" role="alert">{pdfError}</div>}<label className="block-report-observation"><span>Estado actual / observaciones <em>Opcional</em></span><textarea value={estadoInforme} onChange={event => setEstadoInforme(event.target.value)} maxLength={700} placeholder="Ej: Cultivo con buen vigor, floración uniforme y sin incidencia visible de plagas." /><small>Solo aparecerá en el PDF si escribís algo. AgroBloque no genera recomendaciones automáticamente.</small></label><div className="block-report-picker__options"><button type="button" className="is-recommended" onClick={descargarFichaTecnica} disabled={exportandoPdf}><span><i className="ti ti-plant-2" /></span><div><strong>Ficha técnica para el ingeniero</strong><em>Recomendado</em><p>Plantas, variedad, siembra, días en campo, base, fertilizaciones y fumigaciones. Sin precios ni costos.</p></div><i className="ti ti-download" /></button><button type="button" onClick={descargarInformeBloque} disabled={exportandoPdf || costosCiclo.loading}><span><i className="ti ti-file-description" /></span><div><strong>Informe completo del bloque</strong><p>Incluye también costos, cosechas, notas, fotos e historial administrativo.</p></div><i className="ti ti-download" /></button></div>{exportandoPdf && <div className="block-report-picker__loading"><i className="ti ti-loader-2" />Preparando el PDF…</div>}</div></Modal>}

      {/* Header */}
      <div className="ag-block-header block-detail-header ui-606ba4">
        <button className="ag-small-action block-detail-back ui-7347f9" onClick={() => navigate(-1)}>
          <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
          <span className="ui-fe5017">Volver a bloques</span>
        </button>
        <div className="ag-surface ag-block-hero block-detail-hero">
          <div className="block-detail-identity">
            <span className="block-detail-mark" aria-hidden="true"><i className="ti ti-box" /></span>
            <div>
            <div className="ag-eyebrow">{bloque.campos?.nombre} · {bloque.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}><h1>Bloque {bloque.codigo}</h1>{can.edit && <button type="button" className="ag-small-action" onClick={abrirEditarNombre} aria-label="Editar nombre del bloque" title="Editar nombre del bloque" style={{ padding:'7px 9px' }}><i className="ti ti-pencil" aria-hidden="true" /></button>}</div>
            {plantacionActiva && (
              <div className="ag-block-crop">
                {plantacionActiva.cultivos?.nombre}{getVariedad(plantacionActiva) ? `  -  ${getVariedad(plantacionActiva)}` : ''}
              </div>
            )}
            </div>
            <span className={`block-detail-status ${plantacionActiva ? 'is-active' : 'is-empty'}`}><i />{plantacionActiva ? 'En producción' : 'Sin cultivo activo'}</span>
          </div>
          {plantacionActiva && <div className="ag-block-summary"><span><i className="ti ti-calendar-time" /><small>Edad del cultivo</small><strong>{diasDesde(plantacionActiva.fecha_siembra) ?? '—'} <em>días</em></strong></span><span><i className="ti ti-seeding" /><small>Plantas activas</small><strong>{cantidadPlantasActiva ? Number(cantidadPlantasActiva).toLocaleString('es-PY') : '—'}</strong></span><span><i className="ti ti-basket" /><small>Cosecha del ciclo</small><strong>{fmtKg(totalKgCiclo)} <em>kg</em></strong></span><span><i className="ti ti-coin" /><small>Costo acumulado</small><strong>{costosCiclo.loading ? '…' : `Gs. ${fmtGs(costosCiclo.total)}`}</strong></span></div>}
          {!plantacionActiva && can.create && (
            <button className="ag-small-action ui-2c5a32" onClick={abrirNuevaPlantacion}>
              + Nueva plantación
            </button>
          )}
        </div>

        {mensajeExito && (
          <div className="ui-05bacd">
            <span>{mensajeExito}</span>
            <button className="ui-ecf4ec" type="button" onClick={() => setMensajeExito('')} aria-label="Cerrar mensaje">×</button>
          </div>
        )}
        {pdfError && <div className="ag-feedback ag-feedback-error block-pdf-error" role="alert">{pdfError}</div>}

        <div className="ag-surface ag-block-quick block-detail-quick ui-46ae6b">
          <div className="ui-d4e113">
            <div>
              <div className="ui-1d6b4b">Acciones del bloque</div>
              <div className="ui-a8f171">Registrá trabajo sin volver a seleccionar el bloque</div>
            </div>
            <div className="block-detail-quick__buttons"><button className="ag-small-action block-detail-primary-action" type="button" aria-expanded={showQuickActions} onClick={() => setShowQuickActions(value => !value)}><i className={`ti ${showQuickActions ? 'ti-x' : 'ti-plus'}`} />{showQuickActions ? 'Cerrar' : 'Registrar trabajo'}</button><button className="ag-small-action block-pdf-button" type="button" onClick={() => { setPdfError(''); setShowInformeOpciones(true) }} disabled={exportandoPdf}><i className={`ti ${exportandoPdf ? 'ti-loader-2' : 'ti-file-type-pdf'}`} aria-hidden="true" />{exportandoPdf ? 'Preparando…' : 'Descargar informe'}</button>{puedeVerQr && <button className="ag-small-action ui-cd464c" type="button" onClick={() => setShowQr(true)}><i className="ti ti-qrcode ui-e5876b" aria-hidden="true"></i> QR</button>}</div>
          </div>
          {showQuickActions && <div className="block-detail-action-grid ui-1a4890">
            {canFum.create && <button className="ag-small-action ui-0ea43e" type="button" onClick={() => abrirCargaRapida('fumigaciones')}><i className="ti ti-spray" aria-hidden="true" /> Fumigación <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>}
            {canFert.create && <button className="ag-small-action ui-228318" type="button" onClick={() => abrirCargaRapida('fertilizacion')}><i className="ti ti-leaf" aria-hidden="true" /> Fertilización <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>}
            {canCos.create && <button className="ag-small-action ui-f0ca92" type="button" onClick={() => abrirCargaRapida('cosecha')}><i className="ti ti-cut" aria-hidden="true" /> Cosecha <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>}
            {can.edit && plantacionActiva && <button className="ag-small-action ui-f0ca92" type="button" onClick={() => navigate(`/costos?nuevo=1&bloque=${bloque.id}&plantacion=${plantacionActiva.id}`)}><i className="ti ti-coin" aria-hidden="true" /> Costo directo <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>}
            <button className="ag-small-action ui-f0ca92" type="button" onClick={() => navigate(`/rentabilidad?bloque=${bloque.id}`)}><i className="ti ti-chart-line" aria-hidden="true" /> Rentabilidad <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>
          </div>}
        </div>

        <NotasPanel
          modulo="bloc_notas"
          permisoModulo="agenda"
          titulo="Notas de este bloque"
          mostrarFecha={false}
          limite={null}
          referenciaTipo="bloque"
          referenciaId={bloque.id}
          referenciaEtiqueta={`Bloque ${bloque.codigo}`}
        />

        {/* Tabs */}
        <div className="ag-block-tabs block-detail-tabs ui-c1894b" aria-label="Secciones del bloque">
          {[
            ['plantacion','ti-layout-dashboard','Resumen',null],
            ['fertilizacion','ti-leaf','Fertilizaciones',fertilizaciones.length],
            ['cosechas','ti-cut','Cosechas',cosechasCiclo.length],
            ['incidencias','ti-spray','Fumigaciones',incidencias.length],
            ['fotos','ti-photo','Fotos',fotos.length],
            ['historial','ti-history','Historial',historial.length],
          ].map(([k,icon,v,count]) => (
            <button className="ag-small-action ui-f9a370" key={k} aria-pressed={seccion === k} onClick={() => setSeccion(k)}
              style={{ background: seccion===k ? (k==='fertilizacion' ? '#1a5c2e' : '#0F3923') : 'rgba(15,23,42,.06)', color: seccion===k ? '#fff' : 'var(--text-secondary)' }}>
              <i className={`ti ${icon}`} aria-hidden="true" />{v}{count !== null && <span>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={`${`ag-block-content block-detail-content ag-block-section-${seccion}`} ui-538f66`} key={seccion}>
        <div className="block-detail-section-head"><span><i className={`ti ${sectionIcon}`} /></span><div><h2>{sectionTitle}</h2><p>{sectionDescription}</p></div></div>

        {/* PLANTACION ACTUAL */}
        {seccion === 'plantacion' && (
          <>
            {plantacionActiva ? (
              <>
                <div className="ag-surface ui-49272e">
                  <div className="ui-546e10">
                    <div className="ui-1d6b4b">Datos de la plantación</div>
                    {can.edit && <button className="ag-small-action ui-387856" onClick={abrirEditarPlantacion}>Editar</button>}
                  </div>
                  {[
                    ['Cultivo', plantacionActiva.cultivos?.nombre || '-'],
                    ['Variedad', getVariedad(plantacionActiva) || '-'],
                    ['Fecha siembra', plantacionActiva.fecha_siembra || '-'],
                    ['Días en campo', diasDesde(plantacionActiva.fecha_siembra) !== null ? `${diasDesde(plantacionActiva.fecha_siembra)} días` : '-'],
                    ['Cantidad de plantas', cantidadPlantasActiva ? `${cantidadPlantasActiva.toLocaleString('es-PY')} plantas` : '-'],
                  ].map(([k,v]) => (
                    <div className="ui-a7a997" key={k}>
                      <div className="ui-93a7e1">{k}</div>
                      <div className="ui-0993fa">{v}</div>
                    </div>
                  ))}
                  {abonosPlantacion.length > 0 && (
                    <div className="ui-e1deb8">
                      <div className="ui-74cc19">Abonos de base</div>
                      {abonosPlantacion.map(a => (
                        <div className="ui-821f5f" key={a.id}>
                          <span className="ui-8dc166">{a.abonos?.nombre}</span>
                          <span className="ui-93a7e1">{fmtAbonoPlantacion(a)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <section className="ag-surface block-cost-card" aria-label="Costos acumulados del ciclo">
                  <div className="block-cost-card__head">
                    <div><small>GASTOS DEL CICLO ACTUAL</small><h3>Costo acumulado</h3><p>Desde la siembra del {fechaCorta(plantacionActiva.fecha_siembra)}.</p></div>
                    <strong>{costosCiclo.loading ? 'Calculando…' : `Gs. ${fmtGs(costosCiclo.total)}`}</strong>
                  </div>
                  {costosCiclo.error && <div className="ag-feedback ag-feedback-error" role="alert">{costosCiclo.error}</div>}
                  {!costosCiclo.loading && <div className="block-cost-card__breakdown">
                    <button type="button" onClick={() => setDetalleCostos('fumigaciones')}><i className="ti ti-spray" /><small>Fumigaciones</small><strong>Gs. {fmtGs(costosCiclo.fumigaciones)}</strong><em>Ver detalle <i className="ti ti-chevron-right" /></em></button>
                    <button type="button" onClick={() => setDetalleCostos('fertilizaciones')}><i className="ti ti-leaf" /><small>Fertilizaciones</small><strong>Gs. {fmtGs(costosCiclo.fertilizaciones)}</strong><em>Ver detalle <i className="ti ti-chevron-right" /></em></button>
                    <button type="button" onClick={() => setDetalleCostos('manuales')}><i className="ti ti-receipt" /><small>Gastos directos</small><strong>Gs. {fmtGs(costosCiclo.manuales)}</strong><em>Ver detalle <i className="ti ti-chevron-right" /></em></button>
                  </div>}
                  <div className="block-cost-card__foot"><span>Incluye insumos consumidos y gastos asignados a este bloque. No reparte jornales generales del campo.</span><button type="button" onClick={() => navigate(`/rentabilidad?bloque=${bloque.id}`)}>Ver rentabilidad <i className="ti ti-arrow-up-right" /></button></div>
                </section>

                <div className="ui-e4712c">
                  <div className="ui-253181">
                    <div className="ui-19caa9">KG COSECHADOS</div>
                    <div className="ui-b428dd">{fmtKg(totalKgCiclo)}</div>
                    <div className="ui-626bf4">este ciclo</div>
                  </div>
                  <div className="ag-surface ui-c2bf5d">
                    <div className="ui-476525">KG POR PLANTA</div>
                    <div className="ui-7ad61e">{kgPorPlanta || '-'}</div>
                    <div className="ui-a8f171">kg/planta</div>
                  </div>
                  {totalMuertes > 0 && (
                    <div className="ui-5aaa70">
                      <div className="ui-476525">PLANTAS MUERTAS</div>
                      <div className="ui-4a5507">{totalMuertes.toLocaleString('es-PY')}</div>
                    </div>
                  )}
                </div>

                <div className="ui-9c6869">
                  {can.create && <button className="ag-small-action ui-004512" onClick={abrirNuevaPlantacion}
                   >
                    Nueva plantación
                  </button>}
                  {can.create && <button className="ag-small-action ui-d4abad" onClick={() => setShowMuerte(true)}
                   >
                    + Muerte de plantas
                  </button>}
                </div>
                <div className="ui-caac2c">
                  {can.edit && <button className="ag-small-action ui-5b0f32" onClick={finalizarPlantacionActiva}
                   >
                    Finalizar plantación
                  </button>}
                  {can.delete && <button className="ag-small-action ui-05757f" onClick={eliminarPlantacionActiva}
                   >
                    Eliminar plantación
                  </button>}
                </div>
              </>
            ) : (
              <div className="ag-surface ui-13bbf9">
                Sin plantación activa.<br/>
                {can.create && <button className="ag-small-action ui-a4d716" onClick={abrirNuevaPlantacion}>
                  + Nueva plantación
                </button>}
              </div>
            )}
          </>
        )}

        {/* FERTILIZACION */}
        {seccion === 'fertilizacion' && (
          <>
            <div className="ui-d686c5" style={{ background: planSemanal ? '#eef6ea' : '#fff', border: planSemanal ? '1px solid #cde6c8' : '1px dashed #d6d6d6' }}>
              <div className="ui-1d6f95">
                <div>
                  <div className="ui-338218" style={{ color: planSemanal ? '#1a5c2e' : '#8b928b' }}>Plan semanal</div>
                  <div className="ui-62e15c">{planSemanal ? planSemanal.nombre : 'Sin plan activo'}</div>
                  <div className="ui-13b58a">
                    {planSemanal ? `${planSemanal.litros_preparados || '-'} L preparados  -  ${aplicacionesPlan.length} aplicaciones` : 'Solo para los bloques que usan receta semanal.'}
                  </div>
                </div>
                {canFert.create && <button className="ag-small-action ui-0a1c50" onClick={abrirPlanSemanal}
                 >
                  {planSemanal ? 'Editar' : 'Crear'}
                </button>}
              </div>
              {planSemanal && (
                <>
                  <div className="ui-c44e95">
                    {(planSemanal.soluciones || []).slice(0, 3).map((sol, si) => (
                      <div className="ui-405ecf" key={si}>
                        <strong>Sol. {sol.nombre}:</strong> {(sol.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).filter(x => x.trim()).join('  -  ') || 'Sin productos'}
                      </div>
                    ))}
                  </div>
                  <div className="ui-f56ef1">
                    {canFert.create && <button className="ag-small-action ui-3f7a77" onClick={abrirAplicarPlan}
                     >
                      Aplicar hoy
                    </button>}
                    <button className="ag-small-action ui-98ffc9" onClick={desactivarPlanSemanal}
                     >
                      Desactivar
                    </button>
                  </div>
                  {aplicacionesPlan.length > 0 && (
                    <div className="ui-002535">
                      <div className="ui-2fff95">Últimas aplicaciones</div>
                      {aplicacionesPlan.slice(0, 5).map(app => (
                        <div className="ui-d1d4a9" key={app.id}>
                          <span className="ui-93e9c9">{app.fecha}{app.responsable ? `  -  ${app.responsable}` : ''}</span>
                          <strong className="ui-6b9c17">{app.litros_aplicados || '-'} L</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {canFert.create && <button className="ag-small-action ui-bcc504" onClick={abrirNuevaFertilizacion}
             >
              + Nueva fertilización
            </button>}

            {fertilizaciones.length === 0 ? (
              <div className="ag-surface ui-eeb39f">
                Sin fertilizaciones registradas en este bloque
              </div>
            ) : (
              <>
                {/* Fertilizacion actual */}
                {fertilizaciones[0] && (
                  <>
                    <div className="ui-4192ca">Fertilización actual</div>
                    <div className="ui-2e75cf" role="button" tabIndex={0} onClick={() => setFertDetalle(fertilizaciones[0])} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFertDetalle(fertilizaciones[0]) } }}
                     >
                      <div className="ui-5ad71a">
                        <div className="ui-659921">{rangoFertilizacion(fertilizaciones[0])}</div>
                        <i className="ti ti-chevron-right ui-77746e" aria-hidden="true"></i>
                      </div>
                      {(fertilizaciones[0].soluciones || []).map((sol, si) => (
                        <div className="ui-2937bf" key={si}>
                          <div className="ui-627852">SOL. {sol.nombre}</div>
                          <div className="ui-d76068">
                            {(sol.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).filter(x=>x.trim()).join('  -  ')}
                          </div>
                        </div>
                      ))}
                      {notasFertilizacionVisibles(fertilizaciones[0].notas) && (
                        <div className="ui-80cec8">{notasFertilizacionVisibles(fertilizaciones[0].notas)}</div>
                      )}
                    </div>
                  </>
                )}

                {/* Fertilizacion anterior */}
                {fertilizaciones[1] && (
                  <>
                    <div className="ui-4899be">Fertilización anterior</div>
                    <div className="ag-surface ui-fe238f" role="button" tabIndex={0} onClick={() => setFertDetalle(fertilizaciones[1])} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFertDetalle(fertilizaciones[1]) } }}
                     >
                      <div className="ui-5ad71a">
                        <div className="ui-62e15c">{rangoFertilizacion(fertilizaciones[1])}</div>
                        <i className="ti ti-chevron-right ui-d63ae8" aria-hidden="true"></i>
                      </div>
                      {(fertilizaciones[1].soluciones || []).map((sol, si) => (
                        <div className="ui-2937bf" key={si}>
                          <div className="ui-63459e">SOL. {sol.nombre}</div>
                          <div className="ui-93a7e1">
                            {(sol.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).filter(x=>x.trim()).join('  -  ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Historial de fertilizaciones */}
                {fertilizaciones.length > 2 && (
                  <>
                    <div className="ui-4899be">Historial</div>
                    {fertilizaciones.slice(2).map(fert => (
                      <div className="ag-surface ui-652941" role="button" tabIndex={0} key={fert.id} onClick={() => setFertDetalle(fert)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFertDetalle(fert) } }}
                       >
                        <div className="ui-da5cd6">
                          <div className="ui-076bb2">{rangoFertilizacion(fert)}</div>
                          <div className="ui-a8f171">
                            {(fert.soluciones || []).length} solución{(fert.soluciones || []).length !== 1 ? 'es' : ''}  -  {(fert.soluciones || []).reduce((s,sol) => s + (sol.productos||[]).length, 0)} productos
                          </div>
                        </div>
                        <i className="ti ti-chevron-right ui-d63ae8" aria-hidden="true"></i>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* COSECHAS */}
        {seccion === 'cosechas' && (
          <>
            {cosechaError && <div role="alert" className="ag-surface ui-99ac05">{cosechaError}</div>}
            {cosechaSuccess && <div role="status" className="ag-surface ui-315e0e">{cosechaSuccess}</div>}
            {cosechasCiclo.length === 0 ? (
              <div className="ui-5baa7a">Sin cosechas registradas en este ciclo</div>
            ) : (
              <>
                <div className="ui-369c7d">
                  <div className="ui-19caa9">TOTAL DEL CICLO</div>
                  <div className="ui-f89942">{fmtKg(totalKgCiclo)} kg</div>
                  {kgPorPlanta && <div className="ui-626bf4">{kgPorPlanta} kg por planta</div>}
                </div>
                {cosechasCiclo.map(c => (
                  <div className="ag-surface ui-0beb00" key={c.id}>
                    <div className="ui-9b26fa">
                      <div className="ui-076bb2">{c.fecha}</div>
                      <div className="ui-6dc1df">{fmtKg(c.kg_total)} kg</div>
                    </div>
                    <div className="ui-91294d">
                      <div className="ui-fcf19b">
                        {c.calidad === 'primera' ? '1ra' : c.calidad === 'segunda' ? '2da' : 'Mixta'}
                      </div>
                      {canCos.delete && (
                        <button
                          type="button"
                          className="ag-small-action ui-d088ca"
                          aria-label={`Eliminar cosecha de ${fmtKg(c.kg_total)} kg del ${c.fecha}`}
                          onClick={() => eliminarCosecha(c)}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* INCIDENCIAS */}
        {seccion === 'incidencias' && (
          <>
            <div className="ui-315e0e">Fumigaciones registradas y vinculadas a este bloque</div>
            {incidencias.length === 0 ? (
              <div className="ui-5baa7a">Sin fumigaciones registradas</div>
            ) : incidencias.map((inc, i) => (
              <div className="ag-surface ui-3451cf" role="button" tabIndex={0} key={i} onClick={() => setIncidenciaDetalle(inc)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIncidenciaDetalle(inc) } }}>
                <div className="ui-31d953">
                  <div className="ui-878e4e" style={{ background: inc.tipo==='fumigacion' ? '#fff3e8' : '#eaf4fb', color: inc.tipo==='fumigacion' ? '#e07b00' : '#2980b9' }}>
                    {inc.tipo === 'fumigacion' ? 'Fumigación' : inc.tipo === 'fertiriego' ? 'Fertiriego' : 'Foliar'}
                  </div>
                  <div className="ui-93a7e1">{inc.fecha}</div>
                </div>
                <div className="ui-3178c3">{inc.notas}</div>
                {inc.fumigacion_productos?.length > 0 && (
                  <div className="ui-93a7e1">
                    {inc.fumigacion_productos.map(fp => fp.productos?.nombre || fp.producto_nombre).filter(Boolean).join(', ')}
                  </div>
                )}
                <div className="ui-88371b">Tocar para ver detalle</div>
              </div>
            ))}
            {muertes.length > 0 && (
              <>
                <div className="ui-2c2d2a">Muerte de plantas</div>
                {muertes.map(m => (
                  <div className="ui-74aa9e" key={m.id}>
                    <div className="ui-9b26fa">
                      <div className="ui-66a70e">{m.cantidad} plantas  -  {m.causa}</div>
                      <div className="ui-93a7e1">{m.fecha}</div>
                    </div>
                    {m.descripcion && <div className="ui-93a7e1">{m.descripcion}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* FOTOS */}
        {seccion === 'fotos' && (
          <>
            {can.create && <button className="ag-small-action ui-62f30d" onClick={() => fileRef.current?.click()}
             >
              <i className="ti ti-camera ui-e705f9" aria-hidden="true"></i>
              Agregar foto
            </button>}
            {fotos.length === 0 ? (
              <div className="ui-5baa7a">Sin fotos en este ciclo</div>
            ) : (
              <div className="ui-f56ef1">
                {fotos.map(f => (
                  <div className="ui-8e4804" key={f.id}>
                    <img className="ui-caf585" src={f.url} alt="foto bloque"/>
                    {f.descripcion && <div className="block-photo-description">{f.descripcion}</div>}
                    <div className="ui-aa460d">
                      <span className="ui-e3758e">{f.fecha}</span>
                      {can.delete && <button aria-label="Eliminar" className="ag-small-action ui-d088ca" onClick={() => eliminarFoto(f.id)}>
                        <i className="ti ti-trash ui-9fe38b" aria-hidden="true"></i>
                      </button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* HISTORIAL */}
        {seccion === 'historial' && (
          <>
            {historial.length === 0 ? (
              <div className="ui-5baa7a">Sin ciclos anteriores</div>
            ) : historial.map(p => (
              <div className="ag-surface ui-4aac8a" role="button" tabIndex={0} key={p.id} onClick={() => abrirHistorialDetalle(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirHistorialDetalle(p) } }}
               >
                <div className="ui-da5cd6">
                  <div className="ui-451b76">
                    {p.cultivos?.nombre}{getVariedad(p) ? `  -  ${getVariedad(p)}` : ''}
                  </div>
                  <div className="ui-a8f171">
                    Siembra: {p.fecha_siembra || '-'}
                  </div>
                </div>
                <i className="ti ti-chevron-right ui-d63ae8" aria-hidden="true"></i>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modal nueva/editar plantacion */}
      {(showNuevaPlantacion || showEditarPlantacion) && (
        <div className="ui-66d878" style={{ alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end' }}>
          <div className="ui-7dd37e" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{showEditarPlantacion ? 'Editar plantación' : 'Nueva plantación'}</div>

            <label className="ag-field-label ui-74cc19">Cultivo *
            <select style={inpStyle} value={form.cultivo_id} disabled={cultivosLoading} onChange={e => setForm(f => ({...f, cultivo_id:e.target.value}))}>
              <option value="">{cultivosLoading ? 'Cargando cultivos...' : cultivos.length ? 'Selecciona cultivo...' : 'Todavía no hay cultivos'}</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            {!cultivosLoading && cultivos.length === 0 && !cultivoRapidoError && (
              <div style={{ background:'#f2f8f4', border:'1px solid #d9e9df', borderRadius:'var(--ag-radius)', padding:'11px 12px', margin:'-2px 0 10px', color:'#315344', fontSize:12, lineHeight:1.45 }}>
                Esta empresa todavía no tiene cultivos. Creá el primero abajo; quedará guardado y seleccionado automáticamente.
              </div>
            )}
            <div className="ui-74cc19" style={{ marginBottom:6 }}>Agregar un cultivo al catálogo</div>
            <div className="ui-16e267">
              <input className="ui-e7ec54"
                style={{ ...inpStyle }}
                type="text"
                value={nuevoCultivoNombre}
                onChange={e => setNuevoCultivoNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarCultivoRapido() } }}
                placeholder="Ej: Tomate, locote, pepino..."
              />
              <button className="ag-small-action ui-c1563e"
                type="button"
                onClick={() => agregarCultivoRapido()}
                disabled={!nuevoCultivoNombre.trim()}
              >
                Agregar
              </button>
            </div>
            {cultivoRapidoError && (
              <div className="ui-9614e6">
                {cultivoRapidoError}
              </div>
            )}

            <label className="ag-field-label ui-74cc19">Variedad
            <input style={inpStyle} type="text" value={form.variedad_texto} onChange={e => setForm(f => ({...f, variedad_texto:e.target.value}))} placeholder="Ej: Rojo, Lamuyo..."/></label>

            <label className="ag-field-label ui-74cc19">Fecha de siembra *
            <input style={inpStyle} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({...f, fecha_siembra:e.target.value}))}/></label>

            <label className="ag-field-label ui-74cc19">Cantidad de plantas
            <input style={inpStyle} type="text" inputMode="numeric" value={form.cantidad_plantas} onChange={e => setForm(f => ({...f, cantidad_plantas:e.target.value.replace(/[^0-9.,\s]/g, '')}))} onBlur={() => setForm(f => ({...f, cantidad_plantas:formatLocaleInteger(f.cantidad_plantas)}))} placeholder="Ej: 41.497" autoComplete="off"/></label>

            <div className="ui-9546b4">Abonos de base (podés agregar varios)</div>
            <div className="ui-711010">
              <input className="ui-d8b4c5" style={{ ...inpStyle }} type="text" value={nuevoAbonoNombre} onChange={e => setNuevoAbonoNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarAbonoRapido() } }} placeholder="Escribí un abono y agregalo" />
              <button className="ag-small-action ui-2082ce" type="button" onClick={() => agregarAbonoRapido()} disabled={!nuevoAbonoNombre.trim()}>Agregar</button>
            </div>
            <div className="ui-59f8a7">Agregá uno, completá su cantidad y repetí para sumar todos los que uses. No hace falta cargarlos previamente en inventario.</div>
            {abonoRapidoError && <div className="ui-9614e6">{abonoRapidoError}</div>}
            {form.abonos_ids.length > 0 && <div style={{ fontSize:12, fontWeight:700, color:'#315344', margin:'8px 0 6px' }}>Abonos agregados: {form.abonos_ids.length}</div>}
            {abonos.map(a => (
              <div className="ui-d51702" key={a.id}>
                <div className="ui-bfa195" role="checkbox" tabIndex={0} aria-checked={form.abonos_ids.includes(a.id)} onClick={() => toggleAbono(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAbono(a.id) } }}
                  style={{ background: form.abonos_ids.includes(a.id) ? '#0F3923' : '#fff', marginBottom: form.abonos_ids.includes(a.id) ? 6 : 0 }}>
                  <div className="ui-7b138e" style={{ border: form.abonos_ids.includes(a.id) ? 'none' : '1.5px solid #d0d0d0', background: form.abonos_ids.includes(a.id) ? '#fff' : 'transparent' }}>
                    {form.abonos_ids.includes(a.id) && <i className="ti ti-check ui-aa481a" aria-hidden="true"></i>}
                  </div>
                  <span className="ui-3044b6" style={{ color: form.abonos_ids.includes(a.id) ? '#fff' : 'var(--text-primary)' }}>{a.nombre}</span>
                </div>
                {form.abonos_ids.includes(a.id) && (
                  <div className="ui-da683d">
                    <input className="ui-0b58f7"
                      type="text" placeholder="Cantidad (ej: 50)"
                      value={form.abonos_cantidades[a.id] || ''}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id]:e.target.value}}))}/>
                    <select className="ui-59c31d"
                      value={(form.abonos_cantidades[a.id+'_unidad']) || 'kg'}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id+'_unidad']:e.target.value}}))}>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="ton">ton</option>
                    </select>
                    <select className="ui-170849"
                      value={(form.abonos_cantidades[a.id+'_alcance']) || 'total'}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id+'_alcance']:e.target.value}}))}>
                      <option value="total">Total</option>
                      <option value="por_tablon">Por tablon</option>
                    </select>
                  </div>
                )}
              </div>
            ))}

            {plantacionFormError && <div className="ui-9614e6" role="alert">{plantacionFormError}</div>}

            <button className="ag-small-action ui-ae1eb0" style={{ background: saving ? '#888' : '#0F3923' }}
              onClick={showEditarPlantacion ? guardarEditarPlantacion : guardarNuevaPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : showEditarPlantacion ? 'Guardar cambios' : 'Guardar plantación'}
            </button>
            <button className="ag-small-action ui-9d2a4a"
              onClick={() => { setShowNuevaPlantacion(false); setShowEditarPlantacion(false) }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal muerte de plantas */}
      {showMuerte && (
        <Modal onClose={() => setShowMuerte(false)} label="Registro del bloque" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-72e3b5" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0' }}>
            <div className="ui-c7b1b6">Registrar muerte de plantas</div>

            <label className="ag-field-label ui-74cc19">Cantidad de plantas *
            <input style={inpStyle} type="text" inputMode="numeric" autoComplete="off" value={formMuerte.cantidad} onChange={e => setFormMuerte(f => ({...f, cantidad:e.target.value.replace(/[^0-9.,\s]/g, '')}))} onBlur={() => setFormMuerte(f => ({...f, cantidad:formatLocaleInteger(f.cantidad)}))} placeholder="Ej: 5"/></label>

            <div className="ui-74cc19">Causa</div>
            <div className="ui-1e850e">
              {CAUSAS_MUERTE.map(c => (
                <button className="ag-small-action ui-e36b2f" key={c} onClick={() => setFormMuerte(f => ({...f, causa:c}))}
                  style={{ background: formMuerte.causa===c ? '#c84040' : '#fff', color: formMuerte.causa===c ? '#fff' : '#555' }}>
                  {c}
                </button>
              ))}
            </div>

            <label className="ag-field-label ui-74cc19">Descripción (opcional)
            <textarea className="ui-dc8f36" style={{ ...inpStyle }} value={formMuerte.descripcion} onChange={e => setFormMuerte(f => ({...f, descripcion:e.target.value}))} placeholder="Detalles adicionales..."/></label>

            <button className="ag-small-action ui-9002be" onClick={guardarMuerte} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setShowMuerte(false)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Modal nueva fertilizacion */}
      {showPlanSemanal && (
        <Modal onClose={() => setShowPlanSemanal(false)} label="Registro del bloque" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:120, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setShowPlanSemanal(false)}>
          <div className="ui-fda65b" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-99efa8">{formPlan.id ? 'Editar plan semanal' : 'Nuevo plan semanal'}</div>
            <div className="ui-7d5827">Usalo solo en los bloques donde preparas fertilización para varios días.</div>

            <label className="ag-field-label ui-74cc19">Nombre
            <input style={inpStyle} value={formPlan.nombre} onChange={e => setFormPlan(f => ({ ...f, nombre:e.target.value }))} /></label>
            <div className="ui-f56ef1">
              <div>
                <label className="ag-field-label ui-74cc19">Fecha inicio
                <input type="date" style={inpStyle} value={formPlan.fecha_inicio} onChange={e => setFormPlan(f => ({ ...f, fecha_inicio:e.target.value }))} /></label>
              </div>
              <div>
                <label className="ag-field-label ui-74cc19">Litros preparados
                <input style={inpStyle} value={formPlan.litros_preparados} onChange={e => setFormPlan(f => ({ ...f, litros_preparados:e.target.value.replace(',', '.') }))} placeholder="Ej: 200" inputMode="decimal" /></label>
              </div>
            </div>

            {formPlan.soluciones.map((sol, si) => (
              <div className="ag-surface ui-7fff2b" key={si}>
                <div className="ui-b3c308">
                  <div className="ui-515b34">Solución {sol.nombre}</div>
                  {formPlan.soluciones.length > 1 && <button className="ui-6ae6fb" onClick={() => eliminarSolucionPlan(si)}>Eliminar</button>}
                </div>
                {(sol.productos || []).map((prod, pi) => (
                  <div className="ag-product-row ui-964def" key={pi}>
                    <input className="ui-e7ec54" style={{ ...inpStyle }} value={prod.nombre} onChange={e => actualizarProductoPlan(si, pi, 'nombre', e.target.value)} placeholder="Producto"/>
                    <input className="ui-e7ec54" style={{ ...inpStyle }} value={prod.cantidad} onChange={e => actualizarProductoPlan(si, pi, 'cantidad', e.target.value.replace(',', '.'))} placeholder="Cant." inputMode="decimal"/>
                    <select className="ui-e7ec54" style={{ ...inpStyle }} value={prod.unidad} onChange={e => actualizarProductoPlan(si, pi, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button className="ui-b58c47" onClick={() => eliminarProductoPlan(si, pi)}>x</button>
                  </div>
                ))}
                <button className="ag-small-action ui-0a1d4e" onClick={() => agregarProductoPlan(si)}>+ Producto</button>
              </div>
            ))}
            <button className="ag-small-action ui-b987ad" onClick={agregarSolucionPlan}>+ Agregar solución</button>
            <textarea className="ui-3d581a" style={{ ...inpStyle }} value={formPlan.notas} onChange={e => setFormPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas del plan"/>
            <button className="ag-small-action ui-08c1f7" onClick={guardarPlanSemanal} disabled={savingFert}>
              {savingFert ? 'Guardando...' : 'Guardar plan semanal'}
            </button>
            <button className="ag-small-action ui-51b9ff" onClick={() => setShowPlanSemanal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {showAplicarPlan && (
        <Modal onClose={() => setShowAplicarPlan(false)} label="Registro del bloque" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:120, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setShowAplicarPlan(false)}>
          <div className="ui-72e3b5" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0' }}>
            <div className="ui-606db8">Aplicar plan semanal</div>
            <label className="ag-field-label ui-74cc19">Fecha
            <input type="date" style={inpStyle} value={formAplicacionPlan.fecha} onChange={e => setFormAplicacionPlan(f => ({ ...f, fecha:e.target.value }))} /></label>
            <label className="ag-field-label ui-74cc19">Litros aplicados
            <input style={inpStyle} value={formAplicacionPlan.litros_aplicados} onChange={e => setFormAplicacionPlan(f => ({ ...f, litros_aplicados:e.target.value.replace(',', '.') }))} placeholder="Ej: 40" inputMode="decimal" /></label>
            <label className="ag-field-label ui-74cc19">Responsable
            <input style={inpStyle} value={formAplicacionPlan.responsable} onChange={e => setFormAplicacionPlan(f => ({ ...f, responsable:e.target.value }))} placeholder="Opcional" /></label>
            <textarea className="ui-3d581a" style={{ ...inpStyle }} value={formAplicacionPlan.notas} onChange={e => setFormAplicacionPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas"/>
            <button className="ag-small-action ui-08c1f7" onClick={guardarAplicacionPlan} disabled={savingFert}>
              {savingFert ? 'Guardando...' : 'Guardar aplicación'}
            </button>
            <button className="ag-small-action ui-51b9ff" onClick={() => setShowAplicarPlan(false)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {incidenciaDetalle && (
        <Modal onClose={() => setIncidenciaDetalle(null)} label="Registro del bloque" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:130, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center', padding: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : 0 }}
          onClick={e => e.target===e.currentTarget && setIncidenciaDetalle(null)}>
          <div className="ui-ae773e" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0' }}>
            <div className="ui-6c2eec">
              <div>
                <div className="ui-476525">Detalle de fumigación</div>
                <div className="ui-882dd8">{incidenciaDetalle.tipo === 'fertiriego' ? 'Fertiriego' : incidenciaDetalle.tipo === 'foliar' ? 'Foliar' : 'Fumigación'}</div>
                <div className="ui-13b58a">{incidenciaDetalle.fecha}</div>
              </div>
              <button className="ui-6de38e ag-close-btn" aria-label="Cerrar" onClick={() => setIncidenciaDetalle(null)}>
                <i className="ti ti-x ui-b7c8fe" aria-hidden="true"></i>
              </button>
            </div>

            <div className="ag-surface ui-f3f33f">
              <div className="ui-74cc19">Bloques</div>
              <div className="ui-788a2f">
                {(incidenciaDetalle.fumigacion_bloques || []).map(fb => fb.bloques?.codigo).filter(Boolean).join(', ') || bloque?.codigo || '-'}
              </div>
            </div>

            <div className="ui-f6fa01">
              <div className="ag-surface ui-c2bf5d">
                <div className="ui-74cc19">Operario</div>
                <div className="ui-788a2f">{incidenciaDetalle.operario || '-'}</div>
              </div>
              <div className="ag-surface ui-c2bf5d">
                <div className="ui-74cc19">Tanques</div>
                <div className="ui-788a2f">
                  {incidenciaDetalle.tanques_cantidad || '-'}{incidenciaDetalle.tanque_litros ? ` x ${incidenciaDetalle.tanque_litros} L` : ''}
                </div>
              </div>
            </div>

            <div className="ag-surface ui-f3f33f">
              <div className="ui-3771db">Productos aplicados</div>
              {(incidenciaDetalle.fumigacion_productos || []).length === 0 ? (
                <div className="ui-93a7e1">Sin productos cargados.</div>
              ) : incidenciaDetalle.fumigacion_productos.map((fp, idx) => (
                <div className="ui-d01382" key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f0ede8' }}>
                  <div>
                    <div className="ui-788a2f">{fp.productos?.nombre || fp.producto_nombre || 'Producto'}</div>
                    <div className="ui-a8f171">
                      Dosis: {fp.dosis || `${fp.cantidad || '-'} ${fp.unidad_uso || ''}`}
                    </div>
                  </div>
                  <div className="ui-eb34de">
                    {fp.descuento_stock ? `Stock: ${fmtKg(fp.descuento_stock)} ${fp.productos?.unidad || ''}` : ''}
                    {fp.productos?.carencia_dias ? <div>Carencia: {fp.productos.carencia_dias} días</div> : null}
                  </div>
                </div>
              ))}
            </div>

            {incidenciaDetalle.notas && (
              <div className="ag-surface ui-c2bf5d">
                <div className="ui-74cc19">Notas</div>
                <div className="ui-3e9bfb">{incidenciaDetalle.notas}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showNuevaFertilizacion && (
        <Modal onClose={() => setShowNuevaFertilizacion(false)} busy={savingFert} label="Nueva fertilización" className="fert-quick-modal"
          onClick={e => e.target===e.currentTarget && setShowNuevaFertilizacion(false)}>
          <div className="fert-dialog">
            <header className="fert-dialog__header">
              <span className="fert-dialog__icon"><i className="ti ti-leaf" aria-hidden="true" /></span>
              <div><span>Aplicación puntual</span><h2>Nueva fertilización</h2><p>Registrá la mezcla aplicada y vinculala a uno o varios bloques.</p></div>
              <button type="button" className="fert-dialog__close ag-close-btn" aria-label="Cerrar" onClick={() => setShowNuevaFertilizacion(false)}><i className="ti ti-x" aria-hidden="true" /></button>
            </header>

            <div className="fert-dialog__body">
            <label className="fert-field">Fecha de aplicación *
            <input className="fert-control" type="date" value={formFert.fecha} onChange={e => setFormFert(f => ({...f, fecha:e.target.value}))}/></label>

            <fieldset className="fert-block-picker">
              <legend>Bloques tratados *</legend>
              <div className="fert-block-picker__grid">
                {(bloquesCampo.length ? bloquesCampo : [{ id, codigo: bloque.codigo }]).map(b => {
                  const seleccionado = (formFert.bloques_ids || []).includes(b.id)
                  const cultivo = b.plantaciones?.find(p => p.activa)?.cultivos?.nombre
                  return (
                    <button className="fert-block-option" data-selected={seleccionado || undefined} aria-pressed={seleccionado} key={b.id} type="button" onClick={() => alternarBloqueFertilizacion(b.id)}>
                      <i className={`ti ${seleccionado ? 'ti-circle-check-filled' : 'ti-circle'}`} aria-hidden="true" /><span><strong>Bloque {b.codigo}</strong>{cultivo && <small>{cultivo}</small>}</span>
                    </button>
                  )
                })}
              </div>
              <div className="fert-block-picker__summary">
                {(formFert.bloques_ids || []).length || 0} bloque{(formFert.bloques_ids || []).length === 1 ? '' : 's'} seleccionado{(formFert.bloques_ids || []).length === 1 ? '' : 's'}
              </div>
            </fieldset>

            {/* Soluciones */}
            {formFert.soluciones.map((sol, si) => (
              <section className="fert-solution-card" key={si}>
                <div className="fert-solution-card__head">
                  <span className="fert-solution-card__badge">{si + 1}</span>
                  <label>Nombre de la solución<input className="fert-control"
                     
                      value={sol.nombre}
                      onChange={e => {
                        const sols = [...formFert.soluciones]
                        sols[si] = { ...sols[si], nombre: e.target.value }
                        setFormFert(f => ({ ...f, soluciones: sols }))
                      }}
                      placeholder="Ej: Solución A"
                    /></label>
                  {formFert.soluciones.length > 1 && (
                    <button type="button" aria-label="Eliminar solución" className="fert-icon-action" onClick={() => eliminarSolucion(si)}
                     >
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  )}
                </div>

                {sol.productos.map((prod, pi) => (
                  <div className="fert-product-row" key={pi}>
                    <label className="fert-product-row__name">Producto<input className="fert-control"
                     
                      type="text" placeholder="Ej: KCL"
                      value={prod.nombre}
                      onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)}
                    /></label>
                    <label>Cantidad<input className="fert-control numeric-data"
                     
                      type="text" inputMode="decimal" placeholder="0"
                      value={prod.cantidad}
                      onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value)}
                    /></label>
                    <label>Unidad<select className="fert-control"
                     
                      value={prod.unidad}
                      onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select></label>
                    {sol.productos.length > 1 && (
                      <button type="button" aria-label="Quitar producto" className="fert-icon-action fert-product-row__remove" onClick={() => eliminarProducto(si, pi)}
                       >
                        <i className="ti ti-x" aria-hidden="true"></i>
                      </button>
                    )}
                  </div>
                ))}

                <button type="button" className="fert-add-row" onClick={() => agregarProducto(si)}
                 >
                  <i className="ti ti-plus" aria-hidden="true" /> Agregar producto
                </button>
              </section>
            ))}

            <button type="button" className="fert-add-solution" onClick={agregarSolucion}
             >
              <i className="ti ti-layers-subtract" aria-hidden="true" /> Agregar otra solución
            </button>

            <label className="fert-field">Notas (opcional)
            <textarea className="fert-control fert-textarea"
              value={formFert.notas}
              onChange={e => setFormFert(f => ({...f, notas:e.target.value}))}
              placeholder="Observaciones, ajustes del ingeniero..."/></label>
            </div>

            <footer className="fert-dialog__footer">
            <button type="button" className="fert-dialog__cancel"
              onClick={() => setShowNuevaFertilizacion(false)} disabled={savingFert}>Cancelar</button>
            <button type="button" className="fert-dialog__save"
              onClick={guardarFertilizacion} disabled={savingFert}>
              {savingFert ? <><i className="ti ti-loader-2" aria-hidden="true" /> Guardando...</> : <><i className="ti ti-check" aria-hidden="true" /> Guardar fertilización</>}
            </button>
            </footer>
          </div>
        </Modal>
      )}

      {showQr && puedeVerQr && (
        <Modal onClose={() => setShowQr(false)} label="Registro del bloque" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:220, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="ag-surface ui-701d98">
            <div className="ui-93a7e1">{bloque.campos?.nombre}</div>
            <div className="ag-page-title ui-92e9fa">QR Bloque {bloque.codigo}</div>
            {qrError && <div className="ui-99ac05">{qrError}</div>}
            {qrDataUrl
              ? <img className="ui-980293" src={qrDataUrl} alt={`QR del bloque ${bloque.codigo}`}/>
              : <div className="ui-266415">Generando QR...</div>}
            <div className="ui-906e8e">Al escanear, abre directamente este bloque. Para cargar información se requiere iniciar sesión.</div>
            {typeof navigator.share === 'function' && <button className="ag-small-action ui-f40c68" type="button" onClick={compartirQr} disabled={!qrDataUrl}>Compartir / Guardar QR</button>}
            <div className="ui-50089c">En iPhone, usá Compartir / Guardar QR y elegí Guardar imagen o Guardar en Archivos. También podés mantener presionado el QR para ver las opciones disponibles.</div>
            <div className="ui-f56ef1">
              <button className="ag-small-action ui-1cc6c1" type="button" onClick={descargarQr} disabled={!qrDataUrl}>Descargar</button>
              <button className="ag-small-action ui-bb7661" type="button" onClick={imprimirQr} disabled={!qrDataUrl}>Imprimir etiqueta</button>
            </div>
            <button className="ag-small-action ui-5979cd" type="button" onClick={() => { setShowQr(false); setQrError('') }}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CycleSection({ icon, title, count, empty, children }) {
  const contenido = React.Children.toArray(children).filter(Boolean)
  return (
    <section className="ag-surface cycle-history-section">
      <div className="cycle-history-section__head">
        <span><i className={`ti ${icon}`} aria-hidden="true" /><strong>{title}</strong></span>
        <em>{count}</em>
      </div>
      {contenido.length ? <div className="cycle-history-list">{contenido}</div> : <div className="cycle-history-empty">{empty}</div>}
    </section>
  )
}

function CycleRow({ date, title, detail }) {
  return (
    <article className="cycle-history-row">
      <time>{date || '-'}</time>
      <div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
    </article>
  )
}

function CostDetailList({ tipo, costos }) {
  const items = tipo === 'manuales'
    ? (costos.costosManuales || []).map(item => ({ ...item, nombre:item.descripcion || item.tipo || 'Gasto directo', total:item.monto, detalle:item.tipo || '' }))
    : (costos.consumos || [])
      .filter(item => item.origen_tipo === `consumo_${tipo === 'fumigaciones' ? 'fumigacion' : 'fertilizacion'}`)
      .map(item => ({ ...item, nombre:item.productos?.nombre || 'Insumo', total:item.costo_total, detalle:`${fmtKg(item.cantidad_stock)} ${item.productos?.unidad || ''} × Gs. ${fmtGs(item.costo_unitario)}` }))
  return <div className="block-cost-detail__list">{items.length === 0 ? <div className="ui-5baa7a">No hay costos registrados en esta categoría.</div> : items.map(item => <article key={item.id}><div><strong>{item.nombre}</strong><small>{fechaCorta(item.fecha)}{item.detalle ? ` · ${item.detalle}` : ''}</small></div><b>Gs. {fmtGs(item.total)}</b></article>)}</div>
}
