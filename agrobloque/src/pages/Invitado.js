import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')
const fmtNumber = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

export default function Invitado() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const width = useWindowWidth()
  const compact = width < 760
  const verySmall = width < 430

  useEffect(() => {
    cargar()
  }, [token])

  const cargar = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.rpc('get_guest_access_snapshot', { access_token: token })
    if (error) {
      setError(`No se pudo validar el enlace. Ejecuta el SQL actualizado de invitados. Detalle: ${error.message || 'sin detalle'}`)
      setData(null)
    } else if (!data?.ok) {
      setError(data?.error === 'link_no_valido'
        ? 'Este enlace no coincide con ningun invitado activo en este Supabase. Crea un link nuevo despues de ejecutar el SQL actualizado.'
        : 'Este enlace de invitado no existe, vencio o fue desactivado.'
      )
      setData(null)
    } else {
      setData(data)
    }
    setLoading(false)
  }

  if (loading) return <Shell><Empty text="Cargando acceso invitado..." /></Shell>
  if (error) return <Shell><Empty text={error} /></Shell>

  const stats = data?.stats || {}
  const finanzas = data?.finanzas || {}
  const statsColumns = verySmall ? '1fr 1fr' : compact ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))'
  const sectionColumns = compact ? '1fr' : '1fr 1fr'

  return (
    <Shell campo={data?.campo?.nombre} onRefresh={cargar} compact={compact}>
      <div style={{ display:'grid', gridTemplateColumns:statsColumns, gap:compact ? 10 : 12, marginBottom:16 }}>
        <Card title="Bloques activos" value={stats.bloques_activos} sub={`de ${stats.bloques_total || 0} totales`} />
        <Card title="Plantaciones" value={stats.plantaciones_activas} sub="activas" />
        <Card title="Operarios" value={stats.operarios} sub="registrados" />
        <Card title="Tareas" value={stats.tareas_pendientes} sub="pendientes" />
      </div>

      <section style={panel}>
        <div style={head}>
          <h2 style={title}>Resumen financiero del mes</h2>
          <span style={badge}>Solo lectura</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:compact ? '1fr' : 'repeat(3, 1fr)', gap:10 }}>
          <Money label="Ingresos" value={finanzas.ingresos} />
          <Money label="Costos" value={finanzas.costos} />
          <Money label="Balance" value={(finanzas.ingresos || 0) - (finanzas.costos || 0)} />
        </div>
      </section>

      <div style={{ display:'grid', gridTemplateColumns:sectionColumns, gap:16, marginTop:16 }}>
        <section style={panel}>
          <div style={head}><h2 style={title}>Plantaciones activas</h2></div>
          {(data?.plantaciones || []).length === 0 ? <SmallEmpty /> : data.plantaciones.map(p => (
            <Row key={`${p.bloque_codigo}-${p.cultivo}-${p.fecha_siembra}`} title={`Bloque ${p.bloque_codigo}`} sub={`${p.cultivo || 'Sin cultivo'} - ${p.fecha_siembra || 'Sin fecha'}`} right={p.cantidad_plantas ? `${fmtNumber(p.cantidad_plantas)} plantas` : ''} />
          ))}
        </section>

        <section style={panel}>
          <div style={head}><h2 style={title}>Tareas pendientes</h2></div>
          {(data?.tareas || []).length === 0 ? <SmallEmpty /> : data.tareas.map(t => (
            <Row key={t.id} title={t.descripcion} sub={t.fecha_programada || ''} right={t.bloque_codigo ? `Bloque ${t.bloque_codigo}` : 'Agenda'} />
          ))}
        </section>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:sectionColumns, gap:16, marginTop:16 }}>
        <section style={panel}>
          <div style={head}><h2 style={title}>Cosechas recientes</h2></div>
          {(data?.cosechas || []).length === 0 ? <SmallEmpty /> : data.cosechas.map(c => (
            <Row key={c.id} title={`Bloque ${c.bloque_codigo || '-'}`} sub={c.fecha || 'Sin fecha'} right={`${fmtNumber(c.kg_total)} kg - Gs. ${fmtGs(c.precio_kg)}`} />
          ))}
        </section>

        <section style={panel}>
          <div style={head}><h2 style={title}>Inventario</h2></div>
          {(data?.productos || []).length === 0 ? <SmallEmpty /> : data.productos.map(p => (
            <Row key={p.id} title={p.nombre} sub={p.categoria || 'Sin categoria'} right={fmtNumber(p.stock_actual)} />
          ))}
        </section>
      </div>
    </Shell>
  )
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window === 'undefined' ? 1024 : window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

function Shell({ children, campo, onRefresh, compact = false }) {
  return (
    <div style={{ minHeight:'100vh', background:'#f4f5f2', color:'#101511', padding:compact ? '14px 12px 28px' : 20 }}>
      <div style={{ maxWidth:1180, margin:'0 auto' }}>
        <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, marginBottom:18 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12, textTransform:'uppercase', color:'#69706a', letterSpacing:1 }}>AgroBloque - Invitado</div>
            <h1 style={{ margin:'4px 0 0', fontSize:compact ? 25 : 30, letterSpacing:-1 }}>El Sembrador</h1>
            <div style={{ color:'#69706a', fontSize:14, marginTop:4, overflowWrap:'anywhere' }}>{campo || 'Vista de solo lectura'}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            {onRefresh && <button type="button" onClick={onRefresh} style={refreshBtn}>Actualizar</button>}
            <div style={{ width:compact ? 46 : 54, height:compact ? 46 : 54, borderRadius:16, background:'#0b0f0c', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:compact ? 19 : 22 }}>
              HS
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

function Card({ title, value, sub }) {
  return (
    <div style={panel}>
      <div style={{ color:'#69706a', textTransform:'uppercase', fontSize:12, fontWeight:800 }}>{title}</div>
      <strong style={{ display:'block', fontSize:30, marginTop:8, lineHeight:1 }}>{value || 0}</strong>
      <div style={{ color:'#69706a', fontSize:13, marginTop:6 }}>{sub}</div>
    </div>
  )
}

function Money({ label, value }) {
  return (
    <div style={{ background:'#f7f8f6', border:'1px solid #edf0ed', borderRadius:14, padding:14 }}>
      <div style={{ color:'#69706a', fontSize:13, fontWeight:750 }}>{label}</div>
      <strong style={{ fontSize:22, marginTop:6, display:'block' }}>Gs. {fmtGs(value)}</strong>
    </div>
  )
}

function Row({ title, sub, right }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) auto', gap:12, alignItems:'center', padding:'13px 0', borderBottom:'1px solid #edf0ed' }}>
      <div style={{ minWidth:0 }}>
        <strong style={{ fontSize:15, display:'block', overflowWrap:'anywhere' }}>{title}</strong>
        <div style={{ color:'#69706a', fontSize:13, marginTop:4, overflowWrap:'anywhere' }}>{sub}</div>
      </div>
      <div style={{ color:'#176a25', fontWeight:850, fontSize:13, textAlign:'right', maxWidth:150, overflowWrap:'anywhere' }}>{right}</div>
    </div>
  )
}

function Empty({ text }) {
  return <div style={panel}><div style={{ color:'#69706a', fontSize:14, textAlign:'center', padding:30 }}>{text}</div></div>
}

function SmallEmpty() {
  return <div style={{ color:'#8b928b', textAlign:'center', padding:'24px 0', fontSize:13 }}>Sin datos para mostrar.</div>
}

const panel = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:18,
  padding:16,
  boxShadow:'0 14px 32px rgba(29, 38, 29, 0.06)',
}

const head = {
  display:'flex',
  justifyContent:'space-between',
  alignItems:'center',
  gap:12,
  marginBottom:14,
}

const title = {
  margin:0,
  fontSize:18,
  letterSpacing:0,
}

const badge = {
  background:'#edf6ec',
  color:'#176a25',
  borderRadius:999,
  padding:'6px 10px',
  fontSize:12,
  fontWeight:800,
  whiteSpace:'nowrap',
}

const refreshBtn = {
  border:'1px solid #dfe6dc',
  background:'#fff',
  borderRadius:12,
  padding:'10px 12px',
  fontSize:13,
  fontWeight:800,
  color:'#176a25',
  cursor:'pointer',
}
