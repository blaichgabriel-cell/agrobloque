import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { canAccessModule } from '../lib/permissions'
import WorkActions, { availableWork } from '../components/WorkActions'

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const number = value => Number(value || 0).toLocaleString('es-PY', { maximumFractionDigits: 1 })
const shortDate = value => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-PY', { day: 'numeric', month: 'short' }) : 'Sin fecha'
const empty = { bloques: [], plantas: [], cosechas: [], tareas: [], productos: [], operarios: [], fumigaciones: [], fertilizaciones: [] }

export default function Overview({ campoActivo, setCampoActivo, isGuest = false, role }) {
  const navigate = useNavigate()
  const [campos, setCampos] = useState([])
  const [data, setData] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])
  const [fieldsError, setFieldsError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [work, setWork] = useState(false)
  const today = dateKey(new Date())
  const month = `${today.slice(0, 7)}-01`
  const can = key => canAccessModule(role, key)

  useEffect(() => {
    let current = true
    Promise.resolve(supabase.from('campos').select('*').order('nombre')).then(({ data: fields, error }) => {
      if (!current) return
      setFieldsError(Boolean(error))
      if (error) { setLoading(false); return }
      setCampos(fields || [])
      if (!campoActivo && fields?.length) {
        const saved = window.localStorage.getItem('agrobloque-campo-activo')
        setCampoActivo(fields.find(field => field.id === saved) || fields[0])
      } else if (!fields?.length) setLoading(false)
    }).catch(() => { if (current) { setFieldsError(true); setLoading(false) } })
    return () => { current = false }
  }, [retry, campoActivo, setCampoActivo])

  useEffect(() => {
    if (!campoActivo?.id) return
    let current = true
    setLoading(true)
    setData(empty)
    setErrors([])
    const load = async () => {
      const failures = []
      const read = async (key, request) => {
        try {
          const { data: rows, error } = await request
          if (error) throw error
          return rows || []
        } catch { failures.push(key); return [] }
      }
      const bloques = await read('bloques', supabase.from('bloques').select('id, codigo, activo').eq('campo_id', campoActivo.id).order('codigo'))
      const ids = bloques.map(block => block.id)
      const weekStart = new Date(`${today}T12:00:00`); weekStart.setDate(weekStart.getDate() - 6)
      const since = dateKey(weekStart) < month ? dateKey(weekStart) : month
      const [plantas, cosechas, tareas, productos, operarios, fumigaciones, fertilizaciones] = await Promise.all([
        ids.length ? read('plantas', supabase.from('plantaciones').select('id, bloque_id, fecha_siembra, cultivos(nombre)').eq('activa', true).in('bloque_id', ids)) : [],
        canAccessModule(role, 'cosecha') && ids.length ? read('cosechas', supabase.from('cosechas').select('id, bloque_id, kg_total, fecha').in('bloque_id', ids).gte('fecha', since).lte('fecha', today)) : [],
        canAccessModule(role, 'agenda') ? read('tareas', supabase.from('tareas').select('id, descripcion, fecha_programada, completada').eq('campo_id', campoActivo.id).or('completada.eq.false,completada.is.null').order('fecha_programada', { ascending: true, nullsFirst: false })) : [],
        canAccessModule(role, 'inventario') ? read('productos', supabase.from('productos').select('id, nombre, stock_actual, stock_minimo').eq('activo', true)) : [],
        !isGuest && canAccessModule(role, 'asistencia') ? read('operarios', supabase.from('operarios').select('id').eq('campo_id', campoActivo.id)) : [],
        canAccessModule(role, 'fumigaciones') ? read('fumigaciones', supabase.from('fumigaciones').select('id, fecha, tipo, fumigacion_bloques(bloque_id)').eq('campo_id', campoActivo.id).lte('fecha', today).order('fecha', { ascending: false }).limit(10)) : [],
        canAccessModule(role, 'plan_nutricional') && ids.length ? read('fertilizaciones', supabase.from('fertilizaciones').select('id, bloque_id, fecha').in('bloque_id', ids).lte('fecha', today).order('fecha', { ascending: false }).limit(10)) : [],
      ])
      if (current) { setData({ bloques, plantas, cosechas, tareas, productos, operarios, fumigaciones, fertilizaciones }); setErrors(failures); setLoading(false) }
    }
    load().catch(() => { if (current) { setErrors(['bloques']); setLoading(false) } })
    return () => { current = false }
  }, [campoActivo?.id, role, isGuest, retry, today, month])

  const recent = useMemo(() => [
    ...data.cosechas.map(item => ({ id: `c${item.id}`, block: item.bloque_id, date: item.fecha, label: 'Cosecha', sub: `${number(item.kg_total)} kg`, icon: 'ti-cut', path: '/cosecha' })),
    ...data.fumigaciones.map(item => ({ id: `f${item.id}`, blocks: (item.fumigacion_bloques || []).map(b => b.bloque_id), date: item.fecha, label: 'Fumigación', sub: item.tipo || 'Aplicación registrada', icon: 'ti-spray', path: '/fumigaciones' })),
    ...data.fertilizaciones.map(item => ({ id: `n${item.id}`, block: item.bloque_id, date: item.fecha, label: 'Fertilización', sub: 'Aplicación registrada', icon: 'ti-leaf', path: '/fertilizaciones' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [data])
  const active = data.bloques.filter(block => block.activo).length
  const monthlyKg = data.cosechas.filter(item => item.fecha >= month).reduce((sum, item) => sum + Number(item.kg_total || 0), 0)
  const lowStock = data.productos.filter(p => Number(p.stock_actual) <= 0 || (Number(p.stock_minimo) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo)))
  const shownBlocks = data.bloques.filter(block => {
    const crop = data.plantas.find(p => p.bloque_id === block.id)?.cultivos?.nombre || ''
    return `${block.codigo} ${crop}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (filter === 'todos' || (filter === 'activos' ? block.activo : !block.activo))
  })
  const value = (key, result) => loading || errors.includes(key) || (['cosechas', 'plantas'].includes(key) && errors.includes('bloques')) ? '—' : result
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${today}T12:00:00`); day.setDate(day.getDate() - 6 + i)
    const key = dateKey(day)
    return { label: day.toLocaleDateString('es-PY', { weekday: 'short', day: 'numeric' }), kg: data.cosechas.filter(c => c.fecha?.slice(0, 10) === key).reduce((s, c) => s + Number(c.kg_total || 0), 0) }
  })
  const notices = [
    ...data.tareas.slice(0, 3).map(t => ({ id: `t${t.id}`, title: t.descripcion || 'Tarea pendiente', sub: shortDate(t.fecha_programada), icon: 'ti-calendar', path: '/agenda', overdue: t.fecha_programada && t.fecha_programada < today })),
    ...(lowStock.length ? [{ id: 'stock', title: 'Stock bajo de insumos', sub: `${lowStock.length} productos · Inventario general`, icon: 'ti-box', path: '/inventario' }] : []),
  ]
  const nombre = role?.nombre || role?.email?.split('@')[0] || 'Usuario'
  const mayWork = availableWork(role, isGuest).length > 0

  return <div className="ag-overview">
    <header className="ag-topbar">
      <span className="ag-mobile-brand"><b>AB</b> AgroBloque</span>
      {can('buscar') && <button className="ag-search-link" onClick={() => navigate('/buscar')}><i className="ti ti-search" />Buscar bloques, cultivos, actividades…</button>}
      <label className="ag-field-select"><span className="ag-sr-only">Campo activo</span><i className="ti ti-map-pin" /><select value={campoActivo?.id || ''} onChange={e => { const campo = campos.find(c => c.id === e.target.value); if (campo) { setCampoActivo(campo); localStorage.setItem('agrobloque-campo-activo', campo.id) } }}>{!campos.length && <option value="">Sin campos</option>}{campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      {can('alertas') && <button className="ag-icon-button" aria-label="Ver alertas" onClick={() => navigate('/alertas')}><i className="ti ti-bell" /></button>}
      <span className="ag-top-date">{new Date(`${today}T12:00:00`).toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </header>
    <section className="ag-hero"><div><span className="ag-eyebrow">AgroBloque · {campoActivo?.nombre || 'Tu campo'}</span><h1>Hola, {nombre}</h1><p>Un campo bien gestionado,<br />siempre da buenos frutos.</p></div><span className="ag-hero-caption">El campo en control</span></section>
    {(fieldsError || errors.length > 0) && <div className="ag-load-error" role="alert">No se pudo cargar parte del resumen. Los datos no disponibles se muestran con «—».<button onClick={() => setRetry(n => n + 1)}>Reintentar</button></div>}
    {!loading && !fieldsError && !campos.length && <div className="ag-empty">No hay campos disponibles para este usuario.</div>}
    <div className="ag-metrics">
      {can('cosecha') && <Metric icon="ti-leaf" label="Producción del mes" value={value('cosechas', `${number(monthlyKg)} kg`)} detail={new Date(`${today}T12:00:00`).toLocaleDateString('es-PY', { month: 'long', year: 'numeric' })} />}
      <Metric icon="ti-layout-grid" label="Bloques activos" value={value('bloques', active)} detail={`de ${value('bloques', data.bloques.length)} bloques`} />
      {!isGuest && can('asistencia') ? <Metric icon="ti-users" label="Personal registrado" value={value('operarios', data.operarios.length)} detail="Operarios del campo" /> : <Metric icon="ti-seeding" label="Plantaciones activas" value={value('plantas', data.plantas.length)} detail="En el campo seleccionado" />}
      {can('agenda') && <Metric icon="ti-clipboard-list" label="Tareas pendientes" value={value('tareas', data.tareas.length)} detail="Agenda del campo" warning={data.tareas.length > 0} />}
    </div>
    {mayWork && <div className="ag-register"><button className="ag-primary" onClick={() => setWork(true)}><i className="ti ti-plus" />Registrar trabajo</button></div>}
    <div className="ag-dashboard-columns"><div className="ag-main-column">
      {can('mapa') && <section className="ag-panel"><div className="ag-section-heading"><h2>Bloques</h2><button className="ag-text-button" onClick={() => navigate('/mapa')}>Ver mapa <i className="ti ti-chevron-right" /></button></div>
        <div className="ag-block-tools"><label className="ag-block-search"><i className="ti ti-search" /><input aria-label="Buscar bloque o cultivo" placeholder="Buscar bloque o cultivo" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="Filtrar bloques" value={filter} onChange={e => setFilter(e.target.value)}><option value="todos">Todos los bloques</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></select></div>
        <div className="ag-block-table"><div className="ag-block-labels"><span>Bloque / Cultivo</span><span>Estado</span><span>Días</span><span>Última actividad</span><span /></div>
          {loading ? <div className="ag-empty" role="status">Cargando bloques…</div> : errors.includes('bloques') ? <div className="ag-empty">No se pudieron cargar los bloques.</div> : !shownBlocks.length ? <div className="ag-empty">{query || filter !== 'todos' ? 'No hay bloques que coincidan con el filtro.' : 'Todavía no hay bloques en este campo.'}</div> : shownBlocks.slice(0, 8).map(block => {
            const plant = data.plantas.find(p => p.bloque_id === block.id)
            const last = recent.find(item => item.block === block.id || item.blocks?.includes(block.id))
            const days = plant?.fecha_siembra ? Math.max(0, Math.floor((new Date(`${today}T12:00:00`) - new Date(`${plant.fecha_siembra.slice(0, 10)}T12:00:00`)) / 86400000)) : null
            return <button className="ag-block-row" key={block.id} onClick={() => navigate(`/bloque/${block.id}`)}><span className="ag-block-identity"><strong>{block.codigo}</strong><span>{errors.includes('plantas') ? '—' : plant?.cultivos?.nombre || 'Sin plantación activa'}</span></span><span className={`ag-status ${block.activo ? '' : 'is-inactive'}`}><span />{block.activo ? 'Activo' : 'Inactivo'}</span><span className="ag-block-days">{days ?? '—'}</span><span className="ag-block-activity">{last ? `${last.label} · ${shortDate(last.date)}` : '—'}</span><i className="ti ti-chevron-right" /></button>
          })}</div>
        {shownBlocks.length > 8 && <button className="ag-text-button ag-more-blocks" onClick={() => navigate('/mapa')}>Ver los {shownBlocks.length} bloques en el mapa</button>}
      </section>}
      {can('cosecha') && <section className="ag-panel ag-production"><div className="ag-section-heading"><div><h2>Producción de la semana</h2><span className="ag-muted">Últimos 7 días · kg cosechados</span></div><strong>{value('cosechas', `${number(week.reduce((s, d) => s + d.kg, 0))} kg`)}</strong></div>{loading || errors.includes('cosechas') || errors.includes('bloques') ? <div className="ag-empty">{loading ? 'Cargando producción…' : 'Producción no disponible.'}</div> : <ProductionChart days={week} />}</section>}
    </div><div className="ag-side-column">
      {(can('agenda') || can('inventario')) && <section className="ag-panel"><div className="ag-section-heading"><h2>Requiere atención</h2>{can('alertas') && <button className="ag-text-button" onClick={() => navigate('/alertas')}>Ver alertas <i className="ti ti-chevron-right" /></button>}</div>{loading ? <div className="ag-empty">Cargando pendientes…</div> : notices.length ? notices.map(item => <button className={`ag-notice ${item.overdue ? 'is-overdue' : ''}`} key={item.id} onClick={() => navigate(item.path)}><i className={`ti ${item.icon}`} /><span><strong>{item.title}</strong><small>{item.sub}</small></span><i className="ti ti-chevron-right" /></button>) : <div className="ag-empty">{errors.includes('tareas') || errors.includes('productos') ? 'No se pudieron comprobar todos los pendientes.' : 'Sin tareas pendientes ni avisos de stock.'}</div>}</section>}
      <section className="ag-panel"><div className="ag-section-heading"><h2>Actividad reciente</h2></div>{loading ? <div className="ag-empty">Cargando actividad…</div> : recent.length ? recent.slice(0, 5).map(item => <button className="ag-activity" key={item.id} onClick={() => navigate(item.path)}><span className="ag-activity-icon"><i className={`ti ${item.icon}`} /></span><span><strong>{item.label}{item.block ? ` · ${data.bloques.find(b => b.id === item.block)?.codigo || ''}` : ''}</strong><small>{item.sub}</small></span><time>{shortDate(item.date)}</time></button>) : <div className="ag-empty">{errors.some(key => ['cosechas', 'fumigaciones', 'fertilizaciones'].includes(key)) ? 'No se pudo consultar toda la actividad.' : 'Sin registros recientes para mostrar.'}</div>}</section>
    </div></div>
    {work && <WorkActions role={role} isGuest={isGuest} onClose={() => setWork(false)} />}
  </div>
}

function Metric({ icon, label, value, detail, warning }) {
  return <div className={`ag-metric ${warning ? 'is-warning' : ''}`}><span className="ag-metric-icon"><i className={`ti ${icon}`} /></span><div><span className="ag-metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}

function ProductionChart({ days }) {
  const max = Math.max(...days.map(d => d.kg), 1)
  const points = days.map((d, i) => `${48 + i * 88},${150 - d.kg / max * 120}`)
  return <div className="ag-chart"><svg viewBox="0 0 620 198" role="img" aria-label={`Cosecha de los últimos siete días: ${days.map(d => `${d.label}, ${number(d.kg)} kg`).join('; ')}`}>
    {[0, 0.5, 1].map(tick => <g key={tick}><line x1="48" x2="576" y1={150 - tick * 120} y2={150 - tick * 120} stroke="#e4eae6" /><text x="38" y={154 - tick * 120} textAnchor="end">{number(max * tick)}</text></g>)}
    <polygon points={`48,150 ${points.join(' ')} 576,150`} fill="#e7f2eb" />
    <polyline points={points.join(' ')} stroke="#176043" strokeWidth="2.5" fill="none" />
    {days.map((day, i) => <g key={day.label}><circle cx={48 + i * 88} cy={150 - day.kg / max * 120} r="3.5" fill="#176043" /><text x={48 + i * 88} y="177" textAnchor="middle">{day.label}</text></g>)}
  </svg>{days.every(d => d.kg === 0) && <p className="ag-muted">No hay cosechas registradas en este período.</p>}</div>
}
