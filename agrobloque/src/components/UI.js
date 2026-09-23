import React, { useEffect, useRef } from 'react'

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

// A shared focus boundary for the existing modal forms; their data and save handlers stay in the page.
export function Modal({ children, onClose, busy = false, label = 'Detalle o registro', className = '', ...props }) {
  const root = useRef(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy
  useEffect(() => {
    const previous = document.activeElement
    const element = root.current
    const focusables = () => Array.from(element.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length)
    element.focus({ preventScroll: true })
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
      document.removeEventListener('keydown', keydown)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return <div {...props} ref={root} className={`ag-modal-overlay ${className}`} role="dialog" aria-modal="true" aria-label={label} aria-busy={busy || undefined} tabIndex={-1} data-ag-modal="true">{children}</div>
}
