import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  topSub: { color:'rgba(249,248,246,0.5)', fontSize:11 },
  switcher: { display:'flex', margin:'10px 10px 0', gap:6 },
  swBtn: { flex:1, padding:'8px 4px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:11, fontWeight:500, color:'#888', textAlign:'center', cursor:'pointer' },
  swActive: { background:'#1a1a1a', color:'#f9f8f6', borderColor:'#1a1a1a' },
  kpiGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'10px 10px 4px' },
  kpi: { background:'#f0ede8', borderRadius:8, padding:10 },
  kpiLabel: { fontSize:10, color:'#888', marginBottom:3 },
  kpiVal: { fontSize:22, fontWeight:600, color:'#1a1a1a' },
  kpiSub: { fontSize:10, color:'#aaa' },
  secHead: { fontSize:11, fontWeight:500, color:'#888', padding:'10px 10px 6px' },
  alertList: { display:'flex', flexDirection:'column', gap:6, padding:'0 10px 10px' },
  alertItem: { display:'flex', alignItems:'center', gap:8, background:'#f0ede8', borderRadius:8, padding:'8px 10px' },
  alertDot: { width:7, height:7, borderRadius:'50%', background:'#1a1a1a', flexShrink:0 },
  alertText: { fontSize:12, color:'#1a1a1a', flex:1 },
  alertTime: { fontSize:10, color:'#aaa' },
  logoutBtn: { margin:'0 10px 10px', padding:'10px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'transparent', fontSize:12, color:'#888', cursor:'pointer', width:'calc(100% - 20px)' }
}

export default function Dashboard({ campoActivo, setCampoActivo }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques: 0, activos: 0 })
  const today = new Date().toLocaleDateString('es-PY', { weekday:'long', day:'numeric', month:'long' })

  useEffect(() => {
    const fetchCampos = async () => {
      const { data } = await supabase.from('campos').select('*').order('nombre')
      if (data && data.length > 0) {
        setCampos(data)
        if (!campoActivo) setCampoActivo(data[0])
      }
    }
    fetchCampos()
  }, [])

  useEffect(() => {
    if (!campoActivo) return
    const fetchStats = async () => {
      const { data } = await supabase.from('bloques').select('id, activo').eq('campo_id', campoActivo.id)
      if (data) setStats({ bloques: data.length, activos: data.filter(b => b.activo).length })
    }
    fetchStats()
  }, [campoActivo])

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div>
      <div style={s.topbar}>
        <div>
          <div style={s.topTitle}>AgroBloque</div>
          <div style={s.topSub}>{today}</div>
        </div>
        <span style={{ fontSize:20, color:'#f9f8f6' }}>🔔</span>
      </div>

      <div style={s.switcher}>
        {campos.map(c => (
          <div key={c.id}
            style={{ ...s.swBtn, ...(campoActivo?.id === c.id ? s.swActive : {}) }}
            onClick={() => setCampoActivo(c)}>
            {c.nombre}
          </div>
        ))}
      </div>

      <div style={s.kpiGrid}>
        <div style={s.kpi}>
          <div style={s.kpiLabel}>Bloques activos</div>
          <div style={s.kpiVal}>{stats.activos}</div>
          <div style={s.kpiSub}>de {stats.bloques} totales</div>
        </div>
        <div style={s.kpi}>
          <div style={s.kpiLabel}>Campo</div>
          <div style={s.kpiVal} style={{ ...s.kpiVal, fontSize:14, paddingTop:4 }}>{campoActivo?.nombre || '—'}</div>
        </div>
      </div>

      <div style={s.secHead}>Alertas activas</div>
      <div style={s.alertList}>
        <div style={s.alertItem}>
          <div style={s.alertDot}></div>
          <div style={s.alertText}>Sistema iniciado correctamente</div>
          <div style={s.alertTime}>hoy</div>
        </div>
      </div>

      <button style={s.logoutBtn} onClick={handleLogout}>Cerrar sesión</button>
    </div>
  )
}
