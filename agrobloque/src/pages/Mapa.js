import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CULTIVO_COLORES = {
  'Morrón':'#c8793a','Tomate':'#c0392b','Pepino':'#27ae60',
  'Berenjena':'#8e44ad','Zapalito':'#f39c12','Zucchini':'#16a085',
  'Lechuga':'#2ecc71','Lechuga repollo':'#1abc9c','Tomate Cherry':'#e74c3c',
}

const CICLO_DIAS = {
  'Morrón':90,'Tomate':75,'Pepino':50,'Berenjena':80,
  'Zapalito':55,'Zucchini':50,'Lechuga':45,'Lechuga repollo':50,'Tomate Cherry':70,
}

const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / 86400000)
}

const getSemaforo = (cultivo, fechaSiembra) => {
  const dias = diasDesde(fechaSiembra)
  if (dias === null) return null
  const ciclo = CICLO_DIAS[cultivo] || 75
  const pct = dias / ciclo
  if (pct < 0.7) return { color:'#2d8a4e', label:'En crecimiento' }
  if (pct < 0.9) return { color:'#f0c060', label:'Próximo a cosechar' }
  if (pct < 1.1) return { color:'#5abf7a', label:'Listo para cosechar' }
  return { color:'#f08080', label:'Cosecha atrasada' }
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

    // Query simple — solo bloques del campo
    const { data: bloquesData, error: err1 } = await supabase
      .from('bloques')
      .select('id, codigo, activo, tipo')
      .eq('campo_id', campoActivo.id)
      .order('codigo')

    if (err1 || !bloquesData) { setLoading(false); return }
    setBloques(bloquesData)

    // Query separada — plantaciones activas de esos bloques
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
  const getSem = (b) => {
    const p = plantaciones[b.id]
    if (!p) return null
    return getSemaforo(getCultivo(b), p.fecha_siembra)
  }
  const getDias = (b) => {
    const p = plantaciones[b.id]
    return p ? diasDesde(p.fecha_siembra) : null
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
        <div style={{ fontSize:22, fontWeight:700, color:'#1E5631', letterSpacing:-.5, marginBottom:14 }}>{campoActivo?.nombre}</div>

        <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          {[
            { color:'#2d8a4e', label:'Creciendo' },
            { color:'#f0c060', label:'Próximo' },
            { color:'#5abf7a', label:'Listo' },
            { color:'#f08080', label:'Atrasado' },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }}></div>
              <span style={{ fontSize:10, color:'#9a9a9a' }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
          {[['todos','Todos'], ...cultivos.map(c => [c,c]), ['vacio','Sin cultivo']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#1E5631' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>
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
              const sem = getSem(b)
              const dias = getDias(b)
              return (
                <div key={b.id} onClick={() => navigate(`/bloque/${b.id}`)}
                  style={{ background: color || '#fff', borderRadius:20, padding:'14px 12px', cursor:'pointer', minHeight:100, display:'flex', flexDirection:'column', justifyContent:'space-between', position:'relative' }}>
                  {sem && (
                    <div style={{ position:'absolute', top:10, right:10, width:10, height:10, borderRadius:'50%', background:sem.color, boxShadow:`0 0 0 3px ${sem.color}44` }}></div>
                  )}
                  <div style={{ fontSize:10, fontWeight:600, color: cultivo ? 'rgba(255,255,255,0.55)' : '#c0c0c0', textTransform:'uppercase' }}>
                    {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}
                  </div>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, color: cultivo ? '#fff' : '#0a0a0a', letterSpacing:-.5 }}>{b.codigo}</div>
                    <div style={{ fontSize:10, color: cultivo ? 'rgba(255,255,255,0.75)' : '#c0c0c0', marginTop:2 }}>
                      {cultivo || 'Sin cultivo'}
                    </div>
                    {dias !== null && (
                      <div style={{ fontSize:9, color: cultivo ? 'rgba(255,255,255,0.6)' : '#aaa', marginTop:2 }}>
                        {dias}d desde siembra
                      </div>
                    )}
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
