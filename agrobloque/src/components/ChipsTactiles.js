import React, { useEffect, useState } from 'react'

// true en el teléfono (< 768 px): ahí los selectores de bloque se vuelven chips para el pulgar.
export function useEsTelefono() {
  const consulta = '(max-width:767px)'
  const [es, setEs] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const media = window.matchMedia(consulta)
    const cambiar = () => setEs(media.matches)
    media.addEventListener?.('change', cambiar)
    return () => media.removeEventListener?.('change', cambiar)
  }, [])
  return es
}

// Elección de un solo valor con chips de 48 px (código de bloque en JetBrains Mono).
// Se comporta como un grupo de radios: flechas para moverse, Espacio/Enter para elegir.
export default function ChipsTactiles({ opciones, valor, onCambiar, etiqueta, vacio = 'No hay opciones.' }) {
  if (!opciones.length) return <p className="ag-chips__vacio">{vacio}</p>
  const mover = (evento, indice) => {
    const pasos = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    if (!(evento.key in pasos)) return
    evento.preventDefault()
    const siguiente = (indice + pasos[evento.key] + opciones.length) % opciones.length
    onCambiar(opciones[siguiente].valor)
    evento.currentTarget.parentElement.children[siguiente]?.focus()
  }
  const elegido = opciones.findIndex(op => op.valor === valor)
  return <div className="ag-chips" role="radiogroup" aria-label={etiqueta}>
    {opciones.map((op, i) => <button
      type="button"
      role="radio"
      key={op.valor}
      aria-checked={op.valor === valor}
      tabIndex={i === (elegido < 0 ? 0 : elegido) ? 0 : -1}
      className="ag-chip"
      onClick={() => onCambiar(op.valor)}
      onKeyDown={e => mover(e, i)}
    >
      <span className="ag-chip__codigo">{op.etiqueta}</span>
      {op.detalle && <small>{op.detalle}</small>}
    </button>)}
  </div>
}
