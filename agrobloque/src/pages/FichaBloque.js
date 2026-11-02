import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Skeleton, Modal } from '../components/UI'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { registrarAuditoria } from '../lib/audit'
import { formatLocaleInteger, parseLocaleInteger } from '../lib/numbers'

const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / 86400000)
}
const fmtGs = (n) => Math.round(Number(n)||0).toLocaleString('es-PY')
const fmtKg = (n) => { const num=Number(n)||0; return num%1===0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY',{minimumFractionDigits:1,maximumFractionDigits:2}) }
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
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [bloque, setBloque] = useState(null)
  const [plantacionActiva, setPlantacionActiva] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cosechasCiclo, setCosechasCiclo] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const [fotos, setFotos] = useState([])
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
  const [incidenciaDetalle, setIncidenciaDetalle] = useState(null)

  const [showEditarPlantacion, setShowEditarPlantacion] = useState(false)
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [showMuerte, setShowMuerte] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  const [form, setForm] = useState({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
  const [formMuerte, setFormMuerte] = useState({ cantidad:'', causa:'Enfermedad', descripcion:'' })
  const [nuevoCultivoNombre, setNuevoCultivoNombre] = useState('')
  const [cultivoRapidoError, setCultivoRapidoError] = useState('')
  const [nuevoAbonoNombre, setNuevoAbonoNombre] = useState('')
  const [abonoRapidoError, setAbonoRapidoError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrError, setQrError] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      const main = document.querySelector('[data-app-scroll]')
      if (main) main.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    setSeccion('plantacion')
    setHistorialDetalle(null)
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
      setQrError('El navegador bloqueo la impresion. Habilita las ventanas emergentes y proba de nuevo.')
      return
    }
    const escapar = (valor) => String(valor || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
    const campo = escapar(bloque.campos?.nombre || 'Campo')
    const codigo = escapar(bloque.codigo)
    ventana.document.write(`<!doctype html><html><head><title>QR Bloque ${codigo}</title><style>body{font-family:Arial,sans-serif;margin:0;display:flex;justify-content:center}.etiqueta{width:360px;text-align:center;border:2px solid #111;border-radius:18px;padding:24px;margin:20px}.marca{font-size:14px;font-weight:800;letter-spacing:1px}.campo{font-size:18px;margin-top:14px}.bloque{font-size:32px;font-weight:900;margin:4px 0 10px}.qr{width:290px;height:290px}.ayuda{font-size:13px;margin-top:10px}@media print{.etiqueta{margin:0}}</style></head><body><div class="etiqueta"><div class="marca">AGROBLOQUE</div><div class="campo">${campo}</div><div class="bloque">Bloque ${codigo}</div><img class="qr" src="${qrDataUrl}" alt="QR del bloque"/><div class="ayuda">Escanear para ver el bloque y registrar trabajos</div></div><script>window.onload=()=>window.print()</script></body></html>`)
    ventana.document.close()
  }

  const fetchData = async () => {
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
        setCosechasCiclo(cos || [])

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
        setFotos(fts || [])

        const { data: mts } = await supabase.from('muertes_plantas')
          .select('*').eq('bloque_id', id).eq('plantacion_id', activa.id)
          .order('fecha', { ascending: false })
        setMuertes(mts || [])
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
    const [{ data: cultivosData }, { data: abonosData }] = await Promise.all([
      supabase.from('cultivos').select('*').order('nombre'),
      supabase.from('abonos').select('*').order('nombre')
    ])
    setCultivos(cultivosData || [])
    setAbonos(abonosData || [])
    setForm({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
    setNuevoCultivoNombre('')
    setCultivoRapidoError('')
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

  const agregarCultivoRapido = async () => {
    const nombre = nuevoCultivoNombre.trim()
    if (!nombre) return

    const existente = cultivos.find(c => (c.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
    if (existente) {
      setForm(f => ({ ...f, cultivo_id: existente.id }))
      setNuevoCultivoNombre('')
      setCultivoRapidoError('')
      return
    }

    const { data, error } = await supabase
      .from('cultivos')
      .insert({ nombre })
      .select('*')
      .single()

    if (error) {
      setCultivoRapidoError(`No se pudo agregar el cultivo: ${error.message}`)
      return
    }

    const lista = [...cultivos, data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    setCultivos(lista)
    setForm(f => ({ ...f, cultivo_id: data.id }))
    setNuevoCultivoNombre('')
    setCultivoRapidoError('')
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
    if (!form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    if (plantacionActiva) await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    const nueva = await guardarPlantacionCompatible({
      bloque_id: id, cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      cantidad_plantas: form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null,
      activa: true
    })
    if (nueva && form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({
          plantacion_id: nueva.id, abono_id: ab,
          cantidad: form.abonos_cantidades[ab] || null,
          unidad: form.abonos_cantidades[`${ab}_unidad`] || 'kg',
          alcance: form.abonos_cantidades[`${ab}_alcance`] || 'total'
        }))
      )
    }
    setSaving(false); setShowNuevaPlantacion(false)
    await registrarAuditoria({ accion:'Registro plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:nueva?.id || '', detalle:`Bloque ${bloque?.codigo || ''}` })
    fetchData()
  }

  const guardarEditarPlantacion = async () => {
    if (!plantacionActiva || !form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    await guardarPlantacionCompatible({
      cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      cantidad_plantas: form.cantidad_plantas ? parseLocaleInteger(form.cantidad_plantas, null) : null,
    }, plantacionActiva.id)
    await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
    if (form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({
          plantacion_id: plantacionActiva.id, abono_id: ab,
          cantidad: form.abonos_cantidades[ab] || null,
          unidad: form.abonos_cantidades[`${ab}_unidad`] || 'kg',
          alcance: form.abonos_cantidades[`${ab}_alcance`] || 'total'
        }))
      )
    }
    setSaving(false); setShowEditarPlantacion(false)
    await registrarAuditoria({ accion:'Edito plantacion', modulo:'Bloque', tabla:'plantaciones', registroId:plantacionActiva.id, detalle:`Bloque ${bloque?.codigo || ''}` })
    fetchData()
  }

  const finalizarPlantacionActiva = () => {
    if (!plantacionActiva) return
    setConfirmar({
      titulo: 'Finalizar plantacion?',
      mensaje: 'La plantacion actual pasara al historial del bloque. No se borra ningun dato.',
      fn: async () => {
        await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
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
      titulo: 'Eliminar plantacion?',
      mensaje: 'Se borrara definitivamente la plantacion activa y sus abonos, fotos y muertes registradas. No se puede deshacer.',
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
    if (!formMuerte.cantidad) return
    setSaving(true)
    await supabase.from('muertes_plantas').insert({
      bloque_id: id, plantacion_id: plantacionActiva?.id,
      cantidad: Number(formMuerte.cantidad),
      causa: formMuerte.causa,
      descripcion: formMuerte.descripcion || null,
      fecha: new Date().toISOString().split('T')[0]
    })
    setSaving(false); setShowMuerte(false)
    setFormMuerte({ cantidad:'', causa:'Enfermedad', descripcion:'' })
    fetchData()
  }

  const subirFoto = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      await supabase.from('fotos_bloque').insert({
        bloque_id: id, plantacion_id: plantacionActiva?.id,
        url: ev.target.result,
        fecha: new Date().toISOString().split('T')[0]
      })
      fetchData()
    }
    reader.readAsDataURL(file)
  }

  const eliminarFoto = async (fotoId) => {
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
    if (!nombre) return

    const existente = abonos.find(a => (a.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
    if (existente) {
      setForm(f => ({ ...f, abonos_ids: f.abonos_ids.includes(existente.id) ? f.abonos_ids : [...f.abonos_ids, existente.id] }))
      setNuevoAbonoNombre('')
      setAbonoRapidoError('')
      return
    }

    const { data, error } = await supabase.from('abonos').insert({ nombre }).select('*').single()
    if (error) {
      setAbonoRapidoError(`No se pudo agregar el abono: ${error.message}`)
      return
    }
    setAbonos(lista => [...lista, data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')))
    setForm(f => ({ ...f, abonos_ids: [...f.abonos_ids, data.id] }))
    setNuevoAbonoNombre('')
    setAbonoRapidoError('')
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

  //

  const getVariedad = (p) => {
    if (!p?.notas) return null
    return p.notas.startsWith('Variedad: ') ? p.notas.replace('Variedad: ', '') : null
  }

  const totalKgCiclo = cosechasCiclo.reduce((s, c) => s + Number(c.kg_total), 0)
  const cantidadPlantasActiva = Number(plantacionActiva?.cantidad_plantas ?? plantacionActiva?.densidad_plantas_m2 ?? 0)
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
            titulo="Eliminar fertilizacion?"
            mensaje="Se eliminara este registro. No se puede deshacer."
            onConfirm={() => eliminarFertilizacion(confirmarElimFert)}
            onCancel={() => setConfirmarElimFert(null)}
          />
        )}
        <div className="ui-327143">
          <button className="ag-small-action ui-7347f9" onClick={() => setFertDetalle(null)}>
            <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
            <span className="ui-fe5017">Fertilizacion</span>
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
                Solucion {sol.nombre}
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
          <button className="ag-small-action ui-a20b62" onClick={() => navigate(`/fertilizaciones?editar=${encodeURIComponent(fertDetalle.grupo_id || fertDetalle.id)}`)}
           >
            <i className="ti ti-pencil ui-52eaee" aria-hidden="true"></i>
            {fertDetalle.plan_id ? 'Editar semana completa' : 'Editar fertilización'}
          </button>
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
    return (
      <div className="ag-page ui-c1c124">
        {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
        <div className="ui-327143">
          <button className="ag-small-action ui-7347f9" onClick={() => setHistorialDetalle(null)}>
            <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
            <span className="ui-fe5017">Historial</span>
          </button>
          <div className="ui-72161c">
            {historialDetalle.cultivos?.nombre}{getVariedad(historialDetalle) ? `  -  ${getVariedad(historialDetalle)}` : ''}
          </div>
          <div className="ui-93a7e1">Bloque {bloque.codigo}  -  {historialDetalle.fecha_siembra || 'Sin fecha'}</div>
        </div>
        <div className="ui-1a3247">
          <div className="ag-surface ui-49272e">
            <div className="ui-486335">Datos del ciclo</div>
            {[
              ['Cultivo', historialDetalle.cultivos?.nombre || '-'],
              ['Variedad', getVariedad(historialDetalle) || '-'],
              ['Fecha siembra', historialDetalle.fecha_siembra || '-'],
              ['Plantas', (historialDetalle.cantidad_plantas ?? historialDetalle.densidad_plantas_m2) ? `${Number(historialDetalle.cantidad_plantas ?? historialDetalle.densidad_plantas_m2).toLocaleString('es-PY')}` : '-'],
            ].map(([k,v]) => (
              <div className="ui-a7a997" key={k}>
                <div className="ui-93a7e1">{k}</div>
                <div className="ui-0993fa">{v}</div>
              </div>
            ))}
          </div>
          <div className="ag-surface ui-49272e">
            <div className="ui-486335">Abonos de base utilizados</div>
            {(historialDetalle.plantacion_abonos || []).length > 0 ? historialDetalle.plantacion_abonos.map(abono => (
              <div className="ui-1eefd4" key={abono.id || abono.abono_id}>
                <div className="ui-076bb2">{abono.abonos?.nombre || 'Abono'}</div>
                <div className="ui-62cb6b">{fmtAbonoPlantacion(abono)}</div>
              </div>
            )) : <div className="ui-1685e1">No se registraron abonos de base en este ciclo.</div>}
          </div>
          <button className="ag-small-action ui-a3fc3f" onClick={() => eliminarHistorial(historialDetalle.id)}
           >
            Eliminar este ciclo del historial
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ag-page ui-c1c124">
      {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      <input className="ui-cb4589" type="file" accept="image/*" ref={fileRef} onChange={subirFoto} />

      {/* Header */}
      <div className="ag-block-header ui-606ba4">
        <button className="ag-small-action ui-7347f9" onClick={() => navigate(-1)}>
          <i className="ti ti-arrow-left ui-b45e7d" aria-hidden="true"></i>
          <span className="ui-fe5017">Volver</span>
        </button>
        <div className="ag-block-hero">
          <div>
            <div className="ag-eyebrow">{bloque.campos?.nombre} · {bloque.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'}</div>
            <h1>Bloque {bloque.codigo}</h1>
            {plantacionActiva && (
              <div className="ag-block-crop">
                {plantacionActiva.cultivos?.nombre}{getVariedad(plantacionActiva) ? `  -  ${getVariedad(plantacionActiva)}` : ''}
              </div>
            )}
          </div>
          {plantacionActiva && <div className="ag-block-summary"><span><small>Edad del cultivo</small><strong>{diasDesde(plantacionActiva.fecha_siembra) ?? '—'} <em>días</em></strong></span><span><small>Plantas del ciclo</small><strong>{cantidadPlantasActiva ? Number(cantidadPlantasActiva).toLocaleString('es-PY') : '—'}</strong></span><span><small>Cosecha del ciclo</small><strong>{fmtKg(totalKgCiclo)} <em>kg</em></strong></span></div>}
          {!plantacionActiva && (
            <button className="ag-small-action ui-2c5a32" onClick={abrirNuevaPlantacion}>
              + Nueva plantacion
            </button>
          )}
        </div>

        {mensajeExito && (
          <div className="ui-05bacd">
            <span>{mensajeExito}</span>
            <button className="ui-ecf4ec" type="button" onClick={() => setMensajeExito('')} aria-label="Cerrar mensaje">×</button>
          </div>
        )}

        <div className="ag-block-quick ui-46ae6b">
          <div className="ui-d4e113">
            <div>
              <div className="ui-1d6b4b">Registrar en este bloque</div>
              <div className="ui-a8f171">El bloque queda seleccionado automáticamente</div>
            </div>
            <button className="ag-small-action ui-cd464c" type="button" onClick={() => setShowQr(true)}>
              <i className="ti ti-qrcode ui-e5876b" aria-hidden="true"></i> Ver QR
            </button>
          </div>
          <div className="ui-1a4890">
            <button className="ag-small-action ui-0ea43e" type="button" onClick={() => abrirCargaRapida('fumigaciones')}><i className="ti ti-spray" aria-hidden="true" /> Fumigación <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>
            <button className="ag-small-action ui-228318" type="button" onClick={() => abrirCargaRapida('fertilizacion')}><i className="ti ti-leaf" aria-hidden="true" /> Fertilización <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>
            <button className="ag-small-action ui-f0ca92" type="button" onClick={() => abrirCargaRapida('cosecha')}><i className="ti ti-cut" aria-hidden="true" /> Cosecha <i className="ti ti-arrow-up-right" aria-hidden="true" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="ag-block-tabs ui-c1894b" aria-label="Secciones del bloque">
          {[
            ['plantacion','Plantación'],
            ['fertilizacion',`Fertilización (${fertilizaciones.length})`],
            ['cosechas',`Cosechas (${cosechasCiclo.length})`],
            ['incidencias',`Fumigaciones (${incidencias.length})`],
            ['fotos',`Fotos (${fotos.length})`],
            ['historial',`Historial (${historial.length})`],
          ].map(([k,v]) => (
            <button className="ag-small-action ui-f9a370" key={k} aria-pressed={seccion === k} onClick={() => setSeccion(k)}
              style={{ background: seccion===k ? (k==='fertilizacion' ? '#1a5c2e' : '#0F3923') : 'rgba(15,23,42,.06)', color: seccion===k ? '#fff' : 'var(--text-secondary)' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className={`${`ag-block-content ag-block-section-${seccion}`} ui-538f66`} key={seccion}>

        {/* PLANTACION ACTUAL */}
        {seccion === 'plantacion' && (
          <>
            {plantacionActiva ? (
              <>
                <div className="ag-surface ui-49272e">
                  <div className="ui-546e10">
                    <div className="ui-1d6b4b">Datos de la plantacion</div>
                    <button className="ag-small-action ui-387856" onClick={abrirEditarPlantacion}>Editar</button>
                  </div>
                  {[
                    ['Cultivo', plantacionActiva.cultivos?.nombre || '-'],
                    ['Variedad', getVariedad(plantacionActiva) || '-'],
                    ['Fecha siembra', plantacionActiva.fecha_siembra || '-'],
                    ['Dias en campo', diasDesde(plantacionActiva.fecha_siembra) !== null ? `${diasDesde(plantacionActiva.fecha_siembra)} dias` : '-'],
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
                  <button className="ag-small-action ui-004512" onClick={abrirNuevaPlantacion}
                   >
                    Nueva plantacion
                  </button>
                  <button className="ag-small-action ui-d4abad" onClick={() => setShowMuerte(true)}
                   >
                    + Muerte de plantas
                  </button>
                </div>
                <div className="ui-caac2c">
                  <button className="ag-small-action ui-5b0f32" onClick={finalizarPlantacionActiva}
                   >
                    Finalizar plantacion
                  </button>
                  <button className="ag-small-action ui-05757f" onClick={eliminarPlantacionActiva}
                   >
                    Eliminar plantacion
                  </button>
                </div>
              </>
            ) : (
              <div className="ag-surface ui-13bbf9">
                Sin plantacion activa.<br/>
                <button className="ag-small-action ui-a4d716" onClick={abrirNuevaPlantacion}>
                  + Nueva plantacion
                </button>
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
                <button className="ag-small-action ui-0a1c50" onClick={abrirPlanSemanal}
                 >
                  {planSemanal ? 'Editar' : 'Crear'}
                </button>
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
                    <button className="ag-small-action ui-3f7a77" onClick={abrirAplicarPlan}
                     >
                      Aplicar hoy
                    </button>
                    <button className="ag-small-action ui-98ffc9" onClick={desactivarPlanSemanal}
                     >
                      Desactivar
                    </button>
                  </div>
                  {aplicacionesPlan.length > 0 && (
                    <div className="ui-002535">
                      <div className="ui-2fff95">Ultimas aplicaciones</div>
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

            <button className="ag-small-action ui-bcc504" onClick={abrirNuevaFertilizacion}
             >
              + Nueva fertilizacion
            </button>

            {fertilizaciones.length === 0 ? (
              <div className="ag-surface ui-eeb39f">
                Sin fertilizaciones registradas en este bloque
              </div>
            ) : (
              <>
                {/* Fertilizacion actual */}
                {fertilizaciones[0] && (
                  <>
                    <div className="ui-4192ca">Fertilizacion actual</div>
                    <div className="ui-2e75cf" onClick={() => setFertDetalle(fertilizaciones[0])}
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
                    <div className="ui-4899be">Fertilizacion anterior</div>
                    <div className="ag-surface ui-fe238f" onClick={() => setFertDetalle(fertilizaciones[1])}
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
                      <div className="ag-surface ui-652941" key={fert.id} onClick={() => setFertDetalle(fert)}
                       >
                        <div className="ui-da5cd6">
                          <div className="ui-076bb2">{rangoFertilizacion(fert)}</div>
                          <div className="ui-a8f171">
                            {(fert.soluciones || []).length} solucion{(fert.soluciones || []).length !== 1 ? 'es' : ''}  -  {(fert.soluciones || []).reduce((s,sol) => s + (sol.productos||[]).length, 0)} productos
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
              <div className="ag-surface ui-3451cf" key={i} onClick={() => setIncidenciaDetalle(inc)}>
                <div className="ui-31d953">
                  <div className="ui-878e4e" style={{ background: inc.tipo==='fumigacion' ? '#fff3e8' : '#eaf4fb', color: inc.tipo==='fumigacion' ? '#e07b00' : '#2980b9' }}>
                    {inc.tipo === 'fumigacion' ? 'Fumigacion' : inc.tipo === 'fertiriego' ? 'Fertiriego' : 'Foliar'}
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
            <button className="ag-small-action ui-62f30d" onClick={() => fileRef.current?.click()}
             >
              <i className="ti ti-camera ui-e705f9" aria-hidden="true"></i>
              Agregar foto
            </button>
            {fotos.length === 0 ? (
              <div className="ui-5baa7a">Sin fotos en este ciclo</div>
            ) : (
              <div className="ui-f56ef1">
                {fotos.map(f => (
                  <div className="ui-8e4804" key={f.id}>
                    <img className="ui-caf585" src={f.url} alt="foto bloque"/>
                    <div className="ui-aa460d">
                      <span className="ui-e3758e">{f.fecha}</span>
                      <button aria-label="Eliminar" className="ag-small-action ui-d088ca" onClick={() => eliminarFoto(f.id)}>
                        <i className="ti ti-trash ui-9fe38b" aria-hidden="true"></i>
                      </button>
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
              <div className="ag-surface ui-4aac8a" key={p.id} onClick={() => setHistorialDetalle(p)}
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
            <div className="ui-c7b1b6">{showEditarPlantacion ? 'Editar plantacion' : 'Nueva plantacion'}</div>

            <label className="ag-field-label ui-74cc19">Cultivo *
            <select style={inpStyle} value={form.cultivo_id} onChange={e => setForm(f => ({...f, cultivo_id:e.target.value}))}>
              <option value="">Selecciona cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            <div className="ui-16e267">
              <input className="ui-e7ec54"
                style={{ ...inpStyle }}
                type="text"
                value={nuevoCultivoNombre}
                onChange={e => setNuevoCultivoNombre(e.target.value)}
                placeholder="Si no aparece, escribilo aca..."
              />
              <button className="ag-small-action ui-c1563e"
                type="button"
                onClick={agregarCultivoRapido}
               
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

            <div className="ui-9546b4">Abonos de base</div>
            <div className="ui-711010">
              <input className="ui-d8b4c5" style={{ ...inpStyle }} type="text" value={nuevoAbonoNombre} onChange={e => setNuevoAbonoNombre(e.target.value)} placeholder="Escribir abono directamente" />
              <button className="ag-small-action ui-2082ce" type="button" onClick={agregarAbonoRapido} disabled={!nuevoAbonoNombre.trim()}>Agregar</button>
            </div>
            <div className="ui-59f8a7">No hace falta cargarlo previamente en inventario.</div>
            {abonoRapidoError && <div className="ui-9614e6">{abonoRapidoError}</div>}
            {abonos.map(a => (
              <div className="ui-d51702" key={a.id}>
                <div className="ui-bfa195" onClick={() => toggleAbono(a.id)}
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

            <button className="ag-small-action ui-ae1eb0" style={{ background: saving ? '#888' : '#0F3923' }}
              onClick={showEditarPlantacion ? guardarEditarPlantacion : guardarNuevaPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : showEditarPlantacion ? 'Guardar cambios' : 'Guardar plantacion'}
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
            <input style={inpStyle} type="number" value={formMuerte.cantidad} onChange={e => setFormMuerte(f => ({...f, cantidad:e.target.value}))} placeholder="Ej: 5"/></label>

            <div className="ui-74cc19">Causa</div>
            <div className="ui-1e850e">
              {CAUSAS_MUERTE.map(c => (
                <button className="ag-small-action ui-e36b2f" key={c} onClick={() => setFormMuerte(f => ({...f, causa:c}))}
                  style={{ background: formMuerte.causa===c ? '#c84040' : '#fff', color: formMuerte.causa===c ? '#fff' : '#555' }}>
                  {c}
                </button>
              ))}
            </div>

            <label className="ag-field-label ui-74cc19">Descripcion (opcional)
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
            <div className="ui-7d5827">Usalo solo en los bloques donde preparas fertilizacion para varios dias.</div>

            <label className="ag-field-label ui-74cc19">Nombre
            <input style={inpStyle} value={formPlan.nombre} onChange={e => setFormPlan(f => ({ ...f, nombre:e.target.value }))} /></label>
            <div className="ui-f56ef1">
              <div>
                <label className="ag-field-label ui-74cc19">Fecha inicio
                <input type="date" style={inpStyle} value={formPlan.fecha_inicio} onChange={e => setFormPlan(f => ({ ...f, fecha_inicio:e.target.value }))} /></label>
              </div>
              <div>
                <label className="ag-field-label ui-74cc19">Litros preparados
                <input style={inpStyle} value={formPlan.litros_preparados} onChange={e => setFormPlan(f => ({ ...f, litros_preparados:e.target.value }))} placeholder="Ej: 200" /></label>
              </div>
            </div>

            {formPlan.soluciones.map((sol, si) => (
              <div className="ag-surface ui-7fff2b" key={si}>
                <div className="ui-b3c308">
                  <div className="ui-515b34">Solucion {sol.nombre}</div>
                  {formPlan.soluciones.length > 1 && <button className="ui-6ae6fb" onClick={() => eliminarSolucionPlan(si)}>Eliminar</button>}
                </div>
                {(sol.productos || []).map((prod, pi) => (
                  <div className="ag-product-row ui-964def" key={pi}>
                    <input className="ui-e7ec54" style={{ ...inpStyle }} value={prod.nombre} onChange={e => actualizarProductoPlan(si, pi, 'nombre', e.target.value)} placeholder="Producto"/>
                    <input className="ui-e7ec54" style={{ ...inpStyle }} value={prod.cantidad} onChange={e => actualizarProductoPlan(si, pi, 'cantidad', e.target.value)} placeholder="Cant."/>
                    <select className="ui-e7ec54" style={{ ...inpStyle }} value={prod.unidad} onChange={e => actualizarProductoPlan(si, pi, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button className="ui-b58c47" onClick={() => eliminarProductoPlan(si, pi)}>x</button>
                  </div>
                ))}
                <button className="ag-small-action ui-0a1d4e" onClick={() => agregarProductoPlan(si)}>+ Producto</button>
              </div>
            ))}
            <button className="ag-small-action ui-b987ad" onClick={agregarSolucionPlan}>+ Agregar solucion</button>
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
            <input style={inpStyle} value={formAplicacionPlan.litros_aplicados} onChange={e => setFormAplicacionPlan(f => ({ ...f, litros_aplicados:e.target.value }))} placeholder="Ej: 40" /></label>
            <label className="ag-field-label ui-74cc19">Responsable
            <input style={inpStyle} value={formAplicacionPlan.responsable} onChange={e => setFormAplicacionPlan(f => ({ ...f, responsable:e.target.value }))} placeholder="Opcional" /></label>
            <textarea className="ui-3d581a" style={{ ...inpStyle }} value={formAplicacionPlan.notas} onChange={e => setFormAplicacionPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas"/>
            <button className="ag-small-action ui-08c1f7" onClick={guardarAplicacionPlan} disabled={savingFert}>
              {savingFert ? 'Guardando...' : 'Guardar aplicacion'}
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
                <div className="ui-476525">Detalle de fumigacion</div>
                <div className="ui-882dd8">{incidenciaDetalle.tipo === 'fertiriego' ? 'Fertiriego' : incidenciaDetalle.tipo === 'foliar' ? 'Foliar' : 'Fumigacion'}</div>
                <div className="ui-13b58a">{incidenciaDetalle.fecha}</div>
              </div>
              <button className="ui-6de38e" aria-label="Cerrar" onClick={() => setIncidenciaDetalle(null)}>
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
                    {fp.productos?.carencia_dias ? <div>Carencia: {fp.productos.carencia_dias} dias</div> : null}
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
        <Modal onClose={() => setShowNuevaFertilizacion(false)} label="Registro del bloque" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setShowNuevaFertilizacion(false)}>
          <div className="ui-6c907f" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-99efa8">Nueva fertilizacion</div>
            <div className="ui-fe1408">Elegi uno o varios bloques. Se guarda un registro separado por cada bloque.</div>

            <label className="ag-field-label ui-74cc19">Fecha *
            <input style={inpStyle} type="date" value={formFert.fecha} onChange={e => setFormFert(f => ({...f, fecha:e.target.value}))}/></label>

            <div className="ui-74cc19">Bloques *</div>
            <div className="ag-surface ui-91fc48">
              <div className="ui-096aaf">
                {(bloquesCampo.length ? bloquesCampo : [{ id, codigo: bloque.codigo }]).map(b => {
                  const seleccionado = (formFert.bloques_ids || []).includes(b.id)
                  const cultivo = b.plantaciones?.find(p => p.activa)?.cultivos?.nombre
                  return (
                    <button className="ag-small-action ui-59cb66" key={b.id} type="button" onClick={() => alternarBloqueFertilizacion(b.id)} style={{ background: seleccionado ? '#1a5c2e' : '#f8f8f8', color: seleccionado ? '#fff' : '#263026' }}>
                      {b.codigo}{cultivo ? ` - ${cultivo}` : ''}
                    </button>
                  )
                })}
              </div>
              <div className="ui-80c1d8">
                {(formFert.bloques_ids || []).length || 0} bloque{(formFert.bloques_ids || []).length === 1 ? '' : 's'} seleccionado{(formFert.bloques_ids || []).length === 1 ? '' : 's'}
              </div>
            </div>

            {/* Soluciones */}
            {formFert.soluciones.map((sol, si) => (
              <div className="ag-surface ui-f3f33f" key={si}>
                <div className="ui-b3c308">
                  <div className="ui-2a9780">
                    <div className="ui-73f54d">
                      <span className="ui-5f32fb">{sol.nombre}</span>
                    </div>
                    <input className="ui-a25fd0"
                     
                      value={sol.nombre}
                      onChange={e => {
                        const sols = [...formFert.soluciones]
                        sols[si] = { ...sols[si], nombre: e.target.value }
                        setFormFert(f => ({ ...f, soluciones: sols }))
                      }}
                      placeholder="Nombre sol."
                    />
                  </div>
                  {formFert.soluciones.length > 1 && (
                    <button aria-label="Eliminar" className="ag-small-action ui-fa2a44" onClick={() => eliminarSolucion(si)}
                     >
                      <i className="ti ti-trash ui-0cf08e" aria-hidden="true"></i>
                    </button>
                  )}
                </div>

                {sol.productos.map((prod, pi) => (
                  <div className="ui-01389d" key={pi}>
                    <input className="ui-f3cd63"
                     
                      type="text" placeholder="Producto (ej: KCL)"
                      value={prod.nombre}
                      onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)}
                    />
                    <input className="ui-3e1ed4"
                     
                      type="text" placeholder="Cant."
                      value={prod.cantidad}
                      onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value)}
                    />
                    <select className="ui-30e3bd"
                     
                      value={prod.unidad}
                      onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {sol.productos.length > 1 && (
                      <button aria-label="Cerrar" className="ag-small-action ui-79fbe7" onClick={() => eliminarProducto(si, pi)}
                       >
                        <i className="ti ti-x ui-3044b6" aria-hidden="true"></i>
                      </button>
                    )}
                  </div>
                ))}

                <button className="ag-small-action ui-a0678b" onClick={() => agregarProducto(si)}
                 >
                  + Agregar producto
                </button>
              </div>
            ))}

            <button className="ag-small-action ui-5fcb3d" onClick={agregarSolucion}
             >
              + Agregar solucion
            </button>

            <label className="ag-field-label ui-74cc19">Notas (opcional)
            <textarea className="ui-dc8f36"
              style={{ ...inpStyle }}
              value={formFert.notas}
              onChange={e => setFormFert(f => ({...f, notas:e.target.value}))}
              placeholder="Observaciones, ajustes del ingeniero..."/></label>

            <button className="ag-small-action ui-978577"
              style={{ background: savingFert ? '#888' : '#1a5c2e' }}
              onClick={guardarFertilizacion} disabled={savingFert}>
              {savingFert ? 'Guardando...' : 'Guardar fertilizacion'}
            </button>
            <button className="ag-small-action ui-9d2a4a"
             
              onClick={() => setShowNuevaFertilizacion(false)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {showQr && (
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
