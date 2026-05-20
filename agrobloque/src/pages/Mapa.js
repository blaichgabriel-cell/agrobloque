import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CULTIVO_COLORES = {
  'Morrón': '#c8793a', 'Tomate': '#c0392b', 'Pepino': '#27ae60',
  'Berenjena': '#8e44ad', 'Zapalito': '#f39c12', 'Zucchini': '#16a085',
  'Repollo rojo': '#c0392b', 'Repollo verde': '#27ae60',
  'Lechuga': '#2ecc71', 'Lechuga repollo': '#1abc9c',
  'Tomate Cherry': '#e74c3c',
}

// Días estimados de ciclo por cultivo (aproximados)
const CICLO_DIAS = {
  'Morrón': 90, 'Tomate': 75, 'Pepino': 50, 'Berenjena': 80,
  'Zapalito': 55, 'Zucchini': 50, 'Lechuga': 45, 'Lechuga repollo': 50,
  'Tomate Cherry': 70,
}

const diasDesde = (fecha) => {
  if (!fecha) return null
  const diff = new Date() - new Date(fecha)
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// Retorna null | 'ok' | 'proximo' | 'listo' | 'atrasado'
const getSemaforo = (cultivo, fechaSiembra) => {
  const dias = diasDesde(fechaSiembra)
  if (dias === null) return null
  const ciclo = CICLO_DIAS[cultivo] || 75
  const pct = dias / ciclo
  if (pct < 0.7) return 'ok'
  if (pct < 0.9) return 'proximo'
  if (pct < 1.1) return 'listo'
  return 'atrasado'
}

const SEMAFORO = {
  ok:       { label:'En crecimiento', color:'#2d8a4e', bg:'rgba(0,0,0,0.15)' },
  proximo:  { label:'Próximo a cosechar', color:'#f0c060', bg:'rgba(0,0,0,0.15)' },
  listo:    { label:'Listo para cosechar', color:'#5abf7a', bg:'rgba(0,0,0,0.2)' },
  atrasado: { label:'Cosecha atrasada', color:'#f08080', bg:'rgba(0,0,0,0.2)' },
}

// Verificar si bloque está en carencia
const enCarencia = (fumigaciones) => {
  if (!fumigaciones || fumigaciones.length === 0) return null
  const hoy = new Date()
  let maxFecha = null
  fumigaciones.forEach(f => {
    if (f.carencia_dias && f.fecha) {
      const fechaHabil = new Date(f.fecha)
      fechaHabil.setDate(fechaHabil.getDate() + f.carencia_dias)
      if (!maxFecha || fechaHabil > maxFecha) maxFecha = fechaHabil
    }
  })
  if (!maxFecha || maxFecha <= hoy) return null
  const diasRestantes = Math.ceil((maxFecha - hoy) / (1000 * 60 * 60 * 24))
  return diasRestantes
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
        .select(`
          *,
          plantaciones(*, cultivos(nombre)),
          fumigacion_bloques(
            fumigaciones(fecha),
            productos:fumigacion_productos(productos(carencia_dias))
          )
        `)
        .eq('campo_id', campoActivo.id)
        .order('codigo')
      if (data) setBloques(data)
      setLoading(false)
    }
    fetchBloques()
  }, [campoActivo])

  const getPlantacion = (b) => b.plantaciones?.find(p => p.activa) || null
  const getCultivo = (b) => getPlantacion(b)?.cultivos?.nombre || null
  const getVariedad = (b) => {
    const p = getPlantacion(b)
    if (!p?.notas) return null
    return p.notas.startsWith('Variedad: ') ? p.notas.replace('Variedad: ', '') : null
  }
  const getColor = (b) => {
    const c = getCultivo(b)
    return c ? (CULTIVO_COLORES[c] || '#555') : null
  }
  const getSem = (b) => {
    const p = getPlantacion(b)
    if (!p) return null
    return getSemaforo(getCultivo(b), p.fecha_siembra)
  }
  const getDiasDesde = (b) => {
    const p = getPlantacion(b)
    return p ? diasDesde(p.fecha_siembra) : null
  }

  const cultivos = [...new Set(bloques.map(b => getCultivo(b)).filter(Boolean))]
  const bloquesFiltrados = filtro === 'todos' ? bloques
    : filtro === 'vacio' ? bloques.filter(b => !getCultivo(b))
    : filtro === 'carencia' ? bloques.filter(b => getDiasDesde(b) !== null)
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
        <div style={{ fontSize:22, fontWeight:700, color:'#1E5631', letterSpacing:-.5, marginBottom:16 }}>{campoActivo?.nombre}</div>

        {/* Leyenda semáforo */}
        <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          {Object.entries(SEMAFORO).map(([k, v]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:v.color }}></div>
              <span style={{ fontSize:10, color:'#9a9a9a' }}>{v.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:16 }}>
          {[['todos','Todos'], ...cultivos.map(c => [c,c]), ['vacio','Sin cultivo']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#1E5631' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'0 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Cargando bloques...</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {bloquesFiltrados.map(b => {
              const cultivo = getCultivo(b)
              const variedad = getVariedad(b)
              const color = getColor(b)
              const sem = getSem(b)
              const dias = getDiasDesde(b)
              const semInfo = sem ? SEMAFORO[sem] : null

              return (
                <div key={b.id} onClick={() => navigate(`/bloque/${b.id}`)}
                  style={{ background: cultivo ? color : '#fff', borderRadius:20, padding:'14px 12px', cursor:'pointer', minHeight:100, display:'flex', flexDirection:'column', justifyContent:'space-between', position:'relative', overflow:'hidden' }}>

                  {/* Indicador semáforo */}
                  {semInfo && (
                    <div style={{ position:'absolute', top:10, right:10, width:10, height:10, borderRadius:'50%', background:semInfo.color, boxShadow:`0 0 0 3px ${semInfo.color}44` }}></div>
                  )}

                  <div style={{ fontSize:10, fontWeight:600, color: cultivo ? 'rgba(255,255,255,0.55)' : '#c0c0c0', letterSpacing:.05, textTransform:'uppercase' }}>
                    {b.tipo === 'invernadero' ? 'Invernadero' : 'Campo'}
                  </div>

                  <div>
                    <div style={{ fontSize:22, fontWeight:800, color: cultivo ? '#fff' : '#0a0a0a', letterSpacing:-.5 }}>{b.codigo}</div>
                    <div style={{ fontSize:10, color: cultivo ? 'rgba(255,255,255,0.75)' : '#c0c0c0', marginTop:2 }}>
                      {cultivo ? `${cultivo}${variedad ? ' · ' + variedad : ''}` : 'Sin cultivo'}
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
