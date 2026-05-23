import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Mapa from './pages/Mapa'
import FichaBloque from './pages/FichaBloque'
import Configuracion from './pages/Configuracion'
import Agenda from './pages/Agenda'
import Asistencia from './pages/Asistencia'
import Cosecha from './pages/Cosecha'
import Inventario from './pages/Inventario'
import Fumigaciones from './pages/Fumigaciones'
import Costos from './pages/Costos'
import Reportes from './pages/Reportes'
import Compradores from './pages/Compradores'
import NavBar from './components/NavBar'

export function LogoHS({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="72" fontFamily="Georgia, 'Times New Roman', serif" fontSize="72" fontWeight="700" fill="#212121" letterSpacing="-4">HS</text>
      <path d="M50 18c0 0-4-12 0-18 4 6 0 18 0 18z" fill="#aaaaaa"/>
      <path d="M50 16c0 0-11-8-9-16 9 2 9 16 9 16z" fill="#212121"/>
      <path d="M50 16c0 0 11-8 9-16-9 2-9 16-9 16z" fill="#212121"/>
    </svg>
  )
}

// Sidebar para desktop
const allTabs = [
  { path:'/', icon:'ti-home', label:'Inicio' },
  { path:'/mapa', icon:'ti-map', label:'Mapa' },
  { path:'/agenda', icon:'ti-calendar', label:'Agenda' },
  { path:'/asistencia', icon:'ti-users', label:'Asistencia' },
  { path:'/cosecha', icon:'ti-cut', label:'Cosecha' },
  { path:'/inventario', icon:'ti-box', label:'Inventario' },
  { path:'/fumigaciones', icon:'ti-spray', label:'Fumigaciones' },
  { path:'/costos', icon:'ti-coin', label:'Costos' },
  { path:'/reportes', icon:'ti-chart-bar', label:'Reportes' },
  { path:'/compradores', icon:'ti-building-store', label:'Compradores' },
  { path:'/configuracion', icon:'ti-settings', label:'Configuración' },
]

function DesktopSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div style={{
      width: 220,
      minHeight: '100vh',
      background: '#fff',
      borderRight: '1px solid #e8e6e2',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 0',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #f2f1ef', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoHS size={36} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0a0a0a', letterSpacing: -0.3 }}>AgroBloque</div>
            <div style={{ fontSize: 10, color: '#9a9a9a' }}>El Sembrador</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '0 10px', overflowY: 'auto' }}>
        {allTabs.map(t => {
          const active = location.pathname === t.path
          return (
            <div key={t.path} onClick={() => navigate(t.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12, marginBottom: 2,
                cursor: 'pointer',
                background: active ? '#212121' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f2f1ef' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 17, color: active ? '#fff' : '#555' }} aria-hidden="true"></i>
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#fff' : '#333' }}>{t.label}</span>
            </div>
          )
        })}
      </div>

      {/* Cerrar sesión */}
      <div style={{ padding: '12px 10px 0', borderTop: '1px solid #f2f1ef' }}>
        <div onClick={() => supabase.auth.signOut()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#fff0f0'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <i className="ti ti-logout" style={{ fontSize: 17, color: '#c84040' }} aria-hidden="true"></i>
          <span style={{ fontSize: 13, color: '#c84040' }}>Cerrar sesión</span>
        </div>
      </div>
    </div>
  )
}

function AppLayout({ campoActivo, setCampoActivo }) {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768)

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f2f1ef' }}>
      {isDesktop && <DesktopSidebar />}

      <div style={{
        flex: 1,
        marginLeft: isDesktop ? 220 : 0,
        minHeight: '100vh',
        background: '#f2f1ef',
        paddingBottom: isDesktop ? 0 : 64,
        // En desktop, limitar el ancho del contenido para que no sea demasiado ancho
        maxWidth: isDesktop ? 'calc(100vw - 220px)' : '100%',
      }}>
        {/* En desktop, centrar el contenido */}
        <div style={{
          maxWidth: isDesktop ? 900 : 480,
          margin: '0 auto',
          minHeight: '100vh',
        }}>
          <Routes>
            <Route path="/" element={<Dashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo}/>}/>
            <Route path="/mapa" element={<Mapa campoActivo={campoActivo}/>}/>
            <Route path="/bloque/:id" element={<FichaBloque/>}/>
            <Route path="/agenda" element={<Agenda/>}/>
            <Route path="/asistencia" element={<Asistencia/>}/>
            <Route path="/cosecha" element={<Cosecha/>}/>
            <Route path="/inventario" element={<Inventario/>}/>
            <Route path="/fumigaciones" element={<Fumigaciones/>}/>
            <Route path="/costos" element={<Costos campoActivo={campoActivo}/>}/>
            <Route path="/reportes" element={<Reportes campoActivo={campoActivo}/>}/>
            <Route path="/compradores" element={<Compradores/>}/>
            <Route path="/configuracion" element={<Configuracion/>}/>
            <Route path="*" element={<Navigate to="/"/>}/>
          </Routes>
        </div>
      </div>

      {!isDesktop && <NavBar />}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [campoActivo, setCampoActivo] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f0ede8' }}>
      <div style={{ textAlign:'center' }}>
        <LogoHS size={56} />
        <div style={{ color:'#888', fontSize:13, marginTop:12 }}>Cargando...</div>
      </div>
    </div>
  )

  if (!session) return <Login />

  return (
    <BrowserRouter>
      <AppLayout campoActivo={campoActivo} setCampoActivo={setCampoActivo} />
    </BrowserRouter>
  )
}
