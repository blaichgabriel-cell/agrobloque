import React, { useCallback, useEffect, useState } from 'react'
import { listarEmpresas, suscribirPlataforma } from '../lib/plataforma'

// Carga la lista de empresas del panel (datos reales o de ejemplo) y se actualiza cuando cambia el estado de soporte.
export function useEmpresas() {
  const [datos, setDatos] = useState({ cargando: true, demo: false, empresas: [], error: '' })
  const recargar = useCallback(async () => {
    try {
      const r = await listarEmpresas()
      setDatos({ cargando: false, demo: r.demo, empresas: [...r.empresas], error: '' })
    } catch (e) { setDatos(d => ({ ...d, cargando: false, error: e.message })) }
  }, [])
  useEffect(() => { recargar() }, [recargar])
  useEffect(() => suscribirPlataforma(() => setDatos(d => (d.demo ? { ...d, empresas: [...d.empresas] } : d))), [])
  return { ...datos, recargar }
}

export const numero = valor => Number(valor || 0).toLocaleString('es-PY')

// Cabecera compacta de las vistas internas del panel (la vista principal usa el hero oscuro).
export function PlataformaCabecera({ icono, eyebrow, titulo, sub, children }) {
  return <header className="pl-cabecera">
    <div>
      <span className="pl-cabecera__eyebrow"><i className={`ti ${icono}`} aria-hidden="true" />{eyebrow}</span>
      <h1>{titulo}</h1>
      {sub && <p>{sub}</p>}
    </div>
    {children}
  </header>
}

export function AvisoDemo() {
  return <div className="pl-demo" role="note"><i className="ti ti-flask" aria-hidden="true" /><div><b>Vista de demostración.</b> Estas empresas son de ejemplo y nada se guarda. Cuando se aplique el SQL de soporte en la base, aquí aparecerán las empresas reales.</div></div>
}

export function MiniStat({ icono, valor, etiqueta, tono = 'neutral' }) {
  return <div className="pl-mini" data-tone={tono}><i className={`ti ${icono}`} aria-hidden="true" /><div><strong className="numeric-data">{valor}</strong><span>{etiqueta}</span></div></div>
}
