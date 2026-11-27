import React, { useCallback, useRef, useState } from 'react'
import UnifiedFormModal from './UnifiedFormModal'

const TONOS = {
  peligro: { tone: 'alerta', icon: 'ti-trash', danger: true },
  aviso: { tone: 'alerta', icon: 'ti-alert-triangle', danger: false },
  info: { tone: 'finanzas', icon: 'ti-circle-check', danger: false },
}

// Confirmación unificada (Apple Spatial Glass). Con `open` la pantalla puede animar la salida:
// <ModalConfirm open={Boolean(confirmar)} titulo={confirmar?.titulo} … />. Sin `open` se monta y desmonta como antes.
export default function ModalConfirm({ open = true, titulo, mensaje, onConfirm, onCancel, textoBoton = 'Eliminar', textoCancelar = 'Cancelar', tono = 'peligro', icono, children }) {
  const [ocupado, setOcupado] = useState(false)
  const estilo = TONOS[tono] || TONOS.peligro
  const alConfirmar = async () => {
    if (ocupado) return
    setOcupado(true)
    try { await onConfirm?.() } finally { setOcupado(false) }
  }
  return (
    <UnifiedFormModal
      open={open}
      size="sm"
      shortcut={false}
      tone={estilo.tone}
      danger={estilo.danger}
      icon={icono || estilo.icon}
      eyebrow="Confirmar acción"
      title={titulo || '¿Confirmar?'}
      label="Confirmar acción"
      busy={ocupado}
      onClose={onCancel}
      onSubmit={alConfirmar}
      submitLabel={textoBoton}
      cancelLabel={textoCancelar}
    >{() => <>
      {mensaje && <p className="apple-confirm__msg">{mensaje}</p>}
      {children}
    </>}</UnifiedFormModal>
  )
}

// Reemplazo de window.confirm: const [pedir, dialogo] = useConfirmar(); … if (!(await pedir({ titulo, mensaje }))) return … y {dialogo} en el JSX.
export function useConfirmar() {
  const [estado, setEstado] = useState(null)
  const resolver = useRef(null)
  const pedir = useCallback(opciones => new Promise(resolve => { resolver.current = resolve; setEstado(opciones) }), [])
  const cerrar = valor => { resolver.current?.(valor); resolver.current = null; setEstado(null) }
  const dialogo = (
    <ModalConfirm
      open={Boolean(estado)}
      titulo={estado?.titulo}
      mensaje={estado?.mensaje}
      textoBoton={estado?.textoBoton || 'Confirmar'}
      tono={estado?.tono || 'aviso'}
      onConfirm={() => cerrar(true)}
      onCancel={() => cerrar(false)}
    />
  )
  return [pedir, dialogo]
}
