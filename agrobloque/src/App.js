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

const CAMPO_STORAGE_KEY = 'agrobloque-campo-activo'
const SIDEBAR_WIDTH = 260

const getStoredCampoId = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(CAMPO_STORAGE_KEY)
}

function DesktopSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div style={{
      width: SIDEBAR_WIDTH,
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #080b0a 0%, #121512 52%, #080a09 100%)',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 0',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 24px 30px', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', color: '#fff', fontWeight: 900, fontSize: 24, letterSpacing: -2, fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif" }}>
            HS
            <span style={{ position: 'absolute', top: 8, right: 9, width: 14, height: 7, background: '#7bc043', borderRadius: '14px 14px 2px 14px', transform: 'rotate(-10deg)' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', letterSpacing: 1.1, textTransform: 'uppercase' }}>Horticultura</div>
            <div style={{ fontSize: 17, color: '#fff', fontWeight: 800, letterSpacing: -0.2 }}>El Sembrador</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>
        {allTabs.map(t => {
          const active = location.pathname === t.path
          return (
            <div key={t.path} onClick={() => navigate(t.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', borderRadius: 12, marginBottom: 5,
                cursor: 'pointer',
                background: active ? 'linear-gradient(90deg, rgba(123,192,67,0.22), rgba(255,255,255,0.07))' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 19, color: active ? '#7bc043' : 'rgba(255,255,255,0.86)' }} aria-hidden="true"></i>
              <span style={{ fontSize: 15, fontWeight: active ? 700 : 500, color: active ? '#fff' : 'rgba(255,255,255,0.86)' }}>{t.label}</span>
            </div>
          )
        })}
      </div>

      {/* Cerrar sesión */}
      <div style={{ padding: '16px 16px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px 16px', color: '#fff' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#4f9e2f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>G</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Gabriel</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Administrador</div>
          </div>
        </div>
        <div onClick={() => supabase.auth.signOut()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <i className="ti ti-logout" style={{ fontSize: 17, color: '#ff8f8f' }} aria-hidden="true"></i>
          <span style={{ fontSize: 13, color: '#c84040' }}>Cerrar sesión</span>
        </div>
      </div>
    </div>
  )
}

function AppLayout({ campoActivo, setCampoActivo }) {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768)
  const location = useLocation()
  const dashboardDesktop = isDesktop && location.pathname === '/'

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: dashboardDesktop ? '#f6f7f5' : '#f2f1ef' }}>
      {isDesktop && <DesktopSidebar />}

      <div style={{
        flex: 1,
        marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
        minHeight: '100vh',
        background: dashboardDesktop ? '#f6f7f5' : '#f2f1ef',
        paddingBottom: isDesktop ? 0 : 64,
        maxWidth: isDesktop ? `calc(100vw - ${SIDEBAR_WIDTH}px)` : '100%',
      }}>
        <div style={{
          maxWidth: dashboardDesktop ? 'none' : (isDesktop ? 900 : 480),
          width: '100%',
          margin: dashboardDesktop ? 0 : '0 auto',
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

  useEffect(() => {
    if (!session) {
      setCampoActivo(null)
      return
    }

    let cancelled = false
    const cargarCampoActivo = async () => {
      const { data } = await supabase.from('campos').select('*').order('nombre')
      if (cancelled || !data || data.length === 0) return

      setCampoActivo(actual => {
        if (actual && data.some(c => c.id === actual.id)) return actual
        const guardado = getStoredCampoId()
        return data.find(c => c.id === guardado) || data[0]
      })
    }

    cargarCampoActivo()
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (typeof window === 'undefined' || !campoActivo?.id) return
    window.localStorage.setItem(CAMPO_STORAGE_KEY, campoActivo.id)
  }, [campoActivo])

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
