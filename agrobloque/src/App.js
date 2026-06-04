import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { forceLocalSignOut, guestToken, supabase } from './lib/supabase'
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
import PlanNutricional from './pages/PlanNutricional'
import Costos from './pages/Costos'
import Contabilidad from './pages/Contabilidad'
import Reportes from './pages/Reportes'
import Compradores from './pages/Compradores'
import Vivero from './pages/Vivero'
import Buscador from './pages/Buscador'
import Alertas from './pages/Alertas'
import Auditoria from './pages/Auditoria'
import Historial from './pages/Historial'
import NavBar from './components/NavBar'
import { canAccessModule, filterTabsByRole, normalizeRole } from './lib/permissions'
import { textoErrorProfesional } from './lib/errors'

export function LogoHS({ size = 48 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.28),
      background: 'linear-gradient(145deg, #111 0%, #252525 100%)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
      fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif",
      fontWeight: 900,
      fontSize: Math.round(size * 0.46),
      lineHeight: 1,
      letterSpacing: -1,
    }}>
      HS
      <span style={{
        position: 'absolute',
        top: Math.round(size * 0.17),
        right: Math.round(size * 0.16),
        width: Math.round(size * 0.25),
        height: Math.round(size * 0.12),
        background: '#7bc043',
        borderRadius: '14px 14px 2px 14px',
        transform: 'rotate(-10deg)',
      }} />
    </div>
  )
}

function ViveroIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21V10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12C8.2 12 5.4 9.7 4.5 6.2C8.2 6 11.1 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12C15.8 12 18.6 9.7 19.5 6.2C15.8 6 12.9 7.7 12 12Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 21H17" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function MenuIcon({ icon, color, size = 19 }) {
  if (['vivero-icon', 'agro-vivero', 'ti-leaf', 'ti-seeding', 'ti-plant-2'].includes(icon)) {
    return <ViveroIcon size={size} color={color} />
  }
  return <i className={`ti ${icon}`} style={{ fontSize: size, color }} aria-hidden="true"></i>
}

// Sidebar para desktop
const allTabs = [
  { path:'/', icon:'ti-home', label:'Inicio' },
  { path:'/buscar', icon:'ti-search', label:'Buscar' },
  { path:'/alertas', icon:'ti-bell-ringing', label:'Alertas' },
  { path:'/historial', icon:'ti-timeline', label:'Historial' },
  { path:'/mapa', icon:'ti-map', label:'Mapa' },
  { path:'/agenda', icon:'ti-calendar', label:'Agenda' },
  { path:'/vivero', icon:'vivero-icon', label:'Vivero' },
  { path:'/asistencia', icon:'ti-users', label:'Asistencia' },
  { path:'/cosecha', icon:'ti-cut', label:'Cosecha' },
  { path:'/inventario', icon:'ti-box', label:'Inventario' },
  { path:'/fumigaciones', icon:'ti-spray', label:'Fumigaciones' },
  { path:'/plan-nutricional', icon:'ti-leaf', label:'Plan Nutricional' },
  { path:'/costos', icon:'ti-coin', label:'Costos' },
  { path:'/contabilidad', icon:'ti-calculator', label:'Contabilidad' },
  { path:'/reportes', icon:'ti-chart-bar', label:'Reportes' },
  { path:'/compradores', icon:'ti-building-store', label:'Compradores' },
  { path:'/auditoria', icon:'ti-history', label:'Auditoria' },
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

function SinPermiso() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f2f1ef', padding:24 }}>
      <div style={{ background:'#fff', border:'1px solid #e8ece8', borderRadius:22, padding:24, maxWidth:360, textAlign:'center', boxShadow:'0 18px 40px rgba(0,0,0,0.08)' }}>
        <i className="ti ti-lock" style={{ fontSize:34, color:'#176a25' }} aria-hidden="true"></i>
        <h2 style={{ margin:'12px 0 8px', fontSize:20 }}>Sin permiso</h2>
        <p style={{ margin:'0 0 18px', fontSize:13, color:'#687068', lineHeight:1.45 }}>Tu usuario no tiene acceso a este modulo.</p>
        <button onClick={() => navigate('/')} style={{ border:'none', background:'#212121', color:'#fff', borderRadius:12, padding:'11px 16px', fontWeight:700, cursor:'pointer' }}>Volver al inicio</button>
      </div>
    </div>
  )
}

function ProtectedRoute({ role, moduleKey, children }) {
  if (!canAccessModule(role, moduleKey)) return <SinPermiso />
  return children
}

function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    if (typeof window === 'undefined') return

    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0

      const appScroll = document.querySelector('[data-app-scroll]')
      if (appScroll) appScroll.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }

    resetScroll()
    window.requestAnimationFrame(resetScroll)
    const timer = window.setTimeout(resetScroll, 80)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search])
  return null
}

function DesktopSidebar({ isGuest = false, role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const tabs = filterTabsByRole(allTabs, role, isGuest)
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
        {tabs.map(t => {
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
              <MenuIcon icon={t.icon} size={19} color={active ? '#7bc043' : 'rgba(255,255,255,0.86)'} />
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

function AppLayout({ campoActivo, setCampoActivo, isGuest = false, role }) {
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
      {isDesktop && <DesktopSidebar isGuest={isGuest} role={role} />}

      <div data-app-scroll style={{
        flex: 1,
        marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
        height: '100vh',
        minHeight: '100vh',
        background: dashboardDesktop ? '#f6f7f5' : '#f2f1ef',
        paddingBottom: isDesktop ? 0 : 64,
        maxWidth: isDesktop ? `calc(100vw - ${SIDEBAR_WIDTH}px)` : '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollBehavior: 'auto',
      }}>
        <div style={{
          maxWidth: dashboardDesktop ? 'none' : (isDesktop ? 900 : 480),
          width: '100%',
          margin: dashboardDesktop ? 0 : '0 auto',
          minHeight: '100vh',
        }}>
          <Routes>
            <Route path="/" element={<Dashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo} isGuest={isGuest} role={role}/>}/>
            <Route path="/buscar" element={<ProtectedRoute role={role} moduleKey="buscar"><Buscador/></ProtectedRoute>}/>
            <Route path="/alertas" element={<ProtectedRoute role={role} moduleKey="alertas"><Alertas/></ProtectedRoute>}/>
            <Route path="/historial" element={<ProtectedRoute role={role} moduleKey="historial"><Historial campoActivo={campoActivo}/></ProtectedRoute>}/>
            <Route path="/mapa" element={<ProtectedRoute role={role} moduleKey="mapa"><Mapa campoActivo={campoActivo}/></ProtectedRoute>}/>
            <Route path="/bloque/:id" element={<ProtectedRoute role={role} moduleKey="mapa"><FichaBloque/></ProtectedRoute>}/>
            <Route path="/agenda" element={<ProtectedRoute role={role} moduleKey="agenda"><Agenda/></ProtectedRoute>}/>
            <Route path="/vivero" element={<ProtectedRoute role={role} moduleKey="vivero"><Vivero/></ProtectedRoute>}/>
            <Route path="/asistencia" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="asistencia"><Asistencia/></ProtectedRoute>}/>
            <Route path="/cosecha" element={<ProtectedRoute role={role} moduleKey="cosecha"><Cosecha/></ProtectedRoute>}/>
            <Route path="/inventario" element={<ProtectedRoute role={role} moduleKey="inventario"><Inventario/></ProtectedRoute>}/>
            <Route path="/fumigaciones" element={<ProtectedRoute role={role} moduleKey="fumigaciones"><Fumigaciones/></ProtectedRoute>}/>
            <Route path="/plan-nutricional" element={<ProtectedRoute role={role} moduleKey="plan_nutricional"><PlanNutricional campoActivo={campoActivo} isGuest={isGuest}/></ProtectedRoute>}/>
            <Route path="/costos" element={<ProtectedRoute role={role} moduleKey="costos"><Costos campoActivo={campoActivo} isGuest={isGuest}/></ProtectedRoute>}/>
            <Route path="/contabilidad" element={<ProtectedRoute role={role} moduleKey="contabilidad"><Contabilidad/></ProtectedRoute>}/>
            <Route path="/reportes" element={<ProtectedRoute role={role} moduleKey="reportes"><Reportes campoActivo={campoActivo} isGuest={isGuest}/></ProtectedRoute>}/>
            <Route path="/compradores" element={<ProtectedRoute role={role} moduleKey="compradores"><Compradores/></ProtectedRoute>}/>
            <Route path="/auditoria" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="auditoria"><Auditoria/></ProtectedRoute>}/>
            <Route path="/configuracion" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="configuracion"><Configuracion/></ProtectedRoute>}/>
            <Route path="*" element={<Navigate to="/"/>}/>
          </Routes>
        </div>
      </div>

      {!isDesktop && <NavBar isGuest={isGuest} role={role} />}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [campoActivo, setCampoActivo] = useState(null)
  const [dataError, setDataError] = useState('')
  const [role, setRole] = useState(normalizeRole(null))
  const [guestRole, setGuestRole] = useState(normalizeRole({
    rol:'lectura',
    permisos:['buscar','alertas','historial','mapa','agenda','vivero','cosecha','inventario','fumigaciones','plan_nutricional','costos','contabilidad','reportes','compradores'],
  }))
  const guestPath = Boolean(guestToken)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

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
        const email = userData.user.email || ''
        const { data: roleData } = await supabase
          .from('app_user_roles')
          .select('*')
          .eq('email', email.toLowerCase())
          .maybeSingle()
        setRole(normalizeRole(roleData, email))
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
    if (!guestPath) return
    supabase.rpc('guest_get_permissions')
      .then(({ data }) => {
        if (Array.isArray(data?.permisos)) {
          setGuestRole(normalizeRole({ rol:'lectura', permisos:data.permisos }))
        }
      })
      .catch(() => {})
  }, [guestPath])

  useEffect(() => {
    if (!session && !guestPath) {
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
        } else setDataError(textoErrorProfesional(error, { modulo:'Campos', accion:'leer' }))
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
        } else setDataError(textoErrorProfesional(bloquesError, { modulo:'Bloques', accion:'leer' }))
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
  }, [session, guestPath])

  useEffect(() => {
    if (typeof window === 'undefined' || !campoActivo?.id) return
    window.localStorage.setItem(CAMPO_STORAGE_KEY, campoActivo.id)
  }, [campoActivo])

  if (guestPath) return (
    <BrowserRouter basename={`/invitado/${guestToken}`}>
      <ScrollToTop />
      <AppLayout campoActivo={campoActivo} setCampoActivo={setCampoActivo} isGuest role={guestRole} />
    </BrowserRouter>
  )

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
      <ScrollToTop />
      {dataError && (
        <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fff4e5', color: '#7a4a00', border: '1px solid #ffd89a', borderRadius: 12, padding: '10px 14px', fontSize: 13, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', maxWidth: 560, width: 'calc(100% - 28px)', textAlign: 'center' }}>
          <span>{dataError}</span>
          <button onClick={() => forceLocalSignOut()} style={{ marginLeft: 10, border: 'none', borderRadius: 8, background: '#7a4a00', color: '#fff', padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Limpiar sesion</button>
        </div>
      )}
      <AppLayout campoActivo={campoActivo} setCampoActivo={setCampoActivo} role={role} />
    </BrowserRouter>
  )
}
