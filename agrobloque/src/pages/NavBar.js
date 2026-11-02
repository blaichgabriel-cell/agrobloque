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
        <div className="ui-ca8c85">
          {moreTabs.map(t => (
            <button className="ui-6ec60a" key={t.path} onClick={() => { navigate(t.path); setShowMore(false) }}
              style={{ background: location.pathname===t.path ? '#A0785A' : '#f2f1ef' }}>
              <i className={`${`ti ${t.icon}`} ui-e5e6f8`} style={{ color: location.pathname===t.path ? '#fff' : '#555' }} aria-hidden="true"></i>
              <span className="ui-e6f375" style={{ color: location.pathname===t.path ? '#fff' : '#555' }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ui-652476">
        {mainTabs.map(t => {
          const active = location.pathname === t.path
          return (
            <div className="ui-310d3e" key={t.path}
              onClick={() => { navigate(t.path); setShowMore(false) }}>
              <i className={`${`ti ${t.icon}`} ui-27a8ac`} style={{ color: active ? '#A0785A' : '#ccc' }} aria-hidden="true"></i>
              {active && <div className="ui-4fae2a"></div>}
              <span className="ui-908ae8" style={{ color: active ? '#A0785A' : '#ccc', fontWeight: active ? 600 : 400 }}>{t.label}</span>
            </div>
          )
        })}

        <div className="ui-310d3e"
          onClick={() => setShowMore(!showMore)}>
          <i className={`${`ti ${showMore ? 'ti-x' : 'ti-dots'}`} ui-27a8ac`} style={{ color: isMoreActive || showMore ? '#A0785A' : '#ccc' }} aria-hidden="true"></i>
          {isMoreActive && !showMore && <div className="ui-4fae2a"></div>}
          <span className="ui-908ae8" style={{ color: isMoreActive || showMore ? '#A0785A' : '#ccc', fontWeight: isMoreActive || showMore ? 600 : 400 }}>Más</span>
        </div>
      </div>
    </>
  )
}
