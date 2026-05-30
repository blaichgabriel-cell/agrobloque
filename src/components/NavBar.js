import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const mainTabs = [
  { path:'/', icon:'ti-home', label:'Inicio' },
  { path:'/mapa', icon:'ti-map', label:'Mapa' },
  { path:'/agenda', icon:'ti-calendar', label:'Agenda' },
  { path:'/asistencia', icon:'ti-users', label:'Asistencia' },
  { path:'/configuracion', icon:'ti-settings', label:'Config' },
]

const moreTabs = [
  { path:'/cosecha', icon:'ti-cut', label:'Cosecha' },
  { path:'/inventario', icon:'ti-box', label:'Inventario' },
  { path:'/fumigaciones', icon:'ti-spray', label:'Fumig.' },
  { path:'/costos', icon:'ti-coin', label:'Costos' },
  { path:'/reportes', icon:'ti-chart-bar', label:'Reportes' },
  { path:'/compradores', icon:'ti-building-store', label:'Compradores' },
]

export default function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const isMoreActive = moreTabs.some(t => t.path === location.pathname)

  return (
    <>
      {showMore && (
        <div style={{ position:'fixed', bottom:64, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:'#fff', borderTop:'0.5px solid #e8e6e2', padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, zIndex:40 }}>
          {moreTabs.map(t => (
            <button key={t.path} onClick={() => { navigate(t.path); setShowMore(false) }}
              style={{ padding:'10px 6px', borderRadius:14, border:'1px solid #e8e6e2', background: location.pathname===t.path ? '#212121' : '#f2f1ef', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <i className={`ti ${t.icon}`} style={{ fontSize:20, color: location.pathname===t.path ? '#fff' : '#555' }} aria-hidden="true"></i>
              <span style={{ fontSize:9, fontWeight:600, color: location.pathname===t.path ? '#fff' : '#555' }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, display:'flex', borderTop:'0.5px solid #e8e6e2', background:'#f9f8f6', paddingBottom:'env(safe-area-inset-bottom,0px)', zIndex:50 }}>
        {mainTabs.map(t => {
          const active = location.pathname === t.path
          return (
            <div key={t.path} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 0', cursor:'pointer' }}
              onClick={() => { navigate(t.path); setShowMore(false) }}>
              <i className={`ti ${t.icon}`} style={{ fontSize:21, color: active ? '#212121' : '#ccc' }} aria-hidden="true"></i>
              {active && <div style={{ width:4, height:4, borderRadius:'50%', background:'#212121' }}></div>}
              <span style={{ fontSize:8, color: active ? '#212121' : '#ccc', fontWeight: active ? 600 : 400 }}>{t.label}</span>
            </div>
          )
        })}

        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 0', cursor:'pointer' }}
          onClick={() => setShowMore(!showMore)}>
          <i className={`ti ${showMore ? 'ti-x' : 'ti-dots'}`} style={{ fontSize:21, color: isMoreActive || showMore ? '#212121' : '#ccc' }} aria-hidden="true"></i>
          {isMoreActive && !showMore && <div style={{ width:4, height:4, borderRadius:'50%', background:'#212121' }}></div>}
          <span style={{ fontSize:8, color: isMoreActive || showMore ? '#212121' : '#ccc', fontWeight: isMoreActive || showMore ? 600 : 400 }}>Más</span>
        </div>
      </div>
    </>
  )
}
