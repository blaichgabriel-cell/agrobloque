import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { filterTabsByRole } from '../lib/permissions'
import WorkActions, { availableWork } from './WorkActions'
import { OPERACIONES, OPERACION_STORAGE_KEY, operacionesPermitidas } from './MobileChrome'
import { useVolverAlPanel } from './Soporte'

// Hoja «Módulos»: todo lo que no tiene pestaña propia, agrupado como en el menú de escritorio.
const GRUPOS_MODULOS = [
  { titulo: 'Campo', items: [
    { path: '/agenda', icon: 'ti-calendar', label: 'Agenda', tone: 'neutral' },
    { path: '/calendario', icon: 'ti-calendar-month', label: 'Calendario', tone: 'neutral' },
    { path: '/vivero', icon: 'ti-seeding', label: 'Vivero', tone: 'agua' },
  ] },
  { titulo: 'Operación', items: [
    { path: '/inventario', icon: 'ti-box', label: 'Inventario', tone: 'neutral' },
    { path: '/asistencia', icon: 'ti-users', label: 'Asistencia', tone: 'neutral' },
    { path: '/ventas', icon: 'ti-cash-register', label: 'Ventas', tone: 'finanzas' },
    { path: '/compradores', icon: 'ti-building-store', label: 'Compradores', tone: 'finanzas' },
  ] },
  { titulo: 'Gestión', items: [
    { path: '/contabilidad', icon: 'ti-calculator', label: 'Contabilidad', tone: 'finanzas' },
    { path: '/costos', icon: 'ti-coin', label: 'Costos', tone: 'finanzas' },
    { path: '/rentabilidad', icon: 'ti-chart-line', label: 'Rentabilidad', tone: 'finanzas' },
    { path: '/alertas', icon: 'ti-bell-ringing', label: 'Alertas', tone: 'alerta' },
    { path: '/cuentas-pagar', icon: 'ti-receipt-2', label: 'Cuentas a pagar', tone: 'finanzas' },
    { path: '/reportes', icon: 'ti-chart-bar', label: 'Reportes', tone: 'finanzas' },
    { path: '/historial', icon: 'ti-timeline', label: 'Historial', tone: 'neutral' },
    { path: '/auditoria', icon: 'ti-history', label: 'Auditoría', tone: 'neutral' },
    { path: '/configuracion', icon: 'ti-settings', label: 'Configuración', tone: 'neutral' },
  ] },
]

// Modo Plataforma (administradores generales sin empresa abierta): solo las 5 vistas del panel.
const plataformaTabs = [
  { path: '/plataforma', icon: 'ti-building-community', label: 'Empresas' },
  { path: '/plataforma/soporte', icon: 'ti-shield-check', label: 'Soporte' },
  { path: '/plataforma/planes', icon: 'ti-credit-card', label: 'Planes' },
  { path: '/plataforma/errores', icon: 'ti-bug', label: 'Errores' },
  { path: '/plataforma/equipo', icon: 'ti-shield-lock', label: 'Equipo' },
]

const leerOperacion = () => {
  try { return window.localStorage.getItem(OPERACION_STORAGE_KEY) } catch (e) { return null }
}

export default function NavBar({ isGuest = false, role, modo = 'campo', isPlatformAdmin = false, contexto = { activo: false } }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const [work, setWork] = useState(false)
  const { volver, ocupado: volviendo } = useVolverAlPanel()
  const ruta = location.pathname
  const operaciones = operacionesPermitidas(role)
  const grupos = GRUPOS_MODULOS.map(grupo => ({ ...grupo, items: filterTabsByRole(grupo.items, role, isGuest) })).filter(grupo => grupo.items.length)
  const enModulos = grupos.some(grupo => grupo.items.some(item => ruta === item.path || ruta.startsWith(`${item.path}/`)))
  const puedeBloques = filterTabsByRole([{ path: '/mapa' }], role, isGuest).length > 0
  const canWork = availableWork(role, isGuest).length > 0

  useEffect(() => { setShowMore(false) }, [ruta])
  useEffect(() => {
    if (!showMore) return undefined
    const close = event => { if (event.key === 'Escape') setShowMore(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [showMore])

  const go = path => { setShowMore(false); navigate(path) }
  const irOperacion = () => {
    const guardada = leerOperacion()
    const destino = operaciones.find(op => op.path === guardada) || operaciones[0]
    if (destino) go(destino.path)
  }

  if (modo === 'plataforma') return <nav className="ag-bottom-nav ag-bottom-nav--plataforma sb-anim" aria-label="Navegación de la plataforma">
    {plataformaTabs.map(tab => <button key={tab.path} aria-current={ruta === tab.path ? 'page' : undefined} onClick={() => navigate(tab.path)}><i className={'ti ' + tab.icon} aria-hidden="true" /><span>{tab.label}</span></button>)}
  </nav>

  const tab = (clave, { icono, etiqueta, activa, onClick, extra = {} }) => <button type="button" key={clave} aria-current={activa ? 'page' : undefined} onClick={onClick} {...extra}><i className={'ti ' + icono} aria-hidden="true" /><span>{etiqueta}</span></button>

  return <>
    {showMore && <button type="button" className="ag-more-backdrop" aria-label="Cerrar menú" onClick={() => setShowMore(false)} />}
    {showMore && <section id="ag-more-menu" className="ag-more-menu ag-modulos" aria-label="Módulos">
      <h2>Módulos</h2>
      {isPlatformAdmin && <button type="button" className="ag-modulos__panel" disabled={volviendo} onClick={() => { setShowMore(false); if (contexto.activo) volver(); else navigate('/plataforma') }}>
        <span className="ag-modulos__icono" data-tone="finanzas" aria-hidden="true"><i className="ti ti-building-community" /></span>
        <span><strong>Panel AgroBloque</strong><small>{contexto.activo ? 'Salir de esta empresa y volver al panel' : 'Empresas, soporte y planes'}</small></span>
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>}
      {grupos.map(grupo => <div className="ag-modulos__grupo" key={grupo.titulo}>
        <h3>{grupo.titulo}</h3>
        <div>{grupo.items.map(item => <button type="button" key={item.path} aria-current={ruta === item.path ? 'page' : undefined} onClick={() => go(item.path)}>
          <span className="ag-modulos__icono" data-tone={item.tone} aria-hidden="true"><i className={'ti ' + item.icon} /></span>
          <span>{item.label}</span>
        </button>)}</div>
      </div>)}
    </section>}
    <nav className="ag-bottom-nav ag-tabbar" aria-label="Navegación principal">
      {tab('inicio', { icono: 'ti-home', etiqueta: 'Inicio', activa: ruta === '/', onClick: () => go('/') })}
      {puedeBloques && tab('bloques', { icono: 'ti-layout-grid', etiqueta: 'Bloques', activa: ruta === '/mapa' || ruta.startsWith('/bloque/'), onClick: () => go('/mapa') })}
      {canWork && <button type="button" className="ag-nav-create" aria-label="Acción rápida: registrar trabajo" aria-haspopup="dialog" onClick={() => { setShowMore(false); setWork(true) }}><i className="ti ti-plus" aria-hidden="true" /><span>Registrar</span></button>}
      {operaciones.length > 0 && tab('operacion', { icono: 'ti-tractor', etiqueta: 'Operación', activa: OPERACIONES.some(op => op.path === ruta), onClick: irOperacion })}
      {grupos.length > 0 && tab('modulos', { icono: showMore ? 'ti-x' : 'ti-grid-dots', etiqueta: 'Módulos', activa: showMore || enModulos, onClick: () => setShowMore(value => !value), extra: { 'aria-controls': 'ag-more-menu', 'aria-expanded': showMore } })}
    </nav>
    {work && <WorkActions role={role} isGuest={isGuest} onClose={() => setWork(false)} />}
  </>
}
