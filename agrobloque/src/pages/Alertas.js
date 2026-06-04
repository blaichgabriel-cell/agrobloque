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
  baja: { color:'#176a25', bg:'#edf6ec', icon:'ti-info-circle' },
}

export default function Alertas() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [alertas, setAlertas] = useState([])

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
      { data: planesNutricionales },
    ] = await Promise.all([
      supabase.from('tareas').select('id, descripcion, fecha_programada, completada').eq('completada', false).order('fecha_programada'),
      supabase.from('productos').select('id, nombre, stock_actual, stock_minimo').eq('activo', true).order('nombre'),
      supabase.from('plantaciones').select('id, fecha_siembra, activa, bloques(id, codigo), cultivos(nombre)').eq('activa', true),
      supabase.from('vivero_lotes').select('id, cultivo, variedad, fecha_siembra, fecha_trasplante_estimada, estado').order('fecha_siembra', { ascending:false }),
      supabase.from('fumigaciones').select('id, fecha, campo_id, fumigacion_bloques(bloque_id, bloques(id, codigo)), fumigacion_productos(productos(nombre, carencia_dias))').order('fecha', { ascending:false }),
      supabase.from('fertilizacion_planes').select('id, nombre, fecha_inicio, bloque_id, bloques(codigo), fertilizacion_plan_aplicaciones(fecha)').eq('activo', true),
      supabase.from('plan_nutricional_registros').select('id, fecha, objetivo, ec_final, bloque_id, bloques(codigo)').order('fecha', { ascending:false }).limit(250),
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
      if (l.fecha_trasplante_estimada && l.fecha_trasplante_estimada <= hoy) {
        lista.push({
          tipo:'media',
          titulo:'Lote de vivero listo para revisar',
          detalle:`${l.cultivo || 'Cultivo'} ${l.variedad || ''} - trasplante estimado ${l.fecha_trasplante_estimada}`,
          path:'/vivero',
        })
      }
    })

    ;(planesFertilizacion || []).forEach(plan => {
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

    const ultimoPlanNutricionalPorBloque = {}
    ;(planesNutricionales || []).forEach(plan => {
      if (plan.bloque_id && !ultimoPlanNutricionalPorBloque[plan.bloque_id]) {
        ultimoPlanNutricionalPorBloque[plan.bloque_id] = plan
      }
      const ec = Number(plan.ec_final) || 0
      if (ec >= 3.2) {
        lista.push({
          tipo:'alta',
          titulo:'EC alta en plan nutricional',
          detalle:`Bloque ${plan.bloques?.codigo || '-'} - ${ec} mS/cm - ${plan.objetivo || 'sin objetivo'}`,
          path:'/plan-nutricional',
        })
      } else if (ec > 0 && ec <= 0.8) {
        lista.push({
          tipo:'media',
          titulo:'EC baja en plan nutricional',
          detalle:`Bloque ${plan.bloques?.codigo || '-'} - ${ec} mS/cm - revisar si corresponde al objetivo`,
          path:'/plan-nutricional',
        })
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
      const ultimoPlan = ultimoPlanNutricionalPorBloque[p.bloques?.id]
      if (dias >= 14 && (!ultimoPlan || diasEntre(ultimoPlan.fecha) >= 14)) {
        lista.push({
          tipo:'media',
          titulo:'Bloque activo sin plan nutricional reciente',
          detalle:`Bloque ${p.bloques?.codigo || '-'} - ${p.cultivos?.nombre || 'cultivo'} - ${ultimoPlan ? `${diasEntre(ultimoPlan.fecha)} dias desde ultimo plan` : 'sin plan registrado'}`,
          path:'/plan-nutricional',
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

    setAlertas(lista)
    setLoading(false)
  }

  const resumen = useMemo(() => ({
    alta: alertas.filter(a => a.tipo === 'alta').length,
    media: alertas.filter(a => a.tipo === 'media').length,
    baja: alertas.filter(a => a.tipo === 'baja').length,
  }), [alertas])

  return (
    <div style={{ minHeight:'100vh', background:'#f2f1ef', padding:'24px 14px 100px' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#8b928b' }}>Control operativo</div>
            <h1 style={{ margin:0, fontSize:24, letterSpacing:-0.6 }}>Alertas inteligentes</h1>
          </div>
          <button onClick={cargar} style={{ width:42, height:42, borderRadius:14, border:'none', background:'#212121', color:'#fff', cursor:'pointer' }}>
            <i className="ti ti-refresh" style={{ fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:12 }}>
          <Stat label="Altas" value={resumen.alta} color="#c84040" />
          <Stat label="Medias" value={resumen.media} color="#e07b00" />
          <Stat label="Avisos" value={resumen.baja} color="#176a25" />
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b' }}>Calculando alertas...</div>
        ) : alertas.length === 0 ? (
          <div style={{ textAlign:'center', padding:38, color:'#176a25', background:'#fff', borderRadius:20 }}>Todo tranquilo por ahora.</div>
        ) : alertas.map((a, i) => {
          const s = severidad[a.tipo] || severidad.baja
          return (
            <div key={`${a.titulo}-${i}`} onClick={() => navigate(a.path)} style={{ background:'#fff', borderRadius:18, padding:'14px 16px', marginBottom:8, border:'1px solid #e8ece8', cursor:'pointer' }}>
              <div style={{ display:'grid', gridTemplateColumns:'44px 1fr 18px', gap:12, alignItems:'center' }}>
                <span style={{ width:44, height:44, borderRadius:14, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:22, color:s.color }} aria-hidden="true"></i>
                </span>
                <span>
                  <strong style={{ display:'block', fontSize:15 }}>{a.titulo}</strong>
                  <span style={{ display:'block', fontSize:12, color:'#687068', marginTop:3 }}>{a.detalle}</span>
                </span>
                <i className="ti ti-chevron-right" style={{ fontSize:18 }} aria-hidden="true"></i>
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
    <div style={{ background:'#fff', borderRadius:18, padding:'14px', border:'1px solid #e8ece8' }}>
      <div style={{ fontSize:11, color:'#8b928b', textTransform:'uppercase', fontWeight:800 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:900, color, lineHeight:1.1, marginTop:4 }}>{value}</div>
    </div>
  )
}
