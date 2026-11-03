import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { moonPhase, MOON_PHASES } from '../lib/moon'
import { Skeleton } from '../components/UI'
import { CALENDARIO_SIEMBRA, FASE_ICONO } from '../data/calendarioSiembra'

const fechaLocal = fecha => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
const TIPOS = {
  fumigacion:'#e07b00', fertiriego:'#2980b9', cosecha:'#176a45', evaluacion:'#8e44ad', otro:'#66746c',
}

export default function Calendario() {
  const navigate = useNavigate()
  const [vista, setVista] = useState('agenda')
  const [busqueda, setBusqueda] = useState('')
  const [faseFiltro, setFaseFiltro] = useState('todas')
  const [tareas, setTareas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [mes, setMes] = useState(() => { const fecha = new Date(); fecha.setDate(1); return fecha })
  const hoy = fechaLocal(new Date())

  useEffect(() => {
    let activo = true
    supabase.from('tareas').select('id,tipo,descripcion,fecha_programada,hora_programada,completada,anulada,campos(nombre),bloques(codigo)').eq('anulada', false).order('fecha_programada').then(({ data, error }) => {
      if (!activo) return
      setTareas(data || []); setError(Boolean(error)); setLoading(false)
    })
    return () => { activo = false }
  }, [])

  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const desplazamiento = (inicio.getDay() + 6) % 7
  const primera = new Date(inicio); primera.setDate(1 - desplazamiento)
  const dias = Array.from({ length:42 }, (_, indice) => { const fecha = new Date(primera); fecha.setDate(primera.getDate() + indice); return fecha })
  const tareasPorFecha = tareas.reduce((mapa, tarea) => {
    if (!tarea.fecha_programada) return mapa
    mapa[tarea.fecha_programada] = [...(mapa[tarea.fecha_programada] || []), tarea]
    return mapa
  }, {})
  const moverMes = delta => setMes(actual => { const siguiente = new Date(actual); siguiente.setMonth(siguiente.getMonth() + delta); return siguiente })
  const termino = busqueda.trim().toLocaleLowerCase('es')
  const cultivosFiltrados = CALENDARIO_SIEMBRA.filter(item =>
    (!termino || `${item.cultivo} ${item.epoca} ${item.sistema}`.toLocaleLowerCase('es').includes(termino)) &&
    (faseFiltro === 'todas' || item.fase === faseFiltro)
  )

  return <div className="ag-page calendar-page">
    <div className="calendar-page__hero"><div><small>PLANIFICACIÓN AGRÍCOLA</small><h1 className="ag-page-title">Calendario</h1><p>Agenda del campo con referencia astronómica de las fases lunares.</p></div><div className="calendar-moon-today"><span>{moonPhase(new Date()).icon}</span><div><small>FASE DE HOY</small><strong>{moonPhase(new Date()).label}</strong></div></div></div>
    <div className="calendar-page__body">
      <div className="calendar-view-switch" role="tablist" aria-label="Contenido del calendario">
        <button type="button" className={vista === 'agenda' ? 'active' : ''} role="tab" aria-selected={vista === 'agenda'} onClick={() => setVista('agenda')}><i className="ti ti-calendar-month" />Agenda mensual</button>
        <button type="button" className={vista === 'siembra' ? 'active' : ''} role="tab" aria-selected={vista === 'siembra'} onClick={() => setVista('siembra')}><i className="ti ti-seeding" />Guía de siembra</button>
      </div>
      {vista === 'agenda' ? (loading ? <Skeleton rows={5} label="Cargando calendario" /> : error ? <div className="calendar-soft-state"><i className="ti ti-cloud-off" /><div><strong>No pudimos actualizar el calendario</strong><span>Revisá la conexión e intentá nuevamente.</span></div></div> : <section className="lunar-calendar">
        <div className="lunar-calendar__header"><div><small>AGENDA DEL CAMPO</small><h2>{mes.toLocaleDateString('es-PY', { month:'long', year:'numeric' })}</h2></div><div><button onClick={() => moverMes(-1)} aria-label="Mes anterior"><i className="ti ti-chevron-left" /></button><button onClick={() => { const fecha = new Date(); fecha.setDate(1); setMes(fecha) }}>Hoy</button><button onClick={() => moverMes(1)} aria-label="Mes siguiente"><i className="ti ti-chevron-right" /></button></div></div>
        <div className="lunar-calendar__weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(dia => <span key={dia}>{dia}</span>)}</div>
        <div className="lunar-calendar__grid">{dias.map(fecha => {
          const clave = fechaLocal(fecha); const fase = moonPhase(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12)); const items = tareasPorFecha[clave] || []; const fuera = fecha.getMonth() !== mes.getMonth()
          return <div className={`lunar-day ${fuera ? 'is-outside' : ''} ${clave === hoy ? 'is-today' : ''}`} key={clave}>
            <button className="lunar-day__date" onClick={() => navigate(`/agenda?fecha=${clave}`)} aria-label={`Crear tarea el ${fecha.toLocaleDateString('es-PY')}. ${fase.label}`}><strong>{fecha.getDate()}</strong><span title={`${fase.label} · ${Math.round(fase.fraction * 100)}% iluminada`}>{fase.icon}</span></button>
            <div className="lunar-day__tasks">{items.slice(0,3).map(tarea => <button key={tarea.id} className={tarea.completada ? 'is-complete' : ''} onClick={() => navigate(`/agenda?fecha=${clave}`)} title={tarea.descripcion}><i style={{ background:TIPOS[tarea.tipo] || TIPOS.otro }} />{tarea.hora_programada ? `${String(tarea.hora_programada).slice(0,5)} ` : ''}{tarea.descripcion}</button>)}{items.length > 3 && <span>+{items.length - 3} más</span>}</div>
          </div>
        })}</div>
        <div className="lunar-calendar__legend"><span>Cálculo astronómico aproximado; no constituye una recomendación agronómica.</span><span>{MOON_PHASES.filter((_, indice) => indice % 2 === 0).map(fase => `${fase.icon} ${fase.label}`).join(' · ')}</span></div>
      </section>) : <section className="sowing-guide" aria-labelledby="sowing-guide-title">
        <div className="sowing-guide__header">
          <div><small>REFERENCIA REGIONAL</small><h2 id="sowing-guide-title">Calendario de siembra</h2><p>Verduras y hortalizas · zona Sur de Paraguay</p></div>
          <span className="sowing-guide__count"><strong>{cultivosFiltrados.length}</strong> cultivos</span>
        </div>
        <div className="sowing-guide__filters">
          <label className="sowing-search"><i className="ti ti-search" /><span className="sr-only">Buscar cultivo</span><input value={busqueda} onChange={evento => setBusqueda(evento.target.value)} placeholder="Buscar cultivo o sistema…" /></label>
          <label><span className="sr-only">Filtrar por fase lunar</span><select value={faseFiltro} onChange={evento => setFaseFiltro(evento.target.value)}><option value="todas">Todas las fases</option><option value="nueva">Luna nueva</option><option value="creciente">Creciente</option><option value="llena">Luna llena</option><option value="menguante">Menguante</option></select></label>
        </div>
        {cultivosFiltrados.length ? <>
          <div className="sowing-table-wrap"><table className="sowing-table">
            <thead><tr><th>Cultivo</th><th>Época ideal</th><th>Semillas/g</th><th>Distancia (m)</th><th>kg/ha</th><th>Sistema de siembra</th><th>Días a cosecha</th><th>Fase sugerida</th></tr></thead>
            <tbody>{cultivosFiltrados.map(item => <tr key={item.cultivo}><th scope="row">{item.cultivo}</th><td>{item.epoca}</td><td>{item.semillas}</td><td>{item.distancia}</td><td>{item.densidad}</td><td>{item.sistema}</td><td>{item.cosecha}</td><td><span className={`sowing-phase is-${item.fase}`} aria-label={`Fase ${item.fase}`}><i aria-hidden="true">{FASE_ICONO[item.fase]}</i>{item.fase}</span></td></tr>)}</tbody>
          </table></div>
          <div className="sowing-cards">{cultivosFiltrados.map(item => <article key={item.cultivo} className="sowing-card"><div className="sowing-card__title"><div><small>{item.epoca}</small><h3>{item.cultivo}</h3></div><span className={`sowing-phase is-${item.fase}`}><i aria-hidden="true">{FASE_ICONO[item.fase]}</i>{item.fase}</span></div><dl><div><dt>Días a cosecha</dt><dd>{item.cosecha}</dd></div><div><dt>Distancia</dt><dd>{item.distancia} m</dd></div><div><dt>Semillas/g</dt><dd>{item.semillas}</dd></div><div><dt>Densidad</dt><dd>{item.densidad} kg/ha</dd></div></dl><p><i className="ti ti-seeding" />{item.sistema}</p></article>)}</div>
        </> : <div className="calendar-soft-state"><i className="ti ti-plant-off" /><div><strong>No encontramos ese cultivo</strong><span>Probá con otro nombre o cambiá el filtro lunar.</span></div></div>}
        <div className="sowing-guide__note"><i className="ti ti-info-circle" /><p><strong>Cómo leer esta guía.</strong> La época indicada parte de condiciones climáticas normales de la zona Sur de Paraguay. La profundidad orientativa es de 2 a 3 veces el tamaño de la semilla. Las fases lunares reproducen la referencia de la fuente fotografiada; no sustituyen una recomendación técnica local.</p></div>
      </section>}
    </div>
  </div>
}
