import { Modal, FormHeading, Notice, Skeleton } from '../components/UI'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { toast } from 'sonner'
import { moonPhase, MOON_PHASES } from '../lib/moon'

const TIPOS = {
  fumigacion: { label:'Fumigación', icon:'ti-spray', color:'#e07b00', bg:'#fff3e8' },
  fertiriego:  { label:'Fertiriego',  icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  cosecha:     { label:'Cosecha',     icon:'ti-cut',     color:"#124e38", bg:'#eeeeee' },
  evaluacion:  { label:'Evaluación',  icon:'ti-clipboard-list', color:'#8e44ad', bg:'#f5eefb' },
  otro:        { label:'Otro',        icon:'ti-pin',     color:'#555',    bg:'#f2f1ef' },
}

const fechaLocal = fecha => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

function ModalConfirm({ onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label="Confirmar acción" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div className="ag-surface ui-211525">
        <div className="ui-3e43be">¿Cancelar tarea?</div>
        <div className="ui-01159a">La tarea se conservará en el historial.</div>
        <div className="ui-9c6869">
          <button className="ag-small-action ui-395a62" onClick={onCancel}>Cancelar</button>
          <button className="ag-small-action ui-f5f413" onClick={onConfirm}>Cancelar tarea</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Agenda() {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100
  const [tareas, setTareas] = useState([])
  const [campos, setCampos] = useState([])
  const [bloques, setBloques] = useState([])
  const [filtro, setFiltro] = useState('pendientes')
  const [vista, setVista] = useState('lista')
  const [mesVisible, setMesVisible] = useState(() => { const fecha = new Date(); fecha.setDate(1); return fecha })
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const vacio = { id:'', tipo:'fumigacion', descripcion:'', fecha_programada:'', hora_programada:'', campo_id:'', bloque_id:'', prioridad:'normal', responsable:'' }
  const [form, setForm] = useState(vacio)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const hoy = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchTareas(); fetchCampos() }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const fecha = new URLSearchParams(window.location.search).get('fecha')
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) {
      setForm({ ...vacio, fecha_programada:fecha })
      setModal(true)
      window.history.replaceState({}, '', '/agenda')
    }
  }, [])

  const fetchTareas = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('tareas').select('*, campos(nombre), bloques(codigo)').order('fecha_programada')
    if (error) setError('No se pudo cargar la agenda.')
    else setTareas(data || [])
    setLoading(false)
  }

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*')
    setCampos(data || [])
  }

  const fetchBloques = async (campo_id) => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campo_id).order('codigo')
    setBloques(data || [])
  }

  const guardarTarea = async () => {
    if (!form.descripcion || !form.fecha_programada) return setError('Completá la descripción y la fecha.')
    setSaving(true); setError(''); setSuccess('')
    const payload = { tipo:form.tipo, descripcion:form.descripcion.trim(), fecha_programada:form.fecha_programada, hora_programada:form.hora_programada || null, campo_id:form.campo_id||null, bloque_id:form.bloque_id||null, prioridad:form.prioridad || 'normal', responsable:form.responsable || null, updated_at:new Date().toISOString() }
    const ejecutar = datos => form.id ? supabase.from('tareas').update(datos).eq('id', form.id) : supabase.from('tareas').insert({ ...datos, completada:false })
    let result = await ejecutar(payload)
    if (result.error && `${result.error.message || ''}`.toLowerCase().includes('hora_programada')) {
      const { hora_programada, ...compatible } = payload
      result = await ejecutar(compatible)
    }
    const { error } = result
    if (error) { setError('No se pudo guardar la tarea. Revisá la conexión e intentá nuevamente.'); setSaving(false); return }
    await fetchTareas(); setSaving(false); setModal(false); setSuccess('Tarea guardada correctamente.'); toast.success('Tarea guardada', { description:`${payload.descripcion} · ${payload.fecha_programada}${payload.hora_programada ? ` ${payload.hora_programada}` : ''}` })
    setForm(vacio)
  }

  const editarTarea = async (t) => {
    setForm({ id:t.id, tipo:t.tipo || 'otro', descripcion:t.descripcion || '', fecha_programada:t.fecha_programada || '', hora_programada:t.hora_programada ? String(t.hora_programada).slice(0, 5) : '', campo_id:t.campo_id || '', bloque_id:t.bloque_id || '', prioridad:t.prioridad || 'normal', responsable:t.responsable || '' })
    if (t.campo_id) await fetchBloques(t.campo_id)
    setModal(true)
  }

  const reabrirTarea = async (id) => {
    await supabase.from('tareas').update({ completada:false, fecha_completada:null, anulada:false, cancelada:false, anulada_at:null, anulada_motivo:null, updated_at:new Date().toISOString() }).eq('id', id)
    fetchTareas()
  }

  const completarTarea = async (id) => {
    await supabase.from('tareas').update({ completada:true, fecha_completada:hoy }).eq('id', id)
    toast.success('Tarea completada')
    fetchTareas()
  }

  const activarNotificaciones = async () => {
    if (!('Notification' in window)) return toast.error('Este navegador no admite notificaciones.')
    const permission = await Notification.requestPermission()
    if (permission === 'granted') toast.success('Notificaciones activadas', { description:'Te avisaremos mientras AgroBloque esté abierto.' })
    else toast.info('Notificaciones no activadas', { description:'Podés habilitarlas luego desde los permisos del navegador.' })
  }

  const eliminarTarea = (id) => {
    setConfirmar({ fn: async () => {
      const { error } = await supabase.from('tareas').update({ anulada:true, anulada_at:new Date().toISOString() }).eq('id', id)
      if (error && `${error.message || ''}`.toLowerCase().includes('anulada')) {
        const tarea = tareas.find(t => t.id === id)
        await supabase.from('tareas').update({ completada:true, fecha_completada:hoy, descripcion:`[Cancelada] ${tarea?.descripcion || ''}` }).eq('id', id)
      }
      setConfirmar(null); fetchTareas()
    }})
  }

  const tareasFiltradas = tareas.filter(t => {
    if (filtro === 'pendientes') return !t.completada
    if (filtro === 'hoy') return t.fecha_programada === hoy && !t.completada
    if (filtro === 'completadas') return t.completada
    return true
  })

  const getBadge = (t) => {
    if (t.anulada || String(t.descripcion || '').startsWith('[Cancelada]')) return { label:'Cancelada', bg:'#f2f1ef', color:'#697970' }
    if (t.completada) return { label:'Completada', bg:'#eeeeee', color:"#124e38" }
    if (t.fecha_programada < hoy) return { label:'Vencida', bg:'#fff0f0', color:'#c84040' }
    if (t.fecha_programada === hoy) return { label:'Hoy', bg:'#fff3e8', color:'#c8700a' }
    return null
  }

  return (
    <div className="ag-page ui-c1c124">
      {confirmar && <ModalConfirm onConfirm={confirmar.fn} onCancel={() => setConfirmar(null)} />}

      <div className="ag-page-header ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-869419">
          <div>
            <div className="ui-476525">Planificación</div>
            <div className="ag-page-title ui-136b85">Agenda</div>
          </div>
          <div className="agenda-header-actions"><button className="app-button app-button--secondary app-button--icon" aria-label="Activar notificaciones" onClick={activarNotificaciones}><i className="ti ti-bell" aria-hidden="true" /></button><button className="app-button app-button--primary app-button--icon" aria-label="Agregar tarea" onClick={() => { setForm(vacio); setModal(true) }}><i className="ti ti-plus ui-d0538c" aria-hidden="true"></i></button></div>
        </div>
        <div className="SegmentedControl agenda-segments" role="tablist" aria-label="Filtrar tareas">
          {[['pendientes','Pendientes'],['hoy','Hoy'],['completadas','Completadas'],['todas','Todas']].map(([k,v]) => (
            <button className={filtro === k ? 'active' : ''} role="tab" aria-selected={filtro === k} key={k} onClick={() => setFiltro(k)}>{v}</button>
          ))}
        </div>
        <div className="agenda-view-switch" role="tablist" aria-label="Vista de agenda">
          <button type="button" className={vista === 'lista' ? 'active' : ''} aria-selected={vista === 'lista'} onClick={() => setVista('lista')}><i className="ti ti-list" />Lista</button>
          <button type="button" className={vista === 'calendario' ? 'active' : ''} aria-selected={vista === 'calendario'} onClick={() => setVista('calendario')}><i className="ti ti-calendar-month" />Calendario lunar</button>
        </div>
      </div>

      <div className="ag-page-body" style={{ padding: isDesktop ? '12px 36px 100px' : '12px 14px 100px' }}>
        <Notice tone="error">{!modal && error}</Notice><Notice>{success}</Notice>
        {loading ? <Skeleton rows={3} label="Cargando agenda" /> : vista === 'calendario' ? (
          <AgendaCalendar
            tareas={tareasFiltradas}
            mes={mesVisible}
            hoy={hoy}
            onMes={delta => setMesVisible(actual => { const siguiente = new Date(actual); siguiente.setMonth(siguiente.getMonth() + delta); return siguiente })}
            onHoy={() => { const fecha = new Date(); fecha.setDate(1); setMesVisible(fecha) }}
            onCreate={fecha => { setForm({ ...vacio, fecha_programada:fecha }); setModal(true) }}
            onTask={editarTarea}
          />
        ) : tareasFiltradas.length === 0 ? (
          <div className="empty-state"><span className="empty-state__icon"><i className="ti ti-calendar-check" aria-hidden="true" /></span><div><strong>No hay tareas {filtro === 'pendientes' ? 'pendientes' : 'en esta vista'}</strong><p>Agregá una tarea para organizar el próximo trabajo del campo.</p><button className="app-button app-button--secondary" onClick={() => { setForm(vacio); setModal(true) }}><i className="ti ti-plus" aria-hidden="true" />Crear tarea</button></div></div>
        ) : (
          <div className="ag-record-grid ui-998b74" style={{ gridTemplateColumns: isDesktop ? 'repeat(2, minmax(360px, 1fr))' : '1fr', gap: isDesktop ? 12 : 0 }}>
            {tareasFiltradas.map(t => {
          const tipo = TIPOS[t.tipo] || TIPOS.otro
          const badge = getBadge(t)
          return (
            <div className="ag-surface ui-9a7f69" key={t.id} style={{ marginBottom: isDesktop ? 0 : 8, opacity: t.completada ? 0.6 : 1, boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
              <div className="ui-3efc24">
                <div className="ui-4c27b0" style={{ background:tipo.bg }}>
                  <i className={`${`ti ${tipo.icon}`} ui-2592cc`} style={{ color:tipo.color }} aria-hidden="true"></i>
                </div>
                <div className="ui-da5cd6">
                  <div className="ui-8c86bf">{tipo.label}{t.campos?.nombre ? ' · ' + t.campos.nombre : ''}{t.bloques?.codigo ? ' · ' + t.bloques.codigo : ''}</div>
                  <div className="ui-076bb2">{t.descripcion}</div>
                </div>
                {badge && <div className="ui-fb8dcd" style={{ background:badge.bg, color:badge.color }}>{badge.label}</div>}
              </div>
              <div className="ui-8a97f7">
                <div className="agenda-task-time"><i className="ti ti-calendar-event" aria-hidden="true" />{t.fecha_programada}{t.hora_programada ? ` · ${String(t.hora_programada).slice(0, 5)}` : ''}</div>
                <div className="ui-91294d">
                  <button className="ag-small-action ui-2bc228" onClick={() => editarTarea(t)}>Editar</button>
                  {!t.completada && !t.anulada && (
                    <button className="ag-small-action ui-9f0a77" onClick={() => completarTarea(t.id)}>
                      ✓ Completar
                    </button>
                  )}
                  {!t.anulada && <button className="ag-small-action ui-0a41d9" onClick={() => eliminarTarea(t.id)}>
                    Cancelar
                  </button>
                  }
                  {(t.completada || t.anulada) && <button className="ag-small-action ui-aa2db8" onClick={() => reabrirTarea(t.id)}>Reabrir</button>}
                </div>
              </div>
            </div>
          )
        })}
          </div>
        )}
        <NotasPanel modulo="agenda" titulo="Bloc de notas de agenda" />
      </div>

      {modal && (
        <Modal busy={saving} onClose={() => setModal(false)} label="Registro de tarea" style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'center' : 'flex-end', justifyContent:'center' }}>
          <div className="ui-526967" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar tarea' : 'Nueva tarea'}</div>
            <label className="ag-field-label ui-74cc19">Tipo
            <select className="ui-2c08cb" value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))}>
              {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
            <label className="ag-field-label ui-74cc19">Descripción *
            <textarea className="ui-260cff" value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion:e.target.value}))} placeholder="Ej: Fumigar bloques A-2 y A-3"/></label>
            <div className="agenda-date-grid"><label className="ag-field-label">Fecha objetivo *<input type="date" value={form.fecha_programada} onChange={e => setForm(f => ({...f, fecha_programada:e.target.value}))}/></label><label className="ag-field-label">Hora objetivo<input type="time" value={form.hora_programada || ''} onChange={e => setForm(f => ({...f, hora_programada:e.target.value}))}/></label></div>
            <div className="ui-eba032"><div><label className="ag-field-label ui-74cc19">Prioridad<select className="ui-f9a767" value={form.prioridad || 'normal'} onChange={e => setForm(f => ({...f, prioridad:e.target.value}))}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option></select></label></div><div><label className="ag-field-label ui-74cc19">Responsable<input className="ui-90f37f" value={form.responsable || ''} onChange={e => setForm(f => ({...f, responsable:e.target.value}))} placeholder="Opcional" /></label></div></div>
            <label className="ag-field-label ui-74cc19">Campo (opcional)
            <select className="ui-2c08cb" value={form.campo_id} onChange={e => { setForm(f => ({...f, campo_id:e.target.value, bloque_id:''})); if(e.target.value) fetchBloques(e.target.value) }}>
              <option value="">Todos los campos</option>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            {form.campo_id && bloques.length > 0 && <>
              <div className="ui-74cc19">Bloque (opcional)</div>
              <select className="ui-2c08cb" value={form.bloque_id} onChange={e => setForm(f => ({...f, bloque_id:e.target.value}))}>
                <option value="">Todos los bloques</option>
                {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
              </select>
            </>}
            <button className="ag-small-action ui-17d991" onClick={guardarTarea} disabled={saving}>
              {saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Guardar tarea'}
            </button>
            <button className="ag-small-action ui-9d2a4a" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AgendaCalendar({ tareas, mes, hoy, onMes, onHoy, onCreate, onTask }) {
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const desplazamiento = (inicio.getDay() + 6) % 7
  const primera = new Date(inicio); primera.setDate(1 - desplazamiento)
  const dias = Array.from({ length:42 }, (_, indice) => { const fecha = new Date(primera); fecha.setDate(primera.getDate() + indice); return fecha })
  const tareasPorFecha = tareas.reduce((mapa, tarea) => {
    const clave = fechaLocal(new Date(`${tarea.fecha_programada}T12:00:00`))
    mapa[clave] = [...(mapa[clave] || []), tarea]
    return mapa
  }, {})
  return <section className="lunar-calendar" aria-label={`Calendario de ${mes.toLocaleDateString('es-PY', { month:'long', year:'numeric' })}`}>
    <div className="lunar-calendar__header"><div><small>AGENDA DEL CAMPO</small><h2>{mes.toLocaleDateString('es-PY', { month:'long', year:'numeric' })}</h2></div><div><button onClick={() => onMes(-1)} aria-label="Mes anterior"><i className="ti ti-chevron-left" /></button><button onClick={onHoy}>Hoy</button><button onClick={() => onMes(1)} aria-label="Mes siguiente"><i className="ti ti-chevron-right" /></button></div></div>
    <div className="lunar-calendar__weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(dia => <span key={dia}>{dia}</span>)}</div>
    <div className="lunar-calendar__grid">{dias.map(fecha => {
      const clave = fechaLocal(fecha)
      const fase = moonPhase(fecha)
      const items = tareasPorFecha[clave] || []
      const fuera = fecha.getMonth() !== mes.getMonth()
      return <div className={`lunar-day ${fuera ? 'is-outside' : ''} ${clave === hoy ? 'is-today' : ''}`} key={clave}>
        <button className="lunar-day__date" onClick={() => onCreate(clave)} aria-label={`Crear tarea el ${fecha.toLocaleDateString('es-PY')}. ${fase.label}`}><strong>{fecha.getDate()}</strong><span title={fase.label} aria-label={fase.label}>{fase.icon}</span></button>
        <div className="lunar-day__tasks">{items.slice(0, 3).map(tarea => { const tipo = TIPOS[tarea.tipo] || TIPOS.otro; return <button key={tarea.id} onClick={() => onTask(tarea)} title={tarea.descripcion}><i style={{ background:tipo.color }} />{tarea.hora_programada ? `${String(tarea.hora_programada).slice(0,5)} ` : ''}{tarea.descripcion}</button> })}{items.length > 3 && <span>+{items.length - 3} más</span>}</div>
      </div>
    })}</div>
    <div className="lunar-calendar__legend"><span>Cálculo astronómico aproximado; no constituye una recomendación agronómica.</span><span>{MOON_PHASES.filter((_, i) => i % 2 === 0).map(fase => `${fase.icon} ${fase.label}`).join(' · ')}</span></div>
  </section>
}
