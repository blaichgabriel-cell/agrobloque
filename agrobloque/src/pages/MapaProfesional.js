import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const hoy = () => new Date().toISOString().slice(0, 10)
const diasDesde = fecha => fecha ? Math.max(0, Math.floor((new Date(`${hoy()}T12:00:00`) - new Date(`${String(fecha).slice(0, 10)}T12:00:00`)) / 86400000)) : null
const numero = valor => Number(valor || 0).toLocaleString('es-PY')
const fechaCorta = valor => valor ? new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PY', { day:'numeric', month:'short' }) : 'Sin fecha'
const COLOR_CULTIVO = { 'Morrón':'#d08a24', 'Tomate':'#c7463b', 'Pepino':'#25a866', 'Berenjena':'#9148b5', 'Zapalito':'#d6a11c', 'Zucchini':'#159b82', 'Lechuga':'#4caa5b', 'Tomate Cherry':'#d9584c' }
const vacio = { letra:'A', numero:'', tipo:'invernadero' }

export default function MapaProfesional({ campoActivo }) {
  const navigate = useNavigate()
  const [data, setData] = useState({ bloques:[], plantas:[], tareas:[], actividades:[] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [estado, setEstado] = useState('todos')
  const [cultivo, setCultivo] = useState('todos')
  const [vista, setVista] = useState('tarjetas')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(vacio)
  const [saving, setSaving] = useState(false)

  const cargar = async () => {
    if (!campoActivo?.id) return
    setLoading(true); setError('')
    const { data: bloques, error: bloquesError } = await supabase.from('bloques').select('id,codigo,activo,tipo,superficie_m2').eq('campo_id', campoActivo.id).order('codigo')
    if (bloquesError) { setError(`No se pudieron cargar los bloques: ${bloquesError.message}`); setLoading(false); return }
    const ids = (bloques || []).map(b => b.id)
    if (!ids.length) { setData({ bloques:[], plantas:[], tareas:[], actividades:[] }); setLoading(false); return }
    const [plantasRes, tareasRes, fumiRes, fertRes] = await Promise.all([
      supabase.from('plantaciones').select('id,bloque_id,fecha_siembra,cantidad_plantas,densidad_plantas_m2,notas,cultivos(nombre)').in('bloque_id', ids).eq('activa', true),
      supabase.from('tareas').select('id,bloque_id,descripcion,fecha_programada,completada,anulada,prioridad').in('bloque_id', ids).eq('completada', false).order('fecha_programada'),
      supabase.from('fumigaciones').select('id,fecha,tipo,fumigacion_bloques(bloque_id)').eq('campo_id', campoActivo.id).eq('anulada', false).order('fecha', { ascending:false }).limit(100),
      supabase.from('fertilizaciones').select('id,bloque_id,fecha').in('bloque_id', ids).eq('anulada', false).order('fecha', { ascending:false }).limit(100),
    ])
    const actividades = [
      ...(fumiRes.data || []).flatMap(f => (f.fumigacion_bloques || []).map(b => ({ bloque_id:b.bloque_id, fecha:f.fecha, label:f.tipo || 'Fumigación' }))),
      ...(fertRes.data || []).map(f => ({ bloque_id:f.bloque_id, fecha:f.fecha, label:'Fertilización' })),
    ].sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)))
    setData({ bloques:bloques || [], plantas:plantasRes.data || [], tareas:(tareasRes.data || []).filter(t => !t.anulada), actividades })
    setLoading(false)
  }

  useEffect(() => { cargar() }, [campoActivo?.id])

  const registros = useMemo(() => data.bloques.map(b => {
    const planta = data.plantas.find(p => p.bloque_id === b.id)
    const tarea = data.tareas.find(t => t.bloque_id === b.id)
    const ultima = data.actividades.find(a => a.bloque_id === b.id)
    const vencida = Boolean(tarea?.fecha_programada && tarea.fecha_programada < hoy())
    const atencion = vencida || tarea?.prioridad === 'alta'
    return { ...b, planta, tarea, ultima, vencida, atencion, cultivo:planta?.cultivos?.nombre || '', plantas:Number(planta?.cantidad_plantas ?? planta?.densidad_plantas_m2 ?? 0), dias:diasDesde(planta?.fecha_siembra) }
  }), [data])

  const cultivos = useMemo(() => [...new Set(registros.map(r => r.cultivo).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es')), [registros])
  const filtrados = useMemo(() => registros.filter(r => {
    const texto = `${r.codigo} ${r.cultivo} ${r.planta?.notas || ''}`.toLowerCase()
    const coincideEstado = estado === 'todos' || (estado === 'produccion' && r.planta && r.activo) || (estado === 'atencion' && r.atencion) || (estado === 'vacio' && !r.planta)
    return texto.includes(query.trim().toLowerCase()) && coincideEstado && (cultivo === 'todos' || r.cultivo === cultivo)
  }), [registros, query, estado, cultivo])

  const resumen = {
    total: registros.length,
    produccion: registros.filter(r => r.planta && r.activo).length,
    vacios: registros.filter(r => !r.planta).length,
    atencion: registros.filter(r => r.atencion).length,
    plantas: registros.reduce((s,r) => s + r.plantas, 0),
  }

  const guardarBloque = async () => {
    const letra = String(form.letra || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
    const num = String(form.numero || '').replace(/[^0-9]/g, '')
    if (!letra || !num) return setError('Completá la letra y el número del bloque.')
    const codigo = `${letra}-${num}`
    if (data.bloques.some(b => String(b.codigo).toUpperCase() === codigo)) return setError(`El bloque ${codigo} ya existe.`)
    setSaving(true); setError('')
    const { data:nuevo, error:guardarError } = await supabase.from('bloques').insert({ campo_id:campoActivo.id, codigo, tipo:form.tipo, activo:true }).select('id').single()
    if (guardarError) setError(`No se pudo crear el bloque: ${guardarError.message}`)
    else { await registrarAuditoria({ accion:'Registro bloque', modulo:'Mapa', tabla:'bloques', registroId:nuevo?.id || '', detalle:`Bloque ${codigo}` }); setModal(false); setForm(vacio); await cargar() }
    setSaving(false)
  }

  if (!campoActivo) return <div className="ab-map-page"><div className="ab-empty">Seleccioná un campo desde el inicio.</div></div>

  return <div className="ab-map-page">
    <header className="ab-map-header"><div><span>CAMPO ACTIVO</span><h1>{campoActivo.nombre}</h1><p>Estado operativo de los bloques</p></div><button className="ab-new-block" onClick={() => { setError(''); setModal(true) }}><i className="ti ti-plus" />Nuevo bloque</button></header>
    {error && <div className="ab-map-error">{error}</div>}
    <section className="ab-map-kpis">
      <Kpi icon="ti-layout-grid" value={resumen.total} label="Bloques" />
      <Kpi icon="ti-leaf" value={resumen.produccion} label="En producción" />
      <Kpi icon="ti-seeding" value={resumen.vacios} label="Sin cultivo" />
      <Kpi icon="ti-alert-triangle" value={resumen.atencion} label="Requieren atención" alert={resumen.atencion > 0} />
      <Kpi icon="ti-plant" value={numero(resumen.plantas)} label="Plantas" />
    </section>
    <section className="ab-block-toolbar">
      <label className="ab-block-search"><i className="ti ti-search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar bloque o cultivo…" /></label>
      <div className="ab-status-filters">{[['todos','Todos'],['produccion','En producción'],['atencion','Requieren atención'],['vacio','Sin cultivo']].map(([k,v]) => <button key={k} className={estado === k ? 'active' : ''} onClick={() => setEstado(k)}>{v}</button>)}</div>
      <select value={cultivo} onChange={e => setCultivo(e.target.value)}><option value="todos">Todos los cultivos</option>{cultivos.map(c => <option key={c} value={c}>{c}</option>)}</select>
      <div className="ab-view-toggle"><button className={vista === 'tarjetas' ? 'active' : ''} onClick={() => setVista('tarjetas')}><i className="ti ti-layout-grid" />Tarjetas</button><button className={vista === 'mapa' ? 'active' : ''} onClick={() => setVista('mapa')}><i className="ti ti-map" />Mapa</button></div>
    </section>
    {loading ? <div className="ab-block-skeletons">{Array.from({length:8}).map((_,i) => <div key={i} />)}</div> : !filtrados.length ? <div className="ab-empty">No hay bloques que coincidan con los filtros.</div> : vista === 'tarjetas' ? <div className="ab-block-grid">{filtrados.map(r => <BlockCard key={r.id} item={r} onOpen={() => navigate(`/bloque/${r.id}`)} />)}</div> : <div className="ab-field-map">{filtrados.map(r => <BlockCard key={r.id} item={r} onOpen={() => navigate(`/bloque/${r.id}`)} compact />)}</div>}
    <NotasPanel modulo="mapa" titulo="Notas de bloques y mapa" />
    {modal && <div className="ab-modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}><div className="ab-modal"><div className="ab-modal-title"><div><span>NUEVO BLOQUE</span><h2>Agregar al campo</h2></div><button onClick={() => setModal(false)}><i className="ti ti-x" /></button></div><div className="ab-form-two"><label>Letra<input value={form.letra} maxLength={3} onChange={e => setForm(f => ({...f, letra:e.target.value.toUpperCase().replace(/[^A-Z]/g,'')}))} /></label><label>Número<input inputMode="numeric" value={form.numero} onChange={e => setForm(f => ({...f, numero:e.target.value.replace(/[^0-9]/g,'')}))} /></label></div><label className="ab-field-label">Tipo<select value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))}><option value="invernadero">Invernadero</option><option value="campo_abierto">Campo abierto</option></select></label><div className="ab-preview"><span>Vista previa</span><strong>{form.letra || 'A'}-{form.numero || '?'}</strong></div>{error && <div className="ab-map-error">{error}</div>}<button className="ab-save" onClick={guardarBloque} disabled={saving}>{saving ? 'Guardando…' : 'Guardar bloque'}</button></div></div>}
  </div>
}

function Kpi({ icon, value, label, alert }) { return <div className={`ab-kpi ${alert ? 'alert' : ''}`}><i className={`ti ${icon}`} /><div><strong>{value}</strong><span>{label}</span></div></div> }

function BlockCard({ item, onOpen, compact }) {
  const color = item.atencion ? (item.vencida ? '#c7463b' : '#d08a24') : item.cultivo ? (COLOR_CULTIVO[item.cultivo] || '#25a866') : '#9aa49f'
  const estado = item.atencion ? (item.vencida ? 'Atrasado' : 'Atención') : item.cultivo ? 'En producción' : 'Sin cultivo'
  const proxima = item.tarea ? `${item.tarea.descripcion} · ${item.tarea.fecha_programada === hoy() ? 'hoy' : fechaCorta(item.tarea.fecha_programada)}` : item.ultima ? `Última: ${item.ultima.label} · ${fechaCorta(item.ultima.fecha)}` : 'Sin actividad programada'
  return <button className={`ab-block-card ${compact ? 'compact' : ''} ${item.atencion ? 'attention' : ''}`} style={{ '--block-accent':color }} onClick={onOpen}>
    <span className="ab-card-menu"><i className="ti ti-dots-vertical" /></span><span className="ab-card-type">{item.tipo === 'invernadero' ? 'INVERNADERO' : 'CAMPO ABIERTO'}</span><strong className="ab-card-code">{item.codigo}</strong><span className="ab-card-crop">{item.cultivo || 'Sin cultivo activo'}</span><span className={`ab-card-status ${item.atencion ? 'attention' : !item.cultivo ? 'empty' : ''}`}><i className={`ti ${item.atencion ? 'ti-alert-circle' : item.cultivo ? 'ti-circle-check-filled' : 'ti-circle-filled'}`} />{estado}</span><span className="ab-card-meta"><i className="ti ti-plant" />{numero(item.plantas)} plantas{item.dias !== null ? ` · Día ${item.dias}` : ''}</span><span className={`ab-card-next ${item.vencida ? 'overdue' : ''}`}><i className="ti ti-calendar-event" />{proxima}</span>
  </button>
}
