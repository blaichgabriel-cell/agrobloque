import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const hoyIso = () => new Date().toISOString().slice(0, 10)
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
      supabase.from('tareas').select('id, descripcion, fecha_programada, completada').eq('completada', false).order('fecha_programada'),
      supabase.from('productos').select('id, nombre, stock_actual, stock_minimo').eq('activo', true).order('nombre'),
      supabase.from('plantaciones').select('id, fecha_siembra, activa, bloques(id, codigo), cultivos(nombre)').eq('activa', true),
      supabase.from('vivero_lotes').select('id, cultivo, variedad, fecha_siembra, fecha_estimada_trasplante, estado').eq('archivado', false).order('fecha_siembra', { ascending:false }),
      supabase.from('fumigaciones').select('id, fecha, campo_id, fumigacion_bloques(bloque_id, bloques(id, codigo)), fumigacion_productos(productos(nombre, carencia_dias))').order('fecha', { ascending:false }),
      supabase.from('fertilizacion_planes').select('id, nombre, fecha_inicio, fecha_fin, bloque_id, bloques(codigo), fertilizacion_plan_aplicaciones(fecha)').eq('activo', true),
      supabase.from('fertilizaciones').select('id, fecha, bloque_id, bloques(codigo)').order('fecha', { ascending:false }).limit(250),
    ])

    const lista = []

    ;(tareas || []).forEach(t => {
      const vencida = t.fecha_programada && t.fecha_programada < hoy
      lista.push({
        tipo: vencida ? 'alta' : 'media',
        titulo: vencida ? 'Tarea vencida' : 'Tarea pendiente',
        detalle: `${t.descripcion} - ${t.fecha_programada || 'sin fecha'}`,
        path: '/agenda',
      })
    })

    ;(productos || []).forEach(p => {
      const stock = Number(p.stock_actual) || 0
      const minimo = Number(p.stock_minimo) || 0
      if (stock <= 0) {
        lista.push({ tipo:'alta', titulo:'Producto sin stock', detalle:p.nombre, path:'/inventario' })
      } else if (minimo > 0 && stock <= minimo) {
        lista.push({ tipo:'media', titulo:'Producto con bajo stock', detalle:`${p.nombre} - stock ${stock} / minimo ${minimo}`, path:'/inventario' })
      }
    })

    ;(vivero || []).forEach(l => {
      if (l.estado && String(l.estado).toLowerCase().includes('trasplant')) return
      if (l.fecha_estimada_trasplante && l.fecha_estimada_trasplante <= hoy) {
        lista.push({
          tipo:'media',
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
          titulo: 'Plan semanal sin aplicacion reciente',
          detalle:`Bloque ${plan.bloques?.codigo || '-'} - ${plan.nombre || 'Plan semanal'} - ${dias} dias desde la ultima aplicacion`,
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
          titulo:'Bloque activo sin fertilizacion reciente',
          detalle:`Bloque ${p.bloques?.codigo || '-'} - ${p.cultivos?.nombre || 'cultivo'} - ${ultimaFert ? `${diasEntre(ultimaFert.fecha)} dias desde ultima fertilizacion` : 'sin fertilizacion registrada'}`,
          path:'/fertilizaciones',
        })
      }
      if (dias >= 21 && (!ultima || diasEntre(ultima.fecha) >= 21)) {
        lista.push({
          tipo:'baja',
          titulo:'Cultivo sin fumigacion reciente',
          detalle:`Bloque ${p.bloques?.codigo || '-'} - ${p.cultivos?.nombre || 'cultivo'} - ${ultima ? `${diasEntre(ultima.fecha)} dias desde ultima` : 'sin registro'}`,
          path: p.bloques?.id ? `/bloque/${p.bloques.id}` : '/mapa',
        })
      }
    })

    const { data:gestiones } = await supabase.from('alertas_gestion').select('clave,estado,pospuesta_hasta')
    const gestionPorClave = Object.fromEntries((gestiones || []).map(g => [g.clave, g]))
    const visibles = lista.map(a => ({ ...a, clave:`${a.titulo}|${a.detalle}`.slice(0, 240) })).filter(a => {
      const gestion = gestionPorClave[a.clave]
      if (!gestion) return true
      if (gestion.estado === 'resuelta') return false
      if (gestion.estado === 'pospuesta' && gestion.pospuesta_hasta && gestion.pospuesta_hasta >= hoy) return false
      return true
    })
    setAlertas(visibles)
    setLoading(false)
  }

  const gestionar = async (alerta, estado) => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user?.id) return
    const pospuesta_hasta = estado === 'pospuesta' ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10) : null
    const { error } = await supabase.from('alertas_gestion').upsert({ clave:alerta.clave, usuario_id:user.id, estado, pospuesta_hasta, updated_at:new Date().toISOString() }, { onConflict:'clave,usuario_id' })
    if (error) return setMensaje(`No se pudo actualizar la alerta: ${error.message}`)
    setMensaje(estado === 'resuelta' ? 'Alerta marcada como resuelta.' : 'Alerta pospuesta por 3 días.')
    setAlertas(actual => actual.filter(a => a.clave !== alerta.clave))
  }

  const resumen = useMemo(() => ({
    alta: alertas.filter(a => a.tipo === 'alta').length,
    media: alertas.filter(a => a.tipo === 'media').length,
    baja: alertas.filter(a => a.tipo === 'baja').length,
  }), [alertas])

  return (
    <div style={{ minHeight:'100vh', background:"#f6f8f7", padding: typeof window !== 'undefined' && window.innerWidth >= 768 ? '34px 36px 100px' : '24px 14px 100px' }}>
      <div style={{ maxWidth: typeof window !== 'undefined' && window.innerWidth >= 768 ? 1180 : 900, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:"#697970" }}>Control operativo</div>
            <h1 style={{ margin:0, fontSize:24, letterSpacing:-0.6 }}>Alertas inteligentes</h1>
          </div>
          <button onClick={cargar} style={{ width:42, height:42, borderRadius:8, border:'none', background:"#124e38", color:'#fff', cursor:'pointer' }}>
            <i className="ti ti-refresh" style={{ fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        {mensaje && <div style={{ background:'#edf6ec', color:'#08603f', border:'1px solid #d4e7d8', padding:'10px 12px', borderRadius:8, marginBottom:12, fontSize:12 }}>{mensaje}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:12 }}>
          <Stat label="Altas" value={resumen.alta} color="#c84040" />
          <Stat label="Medias" value={resumen.media} color="#e07b00" />
          <Stat label="Avisos" value={resumen.baja} color="#176a25" />
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:38, color:"#697970" }}>Calculando alertas...</div>
        ) : alertas.length === 0 ? (
          <div style={{ textAlign:'center', padding:38, color:"#08603f", background:'#fff', borderRadius:8 }}>Todo tranquilo por ahora.</div>
        ) : alertas.map((a, i) => {
          const s = severidad[a.tipo] || severidad.baja
          return (
            <div key={`${a.titulo}-${i}`} onClick={() => navigate(a.path)} style={{ background:'#fff', borderRadius:8, padding:'14px 16px', marginBottom:8, border:'1px solid #e8ece8', cursor:'pointer', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
              <div style={{ display:'grid', gridTemplateColumns:'44px 1fr auto', gap:12, alignItems:'center' }}>
                <span style={{ width:44, height:44, borderRadius:8, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:22, color:s.color }} aria-hidden="true"></i>
                </span>
                <span>
                  <strong style={{ display:'block', fontSize:15 }}>{a.titulo}</strong>
                  <span style={{ display:'block', fontSize:12, color:'#687068', marginTop:3 }}>{a.detalle}</span>
                </span>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}><button onClick={e => { e.stopPropagation(); gestionar(a, 'pospuesta') }} style={{ border:'1px solid #e2e9e5', background:'#fff', borderRadius:7, padding:'7px 9px', fontSize:10, cursor:'pointer' }}>Posponer 3 días</button><button onClick={e => { e.stopPropagation(); gestionar(a, 'resuelta') }} style={{ border:'none', background:'#08603f', color:'#fff', borderRadius:7, padding:'7px 9px', fontSize:10, fontWeight:700, cursor:'pointer' }}>Resolver</button></div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background:'#fff', borderRadius:8, padding:'14px', border:'1px solid #e8ece8' }}>
      <div style={{ fontSize:11, color:"#697970", textTransform:'uppercase', fontWeight:700 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color, lineHeight:1.1, marginTop:4 }}>{value}</div>
    </div>
  )
}
