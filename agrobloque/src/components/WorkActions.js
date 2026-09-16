import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { canPerformAction } from '../lib/permissions'

export const workOptions = [
  { key: 'cosecha', path: '/cosecha', icon: 'ti-cut', label: 'Cosecha', detail: 'Producción y registros del campo' },
  { key: 'fumigaciones', path: '/fumigaciones', icon: 'ti-spray', label: 'Fumigación', detail: 'Aplicaciones y productos utilizados' },
  { key: 'plan_nutricional', path: '/fertilizaciones', icon: 'ti-leaf', label: 'Fertilización', detail: 'Nutrición y aplicaciones por bloque' },
  { key: 'asistencia', path: '/asistencia', icon: 'ti-users', label: 'Asistencia', detail: 'Planilla diaria del personal' },
  { key: 'agenda', path: '/agenda', icon: 'ti-calendar', label: 'Tarea', detail: 'Organización del trabajo' },
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
  return <dialog ref={dialog} className="ag-work-dialog" onCancel={onClose} onClose={onClose} aria-labelledby="work-title">
    <div className="ag-section-heading"><div><span className="ag-eyebrow">OPERACIÓN</span><h2 id="work-title">Registrar trabajo</h2></div><button className="ag-icon-button" onClick={onClose} aria-label="Cerrar"><i className="ti ti-x" /></button></div>
    <p className="ag-muted">Elegí el tipo de trabajo para abrir sus registros.</p>
    <div className="ag-work-options">{availableWork(role, isGuest).map(item => <button key={item.key} onClick={() => { onClose(); navigate(item.path) }}><i className={`ti ${item.icon}`} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><i className="ti ti-chevron-right" /></button>)}</div>
  </dialog>
}
