import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { moonPhase, MOON_PHASES } from '../lib/moon'
import { Skeleton } from '../components/UI'

const fechaLocal = fecha => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
const TIPOS = {
  fumigacion:'#e07b00', fertiriego:'#2980b9', cosecha:'#176a45', evaluacion:'#8e44ad', otro:'#66746c',
}

export default function Calendario() {
  const navigate = useNavigate()
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

  return <div className="ag-page calendar-page">
    <div className="calendar-page__hero"><div><small>PLANIFICACIÓN AGRÍCOLA</small><h1 className="ag-page-title">Calendario</h1><p>Agenda del campo con referencia astronómica de las fases lunares.</p></div><div className="calendar-moon-today"><span>{moonPhase(new Date()).icon}</span><div><small>FASE DE HOY</small><strong>{moonPhase(new Date()).label}</strong></div></div></div>
    <div className="calendar-page__body">
      {loading ? <Skeleton rows={5} label="Cargando calendario" /> : error ? <div className="calendar-soft-state"><i className="ti ti-cloud-off" /><div><strong>No pudimos actualizar el calendario</strong><span>Revisá la conexión e intentá nuevamente.</span></div></div> : <section className="lunar-calendar">
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
      </section>}
    </div>
  </div>
}
