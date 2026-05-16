import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CULTIVO_COLORES = {
  'Morrón': '#c8793a',
  'Tomate': '#c0392b',
  'Pepino': '#27ae60',
  'Berenjena': '#8e44ad',
  'Zapalito': '#f39c12',
  'Zucchini': '#16a085',
  'Repollo rojo': '#c0392b',
  'Repollo verde': '#27ae60',
  'Lechuga': '#2ecc71',
  'Lechuga repollo': '#1abc9c',
  'default': '#d0cdc8'
}

const s = {
  topbar: { background:'#1a1a1a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  topTitle: { color:'#f9f8f6', fontSize:15, fontWeight:500 },
  body: { padding:10 },
  grid: { display:'grid', gap:6 },
  bloque: { borderRadius:8, padding:'10px 12px', cursor:'pointer', border:'1.5px solid rgba(0,0,0,0.1)', display:'flex', flexDirection:'column', gap:2 },
  bloqueCode: { fontSize:13, fontWeight:600, color:'#1a1a1a' },
  bloqueCultivo: { fontSize:10, color:'#555' },
  vacio: { background:'#f0ede8', border:'1.5px solid #d0cdc8' },
  legend: { display:'flex', flexWrap:'wrap', gap:8, padding:'8px 10px', borderTop:'0.5px solid #d0cdc8', marginTop:8 },
  legItem: { display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#666' },
  legDot: { width:10, height:10, borderRadius:2 },
  empty: { textAlign:'center', padding:40, color:'#888', fontSize:14 }
}

export default function Mapa({ campoActivo }) {
  const [bloques, setBloques] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!campoActivo) return
    const fetchBloques = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('bloques')
        .select(`*, plantaciones(*, cultivos(nombre), variedades(nombre))`)
        .eq('campo_id', campoActivo.id)
        .order('codigo')
      if (data) setBloques(data)
      setLoading(false)
    }
    fetchBloques()
  }, [campoActivo])

  const getCultivoActual = (b) => {
    const p = b.plantaciones?.find(p => p.activa)
    return p ? { cultivo: p.cultivos?.nombre, variedad: p.variedades?.nombre } : null
  }

  const getColor = (b) => {
    const c = getCultivoActual(b)
    if (!c) return '#f0ede8'
    return CULTIVO_COLORES[c.cultivo] || CULTIVO_COLORES.default
  }

  if (!campoActivo) return <div style={s.empty}>Seleccioná un campo desde el inicio</div>

  return (
    <div>
      <div style={s.topbar}>
        <div style={{ color:'#f9f8f6', fontSize:15, fontWeight:500 }}>Mapa · {campoActivo?.nombre}</div>
      </div>
      <div style={s.body}>
        {loading ? <div style={s.empty}>Cargando...</div> : (
          <>
            <div style={{ ...s.grid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {bloques.map(b => {
                const cult = getCultivoActual(b)
                const color = getColor(b)
                const textColor = cult ? '#fff' : '#888'
                return (
                  <div key={b.id}
                    style={{ ...s.bloque, background: color, borderColor: cult ? 'rgba(0,0,0,0.15)' : '#d0cdc8' }}
                    onClick={() => navigate(`/bloque/${b.id}`)}>
                    <div style={{ ...s.bloqueCode, color: textColor }}>{b.codigo}</div>
                    <div style={{ ...s.bloqueCultivo, color: cult ? 'rgba(255,255,255,0.85)' : '#aaa' }}>
                      {cult ? `${cult.cultivo}${cult.variedad ? ' · ' + cult.variedad : ''}` : 'Sin cultivo'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={s.legend}>
              {Object.entries(CULTIVO_COLORES).filter(([k]) => k !== 'default').map(([k, v]) => (
                <div key={k} style={s.legItem}>
                  <div style={{ ...s.legDot, background: v }}></div>
                  {k}
                </div>
              ))}
              <div style={s.legItem}>
                <div style={{ ...s.legDot, background:'#f0ede8', border:'1px solid #d0cdc8' }}></div>
                Sin cultivo
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
