import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { descargarCsv, imprimirHtml } from '../lib/exporters'

const fmtGs = (n) => n > 0 ? `Gs. ${Math.round(n).toLocaleString('es-PY')}` : '—'
const fmtKg = (n) => { const num = Number(n)||0; return num % 1 === 0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY', {minimumFractionDigits:1, maximumFractionDigits:2}) }

export default function Reportes({ campoActivo, isGuest = false }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [campos, setCampos] = useState([])
  const [campoSel, setCampoSel] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [datos, setDatos] = useState({ ingresos:0, costos:0, ganancia:0, kg:0, registros:0 })
  const [porCultivo, setPorCultivo] = useState([])
  const [porBloque, setPorBloque] = useState([])
  const [precioHistorial, setPrecioHistorial] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo) setCampoSel(campoActivo) }, [campoActivo])
  useEffect(() => { if (campoSel) fetchDatos() }, [campoSel, periodo, fechaDesde, fechaHasta])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    const lista = data || []
    setCampos(lista)
    if (!campoSel && lista.length > 0) {
      const campoGuardado = typeof window !== 'undefined' ? window.localStorage.getItem('agrobloque-campo-activo') : null
      setCampoSel(campoActivo || lista.find(c => c.id === campoGuardado) || lista[0])
    }
  }

  const getFechaDesde = () => {
    if (periodo === 'custom') return fechaDesde || '2020-01-01'
    if (periodo === 'total') return '2020-01-01'
    const d = new Date()
    if (periodo === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
    if (periodo === 'trimestre') return new Date(d.getFullYear(), d.getMonth() - 3, 1).toISOString().split('T')[0]
    return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0]
  }

  const getFechaHasta = () => {
    if (periodo === 'custom') return fechaHasta || new Date().toISOString().split('T')[0]
    return new Date().toISOString().split('T')[0]
  }

  const fetchDatos = async () => {
    setLoading(true); setError('')
    try {
      const desde = getFechaDesde()
      const hasta = getFechaHasta()

      // Cosechas — query simple sin joins anidados
      const { data: cosechas, error: e1 } = await supabase
        .from('cosechas')
        .select('id, kg_total, precio_kg, bloque_id, fecha, bloques(codigo, campo_id)')
        .gte('fecha', desde)
        .lte('fecha', hasta)
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
      const { data: asist } = isGuest
        ? { data: [] }
        : await supabase.from('asistencia').select('monto, operarios(campo_id)').gte('fecha', desde).lte('fecha', hasta)
      const jornales = (asist || []).filter(a => a.operarios?.campo_id === campoSel.id).reduce((s, a) => s + Number(a.monto), 0)

      // Costos manuales
      const { data: manuales } = await supabase.from('costos').select('monto').eq('campo_id', campoSel.id).gte('fecha', desde).lte('fecha', hasta)
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

  const exportarCsv = () => {
    const rows = [
      { Seccion:'Resumen', Nombre:'Ingresos', Kg:'', Ingresos:datos.ingresos, PrecioProm:'', Registros:datos.registros },
      { Seccion:'Resumen', Nombre:'Costos', Kg:'', Ingresos:datos.costos, PrecioProm:'', Registros:'' },
      { Seccion:'Resumen', Nombre:'Ganancia neta', Kg:datos.kg, Ingresos:datos.ganancia, PrecioProm:'', Registros:datos.registros },
      ...porCultivo.map(c => ({ Seccion:'Cultivo', Nombre:c.nombre, Kg:c.kg, Ingresos:c.ingresos, PrecioProm:c.precioProm, Registros:c.registros })),
      ...porBloque.map(b => ({ Seccion:'Bloque', Nombre:b.codigo, Kg:b.kg, Ingresos:b.ingresos, PrecioProm:'', Registros:'' })),
    ]
    descargarCsv('reporte-produccion', ['Seccion', 'Nombre', 'Kg', 'Ingresos', 'PrecioProm', 'Registros'], rows)
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

  const imprimirReporte = () => {
    imprimirHtml('Reporte AgroBloque', `
      <h1>Reporte AgroBloque</h1>
      <div class="muted">${esc(campoSel?.nombre || '')} - Periodo: ${esc(periodo === 'custom' ? `${getFechaDesde()} a ${getFechaHasta()}` : periodo)}</div>
      <h2>Resumen</h2>
      <table>
        <tr><th>Ingresos</th><th>Costos</th><th>Ganancia neta</th><th>Kg</th><th>Registros</th></tr>
        <tr>
          <td class="right">${fmtGs(datos.ingresos)}</td>
          <td class="right">${fmtGs(datos.costos)}</td>
          <td class="right total">${fmtGs(datos.ganancia)}</td>
          <td class="right">${fmtKg(datos.kg)}</td>
          <td class="right">${datos.registros}</td>
        </tr>
      </table>
      <h2>Ingresos por cultivo</h2>
      <table>
        <tr><th>Cultivo</th><th class="right">Kg</th><th class="right">Ingresos</th><th class="right">Precio prom.</th><th class="right">Registros</th></tr>
        ${porCultivo.map(c => `<tr><td>${esc(c.nombre)}</td><td class="right">${fmtKg(c.kg)}</td><td class="right">${fmtGs(c.ingresos)}</td><td class="right">${fmtGs(c.precioProm)}</td><td class="right">${c.registros}</td></tr>`).join('')}
      </table>
      <h2>Bloques mas productivos</h2>
      <table>
        <tr><th>Bloque</th><th class="right">Kg</th><th class="right">Ingresos</th></tr>
        ${porBloque.map(b => `<tr><td>${esc(b.codigo)}</td><td class="right">${fmtKg(b.kg)}</td><td class="right">${fmtGs(b.ingresos)}</td></tr>`).join('')}
      </table>
    `)
  }

  const imprimirTabla = (titulo, headers, rows) => {
    imprimirHtml(titulo, `
      <h1>${esc(titulo)}</h1>
      <div class="muted">${esc(campoSel?.nombre || 'AgroBloque')} - ${new Date().toLocaleDateString('es-PY')}</div>
      <table>
        <tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
        ${rows.map(row => `<tr>${headers.map(h => `<td>${esc(row[h] ?? '')}</td>`).join('')}</tr>`).join('')}
      </table>
    `)
  }

  const tablaHtml = (titulo, headers, rows) => `
    <h2>${esc(titulo)}</h2>
    <table>
      <tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
      ${rows.length === 0
        ? `<tr><td colspan="${headers.length}">Sin datos</td></tr>`
        : rows.map(row => `<tr>${headers.map(h => `<td>${esc(row[h] ?? '')}</td>`).join('')}</tr>`).join('')}
    </table>
  `

  const imprimirCompleto = async () => {
    const [
      { data: cosechas },
      { data: costos },
      { data: inventario },
      { data: vivero },
      { data: fumigaciones },
      { data: contabilidad },
    ] = await Promise.all([
      supabase.from('cosechas').select('fecha, kg_total, precio_kg, calidad, notas, bloques(codigo), compradores(nombre)').order('fecha', { ascending:false }).limit(150),
      supabase.from('costos').select('fecha, tipo, descripcion, monto, bloques(codigo)').order('fecha', { ascending:false }).limit(150),
      supabase.from('productos').select('nombre, unidad, stock_actual, stock_minimo, carencia_dias, categorias_producto(nombre)').eq('activo', true).order('nombre'),
      supabase.from('vivero_lotes').select('fecha_siembra, cultivo, variedad, cantidad_semillas, germinadas, perdidas, estado').order('fecha_siembra', { ascending:false }).limit(150),
      supabase.from('fumigaciones').select('fecha, tipo, operario, notas, tanques_cantidad, tanque_litros, campos(nombre), fumigacion_bloques(bloques(codigo))').order('fecha', { ascending:false }).limit(150),
      supabase.from('contabilidad_movimientos').select('fecha, tipo, descripcion, categoria, contraparte, monto').order('fecha', { ascending:false }).limit(200),
    ])

    imprimirHtml('Reporte completo AgroBloque', `
      <h1>Reporte completo AgroBloque</h1>
      <div class="muted">${esc(campoSel?.nombre || 'AgroBloque')} - ${new Date().toLocaleDateString('es-PY')}</div>
      <h2>Resumen</h2>
      <table>
        <tr><th>Ingresos</th><th>Costos</th><th>Ganancia neta</th><th>Kg cosechados</th><th>Registros</th></tr>
        <tr><td>${fmtGs(datos.ingresos)}</td><td>${fmtGs(datos.costos)}</td><td>${fmtGs(datos.ganancia)}</td><td>${fmtKg(datos.kg)}</td><td>${datos.registros}</td></tr>
      </table>
      ${tablaHtml('Cosechas', ['Fecha', 'Bloque', 'Kg', 'Precio', 'Comprador', 'Calidad'], (cosechas || []).map(c => ({
        Fecha:c.fecha, Bloque:c.bloques?.codigo || '', Kg:c.kg_total || '', Precio:c.precio_kg || '', Comprador:c.compradores?.nombre || '', Calidad:c.calidad || '',
      })))}
      ${tablaHtml('Costos manuales', ['Fecha', 'Tipo', 'Descripcion', 'Bloque', 'Monto'], (costos || []).map(c => ({
        Fecha:c.fecha, Tipo:c.tipo || '', Descripcion:c.descripcion || '', Bloque:c.bloques?.codigo || '', Monto:c.monto || '',
      })))}
      ${tablaHtml('Inventario', ['Categoria', 'Producto', 'Stock', 'Unidad', 'Minimo', 'Carencia'], (inventario || []).map(p => ({
        Categoria:p.categorias_producto?.nombre || '', Producto:p.nombre || '', Stock:p.stock_actual || 0, Unidad:p.unidad || '', Minimo:p.stock_minimo || 0, Carencia:p.carencia_dias || 0,
      })))}
      ${tablaHtml('Vivero', ['Fecha', 'Cultivo', 'Variedad', 'Semillas', 'Germinadas', 'Perdidas', 'Estado'], (vivero || []).map(v => ({
        Fecha:v.fecha_siembra || '', Cultivo:v.cultivo || '', Variedad:v.variedad || '', Semillas:v.cantidad_semillas || 0, Germinadas:v.germinadas || 0, Perdidas:v.perdidas || 0, Estado:v.estado || '',
      })))}
      ${tablaHtml('Fumigaciones', ['Fecha', 'Tipo', 'Campo', 'Bloques', 'Tanques', 'Operario'], (fumigaciones || []).map(f => ({
        Fecha:f.fecha || '', Tipo:f.tipo || '', Campo:f.campos?.nombre || '', Bloques:(f.fumigacion_bloques || []).map(b => b.bloques?.codigo).filter(Boolean).join(', '), Tanques:f.tanques_cantidad && f.tanque_litros ? `${f.tanques_cantidad} x ${f.tanque_litros} L` : '', Operario:f.operario || '',
      })))}
      ${tablaHtml('Contabilidad', ['Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Contraparte', 'Monto'], (contabilidad || []).map(m => ({
        Fecha:m.fecha || '', Tipo:m.tipo || '', Descripcion:m.descripcion || '', Categoria:m.categoria || '', Contraparte:m.contraparte || '', Monto:m.monto || '',
      })))}
    `)
  }

  const imprimirModulo = async (modulo) => {
    if (modulo === 'cosechas') {
      const { data } = await supabase.from('cosechas').select('fecha, kg_total, precio_kg, calidad, notas, bloques(codigo), compradores(nombre)').order('fecha', { ascending:false }).limit(200)
      imprimirTabla('Reporte de cosechas', ['Fecha', 'Bloque', 'Kg', 'Precio', 'Comprador', 'Calidad', 'Notas'], (data || []).map(c => ({
        Fecha:c.fecha, Bloque:c.bloques?.codigo || '', Kg:c.kg_total || '', Precio:c.precio_kg || '', Comprador:c.compradores?.nombre || '', Calidad:c.calidad || '', Notas:c.notas || '',
      })))
    }
    if (modulo === 'costos') {
      const { data } = await supabase.from('costos').select('fecha, tipo, descripcion, monto, bloques(codigo)').order('fecha', { ascending:false }).limit(200)
      imprimirTabla('Reporte de costos manuales', ['Fecha', 'Tipo', 'Descripcion', 'Bloque', 'Monto'], (data || []).map(c => ({
        Fecha:c.fecha, Tipo:c.tipo || '', Descripcion:c.descripcion || '', Bloque:c.bloques?.codigo || '', Monto:c.monto || '',
      })))
    }
    if (modulo === 'inventario') {
      const { data } = await supabase.from('productos').select('nombre, unidad, stock_actual, stock_minimo, carencia_dias, categorias_producto(nombre)').eq('activo', true).order('nombre')
      imprimirTabla('Reporte de inventario', ['Categoria', 'Producto', 'Unidad', 'Stock', 'Minimo', 'Carencia'], (data || []).map(p => ({
        Categoria:p.categorias_producto?.nombre || '', Producto:p.nombre || '', Unidad:p.unidad || '', Stock:p.stock_actual || 0, Minimo:p.stock_minimo || 0, Carencia:p.carencia_dias || 0,
      })))
    }
    if (modulo === 'vivero') {
      const { data } = await supabase.from('vivero_lotes').select('fecha_siembra, cultivo, variedad, cantidad_semillas, germinadas, perdidas, estado').order('fecha_siembra', { ascending:false }).limit(200)
      imprimirTabla('Reporte de vivero', ['Fecha', 'Cultivo', 'Variedad', 'Semillas', 'Germinadas', 'Perdidas', 'Estado'], (data || []).map(v => ({
        Fecha:v.fecha_siembra || '', Cultivo:v.cultivo || '', Variedad:v.variedad || '', Semillas:v.cantidad_semillas || 0, Germinadas:v.germinadas || 0, Perdidas:v.perdidas || 0, Estado:v.estado || '',
      })))
    }
    if (modulo === 'fumigaciones') {
      const { data } = await supabase.from('fumigaciones').select('fecha, tipo, operario, notas, campos(nombre), fumigacion_bloques(bloques(codigo))').order('fecha', { ascending:false }).limit(200)
      imprimirTabla('Reporte de fumigaciones', ['Fecha', 'Tipo', 'Campo', 'Bloques', 'Operario', 'Notas'], (data || []).map(f => ({
        Fecha:f.fecha || '', Tipo:f.tipo || '', Campo:f.campos?.nombre || '', Bloques:(f.fumigacion_bloques || []).map(b => b.bloques?.codigo).filter(Boolean).join(', '), Operario:f.operario || '', Notas:f.notas || '',
      })))
    }
    if (modulo === 'contabilidad') {
      const { data } = await supabase.from('contabilidad_movimientos').select('fecha, tipo, descripcion, categoria, contraparte, monto').order('fecha', { ascending:false }).limit(300)
      imprimirTabla('Reporte de contabilidad', ['Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Contraparte', 'Monto'], (data || []).map(m => ({
        Fecha:m.fecha || '', Tipo:m.tipo || '', Descripcion:m.descripcion || '', Categoria:m.categoria || '', Contraparte:m.contraparte || '', Monto:m.monto || '',
      })))
    }
  }

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Análisis</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#0a0a0a', letterSpacing:-.5 }}>Reportes</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportarCsv} style={{ height:40, borderRadius:14, background:'#fff', border:'1px solid #e8e6e2', display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer', padding:'0 12px', fontSize:12, fontWeight:800 }}>
              <i className="ti ti-download" style={{ fontSize:19, color:'#212121' }} aria-hidden="true"></i>
              CSV
            </button>
            <button onClick={imprimirReporte} style={{ height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer', color:'#fff', padding:'0 12px', fontSize:12, fontWeight:800 }}>
              <i className="ti ti-printer" style={{ fontSize:19, color:'#fff' }} aria-hidden="true"></i>
              PDF resumen
            </button>
            <button onClick={imprimirCompleto} style={{ height:40, borderRadius:14, background:'#176a25', border:'none', padding:'0 12px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff', fontSize:12, fontWeight:800 }}>
              PDF completo
            </button>
          </div>
        </div>
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
          <label style={{ display:'grid', gap:5, fontSize:11, color:'#8b928b', fontWeight:800 }}>
            Desde
            <input type="date" value={fechaDesde} onChange={e => { setPeriodo('custom'); setFechaDesde(e.target.value) }}
              style={{ border:'1px solid #e8e6e2', borderRadius:12, padding:'10px 12px', fontSize:13, background:'#fff' }} />
          </label>
          <label style={{ display:'grid', gap:5, fontSize:11, color:'#8b928b', fontWeight:800 }}>
            Hasta
            <input type="date" value={fechaHasta} onChange={e => { setPeriodo('custom'); setFechaHasta(e.target.value) }}
              style={{ border:'1px solid #e8e6e2', borderRadius:12, padding:'10px 12px', fontSize:13, background:'#fff' }} />
          </label>
        </div>
        <div style={{ background:'#fff', borderRadius:18, padding:'12px', marginTop:10, border:'1px solid #e8ece8' }}>
          <div style={{ fontSize:12, color:'#8b928b', fontWeight:800, marginBottom:8 }}>Reportes por modulo</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
            {[
              ['cosechas', 'Cosechas'],
              ['costos', 'Costos'],
              ['inventario', 'Inventario'],
              ['vivero', 'Vivero'],
              ['fumigaciones', 'Fumigaciones'],
              ['contabilidad', 'Contabilidad'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => imprimirModulo(key)}
                style={{ border:'1px solid #e8ece8', background:'#fff', borderRadius:12, padding:'9px 7px', fontSize:11, fontWeight:750, cursor:'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
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
              <div style={{ fontSize:10, color:'#b0b0b0', marginTop:2 }}>{isGuest ? 'gastos registrados' : 'jornales + gastos'}</div>
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
        <NotasPanel modulo="reportes" titulo="Blog de notas de reportes" />
      </div>
    </div>
  )
}
