import React from 'react'
import { useNavigate } from 'react-router-dom'

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px' },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  body: { padding:'8px 0' },
  item: { display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom:'0.5px solid #f0ede8', cursor:'pointer' },
  icon: { width:34, height:34, borderRadius:8, background:'#f0ede8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 },
  title: { fontSize:13, fontWeight:500, color:'#1a1a1a' },
  sub: { fontSize:11, color:'#aaa' },
  arrow: { marginLeft:'auto', color:'#bbb', fontSize:16 },
}

const items = [
  { icon:'🏗️', title:'Campos y bloques', sub:'Sectores, nombres, estructura' },
  { icon:'🌱', title:'Cultivos y variedades', sub:'Agregar o editar' },
  { icon:'👥', title:'Operarios', sub:'7 personas · El Sembrador 1' },
  { icon:'🧪', title:'Productos e insumos', sub:'Abonos, fungicidas, fertilizantes' },
  { icon:'🔔', title:'Notificaciones', sub:'Tipo, hora y anticipación' },
  { icon:'👤', title:'Cuenta', sub:'Email, zona horaria' },
]

export default function Configuracion() {
  return (
    <div>
      <div style={s.topbar}><div style={s.topTitle}>Configuración</div></div>
      <div style={s.body}>
        {items.map((it, i) => (
          <div key={i} style={s.item}>
            <div style={s.icon}>{it.icon}</div>
            <div style={{ flex:1 }}>
              <div style={s.title}>{it.title}</div>
              <div style={s.sub}>{it.sub}</div>
            </div>
            <div style={s.arrow}>›</div>
          </div>
        ))}
      </div>
    </div>
  )
}
