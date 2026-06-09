import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DesktopDashboard from './DesktopDashboard'
import { filterTabsByRole } from '../lib/permissions'

const CAMPO_STORAGE_KEY = 'agrobloque-campo-activo'
const fmtGs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const COSTO_MANUAL_LABELS = {
  insumos: { label: 'Insumos', color: '#2563eb' },
  combustible: { label: 'Combustible', color: '#d9841f' },
  herramientas: { label: 'Herramientas', color: '#6f7770' },
  electricidad: { label: 'Electricidad', color: '#0284c7' },
  gastos_administrativos: { label: 'Administracion', color: '#8e44ad' },
  otro: { label: 'Otros gastos', color: '#64748b' },
}

const normalizarTipoCosto = (valor = '') => String(valor || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

const completarCategoriasCostos = (totalCostos, categorias) => {
  const base = (categorias || [])
    .filter(c => Number(c.value) > 0)
    .map(c => ({ ...c, value: Number(c.value) || 0 }))
  const suma = base.reduce((s, c) => s + c.value, 0)
  const diferencia = Math.max(0, (Number(totalCostos) || 0) - suma)
  const completas = diferencia > 0
    ? [...base, { label: 'Otros costos', value: diferencia, color: '#8a948b' }]
    : base

  return completas.sort((a, b) => b.value - a.value)
}

const crearGradienteCostos = (categorias, total) => {
  if (!categorias.length || total <= 0) return '#e3e8e1'
  let acumulado = 0
  const partes = categorias.map(c => {
    const inicio = (acumulado / total) * 100
    acumulado += Number(c.value) || 0
    const fin = (acumulado / total) * 100
    return `${c.color} ${inicio}% ${fin}%`
  })
  return `conic-gradient(${partes.join(', ')})`
}

const sumarCategoria = (grupos, key, label, value, color) => {
  const monto = Number(value) || 0
  if (monto <= 0) return
  if (!grupos[key]) grupos[key] = { label, value: 0, color }
  grupos[key].value += monto
}

function LogoHS({ size = 56 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.22)',
      background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      boxShadow: '0 14px 34px rgba(0,0,0,0.35)',
      flexShrink: 0,
    }}>
      <span style={{
        color: '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 900,
        letterSpacing: -2,
        lineHeight: 1,
        fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif",
      }}>HS</span>
    </div>
  )
}

function WatermarkHS({ compact }) {
  const width = compact ? 180 : 230
  const height = compact ? 150 : 190

  return (
    <svg
      viewBox="0 0 260 220"
      width={width}
      height={height}
      style={{
        position: 'absolute',
        right: compact ? 8 : 22,
        top: compact ? 54 : 58,
        opacity: 0.16,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <text x="10" y="170" fontFamily="Georgia, 'Times New Roman', serif" fontSize="132" fontWeight="800" fill="#fff" letterSpacing="-9">HS</text>
      <path d="M145 69c10-22 19-35 27-51 16 25 16 48-1 72-10 14-21 23-32 30 0-18 0-34 6-51z" fill="#fff"/>
      <path d="M119 86c-23-4-39-12-52-29 31-1 53 10 66 33 7 12 10 24 10 36-11-13-17-27-24-40z" fill="#fff"/>
      <path d="M187 91c18-19 39-27 66-25-8 28-26 45-53 52-15 4-29 4-42 1 9-8 18-16 29-28z" fill="#fff"/>
      <path d="M165 114c17-30 39-46 70-51-4 34-22 59-53 73-19 8-37 11-55 9 14-8 26-18 38-31z" fill="#fff"/>
      <path d="M214 146c30-17 58-25 84-23-25 20-51 34-82 43-22 6-43 9-63 8 20-7 40-16 61-28z" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"/>
      <path d="M222 174c24-13 49-20 74-21-23 19-47 32-75 40-17 5-34 7-50 7 16-6 33-14 51-26z" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  )
}

function useViewportWidth() {
  const [width, setWidth] = useState(typeof window === 'undefined' ? 480 : window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

function ViveroIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21V10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12C8.2 12 5.4 9.7 4.5 6.2C8.2 6 11.1 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12C15.8 12 18.6 9.7 19.5 6.2C15.8 6 12.9 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 21H17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function DashboardIcon({ icon, size, color }) {
  if (['vivero-icon', 'agro-vivero', 'ti-leaf', 'ti-seeding', 'ti-plant-2'].includes(icon)) {
    return <ViveroIcon size={size} color={color} />
  }
  return <i className={`ti ${icon}`} style={{ fontSize: size, color }} aria-hidden="true"></i>
}

const accesos = [
  { icon: 'ti-map', label: 'Mapa', sub: 'Ver bloques', path: '/mapa', green: true },
  { icon: 'ti-calendar', label: 'Agenda', sub: 'Tareas', path: '/agenda', green: true },
  { icon: 'vivero-icon', label: 'Vivero', sub: 'Plantines', path: '/vivero', green: true },
  { icon: 'ti-timeline', label: 'Historial', sub: 'Trazabilidad', path: '/historial', green: true },
  { icon: 'ti-users', label: 'Asistencia', sub: 'Planilla', path: '/asistencia' },
  { icon: 'ti-chart-bar', label: 'Reportes', sub: 'Rentabilidad', path: '/reportes' },
  { icon: 'ti-spray', label: 'Fumigaciones', sub: 'Historial', path: '/fumigaciones', green: true },
  { icon: 'ti-plant', label: 'Plan Nutricional', sub: 'Fertirriego', path: '/plan-nutricional', green: true },
  { icon: 'ti-box', label: 'Inventario', sub: 'Stock', path: '/inventario' },
  { icon: 'ti-cut', label: 'Cosecha', sub: 'Produccion', path: '/cosecha' },
  { icon: 'ti-coin', label: 'Costos', sub: 'Gastos', path: '/costos' },
  { icon: 'ti-calculator', label: 'Contabilidad', sub: 'Balance', path: '/contabilidad' },
]

const operacionesFrecuentes = [
  { icon: 'vivero-icon', label: 'Vivero', path: '/vivero' },
  { icon: 'ti-spray', label: 'Fumigar', path: '/fumigaciones' },
  { icon: 'ti-cut', label: 'Cosecha', path: '/cosecha' },
  { icon: 'ti-box', label: 'Inventario', path: '/inventario' },
]

const fondo = {
  minHeight: '100vh',
  background: `
    radial-gradient(circle at 20% 0%, rgba(74,124,50,0.22), transparent 28%),
    radial-gradient(circle at 90% 30%, rgba(200,170,95,0.14), transparent 30%),
    linear-gradient(180deg, #090b0a 0%, #111310 48%, #090a09 100%)
  `,
  color: '#fff',
}

const cardBlanca = {
  background: 'linear-gradient(145deg, #ffffff, #f5f5f3)',
  border: '1px solid rgba(255,255,255,0.82)',
  boxShadow: '0 18px 35px rgba(0,0,0,0.22)',
}

const elegirCampoConDatos = (campos, bloques = [], guardado) => {
  if (!campos || campos.length === 0) return null
  const conteo = bloques.reduce((acc, b) => {
    if (b.campo_id) acc[b.campo_id] = (acc[b.campo_id] || 0) + 1
    return acc
  }, {})
  const campoGuardado = campos.find(c => c.id === guardado)
  const campoConMasBloques = campos.reduce((mejor, campo) => {
    return (conteo[campo.id] || 0) > (conteo[mejor.id] || 0) ? campo : mejor
  }, campos[0])
  const hayCampoConDatos = (conteo[campoConMasBloques.id] || 0) > 0

  if (campoGuardado && (!hayCampoConDatos || (conteo[campoGuardado.id] || 0) > 0)) {
    return campoGuardado
  }

  return campoConMasBloques
}

export default function Dashboard({ campoActivo, setCampoActivo, isGuest = false, role }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques: 0, activos: 0, cultivos: 0, operarios: 0 })
  const [alertas, setAlertas] = useState([])
  const [mobileData, setMobileData] = useState({
    productos: 0,
    costos: 0,
    costosCategorias: [],
    produccion: [],
    actividades: [],
  })
  const [loading, setLoading] = useState(true)
  const viewportWidth = useViewportWidth()
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]
  const compacto = viewportWidth < 520
  const muyChico = viewportWidth < 375
  const usarDashboardEscritorio = viewportWidth >= 1100

  const cargarStats = async (campo) => {
    if (!campo?.id) return
    setLoading(true)
    const mesDesde = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    const { data: bloques } = await supabase
      .from('bloques')
      .select('id, activo')
      .eq('campo_id', campo.id)

    const bloqueIds = (bloques || []).map(b => b.id)
    const plantacionesQuery = bloqueIds.length > 0
      ? supabase.from('plantaciones').select('id, bloque_id, densidad_plantas_m2, cultivos(nombre)').eq('activa', true).in('bloque_id', bloqueIds)
      : Promise.resolve({ data: [] })

    const operariosQuery = isGuest
      ? Promise.resolve({ data: [] })
      : supabase.from('operarios').select('id').eq('campo_id', campo.id)

    const [
      { data: plantas },
      { data: ops },
      { data: tareas },
      { data: productos },
      { data: cosechas },
      { data: costosManuales },
      { data: asistencia },
      { data: fumigaciones },
    ] = await Promise.all([
      plantacionesQuery,
      operariosQuery,
      supabase
        .from('tareas')
        .select('*, campos(nombre), bloques(codigo)')
        .eq('campo_id', campo.id)
        .eq('completada', false)
        .lte('fecha_programada', hoy)
        .order('fecha_programada'),
      supabase.from('productos').select('id').eq('activo', true),
      bloqueIds.length > 0
        ? supabase.from('cosechas').select('id, fecha, kg_total, precio_kg, bloques(codigo), cultivos(nombre)').in('bloque_id', bloqueIds).order('fecha', { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
      supabase.from('costos').select('id, tipo, descripcion, concepto, monto, fecha').eq('campo_id', campo.id).gte('fecha', mesDesde).order('fecha', { ascending: false }),
      isGuest
        ? Promise.resolve({ data: [] })
        : supabase.from('asistencia').select('monto, fecha, operarios(campo_id, nombre)').gte('fecha', mesDesde),
      supabase
        .from('fumigaciones')
        .select('id, fecha, tipo, operario, bloques(codigo), fumigacion_productos(dosis, descuento_stock, productos(nombre, precio_unitario))')
        .eq('campo_id', campo.id)
        .gte('fecha', mesDesde)
        .order('fecha', { ascending: false }),
    ])

    const manual = (costosManuales || []).reduce((s, c) => s + (Number(c.monto) || 0), 0)
    const jornales = (asistencia || [])
      .filter(a => a.operarios?.campo_id === campo.id)
      .reduce((s, a) => s + (Number(a.monto) || 0), 0)
    const agroquimicos = (fumigaciones || []).reduce((total, f) => {
      return total + (f.fumigacion_productos || []).reduce((s, fp) => {
        return s + (Number(fp.productos?.precio_unitario) || 0) * (Number(fp.descuento_stock ?? parseFloat(fp.dosis)) || 0)
      }, 0)
    }, 0)
    const totalCostos = manual + jornales + agroquimicos
    const costosCategoriasBase = [
      { label: 'Jornales', value: jornales, color: '#176a25' },
      { label: 'Agroquimicos', value: agroquimicos, color: '#d9841f' },
      ...agruparCostosManualesDashboard(costosManuales || []),
    ]
    const costosCategorias = completarCategoriasCostos(totalCostos, costosCategoriasBase)

    setStats({
      bloques: bloques?.length || 0,
      activos: bloques?.filter(b => b.activo).length || 0,
      cultivos: plantas?.length || 0,
      operarios: ops?.length || 0,
    })
    setAlertas(tareas || [])
    setMobileData({
      productos: productos?.length || 0,
      costos: totalCostos,
      costosCategorias,
      produccion: agruparProduccionMovil(plantas || []),
      actividades: construirActividadesMovil({ tareas: tareas || [], cosechas: cosechas || [], costos: costosManuales || [], fumigaciones: fumigaciones || [] }),
    })
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const [{ data }, { data: bloques }] = await Promise.all([
        supabase.from('campos').select('*').order('nombre'),
        supabase.from('bloques').select('campo_id'),
      ])
      if (!data || data.length === 0) {
        setLoading(false)
        return
      }

      setCampos(data)
      const guardado = typeof window !== 'undefined'
        ? window.localStorage.getItem(CAMPO_STORAGE_KEY)
        : null
      const campo = campoActivo || elegirCampoConDatos(data, bloques || [], guardado)
      if (!campoActivo) setCampoActivo(campo)
      await cargarStats(campo)
    }

    init()
  }, [])

  useEffect(() => {
    if (campoActivo) cargarStats(campoActivo)
  }, [campoActivo])

  const seleccionarCampo = (campo) => {
    setCampoActivo(campo)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CAMPO_STORAGE_KEY, campo.id)
    }
  }

  if (usarDashboardEscritorio) {
    return <DesktopDashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo} isGuest={isGuest} role={role} />
  }

  const operacionesVisibles = filterTabsByRole(operacionesFrecuentes, role, isGuest)

  return (
    <div style={{ minHeight: '100vh', background: '#d7dcd4', color: '#111611' }}>
      <div style={{ background: '#0e130f', padding: '18px 14px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compacto ? 12 : 16 }}>
            <LogoHS size={46} />
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.62)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 }}>
                Horticultura
              </div>
              <div style={{ fontSize: 20, color: '#fff', fontWeight: 850, letterSpacing: -0.7, lineHeight: 1.05 }}>
                El Sembrador
              </div>
            </div>
          </div>

          <button onClick={() => navigate('/agenda')} style={{
            width: 38,
            height: 38,
            borderRadius: 13,
            border: 'none',
            background: '#181e19',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            cursor: 'pointer',
          }} aria-label="Abrir agenda">
            <i className="ti ti-bell" style={{ fontSize: 23, color: '#fff' }} aria-hidden="true"></i>
            <span style={{
              position: 'absolute',
              top: 7,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: alertas.length > 0 ? '#7bc043' : 'rgba(123,192,67,0.45)',
            }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(campos.length, 1)}, minmax(0, 1fr))`, gap: 6, padding: 5, borderRadius: 14, background: '#181e19' }}>
          {campos.length === 0 ? (
            <div style={{ padding: 14, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Sin campos</div>
          ) : campos.map(campo => {
            const activo = campoActivo?.id === campo.id
            return (
              <button key={campo.id} onClick={() => seleccionarCampo(campo)} style={{
                minHeight: 36,
                borderRadius: 11,
                border: 'none',
                background: activo ? '#050706' : 'rgba(255,255,255,0.03)',
                color: activo ? '#fff' : 'rgba(255,255,255,0.72)',
                fontSize: 13,
                fontWeight: activo ? 800 : 500,
                cursor: 'pointer',
                boxShadow: activo ? '0 14px 24px rgba(0,0,0,0.32)' : 'none',
              }}>
                {campo.nombre}
              </button>
            )
          })}
        </div>
      </div>

      <main style={{ padding: '14px 14px 84px', marginTop: -12 }}>
        <button onClick={() => navigate('/mapa')} style={{ ...buttonReset, ...mobileCard, width:'100%', textAlign:'left' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={mobileEyebrow}>Estado general</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                <strong style={{ fontSize:38, lineHeight:1, letterSpacing:-1.8 }}>{loading ? '-' : stats.activos}</strong>
                <span style={{ fontSize:15, fontWeight:800 }}>bloques activos</span>
              </div>
              <div style={mobileMuted}>de {stats.bloques} totales</div>
            </div>
            <div onClick={(e) => { e.stopPropagation(); navigate('/alertas') }} style={{ background:'#edf5ec', borderRadius:14, padding:'10px 12px', minWidth:80 }}>
              <div style={mobileEyebrow}>Alertas</div>
              <strong style={{ display:'block', fontSize:24, color:'#176a25', lineHeight:1.1 }}>{alertas.length}</strong>
              <span style={{ fontSize:10, color:'#68716a' }}>{alertas.length ? 'pendientes' : 'sin alertas'}</span>
            </div>
          </div>
        </button>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10, marginTop:12 }}>
          <MetricCard title="Cultivos" value={stats.cultivos} sub="plantaciones" onClick={() => navigate('/mapa')} />
          <MetricCard title={isGuest ? 'Acceso' : 'Operarios'} value={isGuest ? 'Ver' : stats.operarios} sub={isGuest ? 'invitado' : 'activos'} onClick={() => navigate(isGuest ? '/mapa' : '/asistencia')} />
          <MetricCard title="Stock" value={mobileData.productos} sub="productos" onClick={() => navigate('/inventario')} />
        </div>

        <section style={{ ...mobileCard, marginTop:12, padding:14 }}>
          <div style={sectionHeader}>
            <h2 style={sectionTitle}>Operacion de hoy</h2>
            <button onClick={() => navigate('/agenda')} style={textButton}>Ver agenda</button>
          </div>
          <div style={{ display:'grid', gap:8 }}>
            {mobileData.actividades.length === 0 ? (
              <div style={{ color:'#737b74', fontSize:12, padding:'16px 0', textAlign:'center' }}>Sin movimientos recientes ni tareas pendientes.</div>
            ) : mobileData.actividades.slice(0, 2).map(item => (
              <ActivityRow key={item.id} item={item} onClick={() => navigate(item.path)} />
            ))}
          </div>
        </section>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
          <ResumenFinancieroMini onClick={() => navigate('/reportes')} />
          <ProduccionMini produccion={mobileData.produccion} onClick={() => navigate('/mapa')} />
        </div>

        <section style={{ ...mobileCard, marginTop:12, padding:14 }}>
          <h2 style={{ ...sectionTitle, marginBottom:10 }}>Operaciones frecuentes</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:8 }}>
            {operacionesVisibles.map(item => (
              <button key={item.path} onClick={() => navigate(item.path)} style={operationButton}>
                <DashboardIcon icon={item.icon} size={17} color="#176a25" />
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function agruparProduccionMovil(plantas) {
  const mapa = {}
  plantas.forEach(p => {
    const nombre = p.cultivos?.nombre || 'Sin cultivo'
    if (!mapa[nombre]) mapa[nombre] = { nombre, plantaciones: 0, bloques: new Set() }
    mapa[nombre].plantaciones += 1
    if (p.bloque_id) mapa[nombre].bloques.add(p.bloque_id)
  })
  return Object.values(mapa)
    .map(c => ({ ...c, bloques: c.bloques.size }))
    .sort((a, b) => b.plantaciones - a.plantaciones)
    .slice(0, 3)
}

function agruparCostosManualesDashboard(costos) {
  const grupos = {}
  ;(costos || []).forEach(costo => {
    const key = COSTO_MANUAL_LABELS[normalizarTipoCosto(costo.tipo)]
      ? normalizarTipoCosto(costo.tipo)
      : 'otro'
    const meta = COSTO_MANUAL_LABELS[key] || COSTO_MANUAL_LABELS.otro
    sumarCategoria(grupos, `manual-${key}`, meta.label, costo.monto, meta.color)
  })
  return Object.values(grupos)
}

function construirActividadesMovil({ tareas, cosechas, costos, fumigaciones }) {
  const lista = [
    ...(tareas || []).map(t => ({
      id: `tarea-${t.id}`,
      title: t.descripcion || 'Tarea pendiente',
      sub: `${t.bloques?.codigo ? `Bloque ${t.bloques.codigo} · ` : ''}${t.fecha_programada || ''}`,
      badge: 'Agenda',
      iconBg: '#eef7ee',
      path: '/agenda',
      fecha: t.fecha_programada || '',
    })),
    ...(cosechas || []).map(c => ({
      id: `cosecha-${c.id}`,
      title: `Cosecha ${c.bloques?.codigo || ''}`.trim(),
      sub: `${fmtNum(c.kg_total)} kg · ${fmtGs((Number(c.kg_total) || 0) * (Number(c.precio_kg) || 0))}`,
      badge: 'Venta',
      iconBg: '#fff3e3',
      path: '/cosecha',
      fecha: c.fecha || '',
    })),
    ...(fumigaciones || []).map(f => ({
      id: `fumigacion-${f.id}`,
      title: f.tipo || 'Fumigacion',
      sub: `${f.bloques?.map?.(b => b.codigo).filter(Boolean).join(', ') || 'Bloques'}${f.operario ? ` · ${f.operario}` : ''}`,
      badge: 'Hecha',
      iconBg: '#eef7ee',
      path: '/fumigaciones',
      fecha: f.fecha || '',
    })),
    ...(costos || []).map(c => ({
      id: `costo-${c.id}`,
      title: c.descripcion || c.concepto || 'Gasto registrado',
      sub: fmtGs(c.monto),
      badge: 'Costo',
      iconBg: '#fff3e3',
      path: '/costos',
      fecha: c.fecha || '',
    })),
  ]

  return lista
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, 4)
}

const mobileCard = {
  background: '#fff',
  border: '1px solid rgba(255,255,255,0.78)',
  borderRadius: 20,
  boxShadow: '0 12px 26px rgba(30,38,31,0.08)',
  padding: 16,
}

const mobileEyebrow = {
  color: '#68716a',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
}

const mobileMuted = {
  color: '#737b74',
  fontSize: 11,
  marginTop: 4,
}

const sectionHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 10,
}

const sectionTitle = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.1,
  letterSpacing: -0.4,
  fontWeight: 850,
}

const textButton = {
  border: 'none',
  background: 'transparent',
  color: '#176a25',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
  padding: 0,
}

const operationButton = {
  border: 'none',
  background: '#eef7ee',
  borderRadius: 10,
  minHeight: 34,
  padding: '5px 6px',
  display: 'grid',
  placeItems: 'center',
  gap: 2,
  color: '#111611',
  fontSize: 9.5,
  fontWeight: 850,
  cursor: 'pointer',
  minWidth: 0,
}

const buttonReset = {
  border: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  boxSizing: 'border-box',
}

function MetricCard({ title, value, sub, onClick }) {
  return (
    <button onClick={onClick} style={{ ...buttonReset, ...mobileCard, minHeight: 78, padding: '13px 14px', boxSizing: 'border-box', textAlign:'left' }}>
      <div style={mobileEyebrow}>{title}</div>
      <strong style={{ display:'block', fontSize:27, lineHeight:1, letterSpacing:-0.8 }}>{value}</strong>
      <div style={mobileMuted}>{sub}</div>
    </button>
  )
}

function ActivityRow({ item, onClick }) {
  return (
    <button onClick={onClick} style={{
      border: 'none',
      background: '#fafbf8',
      borderRadius: 14,
      minHeight: 48,
      padding: '8px 10px',
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr) 46px',
      gap: 10,
      alignItems: 'center',
      textAlign: 'left',
      cursor: 'pointer',
    }}>
      <span style={{ width:28, height:28, borderRadius:10, background:item.iconBg, display:'block' }} />
      <span style={{ minWidth:0 }}>
        <strong style={{ display:'block', fontSize:13, lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.title}</strong>
        <span style={{ display:'block', color:'#737b74', fontSize:10.5, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.sub}</span>
      </span>
      <span style={{ justifySelf:'end', background:'#e8f5e5', color:'#176a25', borderRadius:8, padding:'4px 7px', fontSize:9, fontWeight:800 }}>
        {item.badge}
      </span>
    </button>
  )
}

function ResumenFinancieroMini({ onClick }) {
  return (
    <button onClick={onClick} style={{ ...buttonReset, ...mobileCard, padding:14, minHeight:146, textAlign:'left', width:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
      <h2 style={{ ...sectionTitle, fontSize:16 }}>Resumen financiero</h2>
      <div>
        <strong style={{ display:'block', fontSize:20, lineHeight:1.05, marginTop:4, letterSpacing:-0.5 }}>Ingresos, costos y margen</strong>
        <div style={{ color:'#737b74', fontSize:11, lineHeight:1.25, marginTop:8 }}>
          Tocá para ver jornales, insumos y gastos cargados.
        </div>
      </div>
      <span style={{ alignSelf:'flex-start', marginTop:12, background:'#eef7ee', color:'#176a25', borderRadius:10, padding:'7px 10px', fontSize:10.5, fontWeight:850 }}>
        Ver reporte
      </span>
    </button>
  )
}

function ProduccionMini({ produccion, onClick }) {
  const max = Math.max(...(produccion || []).map(p => p.plantaciones), 1)
  return (
    <button onClick={onClick} style={{ ...buttonReset, ...mobileCard, padding:14, minHeight:146, textAlign:'left', width:'100%' }}>
      <h2 style={{ ...sectionTitle, fontSize:16, marginBottom:14 }}>Produccion</h2>
      <div style={{ display:'grid', gap:11 }}>
        {(produccion.length ? produccion : [{ nombre:'Sin cultivo', plantaciones:0, bloques:0 }]).slice(0, 3).map((p, i) => {
          const colors = ['#176a25', '#c7352d', '#cb7a35']
          const width = p.plantaciones > 0 ? Math.max(20, (p.plantaciones / max) * 100) : 0
          return (
            <div key={p.nombre}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:6, fontSize:10.5, marginBottom:5 }}>
                <strong style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre}</strong>
                <span style={{ color:'#737b74', flexShrink:0 }}>{p.bloques} bl.</span>
              </div>
              <div style={{ height:6, borderRadius:8, background:'#dde5dc', overflow:'hidden' }}>
                <div style={{ width:`${width}%`, height:'100%', background:colors[i] || '#176a25', borderRadius:8 }} />
              </div>
            </div>
          )
        })}
      </div>
    </button>
  )
}

function MiniStat({ icon, label, value, compact }) {
  return (
    <div style={{
      padding: compact ? '0 7px' : '0 18px',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 9, color: '#fff', marginBottom: compact ? 8 : 13 }}>
        <i className={`ti ${icon}`} style={{ color: '#7bc043', fontSize: compact ? 19 : 27, flexShrink: 0 }} aria-hidden="true"></i>
        <span style={{ fontSize: compact ? 11.5 : 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div style={{ fontSize: compact ? 25 : 34, color: '#fff', fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  )
}
