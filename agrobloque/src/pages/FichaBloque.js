import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { registrarAuditoria } from '../lib/audit'

const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / 86400000)
}
const fmtGs = (n) => Math.round(Number(n)||0).toLocaleString('es-PY')
const fmtKg = (n) => { const num=Number(n)||0; return num%1===0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY',{minimumFractionDigits:1,maximumFractionDigits:2}) }

const CAUSAS_MUERTE = ['Enfermedad','Dumping off','Esclerotinia','Insectos','Hormigas','Gusanos','Clima','Riego','Otra']
const UNIDADES = ['kg','g','cc','ml','L','unidad']

function ModalConfirm({ titulo, mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>{titulo}</div>
        {mensaje && <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>{mensaje}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:'#c84040', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>Confirmar</button>
        </div>
      </div>
    </div>
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

  // Fertilización
  const [fertilizaciones, setFertilizaciones] = useState([])
  const [planSemanal, setPlanSemanal] = useState(null)
  const [aplicacionesPlan, setAplicacionesPlan] = useState([])
  const [showPlanSemanal, setShowPlanSemanal] = useState(false)
  const [showAplicarPlan, setShowAplicarPlan] = useState(false)
  const [showNuevaFertilizacion, setShowNuevaFertilizacion] = useState(false)
  const [formFert, setFormFert] = useState({
    fecha: new Date().toISOString().split('T')[0],
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

  const [showEditarPlantacion, setShowEditarPlantacion] = useState(false)
  const [showNuevaPlantacion, setShowNuevaPlantacion] = useState(false)
  const [showMuerte, setShowMuerte] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  const [form, setForm] = useState({ cultivo_id:'', variedad_texto:'', fecha_siembra:'', cantidad_plantas:'', abonos_ids:[], abonos_cantidades:{} })
  const [formMuerte, setFormMuerte] = useState({ cantidad:'', causa:'Enfermedad', descripcion:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    const { data: b } = await supabase.from('bloques').select('*, sectores(nombre), campos(nombre)').eq('id', id).single()
    setBloque(b)

    const { data: plantas } = await supabase.from('plantaciones')
      .select('*, cultivos(nombre)').eq('bloque_id', id).order('created_at', { ascending: false })
    if (plantas) {
      const activa = plantas.find(p => p.activa) || null
      setPlantacionActiva(activa)
      setHistorial(plantas.filter(p => !p.activa))

      if (activa) {
        const { data: ab } = await supabase.from('plantacion_abonos').select('*, abonos(nombre)').eq('plantacion_id', activa.id)
        setAbonosPlantacion(ab || [])

        const { data: cos } = await supabase.from('cosechas')
          .select('*, compradores(nombre)')
          .eq('bloque_id', id)
          .gte('fecha', activa.fecha_siembra || '2000-01-01')
          .order('fecha', { ascending: false })
        setCosechasCiclo(cos || [])

        const { data: fumBloques } = await supabase.from('fumigacion_bloques')
          .select('fumigaciones(fecha, notas, tipo, fumigacion_productos(productos(nombre)))')
          .eq('bloque_id', id)
        const inc = (fumBloques || [])
          .map(fb => fb.fumigaciones)
          .filter(f => f && f.notas)
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

    // Fertilizaciones del bloque (todas, independiente de plantación)
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
    abonosPlantacion.forEach(a => { abCants[a.abono_id] = a.cantidad || '' })
    setForm({
      cultivo_id: cultivo?.id || '',
      variedad_texto: plantacionActiva?.notas?.replace('Variedad: ','') || '',
      fecha_siembra: plantacionActiva?.fecha_siembra || '',
      cantidad_plantas: plantacionActiva?.densidad_plantas_m2 || '',
      abonos_ids: abIds,
      abonos_cantidades: abCants
    })
    setShowEditarPlantacion(true)
  }

  const toggleAbono = (abonoId) => {
    setForm(f => ({
      ...f,
      abonos_ids: f.abonos_ids.includes(abonoId) ? f.abonos_ids.filter(x => x!==abonoId) : [...f.abonos_ids, abonoId]
    }))
  }

  const guardarNuevaPlantacion = async () => {
    if (!form.cultivo_id || !form.fecha_siembra) return
    setSaving(true)
    if (plantacionActiva) await supabase.from('plantaciones').update({ activa: false }).eq('id', plantacionActiva.id)
    const { data: nueva } = await supabase.from('plantaciones').insert({
      bloque_id: id, cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.cantidad_plantas || null, activa: true
    }).select().single()
    if (nueva && form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({
          plantacion_id: nueva.id, abono_id: ab,
          cantidad: form.abonos_cantidades[ab] || null
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
    await supabase.from('plantaciones').update({
      cultivo_id: form.cultivo_id,
      notas: form.variedad_texto ? `Variedad: ${form.variedad_texto}` : null,
      fecha_siembra: form.fecha_siembra,
      densidad_plantas_m2: form.cantidad_plantas || null
    }).eq('id', plantacionActiva.id)
    await supabase.from('plantacion_abonos').delete().eq('plantacion_id', plantacionActiva.id)
    if (form.abonos_ids.length > 0) {
      await supabase.from('plantacion_abonos').insert(
        form.abonos_ids.map(ab => ({
          plantacion_id: plantacionActiva.id, abono_id: ab,
          cantidad: form.abonos_cantidades[ab] || null
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
    setConfirmar({ titulo:'¿Eliminar ciclo?', mensaje:'Se eliminará este ciclo del historial. No se puede deshacer.', fn: async () => {
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

  // ─── FERTILIZACIÓN ────────────────────────────────────────────────

  const abrirNuevaFertilizacion = () => {
    setFormFert({
      fecha: new Date().toISOString().split('T')[0],
      notas: '',
      soluciones: [
        { nombre: 'A', productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }
      ]
    })
    setShowNuevaFertilizacion(true)
  }

  const agregarSolucion = () => {
    const letras = ['A','B','C','D','E','F']
    const usadas = formFert.soluciones.map(s => s.nombre)
    const siguiente = letras.find(l => !usadas.includes(l)) || `S${formFert.soluciones.length + 1}`
    setFormFert(f => ({
      ...f,
      soluciones: [...f.soluciones, { nombre: siguiente, productos: [{ nombre: '', cantidad: '', unidad: 'kg' }] }]
    }))
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
    setSavingFert(true)
    await supabase.from('fertilizaciones').insert({
      bloque_id: id,
      fecha: formFert.fecha,
      notas: formFert.notas || null,
      soluciones: formFert.soluciones
    })
    setSavingFert(false)
    setShowNuevaFertilizacion(false)
    fetchData()
  }

  const eliminarFertilizacion = async (fertId) => {
    await supabase.from('fertilizaciones').delete().eq('id', fertId)
    setFertDetalle(null)
    setConfirmarElimFert(null)
    fetchData()
  }

  // ──────────────────────────────────────────────────────────────────

  const getVariedad = (p) => {
    if (!p?.notas) return null
    return p.notas.startsWith('Variedad: ') ? p.notas.replace('Variedad: ', '') : null
  }

  const totalKgCiclo = cosechasCiclo.reduce((s, c) => s + Number(c.kg_total), 0)
  const totalIngresosCiclo = cosechasCiclo.reduce((s, c) => s + (Number(c.kg_total) * Number(c.precio_kg||0)), 0)
  const kgPorPlanta = plantacionActiva?.densidad_plantas_m2 && totalKgCiclo > 0
    ? (totalKgCiclo / Number(plantacionActiva.densidad_plantas_m2)).toFixed(2)
    : null
  const totalMuertes = muertes.reduce((s, m) => s + Number(m.cantidad), 0)

  const inpStyle = { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#fff', fontSize:13, color:'#0a0a0a', marginBottom:10, boxSizing:'border-box' }

  if (!bloque) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:13, color:'#9a9a9a' }}>Cargando...</div>
    </div>
  )

  // Vista detalle de fertilización
  if (fertDetalle) {
    const esMasReciente = fertilizaciones.length > 0 && fertilizaciones[0].id === fertDetalle.id
    const esAnterior = fertilizaciones.length > 1 && fertilizaciones[1].id === fertDetalle.id
    return (
      <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
        {confirmarElimFert && (
          <ModalConfirm
            titulo="¿Eliminar fertilización?"
            mensaje="Se eliminará este registro. No se puede deshacer."
            onConfirm={() => eliminarFertilizacion(confirmarElimFert)}
            onCancel={() => setConfirmarElimFert(null)}
          />
        )}
        <div style={{ padding:'24px 20px 16px' }}>
          <button onClick={() => setFertDetalle(null)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
            <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
            <span style={{ fontSize:13, color:'#212121', fontWeight:500 }}>Fertilización</span>
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <div style={{ fontSize:22, fontWeight:700, color:'#0a0a0a' }}>{fertDetalle.fecha}</div>
            {esMasReciente && <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#1a5c2e', color:'#fff' }}>ACTUAL</span>}
            {esAnterior && <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#e8e6e2', color:'#555' }}>ANTERIOR</span>}
          </div>
          <div style={{ fontSize:12, color:'#9a9a9a' }}>Bloque {bloque.codigo}</div>
        </div>
        <div style={{ padding:'0 14px 100px' }}>
          {(fertDetalle.soluciones || []).map((sol, si) => (
            <div key={si} style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#1a5c2e', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>
                Solución {sol.nombre}
              </div>
              {(sol.productos || []).map((prod, pi) => (
                <div key={pi} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f2f1ef' }}>
                  <div style={{ fontSize:13, color:'#0a0a0a' }}>{prod.nombre || '—'}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a' }}>{prod.cantidad} {prod.unidad}</div>
                </div>
              ))}
            </div>
          ))}
          {fertDetalle.notas && (
            <div style={{ background:'#fff', borderRadius:16, padding:'14px', marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#9a9a9a', marginBottom:4 }}>NOTAS</div>
              <div style={{ fontSize:13, color:'#0a0a0a' }}>{fertDetalle.notas}</div>
            </div>
          )}
          <button onClick={() => setConfirmarElimFert(fertDetalle.id)}
            style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:13, color:'#c84040', cursor:'pointer', marginTop:8 }}>
            Eliminar este registro
          </button>
        </div>
      </div>
    )
  }

  // Vista detalle de ciclo histórico
  if (historialDetalle) {
    return (
      <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
        {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
        <div style={{ padding:'24px 20px 16px' }}>
          <button onClick={() => setHistorialDetalle(null)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
            <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
            <span style={{ fontSize:13, color:'#212121', fontWeight:500 }}>Historial</span>
          </button>
          <div style={{ fontSize:22, fontWeight:700, color:'#0a0a0a', marginBottom:4 }}>
            {historialDetalle.cultivos?.nombre}{getVariedad(historialDetalle) ? ` · ${getVariedad(historialDetalle)}` : ''}
          </div>
          <div style={{ fontSize:12, color:'#9a9a9a' }}>Bloque {bloque.codigo} · {historialDetalle.fecha_siembra || 'Sin fecha'}</div>
        </div>
        <div style={{ padding:'0 14px 100px' }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#9a9a9a', marginBottom:10, textTransform:'uppercase' }}>Datos del ciclo</div>
            {[
              ['Cultivo', historialDetalle.cultivos?.nombre || '—'],
              ['Variedad', getVariedad(historialDetalle) || '—'],
              ['Fecha siembra', historialDetalle.fecha_siembra || '—'],
              ['Plantas', historialDetalle.densidad_plantas_m2 ? `${Number(historialDetalle.densidad_plantas_m2).toLocaleString('es-PY')}` : '—'],
            ].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                <div style={{ fontSize:12, color:'#9a9a9a' }}>{k}</div>
                <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={() => eliminarHistorial(historialDetalle.id)}
            style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:13, color:'#c84040', cursor:'pointer' }}>
            Eliminar este ciclo del historial
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      {confirmar && <ModalConfirm titulo={confirmar.titulo} mensaje={confirmar.mensaje} onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}
      <input type="file" accept="image/*" ref={fileRef} style={{ display:'none' }} onChange={subirFoto} />

      {/* Header */}
      <div style={{ padding:'24px 20px 0' }}>
        <button onClick={() => navigate(-1)} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize:18, color:'#212121' }} aria-hidden="true"></i>
          <span style={{ fontSize:13, color:'#212121', fontWeight:500 }}>Volver</span>
        </button>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:2 }}>{bloque.campos?.nombre}</div>
            <div style={{ fontSize:26, fontWeight:800, color:'#0a0a0a', letterSpacing:-.5 }}>Bloque {bloque.codigo}</div>
            {plantacionActiva && (
              <div style={{ fontSize:13, color:'#555', marginTop:2 }}>
                {plantacionActiva.cultivos?.nombre}{getVariedad(plantacionActiva) ? ` · ${getVariedad(plantacionActiva)}` : ''}
              </div>
            )}
          </div>
          {!plantacionActiva && (
            <button onClick={abrirNuevaPlantacion} style={{ padding:'8px 14px', borderRadius:12, background:'#212121', border:'none', fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer' }}>
              + Nueva plantación
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:4 }}>
          {[
            ['plantacion','Plantación'],
            ['fertilizacion',`Fertilización (${fertilizaciones.length})`],
            ['cosechas',`Cosechas (${cosechasCiclo.length})`],
            ['incidencias',`Incidencias (${incidencias.length})`],
            ['fotos',`Fotos (${fotos.length})`],
            ['historial',`Historial (${historial.length})`],
          ].map(([k,v]) => (
            <button key={k} onClick={() => setSeccion(k)}
              style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap',
                background: seccion===k ? (k==='fertilizacion' ? '#1a5c2e' : '#212121') : '#e8e6e2',
                color: seccion===k ? '#fff' : '#9a9a9a' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 14px 100px' }}>

        {/* PLANTACIÓN ACTUAL */}
        {seccion === 'plantacion' && (
          <>
            {plantacionActiva ? (
              <>
                <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a' }}>Datos de la plantación</div>
                    <button onClick={abrirEditarPlantacion} style={{ padding:'5px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'transparent', fontSize:11, color:'#555', cursor:'pointer' }}>Editar</button>
                  </div>
                  {[
                    ['Cultivo', plantacionActiva.cultivos?.nombre || '—'],
                    ['Variedad', getVariedad(plantacionActiva) || '—'],
                    ['Fecha siembra', plantacionActiva.fecha_siembra || '—'],
                    ['Días en campo', diasDesde(plantacionActiva.fecha_siembra) !== null ? `${diasDesde(plantacionActiva.fecha_siembra)} días` : '—'],
                    ['Cantidad de plantas', plantacionActiva.densidad_plantas_m2 ? `${Number(plantacionActiva.densidad_plantas_m2).toLocaleString('es-PY')} plantas` : '—'],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f2f1ef' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a' }}>{k}</div>
                      <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{v}</div>
                    </div>
                  ))}
                  {abonosPlantacion.length > 0 && (
                    <div style={{ padding:'8px 0' }}>
                      <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:6 }}>Abonos de base</div>
                      {abonosPlantacion.map(a => (
                        <div key={a.id} style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:12, color:'#0a0a0a' }}>{a.abonos?.nombre}</span>
                          <span style={{ fontSize:12, color:'#9a9a9a' }}>{a.cantidad || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  <div style={{ background:'#212121', borderRadius:16, padding:'14px' }}>
                    <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>KG COSECHADOS</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>{fmtKg(totalKgCiclo)}</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:2 }}>este ciclo</div>
                  </div>
                  <div style={{ background:'#fff', borderRadius:16, padding:'14px' }}>
                    <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:4 }}>KG POR PLANTA</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#212121' }}>{kgPorPlanta || '—'}</div>
                    <div style={{ fontSize:10, color:'#9a9a9a', marginTop:2 }}>kg/planta</div>
                  </div>
                  {totalMuertes > 0 && (
                    <div style={{ background:'#fff0f0', borderRadius:16, padding:'14px', gridColumn:'1 / -1' }}>
                      <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:4 }}>PLANTAS MUERTAS</div>
                      <div style={{ fontSize:22, fontWeight:800, color:'#c84040' }}>{totalMuertes.toLocaleString('es-PY')}</div>
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={abrirNuevaPlantacion}
                    style={{ flex:1, padding:'12px', borderRadius:14, border:'1px dashed #888', background:'transparent', fontSize:12, fontWeight:600, color:'#555', cursor:'pointer' }}>
                    Nueva plantación
                  </button>
                  <button onClick={() => setShowMuerte(true)}
                    style={{ flex:1, padding:'12px', borderRadius:14, border:'1px solid #ffcccc', background:'transparent', fontSize:12, fontWeight:600, color:'#c84040', cursor:'pointer' }}>
                    + Muerte de plantas
                  </button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
                  <button onClick={finalizarPlantacionActiva}
                    style={{ padding:'11px', borderRadius:14, border:'1px solid #d8c18a', background:'#fff8e8', fontSize:12, fontWeight:700, color:'#7a5a13', cursor:'pointer' }}>
                    Finalizar plantacion
                  </button>
                  <button onClick={eliminarPlantacionActiva}
                    style={{ padding:'11px', borderRadius:14, border:'1px solid #ffcccc', background:'#fff0f0', fontSize:12, fontWeight:700, color:'#c84040', cursor:'pointer' }}>
                    Eliminar plantacion
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'#9a9a9a', fontSize:13, background:'#fff', borderRadius:20 }}>
                Sin plantación activa.<br/>
                <button onClick={abrirNuevaPlantacion} style={{ marginTop:12, padding:'10px 20px', borderRadius:12, background:'#212121', border:'none', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>
                  + Nueva plantación
                </button>
              </div>
            )}
          </>
        )}

        {/* FERTILIZACIÓN */}
        {seccion === 'fertilizacion' && (
          <>
            <div style={{ background: planSemanal ? '#eef6ea' : '#fff', borderRadius:20, padding:'16px', marginBottom:10, border: planSemanal ? '1px solid #cde6c8' : '1px dashed #d6d6d6' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color: planSemanal ? '#1a5c2e' : '#8b928b', textTransform:'uppercase', marginBottom:4 }}>Plan semanal</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#0a0a0a' }}>{planSemanal ? planSemanal.nombre : 'Sin plan activo'}</div>
                  <div style={{ fontSize:12, color:'#687068', marginTop:3 }}>
                    {planSemanal ? `${planSemanal.litros_preparados || '—'} L preparados · ${aplicacionesPlan.length} aplicaciones` : 'Solo para los bloques que usan receta semanal.'}
                  </div>
                </div>
                <button onClick={abrirPlanSemanal}
                  style={{ padding:'8px 12px', borderRadius:12, border:'none', background:'#212121', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  {planSemanal ? 'Editar' : 'Crear'}
                </button>
              </div>
              {planSemanal && (
                <>
                  <div style={{ display:'grid', gap:6, marginBottom:10 }}>
                    {(planSemanal.soluciones || []).slice(0, 3).map((sol, si) => (
                      <div key={si} style={{ fontSize:12, color:'#263026' }}>
                        <strong>Sol. {sol.nombre}:</strong> {(sol.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).filter(x => x.trim()).join(' · ') || 'Sin productos'}
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <button onClick={abrirAplicarPlan}
                      style={{ padding:'11px', borderRadius:14, border:'none', background:'#1a5c2e', color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer' }}>
                      Aplicar hoy
                    </button>
                    <button onClick={desactivarPlanSemanal}
                      style={{ padding:'11px', borderRadius:14, border:'1px solid #ffcccc', background:'#fff0f0', color:'#c84040', fontSize:12, fontWeight:800, cursor:'pointer' }}>
                      Desactivar
                    </button>
                  </div>
                  {aplicacionesPlan.length > 0 && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:'#8b928b', textTransform:'uppercase', marginBottom:6 }}>Ultimas aplicaciones</div>
                      {aplicacionesPlan.slice(0, 5).map(app => (
                        <div key={app.id} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'7px 0', borderTop:'1px solid rgba(0,0,0,0.06)' }}>
                          <span style={{ fontSize:12, color:'#202820' }}>{app.fecha}{app.responsable ? ` · ${app.responsable}` : ''}</span>
                          <strong style={{ fontSize:12 }}>{app.litros_aplicados || '—'} L</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <button onClick={abrirNuevaFertilizacion}
              style={{ width:'100%', padding:13, borderRadius:14, border:'none', background:'#1a5c2e', fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', marginBottom:16 }}>
              + Nueva fertilización
            </button>

            {fertilizaciones.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13, background:'#fff', borderRadius:20 }}>
                Sin fertilizaciones registradas en este bloque
              </div>
            ) : (
              <>
                {/* Fertilización actual */}
                {fertilizaciones[0] && (
                  <>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1a5c2e', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>Fertilización actual</div>
                    <div onClick={() => setFertDetalle(fertilizaciones[0])}
                      style={{ background:'#1a5c2e', borderRadius:20, padding:'16px', marginBottom:16, cursor:'pointer' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{fertilizaciones[0].fecha}</div>
                        <i className="ti ti-chevron-right" style={{ fontSize:16, color:'rgba(255,255,255,0.4)' }} aria-hidden="true"></i>
                      </div>
                      {(fertilizaciones[0].soluciones || []).map((sol, si) => (
                        <div key={si} style={{ marginBottom:6 }}>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:700, marginBottom:3 }}>SOL. {sol.nombre}</div>
                          <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)' }}>
                            {(sol.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).filter(x=>x.trim()).join(' · ')}
                          </div>
                        </div>
                      ))}
                      {fertilizaciones[0].notas && (
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:8, fontStyle:'italic' }}>{fertilizaciones[0].notas}</div>
                      )}
                    </div>
                  </>
                )}

                {/* Fertilización anterior */}
                {fertilizaciones[1] && (
                  <>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9a9a9a', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>Fertilización anterior</div>
                    <div onClick={() => setFertDetalle(fertilizaciones[1])}
                      style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:16, cursor:'pointer' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a' }}>{fertilizaciones[1].fecha}</div>
                        <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
                      </div>
                      {(fertilizaciones[1].soluciones || []).map((sol, si) => (
                        <div key={si} style={{ marginBottom:6 }}>
                          <div style={{ fontSize:10, color:'#1a5c2e', fontWeight:700, marginBottom:3 }}>SOL. {sol.nombre}</div>
                          <div style={{ fontSize:12, color:'#555' }}>
                            {(sol.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).filter(x=>x.trim()).join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Historial de fertilizaciones */}
                {fertilizaciones.length > 2 && (
                  <>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9a9a9a', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>Historial</div>
                    {fertilizaciones.slice(2).map(fert => (
                      <div key={fert.id} onClick={() => setFertDetalle(fert)}
                        style={{ background:'#fff', borderRadius:16, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a' }}>{fert.fecha}</div>
                          <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>
                            {(fert.soluciones || []).length} solución{(fert.soluciones || []).length !== 1 ? 'es' : ''} · {(fert.soluciones || []).reduce((s,sol) => s + (sol.productos||[]).length, 0)} productos
                          </div>
                        </div>
                        <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
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
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin cosechas registradas en este ciclo</div>
            ) : (
              <>
                <div style={{ background:'#212121', borderRadius:20, padding:'16px', marginBottom:10 }}>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>TOTAL DEL CICLO</div>
                  <div style={{ fontSize:32, fontWeight:800, color:'#fff' }}>{fmtKg(totalKgCiclo)} kg</div>
                  {totalIngresosCiclo > 0 && <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>Gs. {fmtGs(totalIngresosCiclo)} en ingresos</div>}
                  {kgPorPlanta && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{kgPorPlanta} kg por planta</div>}
                </div>
                {cosechasCiclo.map(c => (
                  <div key={c.id} style={{ background:'#fff', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a' }}>{c.fecha}</div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#0a0a0a' }}>{fmtKg(c.kg_total)} kg</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <div style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#eeeeee', color:'#555' }}>
                        {c.calidad === 'primera' ? '1ra' : c.calidad === 'segunda' ? '2da' : 'Mixta'}
                      </div>
                      {c.precio_kg > 0 && <div style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#eeeeee', color:'#555' }}>Gs. {fmtGs(c.precio_kg)}/kg</div>}
                      {c.compradores?.nombre && <div style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#e6f1fb', color:'#185fa5' }}>{c.compradores.nombre}</div>}
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
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:12 }}>Notas de fumigaciones registradas en este bloque</div>
            {incidencias.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin incidencias registradas</div>
            ) : incidencias.map((inc, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:6, background: inc.tipo==='fumigacion' ? '#fff3e8' : '#eaf4fb', color: inc.tipo==='fumigacion' ? '#e07b00' : '#2980b9' }}>
                    {inc.tipo === 'fumigacion' ? 'Fumigación' : inc.tipo === 'fertiriego' ? 'Fertiriego' : 'Foliar'}
                  </div>
                  <div style={{ fontSize:11, color:'#9a9a9a' }}>{inc.fecha}</div>
                </div>
                <div style={{ fontSize:13, color:'#0a0a0a', marginBottom:4 }}>{inc.notas}</div>
                {inc.fumigacion_productos?.length > 0 && (
                  <div style={{ fontSize:11, color:'#9a9a9a' }}>
                    {inc.fumigacion_productos.map(fp => fp.productos?.nombre).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            ))}
            {muertes.length > 0 && (
              <>
                <div style={{ fontSize:12, fontWeight:600, color:'#9a9a9a', margin:'16px 0 8px', textTransform:'uppercase' }}>Muerte de plantas</div>
                {muertes.map(m => (
                  <div key={m.id} style={{ background:'#fff0f0', borderRadius:16, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#c84040' }}>{m.cantidad} plantas · {m.causa}</div>
                      <div style={{ fontSize:11, color:'#9a9a9a' }}>{m.fecha}</div>
                    </div>
                    {m.descripcion && <div style={{ fontSize:12, color:'#9a9a9a' }}>{m.descripcion}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* FOTOS */}
        {seccion === 'fotos' && (
          <>
            <button onClick={() => fileRef.current?.click()}
              style={{ width:'100%', padding:13, borderRadius:14, border:'1px dashed #888', background:'transparent', fontSize:13, fontWeight:600, color:'#555', cursor:'pointer', marginBottom:12 }}>
              <i className="ti ti-camera" style={{ fontSize:16, marginRight:6 }} aria-hidden="true"></i>
              Agregar foto
            </button>
            {fotos.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin fotos en este ciclo</div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {fotos.map(f => (
                  <div key={f.id} style={{ borderRadius:16, overflow:'hidden', position:'relative', background:'#e8e6e2' }}>
                    <img src={f.url} alt="foto bloque" style={{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' }}/>
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.5)', padding:'6px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:10, color:'#fff' }}>{f.fecha}</span>
                      <button onClick={() => eliminarFoto(f.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
                        <i className="ti ti-trash" style={{ fontSize:14, color:'#fff' }} aria-hidden="true"></i>
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
              <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin ciclos anteriores</div>
            ) : historial.map(p => (
              <div key={p.id} onClick={() => setHistorialDetalle(p)}
                style={{ background:'#fff', borderRadius:16, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#0a0a0a' }}>
                    {p.cultivos?.nombre}{getVariedad(p) ? ` · ${getVariedad(p)}` : ''}
                  </div>
                  <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>
                    Siembra: {p.fecha_siembra || '—'}
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize:16, color:'#d0d0d0' }} aria-hidden="true"></i>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modal nueva/editar plantación */}
      {(showNuevaPlantacion || showEditarPlantacion) && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && (setShowNuevaPlantacion(false)||setShowEditarPlantacion(false))}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>{showEditarPlantacion ? 'Editar plantación' : 'Nueva plantación'}</div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cultivo *</div>
            <select style={inpStyle} value={form.cultivo_id} onChange={e => setForm(f => ({...f, cultivo_id:e.target.value}))}>
              <option value="">Seleccioná cultivo...</option>
              {cultivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Variedad</div>
            <input style={inpStyle} type="text" value={form.variedad_texto} onChange={e => setForm(f => ({...f, variedad_texto:e.target.value}))} placeholder="Ej: Rojo, Lamuyo..."/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha de siembra *</div>
            <input style={inpStyle} type="date" value={form.fecha_siembra} onChange={e => setForm(f => ({...f, fecha_siembra:e.target.value}))}/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cantidad de plantas</div>
            <input style={inpStyle} type="number" value={form.cantidad_plantas} onChange={e => setForm(f => ({...f, cantidad_plantas:e.target.value}))} placeholder="Ej: 1000"/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:8 }}>Abonos de base</div>
            {abonos.map(a => (
              <div key={a.id} style={{ marginBottom:8 }}>
                <div onClick={() => toggleAbono(a.id)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:12, background: form.abonos_ids.includes(a.id) ? '#212121' : '#fff', cursor:'pointer', marginBottom: form.abonos_ids.includes(a.id) ? 6 : 0 }}>
                  <div style={{ width:18, height:18, borderRadius:5, border: form.abonos_ids.includes(a.id) ? 'none' : '1.5px solid #d0d0d0', background: form.abonos_ids.includes(a.id) ? '#fff' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {form.abonos_ids.includes(a.id) && <i className="ti ti-check" style={{ fontSize:12, color:'#212121' }} aria-hidden="true"></i>}
                  </div>
                  <span style={{ fontSize:13, color: form.abonos_ids.includes(a.id) ? '#fff' : '#0a0a0a' }}>{a.nombre}</span>
                </div>
                {form.abonos_ids.includes(a.id) && (
                  <div style={{ display:'flex', gap:6, paddingLeft:4 }}>
                    <input style={{ flex:2, padding:'8px 12px', borderRadius:10, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }}
                      type="text" placeholder="Cantidad (ej: 50)"
                      value={form.abonos_cantidades[a.id] || ''}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id]:e.target.value}}))}/>
                    <select style={{ flex:1, padding:'8px 6px', borderRadius:10, border:'1px solid #e8e6e2', background:'#fff', fontSize:12, color:'#0a0a0a' }}
                      value={(form.abonos_cantidades[a.id+'_unidad']) || 'kg'}
                      onChange={e => setForm(f => ({...f, abonos_cantidades:{...f.abonos_cantidades, [a.id+'_unidad']:e.target.value}}))}>
                      <option value="kg">kg</option>
                      <option value="gramos">gramos</option>
                    </select>
                  </div>
                )}
              </div>
            ))}

            <button style={{ width:'100%', padding:14, borderRadius:14, background: saving ? '#888' : '#212121', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', marginTop:12 }}
              onClick={showEditarPlantacion ? guardarEditarPlantacion : guardarNuevaPlantacion} disabled={saving}>
              {saving ? 'Guardando...' : showEditarPlantacion ? 'Guardar cambios' : 'Guardar plantación'}
            </button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }}
              onClick={() => { setShowNuevaPlantacion(false); setShowEditarPlantacion(false) }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal muerte de plantas */}
      {showMuerte && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setShowMuerte(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:20 }}>Registrar muerte de plantas</div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Cantidad de plantas *</div>
            <input style={inpStyle} type="number" value={formMuerte.cantidad} onChange={e => setFormMuerte(f => ({...f, cantidad:e.target.value}))} placeholder="Ej: 5"/>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Causa</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
              {CAUSAS_MUERTE.map(c => (
                <button key={c} onClick={() => setFormMuerte(f => ({...f, causa:c}))}
                  style={{ padding:'7px 14px', borderRadius:20, border:'1px solid #e8e6e2', fontSize:11, fontWeight:500, cursor:'pointer', background: formMuerte.causa===c ? '#c84040' : '#fff', color: formMuerte.causa===c ? '#fff' : '#555' }}>
                  {c}
                </button>
              ))}
            </div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Descripción (opcional)</div>
            <textarea style={{ ...inpStyle, minHeight:60, resize:'vertical' }} value={formMuerte.descripcion} onChange={e => setFormMuerte(f => ({...f, descripcion:e.target.value}))} placeholder="Detalles adicionales..."/>

            <button style={{ width:'100%', padding:14, borderRadius:14, background:'#c84040', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }} onClick={guardarMuerte} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
            <button style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }} onClick={() => setShowMuerte(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal nueva fertilización */}
      {showPlanSemanal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:120, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setShowPlanSemanal(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:4 }}>{formPlan.id ? 'Editar plan semanal' : 'Nuevo plan semanal'}</div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:16 }}>Usalo solo en los bloques donde preparas fertilizacion para varios dias.</div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Nombre</div>
            <input style={inpStyle} value={formPlan.nombre} onChange={e => setFormPlan(f => ({ ...f, nombre:e.target.value }))} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha inicio</div>
                <input type="date" style={inpStyle} value={formPlan.fecha_inicio} onChange={e => setFormPlan(f => ({ ...f, fecha_inicio:e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Litros preparados</div>
                <input style={inpStyle} value={formPlan.litros_preparados} onChange={e => setFormPlan(f => ({ ...f, litros_preparados:e.target.value }))} placeholder="Ej: 200" />
              </div>
            </div>

            {formPlan.soluciones.map((sol, si) => (
              <div key={si} style={{ background:'#fff', borderRadius:16, padding:14, marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1a5c2e' }}>Solucion {sol.nombre}</div>
                  {formPlan.soluciones.length > 1 && <button onClick={() => eliminarSolucionPlan(si)} style={{ border:'none', background:'none', color:'#c84040', cursor:'pointer' }}>Eliminar</button>}
                </div>
                {(sol.productos || []).map((prod, pi) => (
                  <div key={pi} style={{ display:'grid', gridTemplateColumns:'1fr 74px 72px 28px', gap:6, marginBottom:8 }}>
                    <input style={{ ...inpStyle, marginBottom:0 }} value={prod.nombre} onChange={e => actualizarProductoPlan(si, pi, 'nombre', e.target.value)} placeholder="Producto"/>
                    <input style={{ ...inpStyle, marginBottom:0 }} value={prod.cantidad} onChange={e => actualizarProductoPlan(si, pi, 'cantidad', e.target.value)} placeholder="Cant."/>
                    <select style={{ ...inpStyle, marginBottom:0 }} value={prod.unidad} onChange={e => actualizarProductoPlan(si, pi, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button onClick={() => eliminarProductoPlan(si, pi)} style={{ border:'none', background:'transparent', color:'#c84040', cursor:'pointer' }}>×</button>
                  </div>
                ))}
                <button onClick={() => agregarProductoPlan(si)} style={{ width:'100%', padding:9, borderRadius:12, border:'1px dashed #b8c9b5', background:'transparent', fontSize:12, color:'#1a5c2e', cursor:'pointer' }}>+ Producto</button>
              </div>
            ))}
            <button onClick={agregarSolucionPlan} style={{ width:'100%', padding:11, borderRadius:14, border:'1px dashed #1a5c2e', background:'#fff', fontSize:12, color:'#1a5c2e', cursor:'pointer', marginBottom:12 }}>+ Agregar solucion</button>
            <textarea style={{ ...inpStyle, minHeight:70, resize:'vertical' }} value={formPlan.notas} onChange={e => setFormPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas del plan"/>
            <button onClick={guardarPlanSemanal} disabled={savingFert} style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'#1a5c2e', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              {savingFert ? 'Guardando...' : 'Guardar plan semanal'}
            </button>
            <button onClick={() => setShowPlanSemanal(false)} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #e8e6e2', background:'transparent', marginTop:8, fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {showAplicarPlan && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:120, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setShowAplicarPlan(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:16 }}>Aplicar plan semanal</div>
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha</div>
            <input type="date" style={inpStyle} value={formAplicacionPlan.fecha} onChange={e => setFormAplicacionPlan(f => ({ ...f, fecha:e.target.value }))} />
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Litros aplicados</div>
            <input style={inpStyle} value={formAplicacionPlan.litros_aplicados} onChange={e => setFormAplicacionPlan(f => ({ ...f, litros_aplicados:e.target.value }))} placeholder="Ej: 40" />
            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Responsable</div>
            <input style={inpStyle} value={formAplicacionPlan.responsable} onChange={e => setFormAplicacionPlan(f => ({ ...f, responsable:e.target.value }))} placeholder="Opcional" />
            <textarea style={{ ...inpStyle, minHeight:70, resize:'vertical' }} value={formAplicacionPlan.notas} onChange={e => setFormAplicacionPlan(f => ({ ...f, notas:e.target.value }))} placeholder="Notas"/>
            <button onClick={guardarAplicacionPlan} disabled={savingFert} style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'#1a5c2e', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              {savingFert ? 'Guardando...' : 'Guardar aplicacion'}
            </button>
            <button onClick={() => setShowAplicarPlan(false)} style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid #e8e6e2', background:'transparent', marginTop:8, fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {showNuevaFertilizacion && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setShowNuevaFertilizacion(false)}>
          <div style={{ background:'#f2f1ef', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 40px', maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#0a0a0a', marginBottom:4 }}>Nueva fertilización</div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:20 }}>Bloque {bloque.codigo}</div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Fecha *</div>
            <input style={inpStyle} type="date" value={formFert.fecha} onChange={e => setFormFert(f => ({...f, fecha:e.target.value}))}/>

            {/* Soluciones */}
            {formFert.soluciones.map((sol, si) => (
              <div key={si} style={{ background:'#fff', borderRadius:16, padding:'14px', marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:'#1a5c2e', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{sol.nombre}</span>
                    </div>
                    <input
                      style={{ fontSize:13, fontWeight:600, color:'#0a0a0a', border:'none', background:'transparent', padding:0, width:80 }}
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
                    <button onClick={() => eliminarSolucion(si)}
                      style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'#c84040', fontSize:12 }}>
                      <i className="ti ti-trash" style={{ fontSize:14 }} aria-hidden="true"></i>
                    </button>
                  )}
                </div>

                {sol.productos.map((prod, pi) => (
                  <div key={pi} style={{ display:'flex', gap:6, marginBottom:8, alignItems:'center' }}>
                    <input
                      style={{ flex:3, padding:'9px 10px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f8f8f8', fontSize:12, color:'#0a0a0a' }}
                      type="text" placeholder="Producto (ej: KCL)"
                      value={prod.nombre}
                      onChange={e => actualizarProducto(si, pi, 'nombre', e.target.value)}
                    />
                    <input
                      style={{ flex:1.5, padding:'9px 8px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f8f8f8', fontSize:12, color:'#0a0a0a' }}
                      type="text" placeholder="Cant."
                      value={prod.cantidad}
                      onChange={e => actualizarProducto(si, pi, 'cantidad', e.target.value)}
                    />
                    <select
                      style={{ flex:1.2, padding:'9px 4px', borderRadius:10, border:'1px solid #e8e6e2', background:'#f8f8f8', fontSize:11, color:'#0a0a0a' }}
                      value={prod.unidad}
                      onChange={e => actualizarProducto(si, pi, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {sol.productos.length > 1 && (
                      <button onClick={() => eliminarProducto(si, pi)}
                        style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'#c84040' }}>
                        <i className="ti ti-x" style={{ fontSize:13 }} aria-hidden="true"></i>
                      </button>
                    )}
                  </div>
                ))}

                <button onClick={() => agregarProducto(si)}
                  style={{ padding:'6px 12px', borderRadius:10, border:'1px dashed #ccc', background:'transparent', fontSize:11, color:'#888', cursor:'pointer' }}>
                  + Agregar producto
                </button>
              </div>
            ))}

            <button onClick={agregarSolucion}
              style={{ width:'100%', padding:11, borderRadius:12, border:'1px dashed #1a5c2e', background:'transparent', fontSize:12, fontWeight:600, color:'#1a5c2e', cursor:'pointer', marginBottom:12 }}>
              + Agregar solución
            </button>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Notas (opcional)</div>
            <textarea
              style={{ ...inpStyle, minHeight:60, resize:'vertical' }}
              value={formFert.notas}
              onChange={e => setFormFert(f => ({...f, notas:e.target.value}))}
              placeholder="Observaciones, ajustes del ingeniero..."/>

            <button
              style={{ width:'100%', padding:14, borderRadius:14, background: savingFert ? '#888' : '#1a5c2e', border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', marginTop:4 }}
              onClick={guardarFertilizacion} disabled={savingFert}>
              {savingFert ? 'Guardando...' : 'Guardar fertilización'}
            </button>
            <button
              style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }}
              onClick={() => setShowNuevaFertilizacion(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
