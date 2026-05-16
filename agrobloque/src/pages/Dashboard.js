import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Dashboard({ campoActivo, setCampoActivo }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques:0, activos:0, cultivos:0 })
  const [perfil, setPerfil] = useState({ nombre:'', foto:'' })
  const [alertas, setAlertas] = useState([])
  const [showAlertas, setShowAlertas] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchCampos = async () => {
      const { data } = await supabase.from('campos').select('*').order('nombre')
      if (data && data.length > 0) { setCampos(data); if (!campoActivo) setCampoActivo(data[0]) }
    }
    const fetchPerfil = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setPerfil({ nombre: user.user_metadata?.nombre || '', foto: user.user_metadata?.foto || '' })
    }
    fetchCampos(); fetchPerfil()
  }, [])

  useEffect(() => {
    if (!campoActivo) return
    const fetchStats = async () => {
      const { data: bloques } = await supabase.from('bloques').select('id, activo').eq('campo_id', campoActivo.id)
      const { data: plantas } = await supabase.from('plantaciones').select('id').eq('activa', true)
      setStats({ bloques: bloques?.length || 0, activos: bloques?.filter(b => b.activo).length || 0, cultivos: plantas?.length || 0 })
    }
    const fetchAlertas = async () => {
      const hoy = new Date().toISOString().split('T')[0]
      const { data } = await supabase.from('tareas')
        .select('*, campos(nombre), bloques(codigo)')
        .eq('completada', false)
        .lte('fecha_programada', hoy)
        .order('fecha_programada')
      setAlertas(data || [])
    }
    fetchStats(); fetchAlertas()
  }, [campoActivo])

  const iniciales = (n) => n ? n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0,2) : 'HS'

  const hoy = new Date().toISOString().split('T')[0]

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Bienvenido,</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', lineHeight:1.15, letterSpacing:-.5 }}>Horticultura<br/>El Sembrador</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, marginTop:2 }}>
            <button onClick={() => setShowAlertas(!showAlertas)} style={{ width:42, height:42, borderRadius:'50%', background: alertas.length > 0 ? '#0a0a0a' : '#e8e6e2', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}>
              <i className="ti ti-bell" style={{ fontSize:20, color: alertas.length > 0 ? '#fff' : '#9a9a9a' }} aria-hidden="true"></i>
              {alertas.length > 0 && (
                <div style={{ position:'absolute', top:-4, right:-4, background:'#e07b00', borderRadius:10, padding:'1px 5px', fontSize:8, fontWeight:700, color:'#fff', border:'2px solid #f2f1ef' }}>{alertas.length}</div>
              )}
            </button>
            {alertas.length > 0 && <div style={{ background:'#e07b00', borderRadius:8, padding:'1px 6px', fontSize:8, fontWeight:700, color:'#fff' }}>{alertas.length} alertas</div>}
          </div>
        </div>
        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:4 }}>
          {campos.map(c => (
            <button key={c.id} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoActivo?.id===c.id ? '#fff' : 'transparent', color: campoActivo?.id===c.id ? '#0a0a0a' : '#9a9a9a' }} onClick={() => setCampoActivo(c)}>
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {showAlertas && (
        <div style={{ margin:'0 14px 10px', background:'#fff', borderRadius:20, padding:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#0a0a0a', marginBottom:12, display:'flex', justifyContent:'space-between' }}>
            Alertas activas
            <button onClick={() => { setShowAlertas(false); navigate('/agenda') }} style={{ fontSize:11, color:'#2d6a2d', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Ver en agenda →</button>
          </div>
          {alertas.length === 0 ? (
            <div style={{ fontSize:12, color:'#9a9a9a', textAlign:'center', padding:8 }}>Sin alertas activas</div>
          ) : alertas.map(a => (
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
        <div style={{ background:'#0a0a0a', borderRadius:24, padding:20, marginBottom:10 }}>
          <div style={{ fontSize:10, color:'#5a5a5a', letterSpacing:.05, textTransform:'uppercase', marginBottom:8 }}>Bloques activos</div>
          <div style={{ fontSize:52, fontWeight:800, color:'#fff', lineHeight:1, letterSpacing:-2 }}>{stats.activos}</div>
          <div style={{ fontSize:10, color:'#4a4a4a', marginTop:4, marginBottom:18 }}>de {stats.bloques} totales · {campoActivo?.nombre}</div>
          <div style={{ display:'flex' }}>
            <div style={{ flex:1, borderRight:'1px solid #1e1e1e', paddingRight:12 }}>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:3 }}>Cultivos</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#c8c8c8' }}>{stats.cultivos} activos</div>
            </div>
            <div style={{ flex:1, padding:'0 12px', borderRight:'1px solid #1e1e1e' }}>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:3 }}>Operarios</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#c8c8c8' }}>7 hoy</div>
            </div>
            <div style={{ flex:1, paddingLeft:12 }}>
              <div style={{ fontSize:9, color:'#4a4a4a', marginBottom:3 }}>Alertas</div>
              <div style={{ fontSize:13, fontWeight:600, color: alertas.length > 0 ? '#e07b00' : '#c8c8c8' }}>{alertas.length}</div>
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
          <div onClick={() => navigate('/mapa')} style={{ background:'#fff', borderRadius:20, padding:'16px 14px', cursor:'pointer' }}>
            <div style={{ width:36, height:36, borderRadius:11, background:'#f2f1ef', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
              <i className="ti ti-map" style={{ fontSize:17, color:'#0a0a0a' }} aria-hidden="true"></i>
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a0a0a', letterSpacing:-.3 }}>Mapa</div>
            <div style={{ fontSize:9, color:'#b0b0b0', marginTop:2 }}>Ver todos los bloques</div>
          </div>
          <div onClick={() => navigate('/agenda')} style={{ background:'#fff', borderRadius:20, padding:'16px 14px', cursor:'pointer' }}>
            <div style={{ width:36, height:36, borderRadius:11, background:'#edf7ed', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
              <i className="ti ti-calendar" style={{ fontSize:17, color:'#2d6a2d' }} aria-hidden="true"></i>
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a0a0a', letterSpacing:-.3 }}>Agenda</div>
            <div style={{ fontSize:9, color:'#b0b0b0', marginTop:2 }}>Tareas programadas</div>
          </div>
          <div onClick={() => navigate('/asistencia')} style={{ background:'#fff', borderRadius:20, padding:'16px 14px', cursor:'pointer' }}>
            <div style={{ width:36, height:36, borderRadius:11, background:'#f2f1ef', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
              <i className="ti ti-users" style={{ fontSize:17, color:'#0a0a0a' }} aria-hidden="true"></i>
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a0a0a', letterSpacing:-.3 }}>Asistencia</div>
            <div style={{ fontSize:9, color:'#b0b0b0', marginTop:2 }}>Planilla semanal</div>
          </div>
          <div style={{ background:'#fff', borderRadius:20, padding:'16px 14px' }}>
            <div style={{ width:36, height:36, borderRadius:11, background:'#fff8f0', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
              <i className="ti ti-chart-bar" style={{ fontSize:17, color:'#e07b00' }} aria-hidden="true"></i>
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a0a0a', letterSpacing:-.3 }}>Reportes</div>
            <div style={{ fontSize:9, color:'#b0b0b0', marginTop:2 }}>Próximamente</div>
          </div>
        </div>

        {alertas.length > 0 && (
          <div style={{ background:'#fff', borderRadius:20, padding:'14px 16px' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#0a0a0a', marginBottom:10, display:'flex', justifyContent:'space-between' }}>
              Alertas activas
              <button onClick={() => navigate('/agenda')} style={{ fontSize:11, color:'#2d6a2d', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Ver todas →</button>
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

        <button style={{ width:'100%', padding:10, borderRadius:12, background:'transparent', border:'0.5px solid #e0ddd8', fontSize:12, color:'#9a9a9a', cursor:'pointer', marginTop:16 }} onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
