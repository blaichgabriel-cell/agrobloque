import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { authAction, forceLocalSignOut, guestToken, supabase } from './lib/supabase'
import { Skeleton } from './components/UI'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Overview'
import Onboarding from './pages/Onboarding'
import NavBar from './components/NavBar'
import { canAccessModule, filterTabsByRole, normalizeRole } from './lib/permissions'
import { textoErrorProfesional } from './lib/errors'
import { Toaster } from 'sonner'
import TaskNotifications from './components/TaskNotifications'
import SheetGestures from './components/SheetGestures'
import BrandLogo from './components/BrandLogo'
import { RoleContext } from './lib/RoleContext'
import { SoporteBarras, useContextoSoporte, useVolverAlPanel } from './components/Soporte'
import DemoInmersion from './components/DemoInmersion'
import { esAdministradorGeneral } from './lib/plataforma'

const Mapa = lazy(() => import('./pages/MapaProfesional'))
const FichaBloque = lazy(() => import('./pages/FichaBloque'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const Plataforma = lazy(() => import('./pages/Plataforma'))
const PlataformaSoporte = lazy(() => import('./pages/PlataformaSoporte'))
const PlataformaPlanes = lazy(() => import('./pages/PlataformaPlanes'))
const PlataformaEquipo = lazy(() => import('./pages/PlataformaEquipo'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Calendario = lazy(() => import('./pages/Calendario'))
const Asistencia = lazy(() => import('./pages/Asistencia'))
const Cosecha = lazy(() => import('./pages/Cosecha'))
const Ventas = lazy(() => import('./pages/Ventas'))
const Inventario = lazy(() => import('./pages/Inventario'))
const Fumigaciones = lazy(() => import('./pages/Fumigaciones'))
const Fertilizaciones = lazy(() => import('./pages/Fertilizaciones'))
const Costos = lazy(() => import('./pages/Costos'))
const Rentabilidad = lazy(() => import('./pages/Rentabilidad'))
const Contabilidad = lazy(() => import('./pages/Contabilidad'))
const FacturasRecibidas = lazy(() => import('./pages/FacturasRecibidas'))
const CuentasPagar = lazy(() => import('./pages/CuentasPagar'))
const Reportes = lazy(() => import('./pages/Reportes'))
const Compradores = lazy(() => import('./pages/Compradores'))
const Vivero = lazy(() => import('./pages/Vivero'))
const Invitado = lazy(() => import('./pages/Invitado'))
const Buscador = lazy(() => import('./pages/Buscador'))
const Alertas = lazy(() => import('./pages/Alertas'))
const Auditoria = lazy(() => import('./pages/Auditoria'))
const Historial = lazy(() => import('./pages/Historial'))

const DEFAULT_ORGANIZATION = { id:null, nombre:'AgroBloque', logo_url:null, color_primario:'#0F3923' }

export function LogoHS({ size = 48 }) {
  return (
    <div className="ui-a1c952" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), fontSize: Math.round(size * 0.46) }}>
      AB
    </div>
  )
}

function StartupScreen() {
  return <div className="ag-startup" role="status" aria-live="polite" aria-label="Abriendo AgroBloque">
    <div className="ag-startup-glow" aria-hidden="true" />
    <div className="ag-startup-brand">
      <BrandLogo className="ag-startup-logo" />
    </div>
    <div className="ag-startup-progress" aria-hidden="true"><span /></div>
    <p>Preparando tu campo…</p>
  </div>
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
  { path:'/mapa', icon:'ti-map', label:'Mapa' },
  { path:'/agenda', icon:'ti-calendar', label:'Agenda' },
  { path:'/calendario', icon:'ti-calendar-month', label:'Calendario' },
  { path:'/vivero', icon:'vivero-icon', label:'Vivero' },
  { path:'/asistencia', icon:'ti-users', label:'Asistencia' },
  { path:'/cosecha', icon:'ti-cut', label:'Cosecha' },
  { path:'/ventas', icon:'ti-cash-register', label:'Ventas' },
  { path:'/inventario', icon:'ti-box', label:'Inventario' },
  { path:'/fumigaciones', icon:'ti-spray', label:'Fumigaciones' },
  { path:'/fertilizaciones', icon:'ti-leaf', label:'Fertilizaciones' },
  { path:'/costos', icon:'ti-coin', label:'Costos' },
  { path:'/rentabilidad', icon:'ti-chart-line', label:'Rentabilidad' },
  { path:'/contabilidad', icon:'ti-calculator', label:'Contabilidad' },
  { path:'/cuentas-pagar', icon:'ti-receipt-2', label:'Cuentas a pagar' },
  { path:'/reportes', icon:'ti-chart-bar', label:'Reportes' },
  { path:'/compradores', icon:'ti-building-store', label:'Compradores' },
  { path:'/alertas', icon:'ti-bell-ringing', label:'Alertas' },
  { path:'/historial', icon:'ti-timeline', label:'Historial' },
  { path:'/auditoria', icon:'ti-history', label:'Auditoria' },
  { path:'/configuracion', icon:'ti-settings', label:'Configuración' },
]

const CAMPO_STORAGE_KEY = 'agrobloque-campo-activo'

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
    <div className="ui-bebe1c">
      <div className="ui-47fa46">
        <i className="ti ti-lock ui-58cce7" aria-hidden="true"></i>
        <h2 className="ui-174519">Sin permiso</h2>
        <p className="ui-3c8988">Tu usuario no tiene acceso a este modulo.</p>
        <button className="ui-8931ad" onClick={() => navigate('/')}>Volver al inicio</button>
      </div>
    </div>
  )
}

function ProtectedRoute({ role, moduleKey, children }) {
  if (!canAccessModule(role, moduleKey)) return <SinPermiso />
  return children
}

const scrollPositions = new Map()

function ScrollToTop() {
  const location = useLocation()
  const navigationType = useNavigationType()
  useEffect(() => {
    if (typeof window === 'undefined') return

    // El contenedor de scroll se busca cada vez: en la primera pantalla tras abrir la app todavía no existe
    // cuando se ejecuta este efecto.
    const buscarContenedor = () => document.querySelector('[data-app-scroll]')
    const routeKey = `${location.pathname}${location.search}`
    const savedPosition = navigationType === 'POP' ? scrollPositions.get(routeKey) : null
    const target = Number.isFinite(savedPosition) ? savedPosition : 0
    const readPosition = () => { const contenedor = buscarContenedor(); return contenedor ? contenedor.scrollTop : (window.scrollY || 0) }
    const applyScroll = () => {
      const contenedor = buscarContenedor()
      window.scrollTo({ top: target, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = target
      document.body.scrollTop = target
      if (contenedor) contenedor.scrollTo({ top: target, left: 0, behavior: 'auto' })
    }

    // Al volver a una pantalla (por ejemplo, de la ficha de un bloque a la lista de bloques) la lista aún
    // se está cargando y es corta: el navegador recorta el scroll. Por eso la posición guardada se vuelve
    // a aplicar hasta que el contenido sea lo bastante alto, o hasta que la persona mueva la pantalla.
    let restaurando = target > 0
    const dejarDeRestaurar = () => { restaurando = false }
    const aplicarHastaAlcanzar = () => { if (restaurando && Math.abs(readPosition() - target) > 1) applyScroll() }

    applyScroll()
    const frame = window.requestAnimationFrame(applyScroll)
    const timers = [80].map(delay => window.setTimeout(applyScroll, delay))
    const intervalo = target > 0 ? window.setInterval(aplicarHastaAlcanzar, 60) : null
    const limite = target > 0 ? window.setTimeout(() => { restaurando = false; window.clearInterval(intervalo) }, 4000) : null

    // Solo se guarda la posición mientras la ruta sigue siendo esta: así el recorte del scroll al cambiar
    // a una pantalla más corta (o a la de carga) no pisa la posición buena.
    // El evento scroll no sube por el árbol, pero sí se puede capturar en el documento: así se oye tanto el
    // scroll de la página como el del contenedor principal, aunque este aparezca después. Los scrolls de
    // tablas o diálogos internos se ignoran.
    const rememberPosition = evento => {
      if (restaurando) return
      const origen = evento?.target
      const esPrincipal = !origen || origen === document || (origen instanceof Element && origen.hasAttribute('data-app-scroll'))
      if (!esPrincipal) return
      if (`${window.location.pathname}${window.location.search}` !== routeKey) return
      scrollPositions.set(routeKey, readPosition())
    }
    document.addEventListener('scroll', rememberPosition, { passive:true, capture:true })
    const eventosDeUsuario = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    eventosDeUsuario.forEach(nombre => window.addEventListener(nombre, dejarDeRestaurar, { passive:true, capture:true }))

    return () => {
      document.removeEventListener('scroll', rememberPosition, { capture:true })
      eventosDeUsuario.forEach(nombre => window.removeEventListener(nombre, dejarDeRestaurar, { capture:true }))
      window.cancelAnimationFrame(frame)
      timers.forEach(timer => window.clearTimeout(timer))
      if (intervalo) window.clearInterval(intervalo)
      if (limite) window.clearTimeout(limite)
    }
  }, [location.pathname, location.search, navigationType])
  return null
}

function ConnectionStatus() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const conectar = () => setOnline(true)
    const desconectar = () => setOnline(false)
    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)
    return () => { window.removeEventListener('online', conectar); window.removeEventListener('offline', desconectar) }
  }, [])
  if (online) return null
  return <div className="ag-offline"><i className="ti ti-wifi-off" /> Sin conexión. No cierres la aplicación hasta recuperar internet.</div>
}

// Modo Plataforma: lo único que ve un administrador general mientras no ha entrado a ninguna empresa.
const PLATAFORMA_ITEMS = [
  { path:'/plataforma', end:true, icon:'ti-building-community', label:'Empresas y Campos' },
  { path:'/plataforma/soporte', icon:'ti-shield-check', label:'Accesos de Soporte' },
  { path:'/plataforma/planes', icon:'ti-credit-card', label:'Planes y Estado comercial' },
  { path:'/plataforma/equipo', icon:'ti-shield-lock', label:'Equipo Super Admin' },
]

function DesktopSidebar({ isGuest = false, role, organization = DEFAULT_ORGANIZATION, modo = 'campo', contexto = { activo:false }, campoNombre = '' }) {
  const tabs = filterTabsByRole(allTabs, role, isGuest)
  const { volver, ocupado: saliendo } = useVolverAlPanel()
  // El cambio de modo anima el menú; la primera carga y los re-render normales no.
  const modoPrevio = useRef(modo)
  const cambioDeModo = modoPrevio.current !== modo
  useEffect(() => { modoPrevio.current = modo }, [modo])
  const marca = modo === 'plataforma' ? { ...organization, nombre:'AgroBloque', logo_url:null } : (contexto.activo ? { ...organization, nombre:contexto.organizacion_nombre || organization.nombre, logo_url:null } : organization)
  const campo = contexto.campo_nombre || campoNombre
  const nombre = role?.nombre || role?.email?.split('@')[0] || 'Usuario'
  const [alertCount, setAlertCount] = useState(0)
  useEffect(() => {
    if (modo !== 'campo' || !canAccessModule(role, 'alertas')) return
    Promise.all([
      supabase.from('tareas').select('id', { count:'exact', head:true }).eq('completada', false).eq('anulada', false),
      supabase.from('productos').select('id,stock_actual,stock_minimo').eq('activo', true),
    ]).then(([tareas, productos]) => {
      const stock = (productos.data || []).filter(p => Number(p.stock_actual) <= 0 || (Number(p.stock_minimo) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo))).length
      setAlertCount(Number(tareas.count || 0) + stock)
    }).catch(() => {})
  }, [role?.email, modo])
  const groups = [
    { title: 'CAMPO', paths: ['/', '/mapa', '/agenda', '/calendario', '/vivero'] },
    { title: 'OPERACIÓN', paths: ['/cosecha', '/fumigaciones', '/fertilizaciones', '/inventario', '/asistencia'] },
    { title: 'GESTIÓN', paths: ['/ventas', '/costos', '/rentabilidad', '/contabilidad', '/cuentas-pagar', '/reportes', '/compradores', '/alertas', '/historial', '/auditoria', '/configuracion'] },
  ]
  return <aside className="ag-sidebar" aria-label="Navegación principal">
    <div className={`ag-brand ${marca.logo_url ? '' : 'uses-official-logo'}`}><span className={`ag-brand-mark ${marca.logo_url ? 'has-logo' : 'has-official-logo'}`} aria-hidden="true">{marca.logo_url ? <img src={marca.logo_url} alt="" /> : <BrandLogo alt="" />}</span><div><strong title={marca.nombre}>{marca.nombre || 'AgroBloque'}</strong><small>{modo === 'plataforma' ? 'Panel de plataforma' : 'Gestión agrícola'}</small></div></div>
    <nav className={`ag-sidebar-nav ${cambioDeModo ? 'sb-anim' : ''}`} key={modo} data-modo={modo} aria-label={modo === 'plataforma' ? 'Navegación de la plataforma' : 'Navegación del campo'}>{modo === 'plataforma' ? <section className="ag-nav-group"><h2>PLATAFORMA · SUPER ADMIN</h2>{PLATAFORMA_ITEMS.map(item => <NavLink end={item.end} key={item.path} to={item.path} className="ag-nav-link"><span className="ag-nav-icon" data-tone="finanzas" aria-hidden="true"><MenuIcon icon={item.icon} size={17} color="currentColor" /></span><span>{item.label}</span></NavLink>)}</section> : <>{contexto.activo && <div className="sb-soporte" role="status"><span className="sb-soporte__etiqueta"><i className="ti ti-shield-check" aria-hidden="true" />{contexto.propia ? 'MODO DEMOSTRACIÓN' : 'MODO SOPORTE'}</span><b title={contexto.organizacion_nombre}>{contexto.organizacion_nombre}</b>{campo && <span className="sb-soporte__campo"><i className="ti ti-map-2" aria-hidden="true" />{campo}</span>}<button type="button" onClick={volver} disabled={saliendo}><i className="ti ti-arrow-left" aria-hidden="true" />Volver al Panel AgroBloque</button></div>}{groups.map(group => {
      const items = group.paths.map(path => tabs.find(tab => tab.path === path)).filter(Boolean)
      return items.length > 0 && <section className="ag-nav-group" key={group.title}><h2>{group.title}</h2>{items.map(tab => <NavLink end={tab.path === '/'} key={tab.path} to={tab.path} className="ag-nav-link"><span className="ag-nav-icon" data-tone={toneFromPath(tab.path)} aria-hidden="true"><MenuIcon icon={tab.icon} size={17} color="currentColor" /></span><span>{tab.path === '/mapa' ? 'Bloques' : tab.label}</span>{tab.path === '/alertas' && alertCount > 0 && <b className="ag-nav-badge">{alertCount > 99 ? '99+' : alertCount}</b>}</NavLink>)}</section>
    })}</>}</nav>
    <div className="ag-sidebar-footer">{isGuest ? <div className="ag-profile"><span className="ag-avatar">{nombre.charAt(0).toUpperCase()}</span><div><strong>{nombre}</strong><small>Invitado · Solo lectura</small></div></div> : modo === 'plataforma' ? <div className="ag-profile"><span className="ag-avatar">{nombre.charAt(0).toUpperCase()}</span><div><strong>{nombre}</strong><small>Administrador general</small></div></div> : <NavLink to="/configuracion" className="ag-profile ag-profile-link"><span className="ag-avatar">{nombre.charAt(0).toUpperCase()}</span><div><strong>{nombre}</strong><small>{role?.label || 'Usuario'} · Ver perfil</small></div><i className="ti ti-chevron-right" /></NavLink>}<button className="ag-signout" onClick={() => forceLocalSignOut()}>Cerrar sesión</button></div>
  </aside>
}

const MODULE_BY_PATH = {
  '/': 'bloques', '/mapa': 'bloques', '/bloque': 'bloques', '/cosecha': 'bloques', '/calendario': 'bloques',
  '/vivero': 'agua', '/fertilizaciones': 'agua', '/plan-nutricional': 'agua',
  '/fumigaciones': 'alerta', '/alertas': 'alerta',
  '/plataforma': 'finanzas', '/contabilidad': 'finanzas', '/cuentas-pagar': 'finanzas', '/costos': 'finanzas', '/rentabilidad': 'finanzas', '/ventas': 'finanzas', '/reportes': 'finanzas',
}
const moduleFromPath = pathname => MODULE_BY_PATH['/' + (pathname.split('/')[1] || '')] || 'bloques'
const toneFromPath = path => MODULE_BY_PATH[path] || 'neutral'

function AppLayout({ campoActivo, setCampoActivo, isGuest = false, role, organization, setOrganization, theme, themeMode, onThemeChange, isPlatformAdmin = false }) {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1100)
  const location = useLocation()
  const dashboardDesktop = isDesktop && location.pathname === '/'
  // Mode A (plataforma): administrador general sin empresa abierta. Mode B (campo): dentro de una empresa, o un usuario normal.
  const contexto = useContextoSoporte(isPlatformAdmin)
  const modo = isPlatformAdmin && !contexto.activo ? 'plataforma' : 'campo'
  const enPlataforma = location.pathname.startsWith('/plataforma')
  const moduloActual = location.pathname.startsWith('/mapa') ? 'Bloques' : ((allTabs.find(tab => tab.path === '/' + (location.pathname.split('/')[1] || ''))?.label) || 'Esta sección')

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1100)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <RoleContext.Provider value={role}>
    <div className={`ag-app ${isDesktop ? 'has-dock' : ''} ${dashboardDesktop ? 'is-dashboard' : ''}`} data-module={moduleFromPath(location.pathname)} data-modo={modo}>
      <Toaster
        position={isDesktop ? 'top-right' : 'bottom-center'}
        richColors
        closeButton
        theme={theme}
        mobileOffset={{ top:'calc(env(safe-area-inset-top, 0px) + 12px)', right:12, bottom:'calc(env(safe-area-inset-bottom, 0px) + 86px)', left:12 }}
        toastOptions={{ className:'ag-toast', duration:6000 }}
      />
      <TaskNotifications enabled={!isGuest && modo === 'campo' && canAccessModule(role, 'agenda')} />
      <SheetGestures />
      <ConnectionStatus />
      {isDesktop && <DesktopSidebar isGuest={isGuest} role={role} organization={organization} modo={modo} contexto={contexto} campoNombre={campoActivo?.nombre || ''} />}

      <div data-app-scroll>
        {!isGuest && <SoporteBarras esAdminGeneral={isPlatformAdmin} contexto={contexto} campoNombre={campoActivo?.nombre || ''} />}
        <div className="ag-content-shell">
          <div className="ag-route-stage" key={location.pathname}>
          <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<Skeleton rows={3} label="Cargando pantalla" />}>
          {isPlatformAdmin && contexto.cargando ? <Skeleton rows={3} label="Cargando tu espacio" />
            : modo === 'plataforma' && !enPlataforma ? <Navigate to="/plataforma" replace />
            : contexto.activo && contexto.demo && !enPlataforma ? <DemoInmersion contexto={contexto} modulo={moduloActual} />
            : <Routes>
            <Route path="/" element={<Dashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo} isGuest={isGuest} role={role} organization={organization}/>}/>
            <Route path="/plataforma" element={isPlatformAdmin ? <Plataforma/> : <Navigate to="/"/>}/>
            <Route path="/plataforma/soporte" element={isPlatformAdmin ? <PlataformaSoporte/> : <Navigate to="/"/>}/>
            <Route path="/plataforma/planes" element={isPlatformAdmin ? <PlataformaPlanes/> : <Navigate to="/"/>}/>
            <Route path="/plataforma/equipo" element={isPlatformAdmin ? <PlataformaEquipo themeMode={themeMode} onThemeChange={onThemeChange}/> : <Navigate to="/"/>}/>
            <Route path="/buscar" element={<ProtectedRoute role={role} moduleKey="buscar"><Buscador/></ProtectedRoute>}/>
            <Route path="/alertas" element={<ProtectedRoute role={role} moduleKey="alertas"><Alertas/></ProtectedRoute>}/>
            <Route path="/historial" element={<ProtectedRoute role={role} moduleKey="historial"><Historial campoActivo={campoActivo}/></ProtectedRoute>}/>
            <Route path="/mapa" element={<ProtectedRoute role={role} moduleKey="mapa"><Mapa campoActivo={campoActivo}/></ProtectedRoute>}/>
            <Route path="/bloque/:id" element={<ProtectedRoute role={role} moduleKey="mapa"><FichaBloque/></ProtectedRoute>}/>
            <Route path="/agenda" element={<ProtectedRoute role={role} moduleKey="agenda"><Agenda/></ProtectedRoute>}/>
            <Route path="/calendario" element={<ProtectedRoute role={role} moduleKey="agenda"><Calendario/></ProtectedRoute>}/>
            <Route path="/vivero" element={<ProtectedRoute role={role} moduleKey="vivero"><Vivero/></ProtectedRoute>}/>
            <Route path="/asistencia" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="asistencia"><Asistencia/></ProtectedRoute>}/>
            <Route path="/cosecha" element={<ProtectedRoute role={role} moduleKey="cosecha"><Cosecha/></ProtectedRoute>}/>
            <Route path="/ventas" element={<ProtectedRoute role={role} moduleKey="ventas"><Ventas/></ProtectedRoute>}/>
            <Route path="/inventario" element={<ProtectedRoute role={role} moduleKey="inventario"><Inventario/></ProtectedRoute>}/>
            <Route path="/fumigaciones" element={<ProtectedRoute role={role} moduleKey="fumigaciones"><Fumigaciones/></ProtectedRoute>}/>
            <Route path="/fertilizaciones" element={<ProtectedRoute role={role} moduleKey="plan_nutricional"><Fertilizaciones campoActivo={campoActivo} isGuest={isGuest}/></ProtectedRoute>}/>
            <Route path="/plan-nutricional" element={<Navigate to="/fertilizaciones"/>}/>
            <Route path="/costos" element={<ProtectedRoute role={role} moduleKey="costos"><Costos campoActivo={campoActivo} isGuest={isGuest}/></ProtectedRoute>}/>
            <Route path="/rentabilidad" element={<ProtectedRoute role={role} moduleKey="costos"><Rentabilidad campoActivo={campoActivo}/></ProtectedRoute>}/>
            <Route path="/contabilidad" element={<ProtectedRoute role={role} moduleKey="contabilidad"><Contabilidad/></ProtectedRoute>}/>
            <Route path="/contabilidad/facturas" element={<ProtectedRoute role={role} moduleKey="contabilidad"><FacturasRecibidas role={role}/></ProtectedRoute>}/>
            <Route path="/cuentas-pagar" element={<ProtectedRoute role={role} moduleKey="cuentas_pagar"><CuentasPagar/></ProtectedRoute>}/>
            <Route path="/reportes" element={<ProtectedRoute role={role} moduleKey="reportes"><Reportes campoActivo={campoActivo} isGuest={isGuest}/></ProtectedRoute>}/>
            <Route path="/compradores" element={<ProtectedRoute role={role} moduleKey="compradores"><Compradores/></ProtectedRoute>}/>
            <Route path="/auditoria" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="auditoria"><Auditoria/></ProtectedRoute>}/>
            <Route path="/configuracion" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="configuracion"><Configuracion role={role} organization={organization} onOrganizationUpdate={setOrganization} theme={theme} themeMode={themeMode} onThemeChange={onThemeChange}/></ProtectedRoute>}/>
            <Route path="/primeros-pasos" element={isGuest ? <Navigate to="/"/> : <ProtectedRoute role={role} moduleKey="configuracion"><Onboarding preview organization={organization}/></ProtectedRoute>}/>
            <Route path="*" element={<Navigate to="/"/>}/>
          </Routes>}
          </Suspense>
          </ErrorBoundary>
          </div>
        </div>
      </div>

      {!isDesktop && <NavBar isGuest={isGuest} role={role} modo={modo} />}
    </div>
    </RoleContext.Provider>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [campoActivo, setCampoActivo] = useState(null)
  const [dataError, setDataError] = useState('')
  const [role, setRole] = useState(normalizeRole(null))
  const [roleUserId, setRoleUserId] = useState(null)
  const [organization, setOrganization] = useState(DEFAULT_ORGANIZATION)
  const [fieldsState, setFieldsState] = useState('idle')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = window.localStorage.getItem('agrobloque-theme')
    return ['light', 'dark', 'system'].includes(stored) ? stored : 'system'
  })
  const [systemTheme, setSystemTheme] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const theme = themeMode === 'system' ? systemTheme : themeMode
  const guestPath = Boolean(guestToken)
  const passwordSetupPath = authAction === 'set-password'

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const actualizarTemaSistema = event => setSystemTheme(event.matches ? 'dark' : 'light')
    media.addEventListener?.('change', actualizarTemaSistema)
    return () => media.removeEventListener?.('change', actualizarTemaSistema)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem('agrobloque-theme', themeMode)
  }, [theme, themeMode])

  useEffect(() => {
    const company = String(organization?.nombre || '').trim()
    document.title = company && company !== 'AgroBloque' ? `${company} · AgroBloque` : 'AgroBloque'
  }, [organization?.nombre])

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
        await limpiarSesionRota('Tu sesión estaba vencida. Volvé a iniciar sesión para cargar los datos.')
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
    let cancelled = false
    setRole(normalizeRole(null))
    setRoleUserId(null)
    setOrganization(DEFAULT_ORGANIZATION)
    if (!session?.user?.id || guestPath) return
    const cargarPermisos = async () => {
      const email = session.user.email || ''
      const { data, error } = await supabase.from('app_user_roles').select('*').eq('email', email.toLowerCase()).maybeSingle()
      if (cancelled) return
      let organizationData = null
      const organizationRequest = data?.organizacion_id
        ? supabase.from('organizaciones').select('id,nombre,slug,logo_url,telefono,email,color_primario,activo').eq('id', data.organizacion_id).maybeSingle()
        : supabase.from('organizaciones').select('id').limit(1)
      const { data: orgResult } = await organizationRequest
      if (!error && data?.organizacion_id) {
        const org = Array.isArray(orgResult) ? orgResult[0] : orgResult
        organizationData = org || null
      }
      if (cancelled) return
      const perfilNombre = session.user.user_metadata?.nombre || session.user.user_metadata?.full_name || session.user.user_metadata?.name || ''
      const filaRol = data ? { ...data, nombre:perfilNombre || data.nombre, organizacion:organizationData } : null
      const rolNormalizado = normalizeRole(error ? null : filaRol, email)
      setRole(perfilNombre ? { ...rolNormalizado, nombre:perfilNombre } : rolNormalizado)
      setOrganization(organizationData || DEFAULT_ORGANIZATION)
      setRoleUserId(session.user.id)
    }
    cargarPermisos()
    return () => { cancelled = true }
  }, [session?.user?.id, guestPath])

  // Los administradores generales (los socios) entran al Panel de plataforma en vez del asistente de primer campo.
  useEffect(() => {
    let cancelled = false
    setIsPlatformAdmin(false)
    if (!session?.user?.id || guestPath) return
    esAdministradorGeneral().then(v => { if (!cancelled) setIsPlatformAdmin(v) }).catch(() => {})
    return () => { cancelled = true }
  }, [session?.user?.id, guestPath])

  useEffect(() => {
    if (guestPath) return
    if (!session && !guestPath) {
      setCampoActivo(null)
      setFieldsState('idle')
      return
    }

    let cancelled = false
    const cargarCampoActivo = async () => {
      setFieldsState('loading')
      const { data, error } = await supabase.from('campos').select('*').order('nombre')
      if (error) {
        setFieldsState('error')
        console.error('Error cargando campos', error)
        if (guestPath) {
          setDataError(textoErrorProfesional(error, { modulo:'Invitados / Campos', accion:'leer' }))
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch failed')) {
          setDataError('No se pudo conectar con Supabase. Si cargaste una foto de perfil, hay que limpiar esa foto del perfil en Supabase una sola vez.')
        } else if (esErrorSesion(error)) {
          await limpiarSesionRota(`No se pudo conectar con Supabase. Se limpió la sesión; inicia sesión de vuelta. Detalle: ${error.message}`)
        } else setDataError(textoErrorProfesional(error, { modulo:'Campos', accion:'leer' }))
        return
      }
      if (cancelled) return
      if (!data || data.length === 0) {
        setFieldsState('empty')
        if (guestPath) {
          setDataError('El link fue validado, pero Supabase no devolvio campos para el invitado. Ejecuta el SQL supabase/invitados_fix_total_2026_06_18.sql y revisa que el link tenga campo permitido.')
        }
        return
      }
      const { data: bloques, error: bloquesError } = await supabase.from('bloques').select('campo_id')
      if (bloquesError) {
        setFieldsState('error')
        console.error('Error cargando bloques', bloquesError)
        if (guestPath) {
          setDataError(textoErrorProfesional(bloquesError, { modulo:'Invitados / Bloques', accion:'leer' }))
        } else if (bloquesError.message?.includes('Failed to fetch') || bloquesError.message?.includes('fetch failed')) {
          setDataError('No se pudo conectar con Supabase. Si cargaste una foto de perfil, hay que limpiar esa foto del perfil en Supabase una sola vez.')
        } else if (esErrorSesion(bloquesError)) {
          await limpiarSesionRota(`No se pudo conectar con Supabase. Se limpió la sesión; inicia sesión de vuelta. Detalle: ${bloquesError.message}`)
        } else setDataError(textoErrorProfesional(bloquesError, { modulo:'Bloques', accion:'leer' }))
        return
      }
      const bloquesPorCampo = contarBloquesPorCampo(bloques || [])

      setCampoActivo(actual => {
        if (actual && data.some(c => c.id === actual.id)) return actual
        const guardado = getStoredCampoId()
        return elegirCampoConDatos(data, bloquesPorCampo, guardado)
      })
      setFieldsState('ready')
    }

    cargarCampoActivo()
    return () => { cancelled = true }
  }, [session, guestPath])

  useEffect(() => {
    if (typeof window === 'undefined' || !campoActivo?.id) return
    window.localStorage.setItem(CAMPO_STORAGE_KEY, campoActivo.id)
  }, [campoActivo])

  if (guestPath) return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/invitado/:token" element={<Suspense fallback={<Skeleton rows={3} label="Cargando" />}><Invitado /></Suspense>} />
        <Route path="*" element={<Navigate to={`/invitado/${guestToken}`} />} />
      </Routes>
    </BrowserRouter>
  )

  if (loading) return <StartupScreen />

  if (passwordSetupPath) return <Login mode="set-password" session={session} />

  if (!session) return (
    <>
      {dataError && (
        <div className="ui-6454c8">
          <span>{dataError}</span>
          <button className="ui-2052fc" onClick={() => forceLocalSignOut()}>Limpiar sesión</button>
        </div>
      )}
      <Login />
    </>
  )

  return (
    <BrowserRouter>
      <ScrollToTop />
      {dataError && (
        <div className="ui-6454c8">
          <span>{dataError}</span>
          <button className="ui-2052fc" onClick={() => forceLocalSignOut()}>Limpiar sesión</button>
        </div>
      )}
      {roleUserId !== session.user.id ? (
        <Skeleton rows={3} label="Cargando tu espacio de trabajo" />
      ) : !role.permisos.length ? (
        <div className="ui-6aff1e">
          <p>Tu cuenta todavía no tiene acceso habilitado. Pedí al administrador que configure tus permisos.</p>
          <button onClick={() => forceLocalSignOut()}>Cerrar sesión</button>
        </div>
      ) : fieldsState === 'empty' && role.rol === 'admin' && organization?.id && !isPlatformAdmin ? (
        <Onboarding organization={organization} onExit={() => forceLocalSignOut()} onComplete={({ organization:nextOrganization, campo }) => { setOrganization(nextOrganization); setCampoActivo(campo); setFieldsState('ready') }}/>
      ) : <AppLayout campoActivo={campoActivo} setCampoActivo={setCampoActivo} role={role} organization={organization} setOrganization={setOrganization} theme={theme} themeMode={themeMode} onThemeChange={setThemeMode} isPlatformAdmin={isPlatformAdmin} />}
    </BrowserRouter>
  )
}
