import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Skeleton, Modal } from '../components/UI'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, DateQuickField, ChoiceChips, BlockChips, resumenPie, fechaIso } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
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
    fecha: fechaIso(0),
    bloques_ids: [],
    notas: '',
    soluciones: [
      { nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }
    ]
  })
  const [formPlan, setFormPlan] = useState({
    nombre: 'Plan semanal',
    fecha_inicio: fechaIso(0),
    litros_preparados: '',
    notas: '',
    soluciones: [
      { nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }
    ],
  })
  const [formAplicacionPlan, setFormAplicacionPlan] = useState({
    fecha: fechaIso(0),
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
  const [errorMuerte, setErrorMuerte] = useState('')
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

  // Si la base todavía no tiene las funciones atómicas, se usa el camino anterior (guardar en varios pasos).
  const rpcAusente = (error) => error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(error?.message || '')

  // Abonos del formulario en el formato que reciben las funciones de la base.
  const abonosParaBase = (abonosIds) => abonosIds.map(ab => ({
    abono_id: ab,
    cantidad: form.abonos_cantidades[ab] || null,
    unidad: form.abonos_cantidades[`${ab}_unidad`] || 'kg',
    alcance: form.abonos_cantidades[`${ab}_alcance`] || 'total',
  }))

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
    let caminoAnterior = false
    try {
      let abonosIds = [...form.abonos_ids]
      if (nuevoAbonoNombre.trim()) {
        const abonoPendienteId = await agregarAbonoRapido()
        if (!abonoPendienteId) throw new Error('No se pudo agregar el abono escrito.')
        if (!abonosIds.includes(abonoPendienteId)) abonosIds.push(abonoPendienteId)
      }
      // Cerrar la plantación activa, crear la nueva y sus abonos, en una sola operación de la base: si algo falla, no cambia nada.
      const { data:atomico, error:atomicoError } = await supabase.rpc('registrar_plantacion', { p:{
        bloque_id:id, cultivo_id:cultivoId, notas:form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null, fecha_siembra:form.fecha_siembra,
        cantidad_plantas:form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null, abonos:abonosParaBase(abonosIds),
      } })
      if (!atomicoError) nueva = { id:atomico?.id }
      else if (!rpcAusente(atomicoError)) throw atomicoError
      else caminoAnterior = true
      if (caminoAnterior) {
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
      }
      setShowNuevaPlantacion(false)
      await registrarAuditoria({ accion:'Registro plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:nueva?.id || '', detalle:`Bloque ${bloque?.codigo || ''}` })
      await fetchData()
    } catch (error) {
      // Solo el camino anterior necesita deshacer a mano lo que ya guardó; la operación atómica no deja nada a medias.
      if (caminoAnterior) {
        if (nueva?.id) await supabase.from('plantaciones').update({ activa: false }).eq('id', nueva.id)
        if (plantacionActiva) await supabase.from('plantaciones').update({ activa: true }).eq('id', plantacionActiva.id)
      }
      setPlantacionFormError(`No se pudo guardar la plantación: ${error.message || 'intentá nuevamente.'}`)
    } finally {
      setSaving(false)
    }
  }

  const guardarEditarPlantacion = async () => {
    if (!plantacionActiva || !form.cultivo_id || !form.fecha_siembra) return
    setSaving(true); setPlantacionFormError('')
    try {
      // Datos y abonos en una sola operación de la base. Los abonos solo se reemplazan si cambiaron.
      const { error:atomicoError } = await supabase.rpc('editar_plantacion', { p_id:plantacionActiva.id, p:{
        cultivo_id:form.cultivo_id, notas:form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null, fecha_siembra:form.fecha_siembra,
        cantidad_plantas:form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null, abonos:abonosParaBase(form.abonos_ids),
      } })
      if (atomicoError && !rpcAusente(atomicoError)) throw atomicoError
      if (atomicoError) {
      await guardarPlantacionCompatible({ cultivo_id:form.cultivo_id, notas:form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null, fecha_siembra:form.fecha_siembra, cantidad_plantas:form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null }, plantacionActiva.id)
      const { error:eliminarError } = await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
      if (eliminarError) throw eliminarError
      if (form.abonos_ids.length > 0) {
        const { error:abonosError } = await supabase.from('plantacion_abonos').insert(form.abonos_ids.map(ab => ({ plantacion_id:plantacionActiva.id, abono_id:ab, cantidad:form.abonos_cantidades[ab] || null, unidad:form.abonos_cantidades[`${ab}_unidad`] || 'kg', alcance:form.abonos_cantidades[`${ab}_alcance`] || 'total' })))
        if (abonosError) throw abonosError
      }
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
      mensaje: 'Se borrara definitivamente la plantación activa y sus abonos y muertes registradas. No se puede deshacer.',
      fn: async () => {
        // Abonos, muertes y plantación en una sola operación de la base: o se borra todo o no se borra nada.
        const { error:atomicoError } = await supabase.rpc('eliminar_plantacion', { p_id:plantacionActiva.id, p_con_fotos_y_muertes:true })
        if (atomicoError && !rpcAusente(atomicoError)) {
          setMensajeExito(`No se pudo eliminar la plantación: ${atomicoError.message || 'revisá la conexión.'}`)
          setConfirmar(null)
          return
        }
        if (atomicoError) {
        await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
        await supabase.from('muertes_plantas').delete().eq('plantacion_id', plantacionActiva.id)
        await supabase.from('plantaciones').delete().eq('id', plantacionActiva.id)
        }
        await registrarAuditoria({ accion:'Elimino plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:plantacionActiva.id, detalle:`Bloque ${bloque?.codigo || ''}` })
        setConfirmar(null)
        setSeccion('plantacion')
        fetchData()
      }
    })
  }

  const eliminarHistorial = (plantacionId) => {
    setConfirmar({ titulo:'Eliminar ciclo?', mensaje:'Se eliminara este ciclo del historial. No se puede deshacer.', fn: async () => {
      // Los abonos y la plantación se borran en una sola operación (las muertes del ciclo se conservan, como antes).
      const { error:atomicoError } = await supabase.rpc('eliminar_plantacion', { p_id:plantacionId, p_con_fotos_y_muertes:false })
      if (atomicoError && !rpcAusente(atomicoError)) {
        setMensajeExito(`No se pudo eliminar el ciclo: ${atomicoError.message || 'revisá la conexión.'}`)
        setConfirmar(null)
        return
      }
      if (atomicoError) {
      await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionId)
      await supabase.from('plantaciones').delete().eq('id', plantacionId)
      }
      setConfirmar(null); setHistorialDetalle(null); fetchData()
    }})
  }

  const guardarMuerte = async () => {
    if (!parseLocaleInteger(formMuerte.cantidad, null)) { setErrorMuerte('Indicá cuántas plantas murieron.'); return }
    setErrorMuerte('')
    setSaving(true)
    await supabase.from('muertes_plantas').insert({
      bloque_id: id, plantacion_id: plantacionActiva?.id,
      cantidad: parseLocaleInteger(formMuerte.cantidad, null),
      causa: formMuerte.causa,
      descripcion: formMuerte.descripcion || null,
      fecha: fechaIso(0)
    })
    setSaving(false); setShowMuerte(false)
    toast.success('Muerte de plantas registrada', { description:`${formMuerte.cantidad} plantas · ${formMuerte.causa}` })
    setFormMuerte({ cantidad:'', causa:'Enfermedad', descripcion:'' })
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
      fecha: fechaIso(0),
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
        fecha_inicio: planSemanal.fecha_inicio || fechaIso(0),
        litros_preparados: planSemanal.litros_preparados || '',
        notas: planSemanal.notas || '',
        soluciones: Array.isArray(planSemanal.soluciones) && planSemanal.soluciones.length > 0
          ? planSemanal.soluciones
          : [{ nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }],
      })
    } else {
      setFormPlan({
        nombre: 'Plan semanal',
        fecha_inicio: fechaIso(0),
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
      fecha: fechaIso(0),
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
    toast.success('Fertilización guardada', { description:`Vinculada a ${codigos || `${bloquesDestino.length} bloque(s)`}. También aparece en Fertilizaciones generales.` })
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
      conPeriodo(supabase.from('costos').select('id, fecha, tipo, descripcion, monto').eq('bloque_id', id)).order('fecha', { ascending:false }),
      conPeriodo(supabase.from('ventas').select('id, fecha, producto, kg_total, precio_kg, total, monto_cobrado, estado_cobro, compradores(nombre)').eq('bloque_id', id)).order('fecha', { ascending:false }),
    ])

    const errores = resultados.map(r => r.error?.message).filter(Boolean)
    const fumigacionesCiclo = (resultados[1].data || [])
      .map(item => item.fumigaciones)
      .filter(fumigacion => fumigacion && dentroDelPeriodo(fumigacion.fecha) && !fumigacion.anulada)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

    setHistorialCiclo({
      inicio,
      finExclusivo,
      cosechas:(resultados[0].data || []).filter(item => !item.anulada),
      fumigaciones:fumigacionesCiclo,
      fertilizaciones:(resultados[2].data || []).filter(item => !item.anulada),
      muertes:resultados[3].data || [],
      costos:resultados[4].data || [],
      ventas:resultados[5].data || [],
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
          <tr><th>Costo acumulado</th><td colspan="3">Gs. ${fmtGs(costosCiclo.total)}</td></tr>
        </tbody></table>
        <h2>Costos del ciclo</h2>
        <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Detalle / precio usado</th><th class="right">Monto</th></tr></thead><tbody>${costosDetalle.length ? costosDetalle.map(item => `<tr><td>${escapeHtml(item.fecha || '-')}</td><td>${escapeHtml(item.concepto)}</td><td>${escapeHtml(item.detalle)}</td><td class="right">Gs. ${fmtGs(item.monto)}</td></tr>`).join('') : filaVacia(4, 'Sin costos registrados en el ciclo actual.')}<tr class="total"><td colspan="3">TOTAL DEL CICLO</td><td class="right">Gs. ${fmtGs(costosCiclo.total)}</td></tr></tbody></table>
        <h2>Fumigaciones</h2>
        <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Productos</th><th>Preparación / responsable</th></tr></thead><tbody>${fumigacionesInforme.length ? fumigacionesInforme.map(item => `<tr><td>${escapeHtml(item.fecha)}</td><td>${escapeHtml(item.tipo || 'Fumigación')}</td><td>${escapeHtml(productosFumigacion(item) || '-')}</td><td>${escapeHtml([item.tanques_cantidad && item.tanque_litros ? `${item.tanques_cantidad} × ${item.tanque_litros} L` : '', item.operario, item.notas].filter(Boolean).join(' · ') || '-')}</td></tr>`).join('') : filaVacia(4, 'Sin fumigaciones registradas en el ciclo actual.')}</tbody></table>
        <h2>Fertilizaciones</h2>
        <table><thead><tr><th>Fecha</th><th>Productos</th><th>Observaciones</th></tr></thead><tbody>${fertilizacionesInforme.length ? fertilizacionesInforme.map(item => `<tr><td>${escapeHtml(item.fecha)}</td><td>${escapeHtml(productosFertilizacion(item) || '-')}</td><td>${escapeHtml(notasFertilizacionVisibles(item.notas) || '-')}</td></tr>`).join('') : filaVacia(3, 'Sin fertilizaciones registradas en el ciclo actual.')}</tbody></table>
        <h2>Cosechas</h2>
        <table><thead><tr><th>Fecha</th><th class="right">Cantidad</th><th>Calidad</th><th>Observaciones</th></tr></thead><tbody>${cosechasCiclo.length ? cosechasCiclo.map(item => `<tr><td>${escapeHtml(item.fecha)}</td><td class="right">${fmtKg(item.kg_total)} kg</td><td>${escapeHtml(item.calidad || '-')}</td><td>${escapeHtml(item.notas || '-')}</td></tr>`).join('') : filaVacia(4, 'Sin cosechas registradas en el ciclo actual.')}</tbody></table>
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
              {agruparFertilizaciones(fertilizacionesHistoricas).map(grupo => <FertGrupoFecha key={grupo.fecha} grupo={grupo} />)}
            </CycleSection>

            <CycleSection icon="ti-chart-line" title="Ventas y costos" count={ventasHistoricas.length + costosHistoricos.length} empty="No se registraron ventas ni costos directos en este ciclo.">
              {[...ventasHistoricas.map(venta => ({ id:`v-${venta.id}`, fecha:venta.fecha, titulo:`Venta · Gs. ${fmtGs(venta.total || (Number(venta.kg_total || 0) * Number(venta.precio_kg || 0)))}`, detalle:[venta.producto, venta.compradores?.nombre, venta.estado_cobro].filter(Boolean).join(' · ') })), ...costosHistoricos.map(costo => ({ id:`c-${costo.id}`, fecha:costo.fecha, titulo:`Costo · Gs. ${fmtGs(costo.monto)}`, detalle:[costo.tipo, costo.descripcion].filter(Boolean).join(' · ') }))].sort((a,b) => String(b.fecha).localeCompare(String(a.fecha))).map(item => <CycleRow key={item.id} date={item.fecha} title={item.titulo} detail={item.detalle} />)}
            </CycleSection>

            <CycleSection icon="ti-heart-broken" title="Pérdidas de plantas" count={muertesHistoricas.length} empty="No se registraron pérdidas de plantas en este ciclo.">
              {muertesHistoricas.map(muerte => <CycleRow key={muerte.id} date={muerte.fecha} title={`${Number(muerte.cantidad || 0).toLocaleString('es-PY')} planta${Number(muerte.cantidad) === 1 ? '' : 's'} · ${muerte.causa || 'Sin causa'}`} detail={muerte.descripcion} />)}
            </CycleSection>

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
    historial:['ti-history', 'Ciclos anteriores', 'Consulta los cultivos que ocuparon este bloque.'],
  }
  const [sectionIcon, sectionTitle, sectionDescription] = sectionMeta[seccion]

  return (
    <div className="ag-page block-detail-modern ui-c1c124">
      {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      {detalleCostos && <Modal onClose={() => setDetalleCostos(null)} label="Detalle de costos" style={{ position:'fixed', inset:0, zIndex:225, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}><div className="ag-surface block-cost-detail"><div className="block-cost-detail__head"><div><small>HISTORIAL DEL CICLO</small><h2>{detalleCostos === 'fumigaciones' ? 'Fumigaciones' : detalleCostos === 'fertilizaciones' ? 'Fertilizaciones' : 'Gastos directos'}</h2></div><button className="ag-small-action" onClick={() => setDetalleCostos(null)} aria-label="Cerrar"><i className="ti ti-x" /></button></div><CostDetailList tipo={detalleCostos} costos={costosCiclo} /></div></Modal>}
      {showInformeOpciones && <Modal busy={exportandoPdf} onClose={() => !exportandoPdf && setShowInformeOpciones(false)} label="Elegir informe" style={{ position:'fixed', inset:0, zIndex:228, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}><div className="ag-surface block-report-picker"><div className="block-report-picker__head"><div><small>DESCARGAR DATOS DEL BLOQUE</small><h2>¿Qué informe necesitás?</h2><p>Elegí la ficha técnica para compartir con el ingeniero o el informe completo para administración.</p></div><button type="button" className="ag-small-action" aria-label="Cerrar" onClick={() => setShowInformeOpciones(false)} disabled={exportandoPdf}><i className="ti ti-x" /></button></div>{pdfError && <div className="ag-feedback ag-feedback-error" role="alert">{pdfError}</div>}<label className="block-report-observation"><span>Estado actual / observaciones <em>Opcional</em></span><textarea value={estadoInforme} onChange={event => setEstadoInforme(event.target.value)} maxLength={700} placeholder="Ej: Cultivo con buen vigor, floración uniforme y sin incidencia visible de plagas." /><small>Solo aparecerá en el PDF si escribís algo. AgroBloque no genera recomendaciones automáticamente.</small></label><div className="block-report-picker__options"><button type="button" className="is-recommended" onClick={descargarFichaTecnica} disabled={exportandoPdf}><span><i className="ti ti-plant-2" /></span><div><strong>Ficha técnica para el ingeniero</strong><em>Recomendado</em><p>Plantas, variedad, siembra, días en campo, base, fertilizaciones y fumigaciones. Sin precios ni costos.</p></div><i className="ti ti-download" /></button><button type="button" onClick={descargarInformeBloque} disabled={exportandoPdf || costosCiclo.loading}><span><i className="ti ti-file-description" /></span><div><strong>Informe completo del bloque</strong><p>Incluye también costos, cosechas, notas e historial administrativo.</p></div><i className="ti ti-download" /></button></div>{exportandoPdf && <div className="block-report-picker__loading"><i className="ti ti-loader-2" />Preparando el PDF…</div>}</div></Modal>}

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
                  {can.create && <button className="ag-small-action ui-d4abad" onClick={() => { setErrorMuerte(''); setShowMuerte(true) }}
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
                <div className="ui-4192ca">Aplicaciones por fecha</div>
                {agruparFertilizaciones(fertilizaciones).map((grupo, i) => <FertGrupoFecha key={grupo.fecha} grupo={grupo} etiqueta={i === 0 ? 'Última' : ''} onDetalle={setFertDetalle} />)}
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

      {/* Nueva o editar plantación */}
      <UnifiedFormModal
        open={showNuevaPlantacion || showEditarPlantacion}
        tone="bloques"
        icon="ti-seeding"
        eyebrow={`Bloque ${bloque?.codigo || ''}`}
        title={showEditarPlantacion ? 'Editar plantación' : 'Nueva plantación'}
        label={showEditarPlantacion ? 'Editar plantación' : 'Nueva plantación'}
        busy={saving}
        onClose={() => { setShowNuevaPlantacion(false); setShowEditarPlantacion(false) }}
        onSubmit={showEditarPlantacion ? guardarEditarPlantacion : guardarNuevaPlantacion}
        submitLabel={showEditarPlantacion ? 'Guardar cambios' : 'Guardar plantación'}
        error={plantacionFormError}
        summary={resumenPie([
          { solo: cultivos.find(c => c.id === form.cultivo_id)?.nombre || '' },
          { n: parseLocaleInteger(form.cantidad_plantas, 0) || '', texto: 'plantas', uno: 'planta' },
          { n: form.abonos_ids.length, texto: 'abonos', uno: 'abono' },
        ]) || 'Elegí el cultivo y la fecha de siembra'}
      >{() => <>
        <ModalSection title="Qué se planta" icon="ti-seeding">
          <ModalGrid>
            <ModalField label="Cultivo *">
              <select className="apple-control" value={form.cultivo_id} disabled={cultivosLoading} onChange={e => setForm(f => ({ ...f, cultivo_id:e.target.value }))}>
                <option value="">{cultivosLoading ? 'Cargando cultivos…' : cultivos.length ? 'Elegí el cultivo…' : 'Todavía no hay cultivos'}</option>
                {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </ModalField>
            <ModalField label="Variedad">
              <input className="apple-control" type="text" value={form.variedad_texto} onChange={e => setForm(f => ({ ...f, variedad_texto:e.target.value }))} placeholder="Ej: Rojo, Lamuyo…" />
            </ModalField>
          </ModalGrid>
          <ModalGrid>
            <DateQuickField label="Fecha de siembra" required value={form.fecha_siembra} onChange={fecha_siembra => setForm(f => ({ ...f, fecha_siembra }))} />
            <ModalField label="Cantidad de plantas">
              <input className="apple-control apple-control--num" type="text" inputMode="numeric" autoComplete="off" value={form.cantidad_plantas} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, cantidad_plantas:e.target.value.replace(/[^0-9.,\s]/g, '') }))} onBlur={() => setForm(f => ({ ...f, cantidad_plantas:formatLocaleInteger(f.cantidad_plantas) }))} placeholder="Ej: 41.497" />
            </ModalField>
          </ModalGrid>
          {!cultivosLoading && cultivos.length === 0 && !cultivoRapidoError && <p className="apple-note">Esta empresa todavía no tiene cultivos. Creá el primero abajo; quedará guardado y seleccionado.</p>}
          <ModalGroup label="¿No está en la lista? Agregá un cultivo">
            <div className="apple-inline-add">
              <input className="apple-control" type="text" aria-label="Nuevo cultivo" value={nuevoCultivoNombre} onChange={e => setNuevoCultivoNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarCultivoRapido() } }} placeholder="Ej: Tomate, locote, pepino…" />
              <button type="button" className="apple-btn apple-btn--soft" onClick={() => agregarCultivoRapido()} disabled={!nuevoCultivoNombre.trim()}>Agregar</button>
            </div>
            {cultivoRapidoError && <small className="apple-field__hint is-error" role="alert">{cultivoRapidoError}</small>}
          </ModalGroup>
        </ModalSection>

        <ModalSection title="Abonos de base" icon="ti-garden-cart" collapsible defaultOpen={form.abonos_ids.length > 0 || abonos.length > 0} badge={form.abonos_ids.length ? `${form.abonos_ids.length} elegidos` : 'opcional'}>
          <ModalGroup label="Agregar un abono">
            <div className="apple-inline-add">
              <input className="apple-control" type="text" aria-label="Nuevo abono" value={nuevoAbonoNombre} onChange={e => setNuevoAbonoNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarAbonoRapido() } }} placeholder="Escribí un abono y agregalo" />
              <button type="button" className="apple-btn apple-btn--soft" onClick={() => agregarAbonoRapido()} disabled={!nuevoAbonoNombre.trim()}>Agregar</button>
            </div>
            <small className="apple-field__hint">Agregá uno, completá su cantidad y repetí para sumar todos los que uses. No hace falta cargarlos antes en inventario.</small>
            {abonoRapidoError && <small className="apple-field__hint is-error" role="alert">{abonoRapidoError}</small>}
          </ModalGroup>
          {abonos.length > 0 && (
            <div className="apple-rows">
              {abonos.map(a => {
                const activo = form.abonos_ids.includes(a.id)
                return (
                  <div className="apple-abono" key={a.id}>
                    <button type="button" className="apple-chip apple-chip--lg apple-abono__name" aria-pressed={activo} onClick={() => toggleAbono(a.id)}>{activo && <i className="ti ti-check" aria-hidden="true" />}<span>{a.nombre}</span></button>
                    {activo && (
                      <div className="apple-abono__dose">
                        <input className="apple-control apple-control--num" aria-label={`Cantidad de ${a.nombre}`} type="text" inputMode="decimal" placeholder="Cantidad" value={form.abonos_cantidades[a.id] || ''} onWheel={e => e.currentTarget.blur()} onChange={e => setForm(f => ({ ...f, abonos_cantidades:{ ...f.abonos_cantidades, [a.id]:e.target.value } }))} />
                        <select className="apple-control" aria-label="Unidad" value={form.abonos_cantidades[a.id + '_unidad'] || 'kg'} onChange={e => setForm(f => ({ ...f, abonos_cantidades:{ ...f.abonos_cantidades, [a.id + '_unidad']:e.target.value } }))}>
                          <option value="kg">kg</option><option value="g">g</option><option value="ton">ton</option>
                        </select>
                        <select className="apple-control" aria-label="Alcance" value={form.abonos_cantidades[a.id + '_alcance'] || 'total'} onChange={e => setForm(f => ({ ...f, abonos_cantidades:{ ...f.abonos_cantidades, [a.id + '_alcance']:e.target.value } }))}>
                          <option value="total">Total</option><option value="por_tablon">Por tablón</option>
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ModalSection>
      </>}</UnifiedFormModal>

      {/* Editar el nombre del bloque */}
      <UnifiedFormModal
        open={showEditarNombre}
        tone="bloques"
        icon="ti-pencil"
        eyebrow="Bloque"
        title="Editar nombre del bloque"
        subtitle="Este nombre se actualizará en mapas, aplicaciones, costos e historiales vinculados."
        busy={saving}
        onClose={() => setShowEditarNombre(false)}
        onSubmit={guardarNombreBloque}
        submitLabel="Guardar nombre"
        error={nombreBloqueError}
        summary={nombreBloque.trim() ? <><b>{nombreBloque.trim()}</b></> : null}
      >{() => (
        <ModalSection title="Nombre" icon="ti-tag">
          <ModalField label="Nombre del bloque">
            <input className="apple-control apple-control--code" data-autofocus value={nombreBloque} onChange={e => setNombreBloque(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) guardarNombreBloque() }} maxLength={50} placeholder="Ej: A-1" />
          </ModalField>
        </ModalSection>
      )}</UnifiedFormModal>

      {/* Muerte de plantas */}
      <UnifiedFormModal
        open={showMuerte}
        tone="alerta"
        icon="ti-leaf-off"
        eyebrow={`Bloque ${bloque?.codigo || ''}`}
        title="Registrar muerte de plantas"
        label="Registrar muerte de plantas"
        busy={saving}
        onClose={() => setShowMuerte(false)}
        onSubmit={guardarMuerte}
        submitLabel="Registrar"
        error={errorMuerte}
        summary={resumenPie([
          { n: parseLocaleInteger(formMuerte.cantidad, 0) || '', texto: 'plantas', uno: 'planta' },
          { solo: formMuerte.causa },
        ]) || 'Cantidad de plantas y causa'}
      >{() => <>
        <ModalSection title="Qué pasó" icon="ti-alert-triangle">
          <ModalField label="Cantidad de plantas *">
            <input className="apple-control apple-control--num" type="text" inputMode="numeric" autoComplete="off" value={formMuerte.cantidad} onWheel={e => e.currentTarget.blur()} onChange={e => setFormMuerte(f => ({ ...f, cantidad:e.target.value.replace(/[^0-9.,\s]/g, '') }))} onBlur={() => setFormMuerte(f => ({ ...f, cantidad:formatLocaleInteger(f.cantidad) }))} placeholder="Ej: 5" />
          </ModalField>
          <ModalGroup label="Causa">
            <ChoiceChips wrap label="Causa" value={formMuerte.causa} onChange={causa => setFormMuerte(f => ({ ...f, causa }))} options={CAUSAS_MUERTE.map(c => ({ value:c, label:c }))} />
          </ModalGroup>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={false}>
          <ModalField label="Descripción"><textarea className="apple-control" value={formMuerte.descripcion} onChange={e => setFormMuerte(f => ({ ...f, descripcion:e.target.value }))} placeholder="Detalles adicionales…" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      {/* Plan semanal del bloque */}
      <UnifiedFormModal
        open={showPlanSemanal}
        tone="agua"
        icon="ti-calendar-week"
        eyebrow={`Bloque ${bloque?.codigo || ''}`}
        title={formPlan.id ? 'Editar plan semanal' : 'Nuevo plan semanal'}
        subtitle="Usalo solo en los bloques donde preparás fertilización para varios días."
        label="Plan semanal"
        busy={savingFert}
        onClose={() => setShowPlanSemanal(false)}
        onSubmit={guardarPlanSemanal}
        submitLabel="Guardar plan semanal"
        summary={resumenPie([
          { n: formPlan.soluciones.length, texto: 'soluciones', uno: 'solución' },
          { n: formPlan.litros_preparados || '', texto: 'L' },
        ])}
      >{() => <>
        <ModalSection title="Plan" icon="ti-calendar-week">
          <ModalField label="Nombre"><input className="apple-control" value={formPlan.nombre} onChange={e => setFormPlan(f => ({ ...f, nombre:e.target.value }))} /></ModalField>
          <ModalGrid>
            <DateQuickField label="Fecha de inicio" value={formPlan.fecha_inicio} onChange={fecha_inicio => setFormPlan(f => ({ ...f, fecha_inicio }))} />
            <ModalField label="Litros preparados"><input className="apple-control apple-control--num" value={formPlan.litros_preparados} onWheel={e => e.currentTarget.blur()} onChange={e => setFormPlan(f => ({ ...f, litros_preparados:e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') }))} placeholder="Ej: 200" inputMode="decimal" /></ModalField>
          </ModalGrid>
        </ModalSection>
        <ModalSection title="Soluciones" icon="ti-flask">
          {formPlan.soluciones.map((sol, si) => (
            <div className="apple-solution apple-solution--card" key={si}>
              <div className="apple-solution__head">
                <strong>Solución {sol.nombre}</strong>
                {formPlan.soluciones.length > 1 && <button type="button" className="apple-row__remove" aria-label={`Eliminar la solución ${sol.nombre}`} onClick={() => eliminarSolucionPlan(si)}><i className="ti ti-trash" aria-hidden="true" /></button>}
              </div>
              {(sol.productos || []).map((prod, pi) => (
                <div className="apple-row" key={pi}>
                  <div className="apple-row__name"><input className="apple-control" aria-label={`Producto ${pi + 1}`} value={prod.nombre} onChange={e => actualizarProductoPlan(si, pi, 'nombre', e.target.value)} placeholder="Producto" /></div>
                  <input className="apple-control apple-control--num" aria-label="Cantidad" value={prod.cantidad} onWheel={e => e.currentTarget.blur()} onChange={e => actualizarProductoPlan(si, pi, 'cantidad', e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))} placeholder="Cantidad" inputMode="decimal" />
                  <select className="apple-control" aria-label="Unidad" value={prod.unidad} onChange={e => actualizarProductoPlan(si, pi, 'unidad', e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  <button type="button" className="apple-row__remove" aria-label={`Quitar producto ${pi + 1}`} onClick={() => eliminarProductoPlan(si, pi)}><i className="ti ti-x" aria-hidden="true" /></button>
                </div>
              ))}
              <button type="button" className="apple-add" onClick={() => agregarProductoPlan(si)}><i className="ti ti-plus" aria-hidden="true" />Agregar producto</button>
            </div>
          ))}
          <button type="button" className="apple-link" onClick={agregarSolucionPlan}>+ Agregar otra solución</button>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(formPlan.notas)}>
          <ModalField label="Notas del plan"><textarea className="apple-control" value={formPlan.notas} onChange={e => setFormPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas del plan" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      {/* Aplicar el plan semanal */}
      <UnifiedFormModal
        open={showAplicarPlan}
        tone="agua"
        icon="ti-droplet-check"
        eyebrow={`Bloque ${bloque?.codigo || ''}`}
        title="Aplicar plan semanal"
        label="Aplicar plan semanal"
        busy={savingFert}
        onClose={() => setShowAplicarPlan(false)}
        onSubmit={guardarAplicacionPlan}
        submitLabel="Guardar aplicación"
        summary={resumenPie([{ n: formAplicacionPlan.litros_aplicados || '', texto: 'L aplicados' }])}
      >{() => <>
        <ModalSection title="Aplicación" icon="ti-droplet">
          <ModalGrid>
            <DateQuickField label="Fecha" value={formAplicacionPlan.fecha} onChange={fecha => setFormAplicacionPlan(f => ({ ...f, fecha }))} />
            <ModalField label="Litros aplicados"><input className="apple-control apple-control--num" value={formAplicacionPlan.litros_aplicados} onWheel={e => e.currentTarget.blur()} onChange={e => setFormAplicacionPlan(f => ({ ...f, litros_aplicados:e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') }))} placeholder="Ej: 40" inputMode="decimal" /></ModalField>
          </ModalGrid>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(formAplicacionPlan.responsable || formAplicacionPlan.notas)}>
          <ModalField label="Responsable"><input className="apple-control" value={formAplicacionPlan.responsable} onChange={e => setFormAplicacionPlan(f => ({ ...f, responsable:e.target.value }))} placeholder="Opcional" /></ModalField>
          <ModalField label="Notas"><textarea className="apple-control" value={formAplicacionPlan.notas} onChange={e => setFormAplicacionPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      {/* Fertilización puntual */}
      <UnifiedFormModal
        open={showNuevaFertilizacion}
        tone="agua"
        icon="ti-leaf"
        eyebrow="Aplicación puntual"
        title="Nueva fertilización"
        subtitle="Registrá la mezcla aplicada y vinculala a uno o varios bloques."
        label="Nueva fertilización"
        busy={savingFert}
        onClose={() => setShowNuevaFertilizacion(false)}
        onSubmit={guardarFertilizacion}
        submitLabel="Guardar fertilización"
        summary={resumenPie([
          { n: (formFert.bloques_ids || []).length, texto: 'bloques', uno: 'bloque' },
          { n: formFert.soluciones.reduce((total, sol) => total + sol.productos.filter(p => p.nombre.trim()).length, 0), texto: 'productos', uno: 'producto' },
        ]) || 'Elegí los bloques para empezar'}
      >{() => <>
        <ModalSection title="Dónde y cuándo" icon="ti-map-pin">
          <DateQuickField label="Fecha de aplicación" required value={formFert.fecha} onChange={fecha => setFormFert(f => ({ ...f, fecha }))} />
          <BlockChips
            bloques={bloquesCampo.length ? bloquesCampo : [{ id, codigo: bloque.codigo }]}
            seleccionados={formFert.bloques_ids || []}
            cultivoDe={b => b.plantaciones?.find(p => p.activa)?.cultivos?.nombre || ''}
            onToggle={alternarBloqueFertilizacion}
            onSelectAll={lista => setFormFert(f => ({ ...f, bloques_ids:[...new Set([...(f.bloques_ids || []), ...lista.map(b => b.id)])] }))}
            onClear={() => setFormFert(f => ({ ...f, bloques_ids:[] }))}
          />
        </ModalSection>
        <ModalSection title="Mezcla aplicada" icon="ti-flask">
          {formFert.soluciones.map((sol, si) => (
            <div className="apple-solution apple-solution--card" key={si}>
              <div className="apple-solution__head">
                <input className="apple-control" aria-label="Nombre de la solución" value={sol.nombre} onChange={e => setFormFert(f => ({ ...f, soluciones:f.soluciones.map((s, i) => i === si ? { ...s, nombre:e.target.value } : s) }))} placeholder="Ej: Solución A" />
                {formFert.soluciones.length > 1 && <button type="button" className="apple-row__remove" aria-label="Eliminar solución" onClick={() => eliminarSolucion(si)}><i className="ti ti-trash" aria-hidden="true" /></button>}
              </div>
              {sol.productos.map((prod, pi) => (
                <div className="apple-row" key={pi}>
                  <div className="apple-row__name"><input className="apple-control" aria-label={`Producto ${pi + 1}`} type="text" placeholder="Producto (ej: KCL)" value={prod.nombre} onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)} /></div>
                  <input className="apple-control apple-control--num" aria-label="Cantidad" type="text" inputMode="decimal" placeholder="Cantidad" value={prod.cantidad} onWheel={e => e.currentTarget.blur()} onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value.replace(/[^0-9.,]/g, ''))} />
                  <select className="apple-control" aria-label="Unidad" value={prod.unidad} onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  <button type="button" className="apple-row__remove" aria-label={`Quitar producto ${pi + 1}`} onClick={() => eliminarProducto(si, pi)} disabled={sol.productos.length === 1}><i className="ti ti-x" aria-hidden="true" /></button>
                </div>
              ))}
              <button type="button" className="apple-add" onClick={() => agregarProducto(si)}><i className="ti ti-plus" aria-hidden="true" />Agregar producto</button>
            </div>
          ))}
          <button type="button" className="apple-link" onClick={agregarSolucion}>+ Agregar otra solución</button>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={Boolean(formFert.notas)}>
          <ModalField label="Notas"><textarea className="apple-control" value={formFert.notas} onChange={e => setFormFert(f => ({ ...f, notas:e.target.value }))} placeholder="Observaciones, ajustes del ingeniero…" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

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

// Fertilizaciones del bloque agrupadas por fecha: varias aplicaciones del mismo día se leen en una sola tarjeta.
const diaDe = (fecha) => String(fecha || '').slice(0, 10)
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fechaGrupo = (fecha) => {
  const [anio, mes, dia] = diaDe(fecha).split('-')
  return anio && mes && dia ? `${Number(dia)} ${MESES_CORTOS[Number(mes) - 1] || ''} ${anio}` : 'Sin fecha'
}

function agruparFertilizaciones(lista = []) {
  const mapa = new Map()
  ;[...lista].sort((a, b) => diaDe(b.fecha).localeCompare(diaDe(a.fecha))).forEach(registro => {
    const clave = diaDe(registro.fecha) || 'sin-fecha'
    if (!mapa.has(clave)) mapa.set(clave, { fecha:clave, registros:[] })
    mapa.get(clave).registros.push(registro)
  })
  return [...mapa.values()]
}

function FertGrupoFecha({ grupo, onDetalle, etiqueta = '' }) {
  const productos = grupo.registros.flatMap(registro => (registro.soluciones || []).flatMap(solucion => (solucion.productos || [])
    .filter(p => p.nombre || p.cantidad)
    .map(p => ({ nombre:p.nombre || 'Producto', dosis:`${p.cantidad || ''} ${p.unidad || ''}${p.modo === 'por_planta' ? '/planta' : ''}`.trim() }))))
  const tipos = [...new Set(grupo.registros.map(r => r.plan_id ? 'Plan semanal' : 'Fertilización'))]
  const rango = grupo.registros.find(r => r.plan_id) ? rangoFertilizacion(grupo.registros.find(r => r.plan_id)) : ''
  const notas = [...new Set(grupo.registros.map(r => notasFertilizacionVisibles(r.notas)).filter(Boolean))]
  const tanques = [...new Set(grupo.registros.filter(r => r.tanque_litros).map(r => `${r.tanques_cantidad || 1} ${Number(r.tanques_cantidad || 1) === 1 ? 'tanque' : 'tanques'} × ${Number(r.tanque_litros).toLocaleString('es-PY')} L`))]
  const pie = [...tanques, ...notas]
  return (
    <article className="cycle-fert-date-group">
      <header className="cycle-fert-date-group__head">
        <span className="cycle-fert-date-group__date"><i className="ti ti-calendar-event" aria-hidden="true" /><time dateTime={diaDe(grupo.fecha)}>{fechaGrupo(grupo.fecha)}</time></span>
        <span className="cycle-fert-date-group__type">{etiqueta ? `${etiqueta} · ` : ''}{tipos.join(' + ')}{rango ? ` · ${rango}` : ''}</span>
        <span className="cycle-fert-date-group__count">{productos.length} producto{productos.length === 1 ? '' : 's'}</span>
      </header>
      {productos.length === 0 ? <p className="cycle-fert-date-group__empty">Fertilización registrada sin productos detallados.</p> : (
        <ul className="cycle-fert-date-group__list">
          {productos.map((p, i) => (
            <li key={`${p.nombre}-${i}`}><span className="cycle-fert-date-group__name">{p.nombre}</span>{p.dosis && <b className="cycle-fert-date-group__dose">{p.dosis}</b>}</li>
          ))}
        </ul>
      )}
      {(pie.length > 0 || onDetalle) && (
        <footer className="cycle-fert-date-group__foot">
          {pie.length > 0 && <p>{pie.join(' · ')}</p>}
          {onDetalle && <div className="cycle-fert-date-group__actions">{grupo.registros.map((registro, i) => <button type="button" key={registro.id || i} onClick={() => onDetalle(registro)}>{grupo.registros.length === 1 ? 'Ver detalle' : `Aplicación ${i + 1}`}<i className="ti ti-chevron-right" aria-hidden="true" /></button>)}</div>}
        </footer>
      )}
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
