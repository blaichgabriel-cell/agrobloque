import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CAMPO_STORAGE_KEY = 'agrobloque-campo-activo'

const fmtGs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`
const fmtNumber = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

const quickLinks = [
  { path: '/mapa', icon: 'ti-map', title: 'Mapa', sub: 'Ver bloques' },
  { path: '/agenda', icon: 'ti-calendar', title: 'Agenda', sub: 'Tareas' },
  { path: '/vivero', icon: 'ti-plant-2', title: 'Vivero', sub: 'Plantines' },
  { path: '/asistencia', icon: 'ti-users', title: 'Asistencia', sub: 'Planilla' },
  { path: '/reportes', icon: 'ti-chart-bar', title: 'Reportes', sub: 'Analisis' },
  { path: '/fumigaciones', icon: 'ti-spray', title: 'Fumigaciones', sub: 'Historial' },
  { path: '/inventario', icon: 'ti-box', title: 'Inventario', sub: 'Stock' },
  { path: '/cosecha', icon: 'ti-cut', title: 'Cosecha', sub: 'Produccion' },
  { path: '/costos', icon: 'ti-coin', title: 'Costos', sub: 'Gastos' },
  { path: '/compradores', icon: 'ti-building-store', title: 'Compradores', sub: 'Clientes' },
  { path: '/configuracion', icon: 'ti-settings', title: 'Configuracion', sub: 'Ajustes' },
]

const cropIcons = ['🍅', '🫑', '🥒', '🥬', '🍆', '🌱']

const cropIconRules = [
  { terms: ['tomate'], icon: '\uD83C\uDF45' },
  { terms: ['pepino'], icon: '\uD83E\uDD52' },
  { terms: ['zucchini', 'zapallito', 'calabacin', 'calabaza'], icon: '\uD83E\uDD52' },
  { terms: ['morron', 'pimiento', 'locote'], icon: '\uD83E\uDED1' },
  { terms: ['lechuga'], icon: '\uD83E\uDD6C' },
  { terms: ['berenjena'], icon: '\uD83C\uDF46' },
]

const getCropIcon = (nombre = '') => {
  const normalizado = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const fallbackIcon = cropIcons.length ? '\uD83C\uDF31' : '\uD83C\uDF31'
  return cropIconRules.find(rule => rule.terms.some(term => normalizado.includes(term)))?.icon || fallbackIcon
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

export default function DesktopDashboard({ campoActivo, setCampoActivo }) {
  const navigate = useNavigate()
  const [campos, setCampos] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    bloques: 0,
    activos: 0,
    cultivos: 0,
    operarios: 0,
    alertas: 0,
    productos: 0,
    plantacionesTotal: 0,
    bloquesTotal: 0,
  })
  const [finanzas, setFinanzas] = useState({ ingresos: 0, costos: 0, margen: 0 })
  const [produccion, setProduccion] = useState([])
  const [actividades, setActividades] = useState([])
  const [chart, setChart] = useState([])

  const hoy = useMemo(() => new Date().toISOString().split('T')[0], [])
  const mesDesde = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  }, [])

  useEffect(() => {
    const init = async () => {
      const [{ data }, { data: bloques }] = await Promise.all([
        supabase.from('campos').select('*').order('nombre'),
        supabase.from('bloques').select('campo_id'),
      ])
      const lista = data || []
      setCampos(lista)

      if (lista.length > 0 && !campoActivo) {
        const guardado = typeof window !== 'undefined'
          ? window.localStorage.getItem(CAMPO_STORAGE_KEY)
          : null
        setCampoActivo(elegirCampoConDatos(lista, bloques || [], guardado))
      }
    }

    init()
  }, [])

  useEffect(() => {
    if (campoActivo) cargarDashboard(campoActivo)
  }, [campoActivo])

  const seleccionarCampo = (campo) => {
    setCampoActivo(campo)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CAMPO_STORAGE_KEY, campo.id)
    }
  }

  const cargarDashboard = async (campo) => {
    setLoading(true)

    const [
      { data: bloquesCampo },
      { data: bloquesTotal },
      { data: operarios },
      { data: tareas },
      { data: productos },
      { data: plantacionesTotal },
    ] = await Promise.all([
      supabase.from('bloques').select('id, codigo, activo').eq('campo_id', campo.id),
      supabase.from('bloques').select('id'),
      supabase.from('operarios').select('id').eq('campo_id', campo.id),
      supabase.from('tareas').select('id, descripcion, fecha_programada').eq('campo_id', campo.id).eq('completada', false).lte('fecha_programada', hoy).order('fecha_programada'),
      supabase.from('productos').select('id').eq('activo', true),
      supabase.from('plantaciones').select('id'),
    ])

    const bloques = bloquesCampo || []
    const bloqueIds = bloques.map(b => b.id)

    const { data: plantasActivas } = bloqueIds.length > 0
      ? await supabase
        .from('plantaciones')
        .select('id, bloque_id, densidad_plantas_m2, cultivos(nombre)')
        .eq('activa', true)
        .in('bloque_id', bloqueIds)
      : { data: [] }

    const { data: cosechas } = bloqueIds.length > 0
      ? await supabase
        .from('cosechas')
        .select('kg_total, precio_kg, fecha, bloque_id')
        .gte('fecha', mesDesde)
        .in('bloque_id', bloqueIds)
      : { data: [] }

    const [{ data: costosManuales }, { data: asistencia }, { data: fumigaciones }] = await Promise.all([
      supabase.from('costos').select('monto, fecha').eq('campo_id', campo.id).gte('fecha', mesDesde),
      supabase.from('asistencia').select('monto, fecha, operarios(campo_id)').gte('fecha', mesDesde),
      supabase
        .from('fumigaciones')
        .select('fecha, fumigacion_productos(dosis, productos(precio_unitario))')
        .eq('campo_id', campo.id)
        .gte('fecha', mesDesde),
    ])

    const ingresos = (cosechas || []).reduce((s, c) =>
      s + (Number(c.kg_total) || 0) * (Number(c.precio_kg) || 0), 0)
    const costosManual = (costosManuales || []).reduce((s, c) => s + (Number(c.monto) || 0), 0)
    const jornales = (asistencia || [])
      .filter(a => a.operarios?.campo_id === campo.id)
      .reduce((s, a) => s + (Number(a.monto) || 0), 0)
    const agroquimicos = (fumigaciones || []).reduce((total, f) => {
      return total + (f.fumigacion_productos || []).reduce((s, fp) => {
        return s + (Number(fp.productos?.precio_unitario) || 0) * (parseFloat(fp.dosis) || 0)
      }, 0)
    }, 0)
    const costos = costosManual + jornales + agroquimicos
    const costosGrafico = [
      ...(costosManuales || []).map(c => ({ fecha: c.fecha, monto: Number(c.monto) || 0 })),
      ...(asistencia || [])
        .filter(a => a.operarios?.campo_id === campo.id)
        .map(a => ({ fecha: a.fecha, monto: Number(a.monto) || 0 })),
      ...(fumigaciones || []).map(f => ({
        fecha: f.fecha,
        monto: (f.fumigacion_productos || []).reduce((s, fp) => {
          return s + (Number(fp.productos?.precio_unitario) || 0) * (parseFloat(fp.dosis) || 0)
        }, 0),
      })),
    ]

    setStats({
      bloques: bloques.length,
      activos: bloques.filter(b => b.activo).length,
      cultivos: plantasActivas?.length || 0,
      operarios: operarios?.length || 0,
      alertas: tareas?.length || 0,
      productos: productos?.length || 0,
      plantacionesTotal: plantacionesTotal?.length || 0,
      bloquesTotal: bloquesTotal?.length || 0,
    })
    setFinanzas({ ingresos, costos, margen: ingresos - costos })
    setProduccion(agruparProduccion(plantasActivas || []))
    setActividades(tareas || [])
    setChart(construirGrafico(cosechas || [], costosGrafico))
    setLoading(false)
  }

  const hayFinanzas = finanzas.ingresos > 0 || finanzas.costos > 0

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f5', color: '#101511', padding: '34px 36px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, letterSpacing: -1.2, lineHeight: 1.1 }}>Hola, Gabriel</h1>
          <div style={{ color: '#656b66', fontSize: 15, marginTop: 8 }}>
            Resumen general de {campoActivo?.nombre || 'El Sembrador'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <select
            value={campoActivo?.id || ''}
            onChange={e => seleccionarCampo(campos.find(c => c.id === e.target.value))}
            style={{
              height: 46,
              minWidth: 180,
              border: '1px solid #dde2dd',
              borderRadius: 12,
              background: '#fff',
              padding: '0 14px',
              fontSize: 14,
              color: '#121512',
              boxShadow: '0 8px 24px rgba(20,30,20,0.05)',
            }}
          >
            {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button onClick={() => navigate('/agenda')} style={{
            width: 44,
            height: 44,
            border: 'none',
            background: 'transparent',
            position: 'relative',
            cursor: 'pointer',
          }}>
            <i className="ti ti-bell" style={{ fontSize: 27, color: '#1c221e' }} aria-hidden="true"></i>
            <span style={{ position: 'absolute', top: 5, right: 7, width: 9, height: 9, borderRadius: '50%', background: '#2d8a2f' }} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 18, marginBottom: 22 }}>
        <Kpi icon="ti-plant-2" title="Bloques activos" value={loading ? '-' : stats.activos} sub={`de ${stats.bloques} totales`} dark />
        <Kpi icon="ti-plant" title="Cultivos activos" value={stats.cultivos} sub="plantaciones activas" />
        <Kpi icon="ti-users" title="Operarios activos" value={stats.operarios} sub="en el campo" />
        <Kpi icon="ti-alert-triangle" title="Alertas" value={stats.alertas} sub={stats.alertas === 0 ? 'sin alertas' : 'pendientes'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.25fr', gap: 18, marginBottom: 18 }}>
        <Panel title="Resumen financiero del mes" action="Ver costos" onAction={() => navigate('/costos')} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 22 }}>
            <Money title="Ingresos del mes" value={finanzas.ingresos} />
            <Money title="Gastos del mes" value={finanzas.costos} />
            <Money title="Margen estimado" value={finanzas.margen} />
          </div>
          <div style={{ borderTop: '1px solid #ecefec', paddingTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 12 }}>Ingresos vs. Costos</div>
            <MiniChart data={chart} hasData={hayFinanzas} />
          </div>
        </Panel>

        <Panel title="Produccion por cultivo" action="Ver mapa" onAction={() => navigate('/mapa')}>
          {produccion.length === 0 ? (
            <EmptyState text="Sin plantaciones activas para mostrar." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px', gap: 22, alignItems: 'stretch' }}>
              <div style={{ display: 'grid', gap: 16 }}>
                {produccion.slice(0, 3).map(c => <CropRow key={c.nombre} crop={c} icon={getCropIcon(c.nombre)} />)}
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                {produccion.slice(3, 6).map(c => <CropRow key={c.nombre} crop={c} icon={getCropIcon(c.nombre)} />)}
              </div>
              <div style={{ borderLeft: '1px solid #eef0ee', display: 'grid', alignContent: 'center', gap: 28, paddingLeft: 20 }}>
                <SideTotal icon="ti-plant" value={stats.plantacionesTotal} label="Plantaciones registradas" />
                <SideTotal icon="ti-box" value={stats.productos} label="Productos en inventario" />
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.25fr', gap: 18, marginBottom: 18 }}>
        <Panel title="Actividad reciente" action="Ver agenda" onAction={() => navigate('/agenda')}>
          {actividades.length === 0 ? (
            <EmptyState text="Sin tareas pendientes para hoy." />
          ) : (
            <div>
              {actividades.slice(0, 5).map((a, i) => (
                <Activity key={a.id} icon={i % 2 === 0 ? 'ti-calendar' : 'ti-users'} title={a.descripcion} date={a.fecha_programada} />
              ))}
            </div>
          )}
          <button onClick={() => navigate('/agenda')} style={linkRow}>Ver todas las actividades <i className="ti ti-chevron-right" /></button>
        </Panel>

        <Panel title="Accesos rapidos">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {quickLinks.map(link => (
              <button key={link.path} onClick={() => navigate(link.path)} style={{
                border: '1px solid #e7ece7',
                background: '#fff',
                borderRadius: 13,
                padding: '14px 14px',
                display: 'grid',
                gridTemplateColumns: '40px 1fr 16px',
                gap: 10,
                alignItems: 'center',
                textAlign: 'left',
                cursor: 'pointer',
              }}>
                <span style={iconPill}><i className={`ti ${link.icon}`} style={{ fontSize: 22, color: '#176a25' }} aria-hidden="true"></i></span>
                <span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{link.title}</span>
                  <span style={{ display: 'block', color: '#69706a', fontSize: 12, marginTop: 2 }}>{link.sub}</span>
                </span>
                <i className="ti ti-chevron-right" style={{ fontSize: 17, color: '#1c211d' }} aria-hidden="true"></i>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{
        ...panelStyle,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 0,
        padding: 0,
        overflow: 'hidden',
      }}>
        <BottomStat dark icon="ti-stack-2" value={stats.bloquesTotal} label="Bloques totales en la base" />
        <BottomStat icon="ti-plant" value={stats.plantacionesTotal} label="Plantaciones registradas" />
        <BottomStat icon="ti-box" value={stats.productos} label="Productos en inventario" />
        <BottomStat icon="ti-users" value={stats.operarios} label="Operarios activos en el campo" />
      </div>
    </div>
  )
}

function agruparProduccion(plantas) {
  const mapa = {}
  plantas.forEach(p => {
    const nombre = p.cultivos?.nombre || 'Sin cultivo'
    if (!mapa[nombre]) mapa[nombre] = { nombre, plantaciones: 0, bloques: new Set(), plantas: 0 }
    mapa[nombre].plantaciones += 1
    mapa[nombre].bloques.add(p.bloque_id)
    mapa[nombre].plantas += Number(p.densidad_plantas_m2) || 0
  })

  return Object.values(mapa)
    .map(c => ({ ...c, bloques: c.bloques.size }))
    .sort((a, b) => b.plantaciones - a.plantaciones)
}

function construirGrafico(cosechas, costos) {
  const puntos = [1, 7, 14, 21, 28]
  return puntos.map(dia => {
    const ingresos = cosechas
      .filter(c => Number((c.fecha || '').slice(8, 10)) <= dia)
      .reduce((s, c) => s + (Number(c.kg_total) || 0) * (Number(c.precio_kg) || 0), 0)
    const gastos = costos
      .filter(c => Number((c.fecha || '').slice(8, 10)) <= dia)
      .reduce((s, c) => s + (Number(c.monto) || 0), 0)
    return { dia, ingresos, gastos }
  })
}

const panelStyle = {
  background: '#fff',
  border: '1px solid #e8ece8',
  borderRadius: 18,
  boxShadow: '0 16px 34px rgba(29, 38, 29, 0.06)',
}

const iconPill = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: '#edf6ec',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const linkRow = {
  marginTop: 12,
  width: '100%',
  border: 'none',
  borderTop: '1px solid #eef0ee',
  background: 'transparent',
  padding: '15px 0 0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: '#4d544e',
  fontSize: 14,
  cursor: 'pointer',
}

function Panel({ title, action, onAction, children }) {
  return (
    <section style={{ ...panelStyle, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: -0.4 }}>{title}</h2>
        {action && (
          <button type="button" onClick={onAction} style={{ border: '1px solid #e7ece7', background: '#fff', borderRadius: 9, padding: '8px 13px', fontSize: 12, cursor: 'pointer' }}>
            {action}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function Kpi({ icon, title, value, sub, dark, badge }) {
  return (
    <div style={{ ...panelStyle, minHeight: 116, padding: 22, display: 'grid', gridTemplateColumns: '66px 1fr', alignItems: 'center', gap: 18 }}>
      <div style={{ ...iconPill, width: 60, height: 60, borderRadius: 18, background: dark ? '#050705' : '#edf6ec' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 31, color: dark ? '#fff' : '#176a25' }} aria-hidden="true"></i>
      </div>
      <div>
        <div style={{ textTransform: 'uppercase', color: '#5f665f', fontSize: 12, letterSpacing: 0.3 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <strong style={{ fontSize: 31, lineHeight: 1 }}>{value}</strong>
          {badge && <span style={{ background: '#e2f2dc', color: '#16621f', borderRadius: 8, padding: '4px 9px', fontSize: 12 }}>{badge}</span>}
        </div>
        <div style={{ color: '#5f665f', fontSize: 13, marginTop: 6 }}>{sub}</div>
      </div>
    </div>
  )
}

function Money({ title, value }) {
  return (
    <div style={{ borderRight: '1px solid #ecefec', paddingRight: 18 }}>
      <div style={{ color: '#333b34', fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 850, letterSpacing: -0.5 }}>{fmtGs(value)}</div>
      <div style={{ color: '#6d746e', fontSize: 12, marginTop: 5 }}>{value > 0 ? 'calculado automaticamente' : 'Sin datos aun'}</div>
    </div>
  )
}

function MiniChart({ data, hasData }) {
  const max = Math.max(...data.flatMap(d => [d.ingresos, d.gastos]), 1)
  const points = data.map((d, i) => {
    const x = 24 + i * 118
    const y = 140 - (d.ingresos / max) * 105
    return `${x},${y}`
  }).join(' ')
  const costPoints = data.map((d, i) => {
    const x = 24 + i * 118
    const y = 140 - (d.gastos / max) * 105
    return `${x},${y}`
  }).join(' ')

  return (
    <div style={{ height: 178, position: 'relative' }}>
      <svg viewBox="0 0 520 165" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        {[35, 70, 105, 140].map(y => <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="#e6ebe6" strokeDasharray="4 4" />)}
        <polyline points={points} fill="none" stroke="#176a25" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity={hasData ? 1 : 0.25} />
        <polyline points={costPoints} fill="none" stroke="#6f7770" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity={hasData ? 1 : 0.25} />
        {data.map((d, i) => <text key={d.dia} x={24 + i * 118} y="160" fontSize="11" fill="#69706a">{d.dia} Jun</text>)}
      </svg>
      {!hasData && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4b524c', textAlign: 'center' }}>
          <i className="ti ti-chart-bar" style={{ fontSize: 28, marginBottom: 8 }} aria-hidden="true"></i>
          <strong>Sin datos aun</strong>
          <span style={{ fontSize: 12, marginTop: 4 }}>Aun no hay informacion financiera registrada para este periodo.</span>
        </div>
      )}
    </div>
  )
}

function CropRow({ crop, icon }) {
  const pct = Math.min(100, Math.max(18, crop.plantaciones * 18))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: 14, alignItems: 'center' }}>
      <div style={{ fontSize: 40, textAlign: 'center' }}>{icon}</div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <strong style={{ fontSize: 14 }}>{crop.nombre}</strong>
          <span style={{ color: '#4e554f', fontSize: 12 }}>{crop.bloques} bloque{crop.bloques === 1 ? '' : 's'}</span>
        </div>
        <div style={{ color: '#69706a', fontSize: 12, marginTop: 3 }}>
          {crop.plantaciones} plantacion{crop.plantaciones === 1 ? '' : 'es'}{crop.plantas > 0 ? ` · ${fmtNumber(crop.plantas)} plantas` : ''}
        </div>
        <div style={{ height: 5, background: '#e1e7e0', borderRadius: 8, marginTop: 9, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#19732a', borderRadius: 8 }} />
        </div>
      </div>
    </div>
  )
}

function Activity({ icon, title, date }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eef0ee' }}>
      <span style={iconPill}><i className={`ti ${icon}`} style={{ color: '#176a25', fontSize: 21 }} aria-hidden="true"></i></span>
      <div>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <div style={{ color: '#69706a', fontSize: 12, marginTop: 3 }}>{date}</div>
      </div>
      <span style={{ background: '#edf6ec', color: '#176a25', borderRadius: 8, padding: '5px 9px', fontSize: 12 }}>Agenda</span>
    </div>
  )
}

function SideTotal({ icon, value, label }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 12, alignItems: 'center' }}>
      <span style={{ ...iconPill, width: 48, height: 48, borderRadius: 16 }}><i className={`ti ${icon}`} style={{ fontSize: 25, color: '#176a25' }} aria-hidden="true"></i></span>
      <div>
        <strong style={{ fontSize: 28, lineHeight: 1 }}>{value}</strong>
        <div style={{ fontSize: 12, color: '#5f665f', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

function BottomStat({ icon, value, label, dark }) {
  return (
    <div style={{ padding: '24px 26px', display: 'grid', gridTemplateColumns: '58px 1fr', gap: 18, alignItems: 'center', borderRight: '1px solid #edf0ed' }}>
      <span style={{ ...iconPill, width: 58, height: 58, borderRadius: 17, background: dark ? '#050705' : '#edf6ec' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 28, color: dark ? '#fff' : '#176a25' }} aria-hidden="true"></i>
      </span>
      <div>
        <strong style={{ fontSize: 27 }}>{value}</strong>
        <div style={{ color: '#5f665f', fontSize: 13 }}>{label}</div>
      </div>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 185, color: '#69706a', fontSize: 14 }}>
      {text}
    </div>
  )
}
