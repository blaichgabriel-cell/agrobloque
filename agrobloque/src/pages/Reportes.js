import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmtGs = (n) => n > 0 ? `Gs. ${Math.round(n).toLocaleString('es-PY')}` : '—'
const fmtKg = (n) => { const num = Number(n)||0; return num % 1 === 0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY', {minimumFractionDigits:1, maximumFractionDigits:2}) }

export default function Reportes({ campoActivo }) {
  const [campos, setCampos] = useState([])
  const [campoSel, setCampoSel] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [datos, setDatos] = useState({ ingresos:0, costos:0, ganancia:0, kg:0, registros:0 })
  const [porCultivo, setPorCultivo] = useState([])
  const [porBloque, setPorBloque] = useState([])
  const [precioHistorial, setPrecioHistorial] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo && !campoSel) setCampoSel(campoActivo) }, [campoActivo])
  useEffect(() => { if (campoSel) fetchDatos() }, [campoSel, periodo])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    setCampos(data || [])
  }

  const getFechaDesde = () => {
    if (periodo === 'total') return '2020-01-01'
    const d = new Date()
    if (periodo === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
    if (periodo === 'trimestre') return new Date(d.getFullYear(), d.getMonth() - 3, 1).toISOString().split('T')[0]
    return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0]
  }

  const fetchDatos = async () => {
    setLoading(true); setError('')
    try {
      const desde = getFechaDesde()

      // Cosechas — query simple sin joins anidados
      const { data: cosechas, error: e1 } = await supabase
        .from('cosechas')
        .select('id, kg_total, precio_kg, bloque_id, fecha, bloques(codigo, campo_id)')
        .gte('fecha', desde)
      if (e1) throw e1

      const cosechasCampo = (cosechas || []).filter(c => c.bloques?.campo_id === campoSel.id)
      const ingresos = cosechasCampo.reduce((s, c) => s + (Number(c.kg_total) * Number(c.precio_kg||0)), 0)
      const kg = cosechasCampo.reduce((s, c) => s + Number(c.kg_total), 0)

      // Obtener plantaciones activas de los bloques para saber el cultivo
      const bloqueIds = [...new Set(cosechasCampo.map(c => c.bloque_id))]
      let cultivoPorBloque = {}
      if (bloqueIds.length > 0) {
        const { data: plantas } = await supabase
          .from('plantaciones')
          .select('bloque_id, cultivos(nombre)')
          .in('bloque_id', bloqueIds)
          .eq('activa', true)
        ;(plantas || []).forEach(p => { cultivoPorBloque[p.bloque_id] = p.cultivos?.nombre || 'Sin cultivo' })
      }

      // Costos jornales
      const { data: asist } = await supabase.from('asistencia').select('monto, operarios(campo_id)').gte('fecha', desde)
      const jornales = (asist || []).filter(a => a.operarios?.campo_id === campoSel.id).reduce((s, a) => s + Number(a.monto), 0)

      // Costos manuales
      const { data: manuales } = await supabase.from('costos').select('monto').eq('campo_id', campoSel.id).gte('fecha', desde)
      const costosManuales = (manuales || []).reduce((s, c) => s + Number(c.monto), 0)

      const costos = jornales + costosManuales
      setDatos({ ingresos, costos, ganancia: ingresos - costos, kg, registros: cosechasCampo.length })

      // Por cultivo
      const cultivoMap = {}
      cosechasCampo.forEach(c => {
        const cultivo = cultivoPorBloque[c.bloque_id] || 'Sin cultivo'
        if (!cultivoMap[cultivo]) cultivoMap[cultivo] = { kg:0, ingresos:0, registros:0 }
        cultivoMap[cultivo].kg += Number(c.kg_total)
        cultivoMap[cultivo].ingresos += Number(c.kg_total) * Number(c.precio_kg||0)
        cultivoMap[cultivo].registros++
      })
      const cultivoArr = Object.entries(cultivoMap).map(([nombre, d]) => ({
        nombre, ...d, precioProm: d.kg > 0 ? Math.round(d.ingresos / d.kg) : 0
      }))
      cultivoArr.sort((a, b) => b.ingresos - a.ingresos)
      setPorCultivo(cultivoArr)

      // Por bloque — top 5
      const bloqueMap = {}
      cosechasCampo.forEach(c => {
        const cod = c.bloques?.codigo || '?'
        if (!bloqueMap[cod]) bloqueMap[cod] = { kg:0, ingresos:0 }
        bloqueMap[cod].kg += Number(c.kg_total)
        bloqueMap[cod].ingresos += Number(c.kg_total) * Number(c.precio_kg||0)
      })
      const bloqueArr = Object.entries(bloqueMap).map(([codigo, d]) => ({ codigo, ...d }))
      bloqueArr.sort((a, b) => b.kg - a.kg)
      setPorBloque(bloqueArr.slice(0, 5))

      // Historial precios
      const histMap = {}
      cosechasCampo.filter(c => c.precio_kg > 0).forEach(c => {
        const cultivo = cultivoPorBloque[c.bloque_id] || 'Sin cultivo'
        if (!histMap[cultivo]) histMap[cultivo] = []
        histMap[cultivo].push(Number(c.precio_kg))
      })
      setPrecioHistorial(histMap)

    } catch (e) {
      setError('Error al cargar reportes: ' + e.message)
    }
    setLoading(false)
  }

  const maxKg = Math.max(...porBloque.map(b => b.kg), 1)

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding:'24px 20px 16px' }}>
        <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Análisis</div>
        <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5, marginBottom:16 }}>Reportes</div>
        {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:10 }}>{error}</div>}

        {campos.length > 1 && (
          <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4, marginBottom:10 }}>
            {campos.map(c => (
              <button key={c.id} onClick={() => setCampoSel(c)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: campoSel?.id===c.id ? '#212121' : 'transparent', color: campoSel?.id===c.id ? '#fff' : '#9a9a9a' }}>{c.nombre}</button>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:5, background:'#e8e6e2', borderRadius:14, padding:4 }}>
          {[['mes','Mes'],['trimestre','Trimestre'],['año','Año'],['total','Total']].map(([k,v]) => (
            <button key={k} onClick={() => setPeriodo(k)} style={{ flex:1, padding:8, borderRadius:10, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: periodo===k ? '#fff' : 'transparent', color: periodo===k ? '#0a0a0a' : '#9a9a9a' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'8px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Calculando...</div>
        ) : <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            <div style={{ background:'#212121', borderRadius:20, padding:'16px 14px', gridColumn:'1 / -1' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:.05, marginBottom:4 }}>Ganancia neta</div>
              <div style={{ fontSize:34, fontWeight:800, color: datos.ganancia >= 0 ? '#fff' : '#f08080', letterSpacing:-1, lineHeight:1 }}>
                {datos.ganancia !== 0 ? fmtGs(datos.ganancia) : '—'}
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:4 }}>
                {datos.ingresos > 0 && datos.costos > 0 ? `Margen: ${Math.round((datos.ganancia / datos.ingresos) * 100)}%` : 'Sin datos suficientes'}
              </div>
            </div>
            <div style={{ background:'#fff', borderRadius:20, padding:'14px' }}>
              <div style={{ fontSize:9, color:'#9a9a9a', textTransform:'uppercase', marginBottom:4 }}>Ingresos</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#212121', letterSpacing:-.5 }}>{fmtGs(datos.ingresos)}</div>
              <div style={{ fontSize:10, color:'#b0b0b0', marginTop:2 }}>{fmtKg(datos.kg)} kg</div>
            </div>
            <div style={{ background:'#fff', borderRadius:20, padding:'14px' }}>
              <div style={{ fontSize:9, color:'#9a9a9a', textTransform:'uppercase', marginBottom:4 }}>Costos</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#e07b00', letterSpacing:-.5 }}>{fmtGs(datos.costos)}</div>
              <div style={{ fontSize:10, color:'#b0b0b0', marginTop:2 }}>jornales + gastos</div>
            </div>
          </div>

          {porCultivo.length > 0 && (
            <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a', marginBottom:14 }}>Ingresos por cultivo</div>
              {porCultivo.map((c, i) => (
                <div key={c.nombre} style={{ padding:'10px 0', borderBottom: i < porCultivo.length-1 ? '1px solid #f2f1ef' : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>{c.nombre}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#212121' }}>{fmtGs(c.ingresos)}</div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <div style={{ fontSize:10, color:'#9a9a9a' }}>{fmtKg(c.kg)} kg · {c.registros} cosechas</div>
                    <div style={{ fontSize:10, color:'#9a9a9a' }}>Prom: Gs. {c.precioProm.toLocaleString('es-PY')}/kg</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {porBloque.length > 0 && (
            <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a', marginBottom:14 }}>Bloques más productivos</div>
              {porBloque.map((b, i) => (
                <div key={b.codigo} style={{ padding:'8px 0', borderBottom: i < porBloque.length-1 ? '1px solid #f2f1ef' : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a' }}>Bloque {b.codigo}</div>
                    <div style={{ fontSize:12, color:'#9a9a9a' }}>{fmtKg(b.kg)} kg</div>
                  </div>
                  <div style={{ background:'#f2f1ef', borderRadius:20, height:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', background:'#212121', borderRadius:20, width:`${(b.kg / maxKg) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {Object.keys(precioHistorial).length > 0 && (
            <div style={{ background:'#fff', borderRadius:20, padding:'16px', marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0a0a0a', marginBottom:14 }}>Evolución de precios</div>
              {Object.entries(precioHistorial).map(([cultivo, precios]) => {
                const min = Math.min(...precios)
                const max = Math.max(...precios)
                const prom = Math.round(precios.reduce((s, p) => s + p, 0) / precios.length)
                return (
                  <div key={cultivo} style={{ padding:'10px 0', borderBottom:'1px solid #f2f1ef' }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#0a0a0a', marginBottom:6 }}>{cultivo}</div>
                    <div style={{ display:'flex', gap:16 }}>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:2 }}>Mínimo</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'#c84040' }}>Gs. {min.toLocaleString('es-PY')}</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:2 }}>Promedio</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'#0a0a0a' }}>Gs. {prom.toLocaleString('es-PY')}</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:9, color:'#9a9a9a', marginBottom:2 }}>Máximo</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'#212121' }}>Gs. {max.toLocaleString('es-PY')}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {datos.registros === 0 && (
            <div style={{ textAlign:'center', padding:'30px 20px', color:'#9a9a9a', fontSize:13, background:'#fff', borderRadius:20 }}>
              Sin cosechas registradas en este período.
            </div>
          )}
        </>}
      </div>
    </div>
  )
}
