import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().split('T')[0]
const fmt = (n) => (Number(n) || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 })
const RECETAS_KEY = 'agrobloque-plan-nutricional-recetas'

const objetivos = ['Crecimiento', 'Floracion', 'Produccion', 'Cargado', 'Recuperacion', 'Mantenimiento']

const normalizar = (valor = '') => String(valor)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

const recomendacionBase = (objetivo, cultivo = '') => {
  const o = String(objetivo || '').toLowerCase()
  const c = normalizar(cultivo)
  if (o.includes('cargado')) return [
    ...(c.includes('pepino') || c.includes('zucchini') || c.includes('zapallito') ? [
      { producto: 'Nitrato de potasio', cantidad: '260', unidad: 'g', nutrientes: 'Potasio + nitrogeno', motivo: 'Sostiene llenado sin empujar demasiado la conductividad.' },
      { producto: 'Nitrato de calcio', cantidad: '180', unidad: 'g', nutrientes: 'Calcio + nitrogeno', motivo: 'Mantiene crecimiento y firmeza cuidando exceso de sales.' },
      { producto: 'Sulfato de magnesio', cantidad: '90', unidad: 'g', nutrientes: 'Magnesio + azufre', motivo: 'Apoya fotosintesis en cultivo de cosecha continua.' },
    ] : c.includes('morron') || c.includes('pimiento') || c.includes('locote') ? [
      { producto: 'Nitrato de potasio', cantidad: '340', unidad: 'g', nutrientes: 'Potasio + nitrogeno', motivo: 'Favorece calibre y llenado de frutos pesados.' },
      { producto: 'Nitrato de calcio', cantidad: '300', unidad: 'g', nutrientes: 'Calcio + nitrogeno', motivo: 'Refuerza firmeza y calidad de pared del fruto.' },
      { producto: 'Sulfato de magnesio', cantidad: '120', unidad: 'g', nutrientes: 'Magnesio + azufre', motivo: 'Sostiene fotosintesis durante alta carga.' },
      { producto: 'Calcio boro', cantidad: '70', unidad: 'cc', nutrientes: 'Calcio + boro', motivo: 'Apoya cuaje y calidad cuando hay carga de frutos.' },
    ] : [
      { producto: 'Nitrato de potasio', cantidad: '320', unidad: 'g', nutrientes: 'Potasio + nitrogeno', motivo: 'Favorece llenado, calibre y calidad de fruto.' },
      { producto: 'Nitrato de calcio', cantidad: '280', unidad: 'g', nutrientes: 'Calcio + nitrogeno', motivo: 'Ayuda firmeza de fruto y reduce problemas asociados a falta de calcio.' },
      { producto: 'Sulfato de magnesio', cantidad: '100', unidad: 'g', nutrientes: 'Magnesio + azufre', motivo: 'Sostiene fotosintesis durante alta demanda de frutos.' },
      { producto: 'Quelato de micronutrientes', cantidad: '40', unidad: 'g', nutrientes: 'Micronutrientes', motivo: 'Apoyo general cuando la planta esta cargando frutos.' },
    ]),
  ]
  if (o.includes('produccion')) return [
    { producto: 'Nitrato de calcio', cantidad: '350', unidad: 'g', nutrientes: 'Calcio + nitrogeno', motivo: 'Aporta calcio para firmeza y crecimiento activo.' },
    { producto: 'NPK 15-15-15', cantidad: '280', unidad: 'g', nutrientes: 'NPK balanceado', motivo: 'Mantiene aporte general de nitrogeno, fosforo y potasio.' },
    { producto: 'Sulfato de magnesio', cantidad: '120', unidad: 'g', nutrientes: 'Magnesio + azufre', motivo: 'Ayuda a clorofila y actividad fotosintetica.' },
  ]
  if (o.includes('floracion')) return [
    { producto: 'NPK alto en fosforo', cantidad: '250', unidad: 'g', nutrientes: 'Fosforo + potasio', motivo: 'Apoya floracion y raiz.' },
    { producto: 'Calcio boro', cantidad: '100', unidad: 'cc', nutrientes: 'Calcio + boro', motivo: 'Ayuda cuaje y calidad de flor.' },
  ]
  if (o.includes('recuperacion')) return [
    { producto: 'Aminoacidos', cantidad: '120', unidad: 'cc', nutrientes: 'Bioestimulante', motivo: 'Apoyo ante estres o recuperacion.' },
    { producto: 'Extracto de algas', cantidad: '80', unidad: 'cc', nutrientes: 'Bioestimulante', motivo: 'Estimula recuperacion general.' },
  ]
  return [
    { producto: 'NPK 15-15-15', cantidad: '250', unidad: 'g', nutrientes: 'NPK balanceado', motivo: 'Base nutricional general.' },
    { producto: 'Sulfato de magnesio', cantidad: '100', unidad: 'g', nutrientes: 'Magnesio + azufre', motivo: 'Complemento de magnesio.' },
  ]
}

const guiaObjetivo = (objetivo) => {
  const o = normalizar(objetivo)
  if (o.includes('crecimiento')) return 'Crecimiento vegetativo: prioriza nitrogeno balanceado, raiz y hoja sana sin subir de golpe la EC.'
  if (o.includes('floracion')) return 'Floracion: busca cuaje parejo con fosforo, potasio, calcio y boro, cuidando no estresar la planta.'
  if (o.includes('produccion')) return 'Produccion: mantiene la planta trabajando, con nutricion estable para sostener cosecha continua.'
  if (o.includes('cargado')) return 'Cargado de frutos: etapa enfocada en llenado, calibre y firmeza. Sube importancia de potasio, calcio y magnesio; controlar EC final.'
  if (o.includes('recuperacion')) return 'Recuperacion: para estres, poda, calor o golpe de manejo. Conviene bajar exigencia y usar apoyo suave.'
  return 'Mantenimiento: nutricion base para sostener la planta sin empujar demasiado crecimiento ni carga.'
}

const buscarProductoInventario = (productos, recomendado) => {
  const nombre = normalizar(recomendado)
  const tokens = nombre.split(/\s+/).filter(t => t.length > 2)
  return productos.find(p => {
    const prod = normalizar(p.nombre)
    return prod.includes(nombre) || tokens.every(t => prod.includes(t)) || tokens.some(t => prod.includes(t))
  })
}

const estadoInventario = (producto) => {
  if (!producto) return { key: 'no_cargado', label: 'No cargado en inventario', color: '#8a5a00', bg: '#fff7e8' }
  if ((Number(producto.stock_actual) || 0) <= 0) return { key: 'sin_stock', label: 'Sin stock', color: '#c84040', bg: '#fff0f0' }
  return { key: 'disponible', label: 'Disponible', color: '#176a25', bg: '#edf6ec' }
}

const resumenProductosAplicados = (productos = []) => {
  if (!Array.isArray(productos)) return []
  return productos.map(p => ({
    producto: p.producto || p.nombre || p.productos?.nombre || '',
    cantidad: p.cantidad || p.dosis || '',
    unidad: p.unidad || '',
    nutrientes: p.nutrientes || '',
  })).filter(p => p.producto)
}

export default function PlanNutricional({ campoActivo, isGuest = false }) {
  const [bloques, setBloques] = useState([])
  const [productos, setProductos] = useState([])
  const [registros, setRegistros] = useState([])
  const [modo, setModo] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [recetas, setRecetas] = useState([])
  const [form, setForm] = useState({
    fecha: today(),
    bloque_id: '',
    objetivo: 'Produccion',
    tanque_litros: '200',
    ec_agua: '',
    ec_objetivo: '',
    ec_final: '',
    productos: [],
    notas: '',
  })

  useEffect(() => {
    cargarDatos()
  }, [campoActivo?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setRecetas(JSON.parse(window.localStorage.getItem(RECETAS_KEY) || '[]'))
    } catch {
      setRecetas([])
    }
  }, [])

  const bloqueActivo = useMemo(() => bloques.find(b => b.id === form.bloque_id), [bloques, form.bloque_id])
  const cultivoActivo = bloqueActivo?.plantaciones?.find(p => p.activa)?.cultivos?.nombre || ''
  const registrosConEc = registros.filter(r => Number(r.ec_final) > 0)
  const promedioEcFinal = registrosConEc.length
    ? registrosConEc.reduce((s, r) => s + (Number(r.ec_final) || 0), 0) / registrosConEc.length
    : 0
  const diferenciaEc = (Number(String(form.ec_final).replace(',', '.')) || 0) - (Number(String(form.ec_objetivo).replace(',', '.')) || 0)
  const estadoEc = !form.ec_final || !form.ec_objetivo
    ? { label:'Sin comparar EC', color:'#687068', bg:'#f7f8f6' }
    : Math.abs(diferenciaEc) <= 0.2
      ? { label:'EC dentro del rango', color:'#176a25', bg:'#edf6ec' }
      : diferenciaEc > 0
        ? { label:`EC alta por ${fmt(diferenciaEc)}`, color:'#c84040', bg:'#fff0f0' }
        : { label:`EC baja por ${fmt(Math.abs(diferenciaEc))}`, color:'#8a5a00', bg:'#fff7e8' }

  const cargarDatos = async () => {
    const filtroCampo = campoActivo?.id
    const [{ data: b }, { data: p }, { data: r }] = await Promise.all([
      filtroCampo
        ? supabase.from('bloques').select('id, codigo, campo_id, plantaciones(activa, cultivos(nombre))').eq('campo_id', filtroCampo).order('codigo')
        : supabase.from('bloques').select('id, codigo, campo_id, plantaciones(activa, cultivos(nombre))').order('codigo'),
      supabase.from('productos').select('id, nombre, unidad, stock_actual, activo').eq('activo', true).order('nombre'),
      filtroCampo
        ? supabase.from('plan_nutricional_registros').select('*, bloques(codigo), campos(nombre)').eq('campo_id', filtroCampo).order('fecha', { ascending:false }).limit(20)
        : supabase.from('plan_nutricional_registros').select('*, bloques(codigo), campos(nombre)').order('fecha', { ascending:false }).limit(20),
    ])
    setBloques(b || [])
    setProductos(p || [])
    setRegistros(r || [])
  }

  const aplicarProductosRecomendados = (recomendados) => {
    return recomendados.map(rec => {
      const encontrado = buscarProductoInventario(productos, rec.producto)
      return {
        ...rec,
        producto_id: encontrado?.id || '',
        producto: rec.producto,
        producto_inventario: encontrado?.nombre || '',
        stock_actual: encontrado?.stock_actual ?? null,
        estado: estadoInventario(encontrado).key,
      }
    })
  }

  const generarAsistenteBase = (mensajeExtra = '') => {
    const productosBase = aplicarProductosRecomendados(recomendacionBase(form.objetivo, cultivoActivo))
    const ecAgua = Number(String(form.ec_agua).replace(',', '.')) || 0
    const ecObjetivo = Number(String(form.ec_objetivo).replace(',', '.')) || 0
    const ecEstimada = ecObjetivo || (ecAgua ? ecAgua + 1.1 : 0)
    setForm(f => ({
      ...f,
      productos: productosBase,
      ec_final: ecEstimada ? String(ecEstimada.toFixed(2)) : '',
      notas: `${guiaObjetivo(f.objetivo)} Incluye productos recomendables aunque no esten cargados o disponibles en inventario. Revisar conductividad antes de aplicar.${mensajeExtra ? ` ${mensajeExtra}` : ''}`,
    }))
    setModo('asistente')
  }

  const cargarContextoBloqueIA = async () => {
    if (!form.bloque_id) return null

    const [{ data: plantaciones }, { data: ferts }, { data: planes }, { data: registrosBloque }, { data: fumBloques }] = await Promise.all([
      supabase
        .from('plantaciones')
        .select('id, activa, fecha_siembra, densidad_plantas_m2, notas, cultivos(nombre), plantacion_abonos(cantidad, unidad, alcance, abonos(nombre))')
        .eq('bloque_id', form.bloque_id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('fertilizaciones')
        .select('fecha, notas, soluciones')
        .eq('bloque_id', form.bloque_id)
        .order('fecha', { ascending: false })
        .limit(8),
      supabase
        .from('fertilizacion_planes')
        .select('nombre, fecha_inicio, litros_preparados, soluciones, notas, activo')
        .eq('bloque_id', form.bloque_id)
        .eq('activo', true)
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('plan_nutricional_registros')
        .select('fecha, objetivo, tanque_litros, ec_agua, ec_objetivo, ec_final, productos, notas')
        .eq('bloque_id', form.bloque_id)
        .order('fecha', { ascending: false })
        .limit(8),
      supabase
        .from('fumigacion_bloques')
        .select('fumigaciones(fecha, tipo, notas, fumigacion_productos(dosis, unidad, productos(nombre)))')
        .eq('bloque_id', form.bloque_id)
        .limit(8),
    ])

    const activa = (plantaciones || []).find(p => p.activa) || (plantaciones || [])[0] || null
    return {
      bloque_codigo: bloqueActivo?.codigo || '',
      cultivo_activo: activa?.cultivos?.nombre || bloqueActivo?.plantaciones?.find(p => p.activa)?.cultivos?.nombre || '',
      fecha_siembra: activa?.fecha_siembra || '',
      dias_en_campo: activa?.fecha_siembra ? Math.max(0, Math.floor((new Date() - new Date(activa.fecha_siembra)) / 86400000)) : null,
      cantidad_plantas: activa?.densidad_plantas_m2 || '',
      variedad_notas: activa?.notas || '',
      abonos_base: (activa?.plantacion_abonos || []).map(a => ({
        producto: a.abonos?.nombre || '',
        cantidad: a.cantidad || '',
        unidad: a.unidad || 'kg',
        alcance: a.alcance || 'total',
      })),
      fertilizaciones_recientes: (ferts || []).map(f => ({
        fecha: f.fecha,
        notas: f.notas || '',
        productos: Array.isArray(f.soluciones)
          ? f.soluciones.flatMap(sol => resumenProductosAplicados(sol.productos || sol.items || []))
          : [],
      })),
      plan_semanal_activo: (planes || []).map(p => ({
        nombre: p.nombre,
        fecha_inicio: p.fecha_inicio,
        litros_preparados: p.litros_preparados,
        soluciones: (p.soluciones || []).map(sol => ({
          nombre: sol.nombre,
          productos: resumenProductosAplicados(sol.productos || []),
        })),
        notas: p.notas || '',
      })),
      planes_nutricionales_recientes: (registrosBloque || []).map(r => ({
        fecha: r.fecha,
        objetivo: r.objetivo,
        tanque_litros: r.tanque_litros,
        ec_agua: r.ec_agua,
        ec_objetivo: r.ec_objetivo,
        ec_final: r.ec_final,
        productos: resumenProductosAplicados(r.productos || []),
        notas: r.notas || '',
      })),
      fumigaciones_recientes: (fumBloques || []).map(fb => ({
        fecha: fb.fumigaciones?.fecha,
        tipo: fb.fumigaciones?.tipo,
        notas: fb.fumigaciones?.notas || '',
        productos: (fb.fumigaciones?.fumigacion_productos || []).map(fp => ({
          producto: fp.productos?.nombre || '',
          dosis: fp.dosis || '',
          unidad: fp.unidad || '',
        })),
      })),
    }
  }

  const generarAsistente = async () => {
    setAiError('')
    setAiLoading(true)
    const ecAgua = Number(String(form.ec_agua).replace(',', '.')) || 0
    const ecObjetivo = Number(String(form.ec_objetivo).replace(',', '.')) || 0
    const ecEstimada = ecObjetivo || (ecAgua ? ecAgua + 1.1 : 0)

    try {
      const contextoBloque = await cargarContextoBloqueIA()
      const respuesta = await fetch('/api/plan-nutricional-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campo: campoActivo?.nombre || '',
          bloque: bloqueActivo ? {
            codigo: bloqueActivo.codigo,
            cultivo: cultivoActivo,
          } : null,
          objetivo: form.objetivo,
          tanque_litros: form.tanque_litros,
          ec_agua: form.ec_agua,
          ec_objetivo: form.ec_objetivo,
          contexto_bloque: contextoBloque,
          perfil_cultivo: cultivoActivo ? `Cultivo seleccionado: ${cultivoActivo}. Ajustar la recomendacion a este cultivo, no usar receta generica.` : '',
          productos_ideales_base: recomendacionBase(form.objetivo, contextoBloque?.cultivo_activo || cultivoActivo),
          productos_disponibles: productos.map(p => ({
            nombre: p.nombre,
            unidad: p.unidad,
            stock_actual: p.stock_actual,
          })),
          registros_recientes: registros.map(r => ({
            fecha: r.fecha,
            objetivo: r.objetivo,
            bloque: r.bloques?.codigo || '',
            tanque_litros: r.tanque_litros,
            ec_final: r.ec_final,
            productos: r.productos || [],
          })),
        }),
      })
      const data = await respuesta.json()
      if (!respuesta.ok) throw new Error(data?.error || 'La IA no respondio correctamente.')

      const productosIA = aplicarProductosRecomendados(data.productos?.length ? data.productos : recomendacionBase(form.objetivo, contextoBloque?.cultivo_activo || cultivoActivo))
      setForm(f => ({
        ...f,
        productos: productosIA,
        ec_final: data.ec_final || (ecEstimada ? String(ecEstimada.toFixed(2)) : ''),
        notas: data.notas || `${guiaObjetivo(f.objetivo)} Recomendacion generada con IA. Revisar conductividad antes de aplicar.`,
      }))
      setModo('asistente')
    } catch (error) {
      const mensaje = error.message || 'No se pudo usar la IA.'
      setAiError(mensaje)
      generarAsistenteBase(`IA no disponible: ${mensaje}`)
    } finally {
      setAiLoading(false)
    }
  }

  const agregarProducto = () => {
    setForm(f => ({ ...f, productos: [...(f.productos || []), { producto_id:'', producto:'', cantidad:'', unidad:'g' }] }))
  }

  const actualizarProducto = (idx, patch) => {
    setForm(f => ({
      ...f,
      productos: f.productos.map((p, i) => i === idx ? { ...p, ...patch } : p),
    }))
  }

  const guardar = async () => {
    if (isGuest || !campoActivo?.id) return
    setSaving(true)
    const payload = {
      campo_id: campoActivo.id,
      bloque_id: form.bloque_id || null,
      fecha: form.fecha || today(),
      objetivo: form.objetivo,
      tanque_litros: Number(String(form.tanque_litros).replace(',', '.')) || null,
      ec_agua: Number(String(form.ec_agua).replace(',', '.')) || null,
      ec_objetivo: Number(String(form.ec_objetivo).replace(',', '.')) || null,
      ec_final: Number(String(form.ec_final).replace(',', '.')) || null,
      productos: form.productos || [],
      notas: form.notas || null,
      origen: modo === 'asistente' ? 'asistente' : 'manual',
    }
    await supabase.from('plan_nutricional_registros').insert(payload)
    setForm({ fecha: today(), bloque_id: '', objetivo: 'Produccion', tanque_litros: '200', ec_agua: '', ec_objetivo: '', ec_final: '', productos: [], notas: '' })
    setModo('manual')
    await cargarDatos()
    setSaving(false)
  }

  const copiarRegistro = (registro, aplicarHoy = false) => {
    setForm({
      fecha: aplicarHoy ? today() : (registro.fecha || today()),
      bloque_id: registro.bloque_id || '',
      objetivo: registro.objetivo || 'Produccion',
      tanque_litros: registro.tanque_litros ? String(registro.tanque_litros) : '200',
      ec_agua: registro.ec_agua ? String(registro.ec_agua) : '',
      ec_objetivo: registro.ec_objetivo ? String(registro.ec_objetivo) : '',
      ec_final: registro.ec_final ? String(registro.ec_final) : '',
      productos: aplicarProductosRecomendados(registro.productos || []),
      notas: aplicarHoy
        ? `Aplicacion repetida desde plan del ${registro.fecha || ''}. ${registro.notas || ''}`.trim()
        : (registro.notas || ''),
    })
    setModo(registro.origen === 'asistente' ? 'asistente' : 'manual')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const aplicarHoy = async (registro) => {
    if (isGuest || !campoActivo?.id) return
    setSaving(true)
    await supabase.from('plan_nutricional_registros').insert({
      campo_id: campoActivo.id,
      bloque_id: registro.bloque_id || null,
      fecha: today(),
      objetivo: registro.objetivo || 'Produccion',
      tanque_litros: registro.tanque_litros || null,
      ec_agua: registro.ec_agua || null,
      ec_objetivo: registro.ec_objetivo || null,
      ec_final: registro.ec_final || null,
      productos: registro.productos || [],
      notas: `Aplicado hoy repitiendo plan del ${registro.fecha || ''}. ${registro.notas || ''}`.trim(),
      origen: 'repetido',
    })
    await cargarDatos()
    setSaving(false)
  }

  const guardarReceta = () => {
    if (isGuest || !(form.productos || []).length) return
    const nombre = window.prompt('Nombre de la receta nutricional', `${form.objetivo} ${form.tanque_litros || 0}L`)
    if (!nombre) return
    const nueva = {
      id: Date.now(),
      nombre,
      objetivo: form.objetivo,
      tanque_litros: form.tanque_litros,
      ec_objetivo: form.ec_objetivo,
      productos: form.productos || [],
      notas: form.notas || '',
      creada_en: new Date().toISOString(),
    }
    const lista = [nueva, ...recetas].slice(0, 20)
    setRecetas(lista)
    window.localStorage.setItem(RECETAS_KEY, JSON.stringify(lista))
  }

  const aplicarReceta = (receta) => {
    setForm(f => ({
      ...f,
      objetivo: receta.objetivo || f.objetivo,
      tanque_litros: receta.tanque_litros || f.tanque_litros,
      ec_objetivo: receta.ec_objetivo || f.ec_objetivo,
      productos: aplicarProductosRecomendados(receta.productos || []),
      notas: receta.notas || f.notas,
    }))
    setModo('manual')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const eliminarReceta = (id) => {
    const lista = recetas.filter(r => r.id !== id)
    setRecetas(lista)
    window.localStorage.setItem(RECETAS_KEY, JSON.stringify(lista))
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f6f7f5', padding:'30px 28px 44px', color:'#101511' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:20, marginBottom:22 }}>
        <div>
          <div style={{ fontSize:12, color:'#687068', marginBottom:4 }}>Fertirriego y nutricion por cultivo</div>
          <h1 style={{ margin:0, fontSize:30, lineHeight:1.1, letterSpacing:-1 }}>Plan Nutricional</h1>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setModo('manual')} style={btn(modo === 'manual' ? '#212121' : '#fff', modo === 'manual' ? '#fff' : '#212121')}>Registro manual</button>
          <button onClick={generarAsistente} disabled={aiLoading} style={btn('#176a25', '#fff')}>{aiLoading ? 'Pensando...' : 'Asistente IA'}</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(150px, 1fr))', gap:14, marginBottom:18 }}>
        <Kpi label="EC agua base" value={form.ec_agua ? `${form.ec_agua} mS/cm` : '—'} icon="ti-droplet" />
        <Kpi label="EC objetivo" value={form.ec_objetivo ? `${form.ec_objetivo} mS/cm` : '—'} icon="ti-target" />
        <Kpi label="Registros" value={registros.length} icon="ti-clipboard-list" />
        <Kpi label="EC promedio" value={promedioEcFinal ? `${fmt(promedioEcFinal)} mS/cm` : '—'} icon="ti-chart-line" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, alignItems:'start' }}>
        <section style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h2 style={{ margin:0, fontSize:18 }}>Carga del plan</h2>
            <span style={{ fontSize:11, color:'#176a25', background:'#edf6ec', borderRadius:20, padding:'5px 9px' }}>{modo === 'asistente' ? 'Asistente IA' : 'Manual'}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Fecha" type="date" value={form.fecha} onChange={fecha => setForm(f => ({ ...f, fecha }))} />
            <Select label="Bloque" value={form.bloque_id} onChange={bloque_id => setForm(f => ({ ...f, bloque_id }))}>
              <option value="">Seleccionar bloque</option>
              {bloques.map(b => {
                const cultivo = b.plantaciones?.find(p => p.activa)?.cultivos?.nombre
                return <option key={b.id} value={b.id}>{b.codigo}{cultivo ? ` - ${cultivo}` : ''}</option>
              })}
            </Select>
            <Select label="Objetivo" value={form.objetivo} onChange={objetivo => setForm(f => ({ ...f, objetivo }))}>
              {objetivos.map(o => <option key={o} value={o}>{o}</option>)}
            </Select>
            <div style={{ gridColumn:'1 / -1', background:'#f7f8f6', border:'1px solid #edf0ed', borderRadius:14, padding:12, fontSize:12, lineHeight:1.45, color:'#4d544e' }}>
              {guiaObjetivo(form.objetivo)}
            </div>
            <Input label="Tanque (L)" value={form.tanque_litros} onChange={tanque_litros => setForm(f => ({ ...f, tanque_litros }))} />
            <Input label="EC agua base" value={form.ec_agua} onChange={ec_agua => setForm(f => ({ ...f, ec_agua }))} />
            <Input label="EC objetivo" value={form.ec_objetivo} onChange={ec_objetivo => setForm(f => ({ ...f, ec_objetivo }))} />
            <Input label="EC final / estimada" value={form.ec_final} onChange={ec_final => setForm(f => ({ ...f, ec_final }))} />
          </div>
          <div style={{ marginTop:12, background:estadoEc.bg, color:estadoEc.color, border:'1px solid rgba(0,0,0,0.06)', borderRadius:14, padding:12, fontSize:12, fontWeight:800 }}>
            {estadoEc.label}
          </div>
          {bloqueActivo && (
            <div style={{ marginTop:12, background:'#f7f8f6', border:'1px solid #edf0ed', borderRadius:14, padding:12, fontSize:12, color:'#4d544e' }}>
              Bloque seleccionado: <strong>{bloqueActivo.codigo}</strong>
            </div>
          )}

          <div style={{ marginTop:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <strong style={{ fontSize:13 }}>Productos y dosis</strong>
              <button onClick={agregarProducto} style={smallBtn}>+ Producto</button>
            </div>
            {(form.productos || []).length === 0 ? (
              <div style={{ color:'#8b928b', fontSize:13, background:'#f7f8f6', borderRadius:14, padding:14 }}>Sin productos cargados.</div>
            ) : form.productos.map((p, idx) => (
              <div key={idx} style={{ marginBottom:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1.5fr 80px 80px', gap:8, marginBottom:6 }}>
                  <select value={p.producto_id || ''} onChange={e => {
                    const prod = productos.find(x => x.id === e.target.value)
                    actualizarProducto(idx, {
                      producto_id:e.target.value,
                      producto: p.producto || prod?.nombre || '',
                      producto_inventario: prod?.nombre || '',
                      stock_actual: prod?.stock_actual ?? null,
                      estado: estadoInventario(prod).key,
                    })
                  }} style={field}>
                    <option value="">{p.producto || 'Producto recomendado'}</option>
                    {productos.map(prod => <option key={prod.id} value={prod.id}>{prod.nombre}</option>)}
                  </select>
                  <input value={p.cantidad || ''} onChange={e => actualizarProducto(idx, { cantidad:e.target.value })} placeholder="Cant." style={field} />
                  <input value={p.unidad || ''} onChange={e => actualizarProducto(idx, { unidad:e.target.value })} placeholder="Unidad" style={field} />
                </div>
                {p.producto && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'0 2px' }}>
                    <span style={{ fontSize:11, color:'#69706a' }}>
                      Recomendado: <strong>{p.producto}</strong>{p.producto_inventario ? ` · Inventario: ${p.producto_inventario}` : ''}
                    </span>
                    <EstadoBadge estado={p.estado} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas:e.target.value }))} placeholder="Notas, advertencias o instrucciones..." style={{ ...field, width:'100%', minHeight:80, resize:'vertical', marginTop:10 }} />
          {aiError && (
            <div style={{ marginTop:10, background:'#fff7e8', border:'1px solid #f1d7a7', color:'#855a10', borderRadius:12, padding:10, fontSize:12 }}>
              IA no disponible. Se uso la guia base para no dejarte sin recomendacion.
            </div>
          )}
          {!isGuest && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
              <button onClick={guardarReceta} disabled={saving || !(form.productos || []).length} style={{ ...btn('#fff', '#212121'), width:'100%' }}>Guardar receta</button>
              <button onClick={guardar} disabled={saving} style={{ ...btn('#212121', '#fff'), width:'100%' }}>{saving ? 'Guardando...' : 'Guardar plan'}</button>
            </div>
          )}
        </section>

        <section style={panel}>
          <h2 style={{ margin:'0 0 14px', fontSize:18 }}>Plan sugerido</h2>
          <div style={{ background:'#0f1410', color:'#fff', borderRadius:18, padding:18, marginBottom:14 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.62)', marginBottom:6 }}>Resumen</div>
            <div style={{ fontSize:20, fontWeight:900 }}>{form.objetivo} {bloqueActivo ? `- ${bloqueActivo.codigo}` : ''}</div>
            <div style={{ color:'rgba(255,255,255,0.72)', fontSize:13, marginTop:6 }}>Tanque {form.tanque_litros || 0} L · EC estimada {form.ec_final || '—'} mS/cm</div>
          </div>
          {(form.productos || []).map((p, idx) => (
            <div key={idx} style={{ borderBottom:'1px solid #eef0ee', padding:'10px 0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:13, fontWeight:750 }}>{p.producto || 'Producto sin definir'}</span>
                <strong style={{ fontSize:13 }}>{p.cantidad || 0} {p.unidad || ''}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginTop:6, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#69706a' }}>{p.nutrientes || p.motivo || 'Recomendacion nutricional'}</span>
                <EstadoBadge estado={p.estado} />
              </div>
              {p.producto_inventario && <div style={{ fontSize:11, color:'#8b928b', marginTop:4 }}>Coincide con inventario: {p.producto_inventario}</div>}
            </div>
          ))}
          <div style={{ marginTop:14, background:'#fff7e8', border:'1px solid #f1d7a7', color:'#855a10', borderRadius:14, padding:12, fontSize:12 }}>
            Revisar conductividad antes de aplicar. La recomendacion queda editable antes de guardar.
          </div>
        </section>
      </div>

      <section style={{ ...panel, marginTop:18 }}>
        <h2 style={{ margin:'0 0 14px', fontSize:18 }}>Recetas guardadas</h2>
        {recetas.length === 0 ? (
          <div style={{ color:'#8b928b', fontSize:13, padding:'10px 0' }}>Sin recetas guardadas en este dispositivo.</div>
        ) : recetas.map(receta => (
          <div key={receta.id} style={{ display:'grid', gridTemplateColumns:'1fr 110px 150px', gap:12, alignItems:'center', borderBottom:'1px solid #eef0ee', padding:'11px 0' }}>
            <span>
              <strong style={{ display:'block', fontSize:13 }}>{receta.nombre}</strong>
              <span style={{ display:'block', fontSize:11, color:'#69706a', marginTop:3 }}>{receta.objetivo} - tanque {receta.tanque_litros || '-'} L - {receta.productos?.length || 0} productos</span>
            </span>
            <span style={{ fontSize:12, color:'#69706a' }}>{receta.ec_objetivo ? `${receta.ec_objetivo} EC` : 'Sin EC'}</span>
            {!isGuest && (
              <span style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                <button onClick={() => aplicarReceta(receta)} style={miniAction}>Usar</button>
                <button onClick={() => eliminarReceta(receta.id)} style={{ ...miniAction, color:'#c84040' }}>Borrar</button>
              </span>
            )}
          </div>
        ))}
      </section>

      <section style={{ ...panel, marginTop:18 }}>
        <h2 style={{ margin:'0 0 14px', fontSize:18 }}>Aplicaciones recientes</h2>
        {registros.length === 0 ? (
          <div style={{ color:'#8b928b', fontSize:13, padding:'10px 0' }}>Sin registros de plan nutricional.</div>
        ) : registros.map(r => (
          <div key={r.id} style={{ display:'grid', gridTemplateColumns:'110px 1fr 90px 90px 180px', gap:12, alignItems:'center', borderBottom:'1px solid #eef0ee', padding:'11px 0' }}>
            <span style={{ fontSize:12, color:'#69706a' }}>{r.fecha}</span>
            <strong style={{ fontSize:13 }}>{r.bloques?.codigo || 'Sin bloque'} · {r.objetivo}</strong>
            <span style={{ fontSize:12, color:'#69706a' }}>{r.tanque_litros || '-'} L</span>
            <span style={{ fontSize:12, fontWeight:800, color:'#176a25' }}>{r.ec_final ? `${r.ec_final} EC` : '-'}</span>
            {!isGuest && (
              <span style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                <button onClick={() => copiarRegistro(r)} style={miniAction}>Copiar</button>
                <button onClick={() => aplicarHoy(r)} disabled={saving} style={{ ...miniAction, background:'#176a25', color:'#fff', borderColor:'#176a25' }}>Aplicar hoy</button>
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}

const panel = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:18,
  padding:22,
  boxShadow:'0 16px 34px rgba(29, 38, 29, 0.06)',
}

const field = {
  border:'1px solid #e1e6e1',
  borderRadius:12,
  background:'#fff',
  padding:'11px 12px',
  fontSize:13,
  color:'#101511',
  outline:'none',
}

const btn = (bg, color) => ({
  border:'1px solid #dfe5df',
  background:bg,
  color,
  borderRadius:12,
  padding:'11px 15px',
  fontSize:13,
  fontWeight:850,
  cursor:'pointer',
})

const smallBtn = {
  border:'none',
  background:'#edf6ec',
  color:'#176a25',
  borderRadius:10,
  padding:'7px 10px',
  fontSize:12,
  fontWeight:800,
  cursor:'pointer',
}

const miniAction = {
  border:'1px solid #dfe5df',
  background:'#fff',
  color:'#1d241f',
  borderRadius:10,
  padding:'7px 9px',
  fontSize:11,
  fontWeight:800,
  cursor:'pointer',
}

function Kpi({ label, value, icon }) {
  return (
    <div style={{ ...panel, minHeight:92, padding:16, display:'grid', gridTemplateColumns:'44px 1fr', gap:12, alignItems:'center' }}>
      <span style={{ width:44, height:44, borderRadius:14, background:'#edf6ec', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <i className={`ti ${icon}`} style={{ fontSize:23, color:'#176a25' }} aria-hidden="true"></i>
      </span>
      <span>
        <span style={{ display:'block', fontSize:11, textTransform:'uppercase', color:'#69706a' }}>{label}</span>
        <strong style={{ display:'block', fontSize:19, marginTop:4 }}>{value}</strong>
      </span>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label style={{ display:'grid', gap:5 }}>
      <span style={{ fontSize:11, color:'#69706a', textTransform:'uppercase', fontWeight:750 }}>{label}</span>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} style={field} />
    </label>
  )
}

function Select({ label, value, onChange, children }) {
  return (
    <label style={{ display:'grid', gap:5 }}>
      <span style={{ fontSize:11, color:'#69706a', textTransform:'uppercase', fontWeight:750 }}>{label}</span>
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={field}>{children}</select>
    </label>
  )
}

function EstadoBadge({ estado }) {
  const info = estado === 'disponible'
    ? { label:'Disponible', color:'#176a25', bg:'#edf6ec' }
    : estado === 'sin_stock'
      ? { label:'Sin stock', color:'#c84040', bg:'#fff0f0' }
      : { label:'No cargado', color:'#8a5a00', bg:'#fff7e8' }
  return (
    <span style={{ flexShrink:0, borderRadius:999, padding:'4px 8px', background:info.bg, color:info.color, fontSize:10, fontWeight:850 }}>
      {info.label}
    </span>
  )
}
