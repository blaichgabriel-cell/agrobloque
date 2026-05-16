import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const s = {
  nav: { position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, display:'flex', borderTop:'0.5px solid #d0cdc8', background:'#f9f8f6', paddingBottom:'env(safe-area-inset-bottom, 0px)' },
  item: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'8px 0', cursor:'pointer' },
  icon: { fontSize:20 },
  label: { fontSize:9, color:'#bbb' },
  labelActive: { fontSize:9, color:'#1a1a1a' },
}

const tabs = [
  { path:'/', icon:'🏠', label:'Inicio' },
  { path:'/mapa', icon:'🗺️', label:'Mapa' },
  { path:'/agenda', icon:'📅', label:'Agenda' },
  { path:'/asistencia', icon:'👥', label:'Asistencia' },
  { path:'/configuracion', icon:'⚙️', label:'Config' },
]

export default function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div style={s.nav}>
      {tabs.map(t => {
        const active = location.pathname === t.path
        return (
          <div key={t.path} style={s.item} onClick={() => navigate(t.path)}>
            <div style={{ ...s.icon, opacity: active ? 1 : 0.4 }}>{t.icon}</div>
            <div style={active ? s.labelActive : s.label}>{t.label}</div>
          </div>
        )
      })}
    </div>
  )
}
