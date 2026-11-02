import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { descargarCsv, imprimirHtml } from '../lib/exporters'

const fmtGs = (n) => `Gs. ${Math.round(Number(n) || 0).toLocaleString('es-PY')}`
const hoy = () => new Date().toISOString().slice(0, 10)

const tipos = {
  plantacion: { label:'Plantacion', icon:'ti-plant', color:"#08603f", bg:'#edf6ec' },
  cosecha: { label:'Cosecha', icon:'ti-cut', color:"#124e38", bg:'#eeeeee' },
  fumigacion: { label:'Fumigacion', icon:'ti-spray', color:'#e07b00', bg:'#fff3e8' },
  fertilizacion: { label:'Fertilizacion', icon:'ti-droplet', color:'#2980b9', bg:'#eaf4fb' },
  vivero: { label:'Vivero', icon:'ti-seeding', color:"#08603f", bg:'#edf6ec' },
  costo: { label:'Costo', icon:'ti-coin', color:'#c84040', bg:'#fff0f0' },
  tarea: { label:'Tarea', icon:'ti-calendar', color:'#8a6d10', bg:'#fff7dc' },
  contabilidad: { label:'Contabilidad', icon:'ti-calculator', color:'#185fa5', bg:'#e6f1fb' },
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

export default function Historial({ campoActivo }) {
  const navigate = useNavigate()
  const [campos, setCampos] = useState([])
  const [campoSel, setCampoSel] = useState(null)
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState(hoy())

  useEffect(() => { cargarCampos() }, [])
  useEffect(() => { if (campoActivo) setCampoSel(campoActivo) }, [campoActivo])
  useEffect(() => { if (campoSel) cargarHistorial() }, [campoSel, desde, hasta])

  const cargarCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    const lista = data || []
    setCampos(lista)
    if (!campoSel && lista.length > 0) {
      const guardado = typeof window !== 'undefined' ? window.localStorage.getItem('agrobloque-campo-activo') : null
      setCampoSel(campoActivo || lista.find(c => c.id === guardado) || lista[0])
    }
  }

  const filtrarFecha = (query, campo = 'fecha') => {
    let q = query
    if (desde) q = q.gte(campo, desde)
    if (hasta) q = q.lte(campo, hasta)
    return q
  }

  const cargarHistorial = async () => {
    setLoading(true)
    const campoId = campoSel?.id
    const { data: bloques } = await supabase.from('bloques').select('id, codigo').eq('campo_id', campoId)
    const bloqueIds = (bloques || []).map(b => b.id)
    const codigoBloque = Object.fromEntries((bloques || []).map(b => [b.id, b.codigo]))

    const [
      { data: plantaciones },
      { data: cosechas },
      { data: fumigaciones },
      { data: fertilizaciones },
      { data: vivero },
      { data: costos },
      { data: tareas },
      { data: contabilidad },
    ] = await Promise.all([
      bloqueIds.length ? filtrarFecha(supabase.from('plantaciones').select('id, bloque_id, fecha_siembra, activa, cultivos(nombre)'), 'fecha_siembra').in('bloque_id', bloqueIds) : Promise.resolve({ data: [] }),
      bloqueIds.length ? filtrarFecha(supabase.from('cosechas').select('id, fecha, bloque_id, kg_total, precio_kg, compradores(nombre)')).in('bloque_id', bloqueIds) : Promise.resolve({ data: [] }),
      filtrarFecha(supabase.from('fumigaciones').select('id, fecha, tipo, operario, notas, tanques_cantidad, tanque_litros, fumigacion_bloques(bloque_id, bloques(codigo)), fumigacion_productos(*, productos(nombre))').eq('campo_id', campoId)),
      bloqueIds.length ? filtrarFecha(supabase.from('fertilizaciones').select('id, fecha, bloque_id, notas, soluciones')).in('bloque_id', bloqueIds) : Promise.resolve({ data: [] }),
      filtrarFecha(supabase.from('vivero_lotes').select('id, fecha_siembra, cultivo, variedad, estado'), 'fecha_siembra'),
      filtrarFecha(supabase.from('costos').select('id, fecha, tipo, descripcion, monto, bloque_id').eq('campo_id', campoId)),
      filtrarFecha(supabase.from('tareas').select('id, fecha_programada, descripcion, completada').eq('campo_id', campoId), 'fecha_programada'),
      filtrarFecha(supabase.from('contabilidad_movimientos').select('id, fecha, tipo, descripcion, categoria, contraparte, monto')),
    ])

    const lista = []

    ;(plantaciones || []).forEach(p => lista.push({
      tipo:'plantacion',
      fecha:p.fecha_siembra,
      titulo:`Plantacion en bloque ${codigoBloque[p.bloque_id] || '-'}`,
      detalle:`${p.cultivos?.nombre || 'Cultivo'}${p.activa ? ' - activa' : ' - finalizada'}`,
      bloque: codigoBloque[p.bloque_id] || '',
      monto:'',
      path:`/bloque/${p.bloque_id}`,
    }))

    ;(cosechas || []).forEach(c => lista.push({
      tipo:'cosecha',
      fecha:c.fecha,
      titulo:`Cosecha bloque ${codigoBloque[c.bloque_id] || '-'}`,
      detalle:`${Number(c.kg_total || 0).toLocaleString('es-PY')} kg${c.precio_kg ? ` - ${fmtGs(c.precio_kg)}/kg` : ''}${c.compradores?.nombre ? ` - ${c.compradores.nombre}` : ''}`,
      bloque: codigoBloque[c.bloque_id] || '',
      monto:(Number(c.kg_total) || 0) * (Number(c.precio_kg) || 0),
      path:'/cosecha',
    }))

    ;(fumigaciones || []).forEach(f => {
      const bloquesTxt = (f.fumigacion_bloques || []).map(b => b.bloques?.codigo).filter(Boolean).join(', ')
      const productosTxt = (f.fumigacion_productos || []).map(p => `${p.productos?.nombre || p.producto_nombre || ''} ${p.dosis || ''}`.trim()).filter(Boolean).join(' + ')
      const tanques = f.tanques_cantidad && f.tanque_litros ? ` - ${f.tanques_cantidad} x ${f.tanque_litros} L` : ''
      lista.push({
        tipo:'fumigacion',
        fecha:f.fecha,
        titulo:`${f.tipo || 'Fumigacion'}${bloquesTxt ? ` - bloques ${bloquesTxt}` : ''}`,
        detalle:`${productosTxt || 'Sin productos'}${tanques}${f.operario ? ` - ${f.operario}` : ''}`,
        bloque: bloquesTxt,
        monto:'',
        path:'/fumigaciones',
      })
    })

    ;(fertilizaciones || []).forEach(f => lista.push({
      tipo:'fertilizacion',
      fecha:f.fecha,
      titulo:`Fertilizacion bloque ${codigoBloque[f.bloque_id] || '-'}`,
      detalle:Array.isArray(f.soluciones) ? f.soluciones.map(s => `Sol. ${s.nombre}: ${(s.productos || []).map(p => `${p.nombre} ${p.cantidad}${p.unidad}`).join(' + ')}`).join(' | ') : (f.notas || ''),
      bloque: codigoBloque[f.bloque_id] || '',
      monto:'',
      path:`/bloque/${f.bloque_id}`,
    }))

    ;(vivero || []).forEach(v => lista.push({
      tipo:'vivero',
      fecha:v.fecha_siembra,
      titulo:`Vivero: ${v.cultivo || 'Cultivo'}`,
      detalle:`${v.variedad || ''}${v.estado ? ` - ${v.estado}` : ''}`,
      bloque:'',
      monto:'',
      path:'/vivero',
    }))

    ;(costos || []).forEach(c => lista.push({
      tipo:'costo',
      fecha:c.fecha,
      titulo:c.descripcion || c.tipo || 'Costo',
      detalle:`${c.bloque_id ? `Bloque ${codigoBloque[c.bloque_id] || ''} - ` : ''}${fmtGs(c.monto)}`,
      bloque: codigoBloque[c.bloque_id] || '',
      monto:Number(c.monto) || 0,
      path:'/costos',
    }))

    ;(tareas || []).forEach(t => lista.push({
      tipo:'tarea',
      fecha:t.fecha_programada,
      titulo:t.completada ? 'Tarea completada' : 'Tarea pendiente',
      detalle:t.descripcion,
      bloque:'',
      monto:'',
      path:'/agenda',
    }))

    ;(contabilidad || []).forEach(m => lista.push({
      tipo:'contabilidad',
      fecha:m.fecha,
      titulo:`${m.tipo || 'Movimiento'} - ${m.descripcion || m.categoria || ''}`,
      detalle:`${m.contraparte || m.categoria || ''} - ${fmtGs(m.monto)}`,
      bloque:'',
      monto:Number(m.monto) || 0,
      path:'/contabilidad',
    }))

    setEventos(lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))))
    setLoading(false)
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return eventos.filter(e => {
      if (filtro !== 'todos' && e.tipo !== filtro) return false
      if (!q) return true
      return `${e.titulo} ${e.detalle} ${e.bloque}`.toLowerCase().includes(q)
    })
  }, [eventos, filtro, busqueda])

  const exportar = () => {
    descargarCsv('historial-agrobloque', ['Fecha', 'Tipo', 'Titulo', 'Detalle', 'Bloque', 'Monto'], visibles.map(e => ({
      Fecha:e.fecha, Tipo:tipos[e.tipo]?.label || e.tipo, Titulo:e.titulo, Detalle:e.detalle, Bloque:e.bloque, Monto:e.monto,
    })))
  }

  const imprimir = () => {
    imprimirHtml('Historial AgroBloque', `
      <h1>Historial AgroBloque</h1>
      <div class="muted">${esc(campoSel?.nombre || '')} - ${esc(desde || 'inicio')} a ${esc(hasta || hoy())}</div>
      <table>
        <tr><th>Fecha</th><th>Tipo</th><th>Titulo</th><th>Detalle</th><th>Bloque</th><th class="right">Monto</th></tr>
        ${visibles.map(e => `<tr><td>${esc(e.fecha)}</td><td>${esc(tipos[e.tipo]?.label || e.tipo)}</td><td>${esc(e.titulo)}</td><td>${esc(e.detalle)}</td><td>${esc(e.bloque)}</td><td class="right">${e.monto ? esc(fmtGs(e.monto)) : ''}</td></tr>`).join('')}
      </table>
    `)
  }

  const resumen = tiposLista().map(t => ({ ...t, total:eventos.filter(e => e.tipo === t.key).length }))

  return (
    <div className="ui-71cde8" style={{ padding: typeof window !== 'undefined' && window.innerWidth >= 768 ? '34px 36px 100px' : '24px 14px 100px' }}>
      <div className="ui-f47a4b" style={{ maxWidth: typeof window !== 'undefined' && window.innerWidth >= 768 ? 1180 : 980 }}>
        <div className="ui-3259aa">
          <div>
            <div className="ui-93a7e1">Trazabilidad</div>
            <h1 className="ui-ee8706">Historial completo</h1>
          </div>
          <div className="ui-9c6869">
            <button onClick={exportar} style={iconBtn}><i className="ti ti-download ui-b7c8fe" /></button>
            <button className="ui-c84552" onClick={imprimir} style={{ ...iconBtn }}><i className="ti ti-printer ui-b7c8fe" /></button>
          </div>
        </div>

        <div className="ui-0874a1">
          <div className="ui-d3055b">
            <select value={campoSel?.id || ''} onChange={e => setCampoSel(campos.find(c => c.id === e.target.value))} style={inputStyle}>
              {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en historial..." style={inputStyle} />
          </div>
          <div className="ui-f56ef1">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div className="ui-9c59d2">
          <Chip active={filtro === 'todos'} onClick={() => setFiltro('todos')} label={`Todo ${eventos.length}`} />
          {resumen.map(t => <Chip key={t.key} active={filtro === t.key} onClick={() => setFiltro(t.key)} label={`${t.label} ${t.total}`} />)}
        </div>

        {loading ? (
          <div className="ui-4e47d3">Armando historial...</div>
        ) : visibles.length === 0 ? (
          <div className="ui-c59321">Sin movimientos para mostrar.</div>
        ) : (
          <div className="ui-b1b744">
            {visibles.map((e, i) => {
              const t = tipos[e.tipo] || tipos.tarea
              return (
                <div className="ui-e331bd" key={`${e.tipo}-${e.fecha}-${i}`} onClick={() => navigate(e.path)}>
                  <div className="ui-a1cc9d">
                    <span className="ui-13ebd9" style={{ background:t.bg, color:t.color }}>
                      <i className={`${`ti ${t.icon}`} ui-27a8ac`} />
                    </span>
                    <span className="ui-3f9f96">
                      <span className="ui-747a39">
                        <strong className="ui-0cf08e">{e.titulo}</strong>
                        <span className="ui-e3d4a2" style={{ color:t.color, background:t.bg }}>{t.label}</span>
                      </span>
                      <span className="ui-8839ed">{e.fecha} - {e.detalle}</span>
                    </span>
                    <i className="ti ti-chevron-right ui-efe630" />
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

function tiposLista() {
  return Object.entries(tipos).map(([key, value]) => ({ key, ...value }))
}

function Chip({ active, label, onClick }) {
  return (
    <button className="ui-b8190d" onClick={onClick} style={{ background:active ? '#212121' : '#fff', color:active ? '#fff' : '#4f574f' }}>
      {label}
    </button>
  )
}

const inputStyle = {
  width:'100%',
  minWidth:0,
  border:'1px solid #e4e7e2',
  borderRadius:8,
  background:'#fff',
  padding:'10px 12px',
  fontSize:13,
  color:'#111',
  boxSizing:'border-box',
}

const iconBtn = {
  width:42,
  height:42,
  borderRadius:8,
  border:'1px solid #e8ece8',
  background:'#fff',
  color:"#124e38",
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
  cursor:'pointer',
}
