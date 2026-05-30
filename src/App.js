import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { forceLocalSignOut, supabase } from './lib/supabase'
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
import Vivero from './pages/Vivero'
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
  { path:'/vivero', icon:'ti-seedling', label:'Vivero' },
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

const contarBloquesPorCampo = (bloques = []) => bloques.reduce((acc, bloque) => {
  if (bloque.campo_id) acc[bloque.campo_id] = (acc[bloque.campo_id] || 0) + 1
  return acc
}, {})

const elegirCampoConDatos = (campos, bloquesPorCampo, guardado) => {
  if (!campos || campos.length === 0) return null
  const campoGuardado = campos.find(c => c.id === guardado)
  const campoConMasBloques = campos.reduce((mejor, campo) => {
    return (bloquesPorCampo[campo.id] || 0) > (bloquesPorCampo[mejor.id] || 0) ? campo : mejor
  }, campos[0])
  const hayCampoConDatos = (bloquesPorCampo[campoConMasBloques.id] || 0) > 0

  if (campoGuardado && (!hayCampoConDatos || (bloquesPorCampo[campoGuardado.id] || 0) > 0)) {
    return campoGuardado
  }

  return campoConMasBloques
}

const esErrorSesion = (error) => {
  const texto = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.status === 401 ||
    error?.status === 403 ||
    texto.includes('jwt') ||
    texto.includes('permission')
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
        <div onClick={() => forceLocalSignOut()}
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
            <Route path="/vivero" element={<Vivero/>}/>
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
  const [dataError, setDataError] = useState('')

  const limpiarSesionRota = async (mensaje) => {
    setDataError(mensaje)
    await forceLocalSignOut(false)
    setCampoActivo(null)
    setSession(null)

    if (typeof window === 'undefined') return
    const resetKey = 'agrobloque-auto-reset-done'
    if (!window.sessionStorage.getItem(resetKey)) {
      window.sessionStorage.setItem(resetKey, '1')
      window.location.replace('/?sesion_limpiada=1')
    }
  }

  useEffect(() => {
    let cancelled = false

    const validarSesion = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session) {
        setSession(null)
        setLoading(false)
        return
      }

      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
      const sesionActual = refreshData?.session || session
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (cancelled) return

      if (refreshError || userError || !userData?.user) {
        await limpiarSesionRota('Tu sesion estaba vencida. Volve a iniciar sesion para cargar los datos.')
      } else {
        setSession(sesionActual)
        setDataError('')
      }
      setLoading(false)
    }

    validarSesion()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) setDataError('')
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setCampoActivo(null)
      return
    }

    let cancelled = false
    const cargarCampoActivo = async () => {
      const { data, error } = await supabase.from('campos').select('*').order('nombre')
      if (error) {
        console.error('Error cargando campos', error)
        if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch failed')) {
          setDataError('No se pudo conectar con Supabase. Si cargaste una foto de perfil, hay que limpiar esa foto del perfil en Supabase una sola vez.')
        } else if (esErrorSesion(error)) {
          await limpiarSesionRota(`No se pudo conectar con Supabase. Se limpio la sesion; inicia sesion de vuelta. Detalle: ${error.message}`)
        } else {
          setDataError(`Supabase no permitio leer los campos: ${error.message}`)
        }
        return
      }
      if (cancelled || !data || data.length === 0) return
      const { data: bloques, error: bloquesError } = await supabase.from('bloques').select('campo_id')
      if (bloquesError) {
        console.error('Error cargando bloques', bloquesError)
        if (bloquesError.message?.includes('Failed to fetch') || bloquesError.message?.includes('fetch failed')) {
          setDataError('No se pudo conectar con Supabase. Si cargaste una foto de perfil, hay que limpiar esa foto del perfil en Supabase una sola vez.')
        } else if (esErrorSesion(bloquesError)) {
          await limpiarSesionRota(`No se pudo conectar con Supabase. Se limpio la sesion; inicia sesion de vuelta. Detalle: ${bloquesError.message}`)
        } else {
          setDataError(`Supabase no permitio leer los bloques: ${bloquesError.message}`)
        }
        return
      }
      const bloquesPorCampo = contarBloquesPorCampo(bloques || [])

      setCampoActivo(actual => {
        if (actual && data.some(c => c.id === actual.id)) return actual
        const guardado = getStoredCampoId()
        return elegirCampoConDatos(data, bloquesPorCampo, guardado)
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

  if (!session) return (
    <>
      {dataError && (
        <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fff4e5', color: '#7a4a00', border: '1px solid #ffd89a', borderRadius: 12, padding: '10px 14px', fontSize: 13, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', maxWidth: 560, width: 'calc(100% - 28px)', textAlign: 'center' }}>
          <span>{dataError}</span>
          <button onClick={() => forceLocalSignOut()} style={{ marginLeft: 10, border: 'none', borderRadius: 8, background: '#7a4a00', color: '#fff', padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Limpiar sesion</button>
        </div>
      )}
      <Login />
    </>
  )

  return (
    <BrowserRouter>
      {dataError && (
        <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fff4e5', color: '#7a4a00', border: '1px solid #ffd89a', borderRadius: 12, padding: '10px 14px', fontSize: 13, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', maxWidth: 560, width: 'calc(100% - 28px)', textAlign: 'center' }}>
          <span>{dataError}</span>
          <button onClick={() => forceLocalSignOut()} style={{ marginLeft: 10, border: 'none', borderRadius: 8, background: '#7a4a00', color: '#fff', padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Limpiar sesion</button>
        </div>
      )}
      <AppLayout campoActivo={campoActivo} setCampoActivo={setCampoActivo} />
    </BrowserRouter>
  )
}
