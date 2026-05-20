import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function LogoHS({ size = 36 }) {
  const h = size
  const w = size * 1.1
  return (
    <svg width={w} height={h} viewBox="0 0 110 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* H */}
      <path d="M8 82V18h12v24h28V18h12v64H48V50H20v32H8z" fill="#A0785A"/>
      {/* S — dibujada como curvas para que se vea completa */}
      <path d="M72 18h28c4 0 7 3 7 7v10c0 3-2 6-5 7 3 1 5 4 5 7v12c0 4-3 7-7 7H72V18z
               M82 42h16c1.2 0 2-0.8 2-2v-8c0-1.2-0.8-2-2-2H82v12z
               M82 64h16c1.2 0 2-0.8 2-2v-10c0-1.2-0.8-2-2-2H82v14z" fill="#7A5A3E"/>
      {/* Hojas */}
      <path d="M60 16c0 0-4-12 0-18 4 6 0 18 0 18z" fill="#D4B08A"/>
      <path d="M60 14c0 0-10-7-8-14 8 2 8 14 8 14z" fill="#C49878"/>
      <path d="M60 14c0 0 10-7 8-14-8 2-8 14-8 14z" fill="#C49878"/>
    </svg>
  )
}

export default function Dashboard({ campoActivo, setCampoActivo }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques:0, activos:0, cultivos:0, operarios:0 })
  const [alertas, setAlertas] = useState([])
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]

  const cargarStats = async (campo) => {
    const [{ data: bloques }, { data: plantas }, { data: ops }, { data: tareas }] = await Promise.all([
      supabase.from('bloques').select('id, activo').eq('campo_id', campo.id),
      supabase.from('plantaciones').select('id').eq('activa', true),
      supabase.from('operarios').select('id').eq('campo_id', campo.id),
      supabase.from('tareas').select('*, campos(nombre), bloques(codigo)').eq('completada', false).lte('fecha_programada', hoy).order('fecha_programada'),
    ])
    setStats({ bloques: bloques?.length||0, activos: bloques?.filter(b=>b.activo).length||0, cultivos: plantas?.length||0, operarios: ops?.length||0 })
    setAlertas(tareas || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('campos').select('*').order('nombre')
      if (!data || data.length === 0) return
      setCampos(data)
      const campo = campoActivo || data[0]
      if (!campoActivo) setCampoActivo(data[0])
      await cargarStats(campo)
    }
    init()
  }, [])

  useEffect(() => {
    if (campoActivo) cargarStats(campoActivo)
  }, [campoActivo])

  const accesos = [
    { icon:'ti-map',        label:'Mapa',         sub:'Ver bloques',    path:'/mapa',         bg:'#f5ede3', color:'#A0785A' },
    { icon:'ti-calendar',   label:'Agenda',       sub:'Tareas',         path:'/agenda',       bg:'#f5ede3', color:'#A0785A' },
    { icon:'ti-users',      label:'Asistencia',   sub:'Planilla',       path:'/asistencia',   bg:'#f2f1ef', color:'#0a0a0a' },
    { icon:'ti-chart-bar',  label:'Reportes',     sub:'Rentabilidad',   path:'/reportes',     bg:'#f5ede3', color:'#A0785A' },
    { icon:'ti-spray',      label:'Fumigaciones', sub:'Historial',      path:'/fumigaciones', bg:'#fff3e8', color:'#e07b00' },
    { icon:'ti-package',    label:'Inventario',   sub:'Stock',          path:'/inventario',   bg:'#f2f1ef', color:'#0a0a0a' },
    { icon:'ti-cut',        label:'Cosecha',      sub:'Produccion',     path:'/cosecha',      bg:'#f5ede3', color:'#A0785A' },
    { icon:'ti-coin',       label:'Costos',       sub:'Gastos',         path:'/costos',       bg:'#fff3e8', color:'#e07b00' },
  ]

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <LogoHS size={38} />
            <div>
              <div style={{ fontSize:11, color:'#9a9a9a', letterSpacing:.3 }}>HORTICULTURA</div>
              <div style={{ fontSize:17, fontWeight:700, color:'#A0785A', letterSpacing:-.3, lineHeight:1.1 }}>El Sembrador</div>
            </div>
          </div>
          <button onClick={() => navigate('/agenda')} style={{ width:42, height:42, borderRadius:'50%', background: alertas.length > 0 ? '#A0785A' : '#e8e6e2', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}>
            <i className="ti ti-bell" style={{ fontSize:20, color: alertas.length > 0 ? '#fff' : '#9a9a9a' }} aria-hidden="true"></i>
            {alertas.length > 0 && <div style={{ position:'absolute', top:-3, right:-3, background:'#e07b00', borderRadius:10, padding:'1px 5px', fontSize:8, fontWeight:700, color:'#fff', border:'2px solid #f2f1ef' }}>{alertas.length}</div>}
          </button>
        </div>

        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:4 }}>
          {campos.map(c => (
            <button key={c.id} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoActivo?.id===c.id ? '#A0785A' : 'transparent', color: campoActivo?.id===c.id ? '#fff' : '#9a9a9a' }} onClick={() => setCampoActivo(c)}>
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        <div style={{ background:'#A0785A', borderRadius:24, padding:20, marginBottom:10 }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', letterSpacing:.05, textTransform:'uppercase', marginBottom:6 }}>Bloques activos</div>
          <div style={{ fontSize:52, fontWeight:800, color:'#fff', lineHeight:1, letterSpacing:-2 }}>{stats.activos}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:4, marginBottom:18 }}>de {stats.bloques} totales · {campoActivo?.nombre}</div>
          <div style={{ display:'flex' }}>
            <div style={{ flex:1, borderRight:'1px solid rgba(255,255,255,0.1)', paddingRight:12 }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Cultivos</div>
              <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{stats.cultivos} activos</div>
            </div>
            <div style={{ flex:1, padding:'0 12px', borderRight:'1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Operarios</div>
              <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{stats.operarios}</div>
            </div>
            <div style={{ flex:1, paddingLeft:12 }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Alertas</div>
              <div style={{ fontSize:13, fontWeight:600, color: alertas.length > 0 ? '#f0c060' : 'rgba(255,255,255,0.85)' }}>{alertas.length}</div>
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
          {accesos.map((a, i) => (
            <div key={i} onClick={() => navigate(a.path)} style={{ background:'#fff', borderRadius:20, padding:'16px 14px', cursor:'pointer' }}>
              <div style={{ width:36, height:36, borderRadius:11, background:a.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                <i className={`ti ${a.icon}`} style={{ fontSize:17, color:a.color }} aria-hidden="true"></i>
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:'#0a0a0a', letterSpacing:-.3 }}>{a.label}</div>
              <div style={{ fontSize:9, color:'#b0b0b0', marginTop:2 }}>{a.sub}</div>
            </div>
          ))}
        </div>

        {alertas.length > 0 && (
          <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a', marginBottom:10, display:'flex', justifyContent:'space-between' }}>
              Alertas activas
              <button onClick={() => navigate('/agenda')} style={{ fontSize:11, color:'#A0785A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Ver todas</button>
            </div>
            {alertas.slice(0,3).map(a => (
              <div key={a.id} onClick={() => navigate('/agenda')} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #f2f1ef', cursor:'pointer' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: a.fecha_programada < hoy ? '#c84040' : '#e07b00', flexShrink:0 }}></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{a.descripcion}</div>
                  <div style={{ fontSize:10, color:'#9a9a9a', marginTop:1 }}>{a.campos?.nombre}{a.bloques?.codigo ? ' · ' + a.bloques.codigo : ''} · {a.fecha_programada}</div>
                </div>
                <div style={{ fontSize:9, fontWeight:600, padding:'2px 8px', borderRadius:8, background: a.fecha_programada < hoy ? '#fff0f0' : '#fff3e8', color: a.fecha_programada < hoy ? '#c84040' : '#c8700a' }}>
                  {a.fecha_programada < hoy ? 'Vencida' : 'Hoy'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
