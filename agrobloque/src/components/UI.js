import React, { useEffect, useRef, useState, isValidElement, cloneElement, Children } from 'react'
import { createPortal } from 'react-dom'

export function Skeleton({ rows = 3, label = 'Cargando información' }) {
  return <div className="ag-skeleton-group" role="status" aria-label={label} aria-busy="true">
    <span className="ag-sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => <div className="ag-skeleton-row" aria-hidden="true" key={i}><span /><div><b /><b /></div></div>)}
  </div>
}

export function Notice({ children, tone = 'success' }) {
  if (!children) return null
  return <div className={`ag-feedback ag-feedback-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <i className={`ti ${tone === 'error' ? 'ti-alert-circle' : 'ti-circle-check'}`} aria-hidden="true" /><span>{children}</span>
  </div>
}

export function FormHeading({ number, children, detail }) {
  return <div className="ag-form-heading"><span aria-hidden="true">{number}</span><div><h3>{children}</h3>{detail && <p>{detail}</p>}</div></div>
}

// Botón X para salir de un formulario u hoja. Pegado arriba a la derecha mientras se desplaza el contenido
// (envoltorio de altura 0: no mueve nada del formulario). Se pone solo en los modales que no traen la suya.
export function CerrarX({ onClose, disabled = false }) {
  return <div className="ag-modal-x"><button type="button" className="ag-modal-x__boton" aria-label="Cerrar" disabled={disabled} onClick={onClose}><i className="ti ti-x" aria-hidden="true" /></button></div>
}

// A shared focus boundary for the existing modal forms; their data and save handlers stay in the page.
export function Modal({ children, onClose, busy = false, label = 'Detalle o registro', className = '', ...props }) {
  const root = useRef(null)
  const [sinX, setSinX] = useState(false)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy
  useEffect(() => {
    const previous = document.activeElement
    const element = root.current
    document.documentElement.classList.add('ag-modal-open')
    document.body.classList.add('ag-modal-open')
    const focusables = () => Array.from(element.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length)
    element.focus({ preventScroll: true })
    // Las confirmaciones («¿Eliminar?») ya tienen Cancelar/Eliminar; el resto lleva X si no trae su propio cierre.
    const esConfirmacion = /^confirmar/i.test(element.getAttribute('aria-label') || '')
    const marco = window.requestAnimationFrame(() => {
      if (!esConfirmacion && !element.querySelector('.ag-close-btn, .ag-modal-x, [aria-label="Cerrar"]')) setSinX(true)
    })
    const keydown = event => {
      const dialogs = document.querySelectorAll('[data-ag-modal]')
      if (dialogs[dialogs.length - 1] !== element) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!busyRef.current) closeRef.current?.()
      }
      if (event.key === 'Tab') {
        const controls = focusables()
        if (!controls.length) { event.preventDefault(); element.focus(); return }
        const first = controls[0], last = controls[controls.length - 1]
        if (!element.contains(document.activeElement) || document.activeElement === element) {
          event.preventDefault(); (event.shiftKey ? last : first).focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      window.cancelAnimationFrame(marco)
      document.removeEventListener('keydown', keydown)
      // Puede haber un segundo diálogo encima del primero (por ejemplo, una confirmación).
      // Sólo devolvemos el scroll cuando ya no queda ninguno abierto.
      window.requestAnimationFrame(() => {
        if (!document.querySelector('[data-ag-modal]')) {
          document.documentElement.classList.remove('ag-modal-open')
          document.body.classList.remove('ag-modal-open')
        }
      })
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  // La X va como primer elemento de la hoja (para pegarse a su esquina); si hay varios hijos, directo en el fondo.
  const equis = sinX && onClose ? <CerrarX onClose={() => { if (!busy) onClose() }} disabled={busy} /> : null
  const unico = Children.count(children) === 1 && isValidElement(children) && typeof children.type === 'string'
  const conX = !equis ? children : unico ? cloneElement(children, undefined, equis, children.props.children) : <>{equis}{children}</>
  const overlay = <div {...props} ref={root} className={`ag-modal-overlay ${className}`} role="dialog" aria-modal="true" aria-label={label} aria-busy={busy || undefined} tabIndex={-1} data-ag-modal="true">{conX}</div>
  // Se monta fuera del contenedor con scroll de la página: en iOS ese contenedor atrapa el z-index y la barra inferior
  // quedaba por encima del diálogo, tapando los botones. `.ag-app` conserva los estilos con ese prefijo.
  const host = typeof document !== 'undefined' ? (document.querySelector('.ag-app') || document.body) : null
  return host ? createPortal(overlay, host) : overlay
}
