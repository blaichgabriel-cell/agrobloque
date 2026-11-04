import React from 'react'

export default function ThemeToggle({ theme = 'light', onToggle, compact = false }) {
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      className={`ag-theme-toggle${compact ? ' is-compact' : ''}`}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={onToggle}
    >
      <span className="ag-theme-toggle__icon" aria-hidden="true">
        <i className={`ti ${dark ? 'ti-moon-stars' : 'ti-sun'}`} />
      </span>
      {!compact && (
        <span className="ag-theme-toggle__copy">
          <strong>Apariencia</strong>
          <small>{dark ? 'Modo oscuro' : 'Modo claro'}</small>
        </span>
      )}
      <span className="ag-theme-toggle__track" aria-hidden="true">
        <span className="ag-theme-toggle__thumb" />
      </span>
    </button>
  )
}
