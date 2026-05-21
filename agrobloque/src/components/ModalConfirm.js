import React from 'react'

export default function ModalConfirm({ titulo, mensaje, onConfirm, onCancel, colorBoton = '#c84040', textoBoton = 'Eliminar' }) {
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:15, fontWeight:600, color:'#0a0a0a', marginBottom:8, textAlign:'center' }}>{titulo || '¿Confirmar?'}</div>
        {mensaje && <div style={{ fontSize:13, color:'#9a9a9a', textAlign:'center', marginBottom:20 }}>{mensaje}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:12, border:'1px solid #e8e6e2', background:'transparent', fontSize:13, color:'#9a9a9a', cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:12, borderRadius:12, border:'none', background:colorBoton, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer' }}>{textoBoton}</button>
        </div>
      </div>
    </div>
  )
}
