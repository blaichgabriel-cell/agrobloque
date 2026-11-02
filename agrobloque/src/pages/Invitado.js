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
    <Shell company={data?.organizacion?.nombre} campo={data?.campo?.nombre} onRefresh={cargar} compact={compact}>
      <div className="ui-fa705b" style={{ gridTemplateColumns:statsColumns, gap:compact ? 10 : 12 }}>
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
        <div className="ui-ea54d1" style={{ gridTemplateColumns:compact ? '1fr' : 'repeat(3, 1fr)' }}>
          <Money label="Ingresos" value={finanzas.ingresos} />
          <Money label="Costos" value={finanzas.costos} />
          <Money label="Balance" value={(finanzas.ingresos || 0) - (finanzas.costos || 0)} />
        </div>
      </section>

      <div className="ui-967a75" style={{ gridTemplateColumns:sectionColumns }}>
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

      <div className="ui-967a75" style={{ gridTemplateColumns:sectionColumns }}>
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

function Shell({ children, company = 'AgroBloque', campo, onRefresh, compact = false }) {
  return (
    <div className="ui-bc1e10" style={{ padding:compact ? '14px 12px 28px' : 20 }}>
      <div className="ui-6d87e9">
        <header className="ui-477274">
          <div className="ui-3f9f96">
            <div className="ui-d1cf09">AgroBloque - Invitado</div>
            <h1 className="ui-227a72" style={{ fontSize:compact ? 25 : 30 }}>{company || 'AgroBloque'}</h1>
            <div className="ui-374162">{campo || 'Vista de solo lectura'}</div>
          </div>
          <div className="ui-fef609">
            {onRefresh && <button type="button" onClick={onRefresh} style={refreshBtn}>Actualizar</button>}
            <div className="ui-4efd64" style={{ width:compact ? 46 : 54, height:compact ? 46 : 54, fontSize:compact ? 19 : 22 }}>
              AB
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
      <div className="ui-16b824">{title}</div>
      <strong className="ui-95163f">{value || 0}</strong>
      <div className="ui-b2247b">{sub}</div>
    </div>
  )
}

function Money({ label, value }) {
  return (
    <div className="ui-d61cd5">
      <div className="ui-646921">{label}</div>
      <strong className="ui-8b507c">Gs. {fmtGs(value)}</strong>
    </div>
  )
}

function Row({ title, sub, right }) {
  return (
    <div className="ui-9c9567">
      <div className="ui-3f9f96">
        <strong className="ui-33372b">{title}</strong>
        <div className="ui-442379">{sub}</div>
      </div>
      <div className="ui-43c867">{right}</div>
    </div>
  )
}

function Empty({ text }) {
  return <div style={panel}><div className="ui-7afa5c">{text}</div></div>
}

function SmallEmpty() {
  return <div className="ui-19cc08">Sin datos para mostrar.</div>
}

const panel = {
  background:'#fff',
  border:'1px solid #e8ece8',
  borderRadius:8,
  padding:16,
  boxShadow:'none',
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
  background:"#edf7f1",
  color:"#08603f",
  borderRadius:999,
  padding:'6px 10px',
  fontSize:12,
  fontWeight:700,
  whiteSpace:'nowrap',
}

const refreshBtn = {
  border:'1px solid #dfe6dc',
  background:'#fff',
  borderRadius:8,
  padding:'10px 12px',
  fontSize:13,
  fontWeight:700,
  color:"#08603f",
  cursor:'pointer',
}
