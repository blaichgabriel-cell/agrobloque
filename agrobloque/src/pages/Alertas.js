import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const hoyIso = () => new Date().toISOString().slice(0, 10)
const NOTIFICATION_KEY = 'agrobloque-notificaciones'
const ALERT_COUNT_EVENT = 'agrobloque:alertas-conteo'
const diasEntre = (fecha) => {
  if (!fecha) return 0
  return Math.floor((new Date(hoyIso() + 'T00:00:00') - new Date(fecha + 'T00:00:00')) / 86400000)
}

const severidad = {
  alta: { color:'#c84040', bg:'#fff0f0', icon:'ti-alert-triangle' },
  media: { color:'#e07b00', bg:'#fff4e8', icon:'ti-alert-circle' },
  baja: { color:"#08603f", bg:'#edf6ec', icon:'ti-info-circle' },
}

export default function Alertas() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [alertas, setAlertas] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [expandidas, setExpandidas] = useState({})
  const [notificaciones, setNotificaciones] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(NOTIFICATION_KEY) === 'on' && window.Notification?.permission === 'granted')

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const hoy = hoyIso()
    const [
      { data: tareas },
      { data: productos },
      { data: plantaciones },
      { data: vivero },
      { data: fumigaciones },
      { data: planesFertilizacion },
      { data: fertilizacionesRecientes },
    ] = await Promise.all([
      supabase.from('tareas').select('id, descripcion, fecha_programada, completada, anulada').eq('completada', false).or('anulada.is.null,anulada.eq.false').order('fecha_programada'),
      supabase.from('productos').select('id, nombre, stock_actual, stock_minimo').eq('activo', true).order('nombre'),
      supabase.from('plantaciones').select('id, fecha_siembra, activa, bloques(id, codigo), cultivos(nombre)').eq('activa', true),
      supabase.from('vivero_lotes').select('id, cultivo, variedad, fecha_siembra, fecha_estimada_trasplante, estado').eq('archivado', false).order('fecha_siembra', { ascending:false }),
      supabase.from('fumigaciones').select('id, fecha, campo_id, fumigacion_bloques(bloque_id, bloques(id, codigo)), fumigacion_productos(productos(nombre, carencia_dias))').order('fecha', { ascending:false }),
      supabase.from('fertilizacion_planes').select('id, nombre, fecha_inicio, fecha_fin, bloque_id, bloques(codigo), fertilizacion_plan_aplicaciones(fecha)').eq('activo', true),
      supabase.from('fertilizaciones').select('id, fecha, bloque_id, bloques(codigo)').order('fecha', { ascending:false }).limit(250),
    ])

    const lista = []

    ;(tareas || []).filter(t => !t.anulada && !String(t.descripcion || '').startsWith('[Cancelada]')).forEach(t => {
      const vencida = t.fecha_programada && t.fecha_programada < hoy
      lista.push({
        tipo: vencida ? 'alta' : 'media',
        categoria:'importante',
        claveBase:`tarea:${t.id}`,
        titulo: vencida ? 'Tarea vencida' : 'Tarea pendiente',
        detalle: `${t.descripcion} - ${t.fecha_programada || 'sin fecha'}`,
        path: '/agenda',
      })
    })

    ;(productos || []).forEach(p => {
      const stock = Number(p.stock_actual) || 0
      const minimo = Number(p.stock_minimo) || 0
      if (stock <= 0) {
        lista.push({ tipo:'alta', categoria:'importante', claveBase:`stock:${p.id}`, titulo:'Producto sin stock', detalle:p.nombre, path:'/inventario' })
      } else if (minimo > 0 && stock <= minimo) {
        lista.push({ tipo:'media', categoria:'importante', claveBase:`stock:${p.id}`, titulo:'Producto con bajo stock', detalle:`${p.nombre} - stock ${stock} / mínimo ${minimo}`, path:'/inventario' })
      }
    })

    ;(vivero || []).forEach(l => {
      if (l.estado && String(l.estado).toLowerCase().includes('trasplant')) return
      if (l.fecha_estimada_trasplante && l.fecha_estimada_trasplante <= hoy) {
        lista.push({
          tipo:'media',
          categoria:'importante',
          claveBase:`vivero:${l.id}`,
          titulo:'Lote de vivero listo para revisar',
          detalle:`${l.cultivo || 'Cultivo'} ${l.variedad || ''} - trasplante estimado ${l.fecha_estimada_trasplante}`,
          path:'/vivero',
        })
      }
    })

    ;(planesFertilizacion || []).forEach(plan => {
      if (plan.fecha_fin && plan.fecha_fin < new Date().toISOString().split('T')[0]) return
      const aplicaciones = plan.fertilizacion_plan_aplicaciones || []
      const ultima = aplicaciones
        .map(a => a.fecha)
        .filter(Boolean)
        .sort()
        .pop()
      const fechaBase = ultima || plan.fecha_inicio
      if (!fechaBase) return
      const dias = diasEntre(fechaBase)
      if (dias >= 7) {
        lista.push({
          tipo: dias >= 10 ? 'alta' : 'media',
          categoria:'sugerencia',
          grupo:'planes-fertilizacion',
          claveBase:`plan-fertilizacion:${plan.id}`,
          titulo: 'Plan semanal sin aplicación reciente',
          detalle:`Bloque ${plan.bloques?.codigo || '-'} - ${plan.nombre || 'Plan semanal'} - ${dias} días desde la última aplicación`,
          path: plan.bloque_id ? `/bloque/${plan.bloque_id}` : '/mapa',
        })
      }
    })

    const ultimaFertilizacionPorBloque = {}
    ;(fertilizacionesRecientes || []).forEach(fert => {
      if (fert.bloque_id && !ultimaFertilizacionPorBloque[fert.bloque_id]) {
        ultimaFertilizacionPorBloque[fert.bloque_id] = fert
      }
    })

    const ultimaFumiPorBloque = {}
    ;(fumigaciones || []).forEach(f => {
      ;(f.fumigacion_bloques || []).forEach(fb => {
        const id = fb.bloque_id
        if (!id || ultimaFumiPorBloque[id]) return
        ultimaFumiPorBloque[id] = { fecha:f.fecha, codigo:fb.bloques?.codigo }
      })
    })

    ;(fumigaciones || []).forEach(f => {
      const maxCarencia = Math.max(0, ...(f.fumigacion_productos || []).map(fp => Number(fp.productos?.carencia_dias) || 0))
      if (maxCarencia <= 0) return
      const fechaFin = new Date(f.fecha + 'T00:00:00')
      fechaFin.setDate(fechaFin.getDate() + maxCarencia)
      const restantes = Math.ceil((fechaFin - new Date(hoy + 'T00:00:00')) / 86400000)
      if (restantes <= 0) return
      const bloquesTxt = (f.fumigacion_bloques || []).map(fb => fb.bloques?.codigo).filter(Boolean).join(', ')
      const productosTxt = (f.fumigacion_productos || []).map(fp => fp.productos?.nombre).filter(Boolean).join(', ')
      lista.push({
        tipo:'alta',
        categoria:'importante',
        claveBase:`carencia:${f.id}`,
        titulo:'Carencia activa',
        detalle:`Bloques ${bloquesTxt || '-'} - faltan ${restantes} dia${restantes === 1 ? '' : 's'} - ${productosTxt || 'producto con carencia'}`,
        path:'/fumigaciones',
      })
    })

    ;(plantaciones || []).forEach(p => {
      const dias = diasEntre(p.fecha_siembra)
      const ultima = ultimaFumiPorBloque[p.bloques?.id]
      const ultimaFert = ultimaFertilizacionPorBloque[p.bloques?.id]
      if (dias >= 14 && (!ultimaFert || diasEntre(ultimaFert.fecha) >= 14)) {
        lista.push({
          tipo:'media',
          categoria:'sugerencia',
          grupo:'fertilizacion-reciente',
          claveBase:`fertilizacion-bloque:${p.bloques?.id || p.id}`,
          titulo:'Bloque activo sin fertilización reciente',
          detalle:`Bloque ${p.bloques?.codigo || '-'} - ${p.cultivos?.nombre || 'cultivo'} - ${ultimaFert ? `${diasEntre(ultimaFert.fecha)} días desde última fertilización` : 'sin fertilización registrada'}`,
          path:'/fertilizaciones',
        })
      }
      if (dias >= 21 && (!ultima || diasEntre(ultima.fecha) >= 21)) {
        lista.push({
          tipo:'baja',
          categoria:'sugerencia',
          grupo:'fumigacion-reciente',
          claveBase:`fumigacion-bloque:${p.bloques?.id || p.id}`,
          titulo:'Cultivo sin fumigación reciente',
          detalle:`Bloque ${p.bloques?.codigo || '-'} - ${p.cultivos?.nombre || 'cultivo'} - ${ultima ? `${diasEntre(ultima.fecha)} días desde última` : 'sin registro'}`,
          path: p.bloques?.id ? `/bloque/${p.bloques.id}` : '/mapa',
        })
      }
    })

    const { data:gestiones } = await supabase.from('alertas_gestion').select('clave,estado,pospuesta_hasta')
    const gestionPorClave = Object.fromEntries((gestiones || []).map(g => [g.clave, g]))
    const visibles = lista.map(a => ({ ...a, categoria:a.categoria || 'importante', clave:(a.claveBase || `${a.titulo}|${a.detalle}`).slice(0, 240) })).filter(a => {
      const gestion = gestionPorClave[a.clave]
      if (!gestion) return true
      if (gestion.estado === 'resuelta') return false
      if (gestion.estado === 'pospuesta' && gestion.pospuesta_hasta && gestion.pospuesta_hasta >= hoy) return false
      return true
    })
    setAlertas(visibles)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ALERT_COUNT_EVENT, { detail:{ count:visibles.filter(a => a.categoria === 'importante').length } }))
    if (typeof window !== 'undefined' && window.localStorage.getItem(NOTIFICATION_KEY) === 'on' && window.Notification?.permission === 'granted') {
      visibles.filter(a => a.categoria === 'importante').slice(0, 3).forEach(alerta => {
        const claveAviso = `agrobloque-alerta:${hoy}:${alerta.clave}`
        if (window.localStorage.getItem(claveAviso)) return
        try { new Notification(`AgroBloque · ${alerta.titulo}`, { body:alerta.detalle, icon:'/logo192.png', tag:alerta.clave }) } catch {}
        window.localStorage.setItem(claveAviso, '1')
      })
    }
    setLoading(false)
  }

  const activarNotificaciones = async () => {
    if (!('Notification' in window)) return setMensaje('Este navegador no permite notificaciones.')
    if (notificaciones) {
      window.localStorage.removeItem(NOTIFICATION_KEY)
      setNotificaciones(false)
      setMensaje('Avisos del navegador desactivados en AgroBloque.')
      return
    }
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return setMensaje('El navegador no autorizó las notificaciones. Podés habilitarlas desde el candado de la barra de direcciones.')
    window.localStorage.setItem(NOTIFICATION_KEY, 'on')
    setNotificaciones(true)
    setMensaje('Notificaciones activadas. AgroBloque te avisará sobre tareas y alertas mientras la aplicación esté abierta.')
    cargar()
  }

  const gestionarVarias = async (items, estado) => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user?.id) return
    const pospuesta_hasta = estado === 'pospuesta' ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10) : null
    const registros = items.map(alerta => ({ clave:alerta.clave, usuario_id:user.id, estado, pospuesta_hasta, updated_at:new Date().toISOString() }))
    const { error } = await supabase.from('alertas_gestion').upsert(registros, { onConflict:'clave,usuario_id' })
    if (error) return setMensaje(`No se pudo actualizar la alerta: ${error.message}`)
    const claves = new Set(items.map(item => item.clave))
    setMensaje(estado === 'resuelta' ? `${items.length === 1 ? 'Aviso ocultado' : `${items.length} avisos ocultados`} permanentemente.` : `${items.length === 1 ? 'Aviso pospuesto' : `${items.length} avisos pospuestos`} por 3 días.`)
    setAlertas(actual => actual.filter(a => !claves.has(a.clave)))
  }

  const gestionar = (alerta, estado) => gestionarVarias([alerta], estado)

  const importantes = useMemo(() => alertas.filter(alerta => alerta.categoria === 'importante'), [alertas])
  const sugerencias = useMemo(() => {
    const grupos = new Map()
    alertas.filter(alerta => alerta.categoria === 'sugerencia').forEach(alerta => {
      const claveGrupo = alerta.grupo || alerta.titulo
      if (!grupos.has(claveGrupo)) grupos.set(claveGrupo, { claveGrupo, titulo:alerta.titulo, tipo:alerta.tipo, path:alerta.path, items:[] })
      grupos.get(claveGrupo).items.push(alerta)
    })
    return Array.from(grupos.values()).map(grupo => ({
      ...grupo,
      titulo: grupo.claveGrupo === 'fertilizacion-reciente' ? 'Fertilización para revisar' : grupo.claveGrupo === 'fumigacion-reciente' ? 'Fumigación para revisar' : grupo.titulo,
      detalle: grupo.items.length === 1 ? grupo.items[0].detalle : `${grupo.items.length} avisos agrupados. Abrí la lista para ver los bloques.`,
    }))
  }, [alertas])

  const resumen = useMemo(() => ({
    urgentes: importantes.filter(a => a.tipo === 'alta').length,
    importantes: importantes.length,
    sugerencias: alertas.filter(a => a.categoria === 'sugerencia').length,
  }), [alertas, importantes])

  return (
    <div className="ag-page ag-page-body ui-71cde8" style={{ padding: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '34px 36px 100px' : '24px 14px 100px' }}>
      <div className="ui-f47a4b" style={{ maxWidth: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 1180 : 900 }}>
        <div className="ui-d73a43">
          <div>
            <div className="ui-93a7e1">Control operativo</div>
            <h1 className="ui-ee8706">Alertas inteligentes</h1>
          </div>
          <div className="alerts-header-actions"><button className={`alerts-notification-button ${notificaciones ? 'is-active' : ''}`} onClick={activarNotificaciones}><i className={`ti ${notificaciones ? 'ti-bell-check' : 'ti-bell'}`} />{notificaciones ? 'Avisos activos' : 'Activar avisos'}</button><button className="ui-27d7de" aria-label="Actualizar" onClick={cargar}><i className="ti ti-refresh ui-e5e6f8" aria-hidden="true"></i></button></div>
        </div>
        {mensaje && <div className="ui-ab0dc2">{mensaje}</div>}
        <div className="alerts-notification-note"><i className="ti ti-info-circle" /><span>Los avisos del navegador funcionan mientras AgroBloque está abierto. Las notificaciones con la aplicación cerrada requieren activar el servicio push del servidor.</span></div>

        <div className="ui-9420ec">
          <Stat label="Urgentes" value={resumen.urgentes} color="#c84040" />
          <Stat label="Importantes" value={resumen.importantes} color="#e07b00" />
          <Stat label="Sugerencias agrupadas" value={sugerencias.length} color="#176a25" />
        </div>

        {loading ? (
          <div className="ui-4e47d3">Calculando alertas...</div>
        ) : alertas.length === 0 ? (
          <div className="ag-surface ui-422178">Todo tranquilo por ahora.</div>
        ) : <>
          <section className="alerts-section"><div className="alerts-section__head"><div><span>REQUIERE ATENCIÓN</span><h2>Alertas importantes</h2></div><em>{importantes.length}</em></div>{importantes.length ? importantes.map(alerta => <AlertItem key={alerta.clave} alerta={alerta} onOpen={() => navigate(alerta.path)} onPostpone={() => gestionar(alerta, 'pospuesta')} onResolve={() => gestionar(alerta, 'resuelta')} />) : <div className="ag-surface alerts-empty"><i className="ti ti-circle-check" />No hay alertas importantes.</div>}</section>
          <section className="alerts-section alerts-section--suggestions"><div className="alerts-section__head"><div><span>RECOMENDACIONES AUTOMÁTICAS</span><h2>Sugerencias agronómicas</h2><p>No se incluyen en el contador principal.</p></div><em>{sugerencias.length}</em></div>{sugerencias.length ? sugerencias.map(grupo => <GroupedAlert key={grupo.claveGrupo} grupo={grupo} expanded={Boolean(expandidas[grupo.claveGrupo])} onToggle={() => setExpandidas(actual => ({ ...actual, [grupo.claveGrupo]:!actual[grupo.claveGrupo] }))} onOpen={item => navigate(item.path)} onPostpone={() => gestionarVarias(grupo.items, 'pospuesta')} onResolve={() => gestionarVarias(grupo.items, 'resuelta')} />) : <div className="ag-surface alerts-empty"><i className="ti ti-leaf" />No hay sugerencias pendientes.</div>}</section>
        </>}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="ag-surface ui-72e6b5">
      <div className="ui-7e686d">{label}</div>
      <div className="ui-121d5b" style={{ color }}>{value}</div>
    </div>
  )
}

function AlertItem({ alerta, onOpen, onPostpone, onResolve, compact = false }) {
  const s = severidad[alerta.tipo] || severidad.baja
  return <article className={`ag-surface alert-row ${compact ? 'is-compact' : ''}`}>
    <button type="button" className="alert-row__main" onClick={onOpen}>
      <span className="alert-row__icon" style={{ background:s.bg }}><i className={`ti ${s.icon}`} style={{ color:s.color }} /></span>
      <span className="alert-row__copy"><strong>{alerta.titulo}</strong><small>{alerta.detalle}</small></span>
      <i className="ti ti-chevron-right alert-row__chevron" />
    </button>
    {!compact && <div className="alert-row__actions"><button type="button" onClick={onPostpone}>Recordar en 3 días</button><button type="button" onClick={onResolve}>No volver a avisar</button></div>}
  </article>
}

function GroupedAlert({ grupo, expanded, onToggle, onOpen, onPostpone, onResolve }) {
  const s = severidad[grupo.tipo] || severidad.baja
  return <article className="ag-surface alert-group">
    <button type="button" className="alert-group__summary" onClick={onToggle} aria-expanded={expanded}>
      <span className="alert-row__icon" style={{ background:s.bg }}><i className={`ti ${s.icon}`} style={{ color:s.color }} /></span>
      <span className="alert-row__copy"><strong>{grupo.titulo}</strong><small>{grupo.detalle}</small></span>
      <span className="alert-group__count">{grupo.items.length}</span><i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} />
    </button>
    {expanded && <div className="alert-group__details">{grupo.items.map(item => <AlertItem key={item.clave} alerta={item} compact onOpen={() => onOpen(item)} />)}</div>}
    <div className="alert-row__actions"><button type="button" onClick={onPostpone}>Recordar en 3 días</button><button type="button" onClick={onResolve}>No volver a avisar</button></div>
  </article>
}
