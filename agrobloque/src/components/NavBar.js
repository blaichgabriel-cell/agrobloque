import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { filterTabsByRole } from '../lib/permissions'
import WorkActions, { availableWork } from './WorkActions'

const moreTabs = [
  { path: '/agenda', icon: 'ti-calendar', label: 'Agenda' },
  { path: '/buscar', icon: 'ti-search', label: 'Buscar' },
  { path: '/mapa', icon: 'ti-map', label: 'Mapa' },
  { path: '/vivero', icon: 'vivero-icon', label: 'Vivero' },
  { path: '/asistencia', icon: 'ti-users', label: 'Asistencia' },
  { path: '/cosecha', icon: 'ti-cut', label: 'Cosecha' },
  { path: '/ventas', icon: 'ti-cash-register', label: 'Ventas' },
  { path: '/inventario', icon: 'ti-box', label: 'Inventario' },
  { path: '/fumigaciones', icon: 'ti-spray', label: 'Fumigaciones' },
  { path: '/fertilizaciones', icon: 'ti-leaf', label: 'Fertilizaciones' },
  { path: '/costos', icon: 'ti-coin', label: 'Costos' },
  { path: '/contabilidad', icon: 'ti-calculator', label: 'Contabilidad' },
  { path: '/cuentas-pagar', icon: 'ti-receipt-2', label: 'Cuentas a pagar' },
  { path: '/reportes', icon: 'ti-chart-bar', label: 'Reportes' },
  { path: '/compradores', icon: 'ti-building-store', label: 'Compradores' },
  { path: '/alertas', icon: 'ti-bell-ringing', label: 'Alertas' },
  { path: '/historial', icon: 'ti-timeline', label: 'Historial' },
  { path: '/auditoria', icon: 'ti-history', label: 'Auditoría' },
  { path: '/configuracion', icon: 'ti-settings', label: 'Configuración' },
]


export default function NavBar({ isGuest = false, role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const [work, setWork] = useState(false)
  const tabs = filterTabsByRole(moreTabs, role, isGuest)
  const main = tabs.filter(tab => ['/mapa', '/inventario'].includes(tab.path))
  const more = tabs.filter(tab => !['/mapa', '/inventario'].includes(tab.path))
  const canWork = availableWork(role, isGuest).length > 0
  useEffect(() => { setShowMore(false) }, [location.pathname])
  useEffect(() => {
    if (!showMore) return
    const close = event => { if (event.key === 'Escape') setShowMore(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [showMore])
  const go = path => { setShowMore(false); navigate(path) }
  const button = tab => <button key={tab.path} aria-current={location.pathname === tab.path || (tab.path === '/mapa' && location.pathname.startsWith('/bloque/')) ? 'page' : undefined} onClick={() => go(tab.path)}><i className={'ti ' + tab.icon} aria-hidden="true" /><span>{tab.path === '/mapa' ? 'Bloques' : tab.label}</span></button>
  return <>
    {showMore && <button className="ag-more-backdrop" aria-label="Cerrar menú" onClick={() => setShowMore(false)} />}
    {showMore && <section id="ag-more-menu" className="ag-more-menu" aria-label="Más secciones"><h2>Tu espacio de trabajo</h2><div>{more.map(tab => <button key={tab.path} aria-current={location.pathname === tab.path ? 'page' : undefined} onClick={() => go(tab.path)}><i className={'ti ' + (tab.icon === 'vivero-icon' ? 'ti-seeding' : tab.icon)} aria-hidden="true" /><span>{tab.label}</span></button>)}</div></section>}
    <nav className="ag-bottom-nav" aria-label="Navegación principal">
      {button({ path:'/', icon:'ti-home', label:'Inicio' })}
      {main.filter(tab => tab.path === '/mapa').map(button)}
      {canWork && <button className="ag-nav-create" aria-label="Registrar trabajo" onClick={() => { setShowMore(false); setWork(true) }}><i className="ti ti-plus" aria-hidden="true" /><span>Registrar</span></button>}
      {main.filter(tab => tab.path === '/inventario').map(button)}
      <button aria-controls="ag-more-menu" aria-current={more.some(tab => location.pathname === tab.path) ? 'page' : undefined} aria-label="Más secciones" aria-expanded={showMore} onClick={() => setShowMore(value => !value)}><i className={'ti ' + (showMore ? 'ti-x' : 'ti-dots')} aria-hidden="true" /><span>Más</span></button>
    </nav>
    {work && <WorkActions role={role} isGuest={isGuest} onClose={() => setWork(false)} />}
  </>
}
