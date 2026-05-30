import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const moreTabs = [
  { path: '/mapa', icon: 'ti-map', label: 'Mapa' },
  { path: '/vivero', icon: 'agro-vivero', label: 'Vivero' },
  { path: '/asistencia', icon: 'ti-users', label: 'Asistencia' },
  { path: '/cosecha', icon: 'ti-cut', label: 'Cosecha' },
  { path: '/inventario', icon: 'ti-box', label: 'Inventario' },
  { path: '/fumigaciones', icon: 'ti-spray', label: 'Fumig.' },
  { path: '/costos', icon: 'ti-coin', label: 'Costos' },
  { path: '/reportes', icon: 'ti-chart-bar', label: 'Reportes' },
  { path: '/compradores', icon: 'ti-building-store', label: 'Compradores' },
  { path: '/configuracion', icon: 'ti-settings', label: 'Config.' },
]

const navItem = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '10px 0 8px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
}

function ViveroIcon({ size = 21, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21V10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12C8.2 12 5.4 9.7 4.5 6.2C8.2 6 11.1 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12C15.8 12 18.6 9.7 19.5 6.2C15.8 6 12.9 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 21H17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function RenderIcon({ icon, size = 21, color = 'currentColor' }) {
  if (icon === 'agro-vivero') return <ViveroIcon size={size} color={color} />
  return <i className={`ti ${icon}`} style={{ fontSize: size, color }} aria-hidden="true"></i>
}

export default function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const isMoreActive = moreTabs.some(t => t.path === location.pathname)

  const go = (path) => {
    navigate(path)
    setShowMore(false)
  }

  return (
    <>
      {showMore && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: 86,
          transform: 'translateX(-50%)',
          width: 'calc(100% - 28px)',
          maxWidth: 452,
          padding: 12,
          borderRadius: 24,
          background: 'rgba(18,19,18,0.96)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 24px 55px rgba(0,0,0,0.45)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          zIndex: 45,
          backdropFilter: 'blur(14px)',
        }}>
          {moreTabs.map(t => {
            const active = location.pathname === t.path
            return (
              <button key={t.path} onClick={() => go(t.path)} style={{
                minHeight: 58,
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)',
                background: active ? 'rgba(123,192,67,0.18)' : 'rgba(255,255,255,0.06)',
                color: active ? '#8fd24e' : 'rgba(255,255,255,0.74)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}>
                <RenderIcon icon={t.icon} size={21} color={active ? '#8fd24e' : 'rgba(255,255,255,0.74)'} />
                <span style={{ fontSize: 10, fontWeight: 650 }}>{t.label}</span>
              </button>
            )
          })}
        </div>
      )}

      <div style={{
        position: 'fixed',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        padding: '0 14px calc(10px + env(safe-area-inset-bottom, 0px))',
        boxSizing: 'border-box',
        zIndex: 50,
        pointerEvents: 'none',
      }}>
        <div style={{
          height: 78,
          borderRadius: 24,
          background: 'linear-gradient(145deg, rgba(28,31,28,0.96), rgba(13,14,13,0.97))',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 22px 46px rgba(0,0,0,0.50)',
          display: 'flex',
          alignItems: 'stretch',
          overflow: 'hidden',
          pointerEvents: 'auto',
          backdropFilter: 'blur(16px)',
        }}>
          <MainButton
            active={location.pathname === '/'}
            icon="ti-home"
            label="Inicio"
            onClick={() => go('/')}
          />
          <MainButton
            active={location.pathname === '/agenda'}
            icon="ti-clock"
            label="Actividad"
            onClick={() => go('/agenda')}
          />
          <MainButton
            active={location.pathname === '/agenda'}
            icon="ti-bell"
            label="Notificaciones"
            hasDot
            onClick={() => go('/agenda')}
          />
          <button style={navItem} onClick={() => setShowMore(v => !v)}>
            <i className={`ti ${showMore ? 'ti-x' : 'ti-dots'}`} style={{
              fontSize: 28,
              color: showMore || isMoreActive ? '#8fd24e' : 'rgba(255,255,255,0.70)',
            }} aria-hidden="true"></i>
            <span style={{
              color: showMore || isMoreActive ? '#8fd24e' : 'rgba(255,255,255,0.70)',
              fontSize: 12,
              fontWeight: showMore || isMoreActive ? 750 : 500,
            }}>Mas</span>
          </button>
        </div>
      </div>
    </>
  )
}

function MainButton({ active, icon, fallbackIcon, label, hasDot, onClick }) {
  return (
    <button style={navItem} onClick={onClick}>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`ti ${icon || fallbackIcon}`} style={{
          fontSize: 27,
          color: active ? '#8fd24e' : 'rgba(255,255,255,0.70)',
          textShadow: active ? '0 0 22px rgba(123,192,67,0.35)' : 'none',
        }} aria-hidden="true"></i>
        {hasDot && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -7,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: '#7bc043',
          }} />
        )}
      </span>
      <span style={{
        color: active ? '#8fd24e' : 'rgba(255,255,255,0.70)',
        fontSize: 12,
        fontWeight: active ? 750 : 500,
      }}>{label}</span>
    </button>
  )
}
