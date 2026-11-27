import React, { useEffect, useRef, useState } from 'react'
import { Modal, Notice } from './UI'

// Formato único de las ventanas de carga y edición («Apple Spatial Glass»):
//   · cabecera fija con ícono degradado por módulo, título y botón X,
//   · cuerpo compacto con scroll propio,
//   · pie fijo con micro-resumen en vivo, Cancelar y el botón principal (Ctrl/Cmd + Enter),
//   · en escritorio es un diálogo centrado de 680 px; en móvil (< 768 px) sube desde abajo como hoja nativa.
// La lógica de guardado sigue en cada pantalla: este componente solo pone la interfaz y la animación de salida.

const SALIDA_MS = 200
const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')
const reducirMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Fecha local en AAAA-MM-DD, desplazada `dias` respecto de hoy.
export const fechaIso = (dias = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function UnifiedFormModal({
  open = true,
  tone = 'bloques',
  icon = 'ti-clipboard-plus',
  eyebrow = '',
  title,
  subtitle = '',
  summary = null,
  onClose,
  onCancel,
  onSubmit,
  size = '',
  danger = false,
  shortcut = true,
  busy = false,
  submitDisabled = false,
  submitLabel = 'Guardar registro',
  cancelLabel = 'Cancelar',
  secondary = null,
  error = '',
  label = '',
  children,
}) {
  const [presente, setPresente] = useState(open)
  const vista = useRef(null)
  const raiz = useRef(null)
  const temporizador = useRef(0)
  // `children` puede ser una función: así el cuerpo solo se arma mientras la ventana está abierta.
  const actual = open ? { tone, icon, eyebrow, title, subtitle, summary, submitLabel, cancelLabel, secondary, error, label, children: typeof children === 'function' ? children() : children } : null
  // Mientras se anima la salida se muestra la última vista abierta: la pantalla ya pudo vaciar su formulario.
  if (open) vista.current = actual

  // En escritorio (puntero fino) el cursor cae en el primer campo marcado con data-autofocus; en el móvil no, para no tapar la hoja con el teclado.
  useEffect(() => {
    if (!open) return undefined
    const t = window.setTimeout(() => {
      if (!window.matchMedia?.('(pointer: fine)').matches) return
      raiz.current?.querySelector('[data-autofocus]')?.focus({ preventScroll:true })
    }, 90)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    window.clearTimeout(temporizador.current)
    if (open) { setPresente(true); return undefined }
    temporizador.current = window.setTimeout(() => setPresente(false), reducirMovimiento() ? 0 : SALIDA_MS)
    return () => window.clearTimeout(temporizador.current)
  }, [open])

  if (!open && !presente) return null
  const v = open ? actual : vista.current
  if (!v) return null
  const cerrando = !open

  const alTeclear = (event) => {
    if (shortcut && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault()
      if (!busy && !submitDisabled && open && v.submitLabel !== null) onSubmit?.()
    }
  }

  return (
    <Modal busy={busy || cerrando} onClose={() => { if (!cerrando) onClose?.() }} label={v.label || v.title || 'Formulario'} className={`apple-modal-overlay${cerrando ? ' is-closing' : ''}`}>
      <div className={`apple-modal${size === 'sm' ? ' apple-modal--sm' : ''}${danger ? ' apple-modal--danger' : ''}`} data-tone={v.tone} onKeyDown={alTeclear} ref={raiz}>
        <header className="apple-modal__head">
          <span className="apple-modal__icon" aria-hidden="true"><i className={`ti ${v.icon}`} /></span>
          <div className="apple-modal__titles">
            {v.eyebrow && <small>{v.eyebrow}</small>}
            <h2>{v.title}</h2>
            {v.subtitle && <p>{v.subtitle}</p>}
          </div>
          <button type="button" className="apple-modal__close" aria-label="Cerrar" onClick={onClose} disabled={busy || cerrando}><i className="ti ti-x" aria-hidden="true" /></button>
        </header>
        <div className="apple-modal__body">{v.children}</div>
        {v.error && <div className="apple-modal__error"><Notice tone="error">{v.error}</Notice></div>}
        <footer className="apple-modal__foot">
          <div className="apple-modal__summary" aria-live="polite">{v.summary}</div>
          <div className="apple-modal__actions">
            <button type="button" className="apple-btn apple-btn--ghost" onClick={onCancel || onClose} disabled={busy || cerrando}>{v.cancelLabel}</button>
            {v.secondary}
            {v.submitLabel !== null && <button type="button" className="apple-btn apple-btn--primary" onClick={onSubmit} disabled={busy || cerrando || submitDisabled} aria-busy={busy || undefined} aria-keyshortcuts={shortcut ? (esMac ? "Meta+Enter" : "Control+Enter") : undefined}>
              {busy && <span className="apple-spinner" aria-hidden="true" />}
              <span>{busy ? 'Guardando…' : v.submitLabel}</span>
              {!busy && shortcut && <kbd aria-hidden="true">{esMac ? '⌘' : 'Ctrl'} ↵</kbd>}
            </button>}
          </div>
        </footer>
      </div>
    </Modal>
  )
}

// Sección del formulario: título corto y, opcionalmente, plegable («Detalles opcionales»).
export function ModalSection({ title, icon, aside = null, collapsible = false, defaultOpen = true, open, onToggle, badge = '', children }) {
  const [interna, setInterna] = useState(defaultOpen)
  const abierta = open !== undefined ? open : interna
  const alternar = () => (onToggle ? onToggle() : setInterna(v => !v))
  if (!collapsible) {
    return <section className="apple-section">
      <div className="apple-section__head"><h3>{icon && <i className={`ti ${icon}`} aria-hidden="true" />}{title}</h3>{aside}</div>
      <div className="apple-section__body">{children}</div>
    </section>
  }
  return <section className={`apple-section apple-section--fold${abierta ? ' is-open' : ''}`}>
    <button type="button" className="apple-section__toggle" aria-expanded={abierta} onClick={alternar}>
      <h3>{icon && <i className={`ti ${icon}`} aria-hidden="true" />}{title}</h3>
      {badge && <span className="apple-section__badge">{badge}</span>}
      <i className="ti ti-chevron-down apple-section__chevron" aria-hidden="true" />
    </button>
    <div className="apple-fold"><div className="apple-fold__inner"><div className="apple-section__body">{children}</div></div></div>
  </section>
}

// Fila de campos cortos en 2 columnas (Fecha + Campo, Cantidad + Unidad). En móvil angosto pasa a una columna.
export function ModalGrid({ cols = 2, children }) {
  return <div className={`apple-grid apple-grid--${cols}`}>{children}</div>
}

export function ModalField({ label, hint = '', children, className = '' }) {
  return <label className={`apple-field ${className}`}>
    <span className="apple-field__label">{label}</span>
    {children}
    {hint && <small className="apple-field__hint">{hint}</small>}
  </label>
}

// Grupo con etiqueta que no es un solo campo (chips, listas).
export function ModalGroup({ label, aside = null, children, className = '' }) {
  return <div className={`apple-field ${className}`} role="group" aria-label={typeof label === 'string' ? label : undefined}>
    <div className="apple-field__head"><span className="apple-field__label">{label}</span>{aside}</div>
    {children}
  </div>
}

// Fecha con atajos («Hoy» y «Ayer» por defecto) además del calendario. `atajos` = [{ etiqueta, dias }].
export function DateQuickField({ label = 'Fecha', value, onChange, required = false, id = 'apple-fecha', atajos, min, max, destacada = false }) {
  const lista = (atajos || [{ etiqueta:'Hoy', dias:0 }, { etiqueta:'Ayer', dias:-1 }]).map(a => ({ ...a, fecha:fechaIso(a.dias) }))
  return <div className={`apple-field${destacada ? ' apple-field--hl' : ''}`}>
    <div className="apple-field__head">
      <label className="apple-field__label" htmlFor={id}>{label}{required ? ' *' : ''}</label>
      <div className="apple-chips apple-chips--mini" role="group" aria-label="Fecha rápida">
        {lista.map(a => <button type="button" key={a.etiqueta} className="apple-chip" aria-pressed={value === a.fecha} onClick={() => onChange(a.fecha)}>{a.etiqueta}</button>)}
      </div>
    </div>
    <input id={id} className="apple-control" type="date" value={value || ''} min={min} max={max || fechaIso(30)} onChange={e => onChange(e.target.value)} />
  </div>
}

// Opciones excluyentes en una fila de chips (tipo de aplicación, distribución de la mezcla…).
export function ChoiceChips({ options, value, onChange, label = '', wrap = false }) {
  return <div className={`apple-chips apple-chips--choice${wrap ? ' apple-chips--wrap' : ''}`} role="group" aria-label={label || undefined}>
    {options.map(o => <button type="button" key={o.value} className="apple-chip apple-chip--lg" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
      {o.icon && <i className={`ti ${o.icon}`} aria-hidden="true" />}<span>{o.label}</span>
    </button>)}
  </div>
}

// Grilla de bloques como chips táctiles (códigos en JetBrains Mono). Varios bloques con «Seleccionar todos» / «Limpiar»;
// con `single` se elige uno solo (cosecha, tareas).
export function BlockChips({ bloques, seleccionados, onToggle, onSelectAll, onClear, cultivoDe = () => '', cargando = false, single = false, neutral = false, required = true, label = 'Bloques', vacio = 'Este campo no tiene bloques cargados.' }) {
  const [busqueda, setBusqueda] = useState('')
  const [soloCultivo, setSoloCultivo] = useState(false)
  const termino = busqueda.trim().toLowerCase()
  const visibles = bloques.filter(b => {
    const cultivo = cultivoDe(b)
    return (!termino || `${b.codigo} ${cultivo}`.toLowerCase().includes(termino)) && (!soloCultivo || Boolean(cultivo))
  })
  const marcados = visibles.filter(b => seleccionados.includes(b.id)).length
  const todos = visibles.length > 0 && marcados === visibles.length
  const conCultivo = !neutral && bloques.some(b => cultivoDe(b))
  return <div className="apple-field">
    <div className="apple-field__head">
      <span className="apple-field__label">{label}{required ? ' *' : ''}{!single && <b className={`apple-count${seleccionados.length ? '' : ' is-zero'}`}>{seleccionados.length}</b>}</span>
      <div className="apple-chips apple-chips--mini">
        {conCultivo && <button type="button" className="apple-chip" aria-pressed={soloCultivo} onClick={() => setSoloCultivo(v => !v)}><i className="ti ti-leaf" aria-hidden="true" />Con cultivo</button>}
        {!single && <button type="button" className="apple-chip apple-chip--action" onClick={() => onSelectAll(visibles)} disabled={!visibles.length || todos}>Seleccionar todos</button>}
        {!single && <button type="button" className="apple-chip apple-chip--action" onClick={onClear} disabled={!seleccionados.length}>Limpiar</button>}
      </div>
    </div>
    {bloques.length > 24 && <label className="apple-search"><i className="ti ti-search" aria-hidden="true" /><span className="ag-sr-only">Buscar bloque o cultivo</span><input className="apple-bare" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar bloque o cultivo" enterKeyHint="search" /></label>}
    {bloques.length === 0 ? <p className="apple-empty" role="status">{cargando ? 'Cargando bloques…' : vacio}</p> : visibles.length === 0 ? <p className="apple-empty">Ningún bloque coincide con la búsqueda.</p> : (
      <div className="apple-blocks" role="group" aria-label="Bloques del campo">
        {visibles.map(b => {
          const cultivo = cultivoDe(b)
          const activo = seleccionados.includes(b.id)
          return <button type="button" key={b.id} className={`apple-block${cultivo || neutral ? '' : ' is-empty'}`} aria-pressed={activo} title={neutral ? b.codigo : `${b.codigo}${cultivo ? ` · ${cultivo}` : ' · Sin cultivo'}`} onClick={() => onToggle(b.id)}>
            <span>{b.codigo}</span>{activo && <i className="ti ti-check" aria-hidden="true" />}
          </button>
        })}
      </div>
    )}
  </div>
}

// Micro-resumen del pie: «3 bloques · 2 productos». Las partes vacías se omiten; { solo:'texto' } agrega texto sin cifra.
export function resumenPie(partes) {
  const lista = partes
    .filter(p => p && (p.solo || (p.n !== undefined && p.n !== null && p.n !== 0 && p.n !== '')))
    .map(p => p.solo ? { solo: p.solo } : { n: p.n, texto: p.uno && Number(p.n) === 1 ? p.uno : p.texto })
  if (!lista.length) return null
  return lista.map((p, i) => <React.Fragment key={i}>{i > 0 && <span className="apple-dot" aria-hidden="true"> · </span>}{p.solo ? p.solo : <><b>{p.n}</b>{p.texto ? ` ${p.texto}` : ''}</>}</React.Fragment>)
}
