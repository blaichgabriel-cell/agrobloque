import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function LogoHS({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 90V30h11v24h26V30h11v60H51V60H25v30H14z" fill="#1E5631"/>
      <path d="M70 30h32c5.5 0 10 4.5 10 10v8c0 4.5-2.5 8-7 9.5 4.5 1.5 7 5 7 9.5v10c0 5.5-4.5 10-10 10H70V30zm11 26h19c1.8 0 3-1.2 3-3v-7c0-1.8-1.2-3-3-3H81v13zm0 23h19c1.8 0 3-1.2 3-3v-8c0-1.8-1.2-3-3-3H81v14z" fill="#2d8a4e"/>
      <path d="M60 26c0 0-5-14 0-20 5 6 0 20 0 20z" fill="#5abf7a"/>
      <path d="M60 24c0 0-12-9-10-19 9 2 10 19 10 19z" fill="#4aaa6a"/>
      <path d="M60 24c0 0 12-9 10-19-9 2-10 19-10 19z" fill="#4aaa6a"/>
    </svg>
  )
}

export default function Dashboard({ campoActivo, setCampoActivo }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques:0, activos:0, cultivos:0, operarios:0 })
  const [alertas, setAlertas] = useState([])
  const [showAlertas, setShowAlertas] = useState(false)
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const fetchCampos = async () => {
      const { data } = await supabase.from('campos').select('*').order('nombre')
      if (data && data.length > 0) { setCampos(data); if (!campoActivo) setCampoActivo(data[0]) }
    }
    fetchCampos()
  }, [])

  useEffect(() => {
    if (!campoActivo) return
    const fetchStats = async () => {
      const { data: bloques } = await supabase.from('bloques').select('id, activo').eq('campo_id', campoActivo.id)
      const { data: plantas } = await supabase.from('plantaciones').select('id').eq('activa', true)
      const { data: ops } = await supabase.from('operarios').select('id').eq('campo_id', campoActivo.id)
      setStats({
        bloques: bloques?.length || 0,
        activos: bloques?.filter(b => b.activo).length || 0,
        cultivos: plantas?.length || 0,
        operarios: ops?.length || 0
      })
    }
    const fetchAlertas = async () => {
      const { data } = await supabase.from('tareas')
        .select('*, campos(nombre), bloques(codigo)')
        .eq('completada', false)
        .lte('fecha_programada', hoy)
        .order('fecha_programada')
      setAlertas(data || [])
    }
    fetchStats(); fetchAlertas()
  }, [campoActivo])

  const accesos = [
    { icon:'ti-map', label:'Mapa', sub:'Ver bloques', path:'/mapa', bg:'#f2f1ef', color:'#1E5631' },
    { icon:'ti-calendar', label:'Agenda', sub:'Tareas', path:'/agenda', bg:'#edf7ed', color:'#1E5631' },
    { icon:'ti-users', label:'Asistencia', sub:'Planilla', path:'/asistencia', bg:'#f2f1ef', color:'#0a0a0a' },
    { icon:'ti-chart-bar', label:'Reportes', sub:'Rentabilidad', path:'/reportes', bg:'#edf7ed', color:'#1E5631' },
    { icon:'ti-spray', label:'Fumigaciones', sub:'Historial', path:'/fumigaciones', bg:'#fff3e8', color:'#e07b00' },
    { icon:'ti-package', label:'Inventario', sub:'Stock', path:'/inventario', bg:'#f2f1ef', color:'#0a0a0a' },
    { icon:'ti-cut', label:'Cosecha', sub:'Producción', path:'/cosecha', bg:'#edf7ed', color:'#1E5631' },
    { icon:'ti-coin', label:'Costos', sub:'Gastos', path:'/costos', bg:'#fff3e8', color:'#e07b00' },
  ]

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <LogoHS size={36} />
            <div>
              <div style={{ fontSize:11, color:'#9a9a9a', letterSpacing:.3 }}>HORTICULTURA</div>
              <div style={{ fontSize:17, fontWeight:700, color:'#1E5631', letterSpacing:-.3, lineHeight:1.1 }}>El Sembrador</div>
            </div>
          </div>
          <button onClick={() => setShowAlertas(!showAlertas)} style={{ width:42, height:42, borderRadius:'50%', background: alertas.length > 0 ? '#1E5631' : '#e8e6e2', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}>
            <i className="ti ti-bell" style={{ fontSize:20, color: alertas.length > 0 ? '#fff' : '#9a9a9a' }} aria-hidden="true"></i>
            {alertas.length > 0 && (
              <div style={{ position:'absolute', top:-3, right:-3, background:'#e07b00', borderRadius:10, padding:'1px 5px', fontSize:8, fontWeight:700, color:'#fff', border:'2px solid #f2f1ef' }}>{alertas.length}</div>
            )}
          </button>
        </div>

        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:4 }}>
          {campos.map(c => (
            <button key={c.id} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoActivo?.id===c.id ? '#1E5631' : 'transparent', color: campoActivo?.id===c.id ? '#fff' : '#9a9a9a' }} onClick={() => setCampoActivo(c)}>
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {showAlertas && alertas.length > 0 && (
        <div style={{ margin:'0 14px 10px', background:'#fff', borderRadius:20, padding:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a', marginBottom:12, display:'flex', justifyContent:'space-between' }}>
            Alertas activas
            <button onClick={() => { setShowAlertas(false); navigate('/agenda') }} style={{ fontSize:11, color:'#1E5631', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Ver en agenda →</button>
          </div>
          {alertas.map(a => (
            <div key={a.id} onClick={() => navigate('/agenda')} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f2f1ef', cursor:'pointer' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: a.fecha_programada < hoy ? '#c84040' : '#e07b00', flexShrink:0 }}></div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'#0a0a0a' }}>{a.descripcion}</div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginTop:1 }}>{a.campos?.nombre}{a.bloques?.codigo ? ' · ' + a.bloques.codigo : ''}</div>
              </div>
              <div style={{ fontSize:9, fontWeight:600, padding:'2px 8px', borderRadius:8, background: a.fecha_programada < hoy ? '#fff0f0' : '#fff3e8', color: a.fecha_programada < hoy ? '#c84040' : '#c8700a' }}>
                {a.fecha_programada < hoy ? 'Vencida' : 'Hoy'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding:'0 14px 100px' }}>
        <div style={{ background:'#1E5631', borderRadius:24, padding:20, marginBottom:10 }}>
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
              <button onClick={() => navigate('/agenda')} style={{ fontSize:11, color:'#1E5631', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Ver todas →</button>
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
