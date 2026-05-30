import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'

const CULTIVO_COLORES = {
  'Morrón':'#c8793a','Tomate':'#c0392b','Pepino':'#27ae60',
  'Berenjena':'#8e44ad','Zapalito':'#f39c12','Zucchini':'#16a085',
  'Lechuga':'#2ecc71','Lechuga repollo':'#1abc9c','Tomate Cherry':'#e74c3c',
}

export default function Mapa({ campoActivo }) {
  const [bloques, setBloques] = useState([])
  const [plantaciones, setPlantaciones] = useState({})
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const navigate = useNavigate()

  useEffect(() => {
    if (!campoActivo) return
    fetchData()
  }, [campoActivo])

  const fetchData = async () => {
    setLoading(true)
    const { data: bloquesData, error } = await supabase
      .from('bloques')
      .select('id, codigo, activo, tipo')
      .eq('campo_id', campoActivo.id)
      .order('codigo')

    if (error || !bloquesData) { setLoading(false); return }
    setBloques(bloquesData)

    const ids = bloquesData.map(b => b.id)
    if (ids.length === 0) { setLoading(false); return }

    const { data: plantData } = await supabase
      .from('plantaciones')
      .select('id, bloque_id, fecha_siembra, activa, cultivos(nombre)')
      .in('bloque_id', ids)
      .eq('activa', true)

    const mapa = {}
    ;(plantData || []).forEach(p => { mapa[p.bloque_id] = p })
    setPlantaciones(mapa)
    setLoading(false)
  }

  const getCultivo = (b) => plantaciones[b.id]?.cultivos?.nombre || null
  const getColor = (b) => {
    const c = getCultivo(b)
    return c ? (CULTIVO_COLORES[c] || '#555') : null
  }

  const cultivos = [...new Set(bloques.map(b => getCultivo(b)).filter(Boolean))]
  const bloquesFiltrados = filtro === 'todos' ? bloques
    : filtro === 'vacio' ? bloques.filter(b => !getCultivo(b))
    : bloques.filter(b => getCultivo(b) === filtro)

  if (!campoActivo) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:13, color:'#9a9a9a' }}>Seleccioná un campo desde el inicio</div>
    </div>
  )

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 0' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Campo activo</div>
        <div style={{ fontSize:22, fontWeight:700, color:'#212121', letterSpacing:-.5, marginBottom:14 }}>{campoActivo?.nombre}</div>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
          {[['todos','Todos'], ...cultivos.map(c => [c,c]), ['vacio','Sin cultivo']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#212121' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'8px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Cargando bloques...</div>
        ) : bloquesFiltrados.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin bloques para mostrar</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {bloquesFiltrados.map(b => {
              const cultivo = getCultivo(b)
              const color = getColor(b)
              return (
                <div key={b.id} onClick={() => navigate(`/bloque/${b.id}`)}
                  style={{ background: color || '#fff', borderRadius:20, padding:'14px 12px', cursor:'pointer', minHeight:90, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                  <div style={{ fontSize:10, fontWeight:600, color: cultivo ? 'rgba(255,255,255,0.55)' : '#c0c0c0', textTransform:'uppercase' }}>
                    {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}
                  </div>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, color: cultivo ? '#fff' : '#0a0a0a', letterSpacing:-.5 }}>{b.codigo}</div>
                    <div style={{ fontSize:10, color: cultivo ? 'rgba(255,255,255,0.75)' : '#c0c0c0', marginTop:2 }}>
                      {cultivo || 'Sin cultivo'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <NotasPanel modulo="mapa" titulo="Blog de notas de mapa" />
      </div>
    </div>
  )
}
