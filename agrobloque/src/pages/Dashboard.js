import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const s = {
  app: { background:'#f2f1ef', minHeight:'100vh' },
  hdr: { background:'#f2f1ef', padding:'24px 20px 16px' },
  hdrTop: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 },
  hola: { fontSize:12, color:'#9a9a9a', marginBottom:4 },
  nombre: { fontSize:24, fontWeight:700, color:'#0a0a0a', lineHeight:1.15, letterSpacing:-.5 },
  bellWrap: { display:'flex', flexDirection:'column', alignItems:'center', gap:4, marginTop:2 },
  bellBtn: { width:40, height:40, borderRadius:14, background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', cursor:'pointer', border:'none' },
  bellIcon: { fontSize:18, color:'#fff' },
  bellBadge: { background:'#e07b00', borderRadius:8, padding:'1px 6px', fontSize:8, fontWeight:700, color:'#fff' },
  tabs: { display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:18 },
  tabActive: { flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, textAlign:'center', background:'#fff', color:'#0a0a0a', border:'none', cursor:'pointer' },
  tabInactive: { flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, textAlign:'center', background:'transparent', color:'#9a9a9a', border:'none', cursor:'pointer' },
  body: { padding:'0 14px 100px' },
  mainCard: { background:'#0a0a0a', borderRadius:24, padding:20, marginBottom:10 },
  mcLabel: { fontSize:10, color:'#5a5a5a', letterSpacing:.05, textTransform:'uppercase', marginBottom:8 },
  mcNum: { fontSize:52, fontWeight:800, color:'#fff', lineHeight:1, letterSpacing:-2 },
  mcSub: { fontSize:10, color:'#4a4a4a', marginTop:4, marginBottom:18 },
  mcStats: { display:'flex' },
  mcStat: { flex:1, borderRight:'1px solid #1e1e1e', paddingRight:12 },
  mcStatLast: { flex:1, paddingLeft:12 },
  mcStatMid: { flex:1, padding:'0 12px', borderRight:'1px solid #1e1e1e' },
  mcStatLabel: { fontSize:9, color:'#4a4a4a', letterSpacing:.03, marginBottom:3 },
  mcStatVal: { fontSize:13, fontWeight:600, color:'#c8c8c8' },
  grid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 },
  gc: { background:'#fff', borderRadius:20, padding:'16px 14px', cursor:'pointer' },
  gcIcon: { width:36, height:36, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12, fontSize:17 },
  gcTitle: { fontSize:16, fontWeight:700, color:'#0a0a0a', letterSpacing:-.3 },
  gcSub: { fontSize:9, color:'#b0b0b0', marginTop:2 },
  alertsTitle: { fontSize:11, fontWeight:600, color:'#0a0a0a', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' },
  alertsVer: { fontSize:10, color:'#b0b0b0', fontWeight:400 },
  ai: { background:'#fff', borderRadius:14, padding:'11px 14px', marginBottom:6, display:'flex', alignItems:'center', gap:10 },
  aiDot: { width:8, height:8, borderRadius:'50%', flexShrink:0 },
  aiBody: { flex:1 },
  aiTxt: { fontSize:11, fontWeight:500, color:'#0a0a0a' },
  aiSub: { fontSize:9, color:'#b0b0b0', marginTop:1 },
  aiBadge: { fontSize:9, fontWeight:600, padding:'3px 8px', borderRadius:8 },
  logoutBtn: { width:'100%', padding:10, borderRadius:12, background:'transparent', border:'0.5px solid #e0ddd8', fontSize:12, color:'#9a9a9a', cursor:'pointer', marginTop:16 },
}

export default function Dashboard({ campoActivo, setCampoActivo }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques:0, activos:0, cultivos:0 })
  const [perfil, setPerfil] = useState({ nombre:'', foto:'' })
  const navigate = useNavigate()

  const today = new Date().toLocaleDateString('es-PY', { weekday:'long', day:'numeric', month:'long' })

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
    fetchStats()
  }, [campoActivo])

  const iniciales = (n) => n ? n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0,2) : 'HS'

  return (
    <div style={s.app}>
      <div style={s.hdr}>
        <div style={s.hdrTop}>
          <div>
            <div style={s.hola}>Bienvenido,</div>
            <div style={s.nombre}>Horticultura<br/>El Sembrador</div>
          </div>
          <div style={s.bellWrap}>
            <button style={s.bellBtn} aria-label="Notificaciones">
              <i className="ti ti-bell" style={s.bellIcon} aria-hidden="true"></i>
            </button>
            <div style={s.bellBadge}>2 alertas</div>
          </div>
        </div>
        <div style={s.tabs}>
          {campos.map(c => (
            <button key={c.id}
              style={campoActivo?.id === c.id ? s.tabActive : s.tabInactive}
              onClick={() => setCampoActivo(c)}>
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      <div style={s.body}>
        <div style={s.mainCard}>
          <div style={s.mcLabel}>Bloques activos</div>
          <div style={s.mcNum}>{stats.activos}</div>
          <div style={s.mcSub}>de {stats.bloques} totales · {campoActivo?.nombre}</div>
          <div style={s.mcStats}>
            <div style={s.mcStat}>
              <div style={s.mcStatLabel}>Cultivos</div>
              <div style={s.mcStatVal}>{stats.cultivos} activos</div>
            </div>
            <div style={s.mcStatMid}>
              <div style={s.mcStatLabel}>Operarios</div>
              <div style={s.mcStatVal}>7 hoy</div>
            </div>
            <div style={s.mcStatLast}>
              <div style={s.mcStatLabel}>Alertas</div>
              <div style={{ ...s.mcStatVal, color:'#e07b00' }}>2</div>
            </div>
          </div>
        </div>

        <div style={s.grid}>
          <div style={s.gc} onClick={() => navigate('/mapa')}>
            <div style={{ ...s.gcIcon, background:'#f2f1ef' }}>
              <i className="ti ti-map" aria-hidden="true" style={{ color:'#0a0a0a' }}></i>
            </div>
            <div style={s.gcTitle}>Mapa</div>
            <div style={s.gcSub}>Ver todos los bloques</div>
          </div>
          <div style={s.gc} onClick={() => navigate('/agenda')}>
            <div style={{ ...s.gcIcon, background:'#edf7ed' }}>
              <i className="ti ti-calendar" aria-hidden="true" style={{ color:'#2d6a2d' }}></i>
            </div>
            <div style={s.gcTitle}>Agenda</div>
            <div style={s.gcSub}>Tareas programadas</div>
          </div>
          <div style={s.gc} onClick={() => navigate('/asistencia')}>
            <div style={{ ...s.gcIcon, background:'#f2f1ef' }}>
              <i className="ti ti-users" aria-hidden="true" style={{ color:'#0a0a0a' }}></i>
            </div>
            <div style={s.gcTitle}>Asistencia</div>
            <div style={s.gcSub}>Planilla semanal</div>
          </div>
          <div style={s.gc}>
            <div style={{ ...s.gcIcon, background:'#fff8f0' }}>
              <i className="ti ti-chart-bar" aria-hidden="true" style={{ color:'#e07b00' }}></i>
            </div>
            <div style={s.gcTitle}>Reportes</div>
            <div style={s.gcSub}>Próximamente</div>
          </div>
        </div>

        <div style={s.alertsTitle}>
          Alertas activas
          <span style={s.alertsVer}>Ver todas →</span>
        </div>
        <div style={s.ai}>
          <div style={{ ...s.aiDot, background:'#e07b00' }}></div>
          <div style={s.aiBody}>
            <div style={s.aiTxt}>Fumigación pendiente · Bloque A-3</div>
            <div style={s.aiSub}>El Sembrador 1 · Sin completar</div>
          </div>
          <div style={{ ...s.aiBadge, background:'#fff3e8', color:'#c8700a' }}>Hoy</div>
        </div>
        <div style={s.ai}>
          <div style={{ ...s.aiDot, background:'#c84040' }}></div>
          <div style={s.aiBody}>
            <div style={s.aiTxt}>Stock bajo · Fungicida Captan</div>
            <div style={s.aiSub}>Quedan menos de 2 kg</div>
          </div>
          <div style={{ ...s.aiBadge, background:'#fff0f0', color:'#c84040' }}>Urgente</div>
        </div>

        <button style={s.logoutBtn} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
    </div>
  )
}
