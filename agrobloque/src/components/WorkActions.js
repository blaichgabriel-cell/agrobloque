import React from 'react'
import { useNavigate } from 'react-router-dom'
import { canPerformAction } from '../lib/permissions'
import UnifiedFormModal from './UnifiedFormModal'

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

export default function WorkActions({ open = true, role, isGuest, onClose }) {
  const navigate = useNavigate()
  const opciones = availableWork(role, isGuest)
  const ir = path => { onClose(); navigate(path) }
  return (
    <UnifiedFormModal
      open={open}
      tone="bloques"
      icon="ti-plus"
      eyebrow="Registrar"
      title="¿Qué vas a registrar?"
      subtitle="Elegí el trabajo y te llevamos directo al formulario."
      label="Registrar trabajo"
      onClose={onClose}
      submitLabel={null}
      cancelLabel="Cerrar"
    >{() => opciones.length === 0
      ? <p className="apple-empty">Tu usuario no tiene acciones de registro habilitadas.</p>
      : <div className="apple-quick">{opciones.map((item, i) => (
        <button type="button" className="apple-quick__item" key={item.key} data-tone={item.tone} data-autofocus={i === 0 ? '' : undefined} onClick={() => ir(item.path)}>
          <span className="apple-quick__icon" aria-hidden="true"><i className={`ti ${item.icon}`} /></span>
          <strong>{item.label}</strong>
          <small>{item.detail}</small>
        </button>
      ))}</div>}</UnifiedFormModal>
  )
}
