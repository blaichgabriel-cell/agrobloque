import React from 'react'

export default function ModalConfirm({ titulo, mensaje, onConfirm, onCancel, colorBoton = '#c84040', textoBoton = 'Eliminar' }) {
  return (
    <div className="ui-2ca387">
      <div className="ui-585654">
        <div className="ui-3e43be">{titulo || '¿Confirmar?'}</div>
        {mensaje && <div className="ui-01159a">{mensaje}</div>}
        <div className="ui-9c6869">
          <button className="ui-b1a395" onClick={onCancel}>Cancelar</button>
          <button className="ui-aed365" onClick={onConfirm} style={{ background:colorBoton }}>{textoBoton}</button>
        </div>
      </div>
    </div>
  )
}
