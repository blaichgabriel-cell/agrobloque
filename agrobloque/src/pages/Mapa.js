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
}

export default function Mapa({ campoActivo }) {
  const [bloques, setBloques] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const navigate = useNavigate()

  useEffect(() => {
    if (!campoActivo) return
    const fetchBloques = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('bloques')
        .select('*, plantaciones(*, cultivos(nombre))')
        .eq('campo_id', campoActivo.id)
        .order('codigo')
      if (data) setBloques(data)
      setLoading(false)
    }
    fetchBloques()
  }, [campoActivo])

  const getCultivo = (b) => b.plantaciones?.find(p => p.activa)?.cultivos?.nombre || null
  const getVariedad = (b) => {
    const p = b.plantaciones?.find(p => p.activa)
    if (!p || !p.notas) return null
    if (p.notas.startsWith('Variedad: ')) return p.notas.replace('Variedad: ', '')
    return null
  }
  const getColor = (b) => {
    const c = getCultivo(b)
    return c ? CULTIVO_COLORES[c] || '#888' : null
  }

  const cultivos = [...new Set(bloques.map(b => getCultivo(b)).filter(Boolean))]
  const bloquesFiltrados = filtro === 'todos' ? bloques : bloques.filter(b => getCultivo(b) === filtro)

  if (!campoActivo) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:13, color:'#9a9a9a' }}>Seleccioná un campo desde el inicio</div>
    </div>
  )

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 0' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Campo activo</div>
        <div style={{ fontSize:22, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:20 }}>{campoActivo?.nombre}</div>

        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:16 }}>
          <button onClick={() => setFiltro('todos')} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro==='todos' ? '#0a0a0a' : '#e8e6e2', color: filtro==='todos' ? '#fff' : '#9a9a9a' }}>
            Todos
          </button>
          {cultivos.map(c => (
            <button key={c} onClick={() => setFiltro(c)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===c ? '#0a0a0a' : '#e8e6e2', color: filtro===c ? '#fff' : '#9a9a9a' }}>
              {c}
            </button>
          ))}
          <button onClick={() => setFiltro('vacio')} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro==='vacio' ? '#0a0a0a' : '#e8e6e2', color: filtro==='vacio' ? '#fff' : '#9a9a9a' }}>
            Sin cultivo
          </button>
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Cargando bloques...</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {(filtro === 'vacio' ? bloques.filter(b => !getCultivo(b)) : bloquesFiltrados).map(b => {
              const cultivo = getCultivo(b)
              const variedad = getVariedad(b)
              const color = getColor(b)
              return (
                <div key={b.id}
                  onClick={() => navigate(`/bloque/${b.id}`)}
                  style={{ background: cultivo ? color : '#fff', borderRadius:20, padding:'16px 14px', cursor:'pointer', minHeight:100, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                  <div style={{ fontSize:10, fontWeight:600, color: cultivo ? 'rgba(255,255,255,0.6)' : '#c0c0c0', letterSpacing:.05, textTransform:'uppercase' }}>
                    {b.tipo === 'invernadero' ? 'Invernadero' : 'Campo abierto'}
                  </div>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, color: cultivo ? '#fff' : '#0a0a0a', letterSpacing:-.5 }}>{b.codigo}</div>
                    <div style={{ fontSize:10, color: cultivo ? 'rgba(255,255,255,0.75)' : '#c0c0c0', marginTop:3 }}>
                      {cultivo ? `${cultivo}${variedad ? ' · ' + variedad : ''}` : 'Sin cultivo'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
