import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { canPerformAction } from '../lib/permissions'

// Acción rápida universal (botón «+» de la barra inferior y «Registrar trabajo» del Inicio).
// Los accesos con ?nuevo=1 abren directamente el alta; Fumigaciones primero muestra su resumen e historial.
export const workOptions = [
  { key: 'cosecha', path: '/cosecha?nuevo=1', icon: 'ti-basket', label: 'Registrar cosecha', detail: 'Kilos por bloque', tone: 'bloques' },
  { key: 'fumigaciones', path: '/fumigaciones', icon: 'ti-spray', label: 'Fumigaciones', detail: 'Ver historial y registrar', tone: 'alerta' },
  { key: 'plan_nutricional', path: '/fertilizaciones?nuevo=1', icon: 'ti-droplet', label: 'Nueva fertilización', detail: 'Aplicación puntual', tone: 'agua' },
  { key: 'agenda', path: '/agenda?nuevo=1', icon: 'ti-calendar-plus', label: 'Tarea en agenda', detail: 'Para hoy o más adelante', tone: 'neutral' },
  { key: 'vivero', path: '/vivero?nuevo=1', icon: 'ti-seeding', label: 'Lote en vivero', detail: 'Siembra y bandejas', tone: 'agua' },
  { key: 'asistencia', path: '/asistencia', icon: 'ti-users', label: 'Asistencia', detail: 'Planilla del día', tone: 'finanzas' },
]
export const availableWork = (role, isGuest) => isGuest ? [] : workOptions.filter(item => canPerformAction(role, item.key, 'create'))

export default function WorkActions({ role, isGuest, onClose }) {
  const dialog = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  const ir = path => { onClose(); navigate(path) }
  return <dialog ref={dialog} className="ag-work-dialog ag-quick-sheet" onCancel={onClose} onClose={() => { if (!dialog.current?.open) onClose() }} onClick={e => { if (e.target === dialog.current) onClose() }} aria-labelledby="work-title">
    <div className="ag-quick-sheet__head"><h2 id="work-title">¿Qué vas a registrar?</h2><button type="button" className="ag-icon-button" onClick={onClose} aria-label="Cerrar"><i className="ti ti-x" aria-hidden="true" /></button></div>
    <div className="ag-quick-grid">{availableWork(role, isGuest).map(item => <button type="button" key={item.key} data-tone={item.tone} onClick={() => ir(item.path)}>
      <span className="ag-quick-grid__icon" aria-hidden="true"><i className={`ti ${item.icon}`} /></span>
      <strong>{item.label}</strong>
      <small>{item.detail}</small>
    </button>)}</div>
  </dialog>
}
