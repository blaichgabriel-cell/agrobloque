import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const normalizar = (v) => String(v || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

const card = {
  background: '#fff',
  borderRadius: 18,
  padding: '14px 16px',
  marginBottom: 8,
  border: '1px solid #e8ece8',
  cursor: 'pointer',
}

export default function Buscador() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const [
      { data: bloques },
      { data: plantaciones },
      { data: productos },
      { data: cosechas },
      { data: compradores },
      { data: tareas },
      { data: vivero },
      { data: contabilidad },
    ] = await Promise.all([
      supabase.from('bloques').select('id, codigo, campos(nombre)').order('codigo'),
      supabase.from('plantaciones').select('id, activa, fecha_siembra, bloques(id, codigo), cultivos(nombre)').order('created_at', { ascending:false }),
      supabase.from('productos').select('id, nombre, stock_actual, categorias_producto(nombre)').eq('activo', true).order('nombre'),
      supabase.from('cosechas').select('id, fecha, kg_total, precio_kg, bloques(id, codigo), compradores(nombre)').order('fecha', { ascending:false }),
      supabase.from('compradores').select('id, nombre, tipo, telefono').order('nombre'),
      supabase.from('tareas').select('id, descripcion, fecha_programada, completada, bloques(id, codigo)').order('fecha_programada', { ascending:false }),
      supabase.from('vivero_lotes').select('id, cultivo, variedad, fecha_siembra, estado').order('fecha_siembra', { ascending:false }),
      supabase.from('contabilidad_movimientos').select('id, fecha, tipo, descripcion, categoria, monto').order('fecha', { ascending:false }),
    ])

    const lista = [
      ...(bloques || []).map(b => ({
        tipo: 'Bloque',
        titulo: `Bloque ${b.codigo}`,
        sub: b.campos?.nombre || 'Mapa',
        icon: 'ti-map-pin',
        path: `/bloque/${b.id}`,
      })),
      ...(plantaciones || []).map(p => ({
        tipo: 'Plantacion',
        titulo: p.cultivos?.nombre || 'Plantacion',
        sub: `Bloque ${p.bloques?.codigo || '-'} - ${p.activa ? 'Activa' : 'Historial'} - ${p.fecha_siembra || 'sin fecha'}`,
        icon: 'ti-plant',
        path: p.bloques?.id ? `/bloque/${p.bloques.id}` : '/mapa',
      })),
      ...(productos || []).map(p => ({
        tipo: 'Inventario',
        titulo: p.nombre,
        sub: `${p.categorias_producto?.nombre || 'Producto'} - stock ${p.stock_actual || 0}`,
        icon: 'ti-box',
        path: '/inventario',
      })),
      ...(cosechas || []).map(c => ({
        tipo: 'Cosecha',
        titulo: `Bloque ${c.bloques?.codigo || '-'} - ${c.kg_total || 0} kg`,
        sub: `${c.fecha || ''} - ${c.compradores?.nombre || 'sin comprador'} - Gs. ${Math.round(Number(c.precio_kg) || 0).toLocaleString('es-PY')}/kg`,
        icon: 'ti-cut',
        path: '/cosecha',
      })),
      ...(compradores || []).map(c => ({
        tipo: 'Comprador',
        titulo: c.nombre,
        sub: `${c.tipo || 'Comprador'}${c.telefono ? ' - ' + c.telefono : ''}`,
        icon: 'ti-building-store',
        path: '/compradores',
      })),
      ...(tareas || []).map(t => ({
        tipo: 'Agenda',
        titulo: t.descripcion,
        sub: `${t.fecha_programada || ''} - ${t.completada ? 'completada' : 'pendiente'}${t.bloques?.codigo ? ' - bloque ' + t.bloques.codigo : ''}`,
        icon: 'ti-calendar',
        path: '/agenda',
      })),
      ...(vivero || []).map(v => ({
        tipo: 'Vivero',
        titulo: v.cultivo || 'Lote de vivero',
        sub: `${v.variedad || 'sin variedad'} - ${v.estado || 'activo'} - ${v.fecha_siembra || 'sin fecha'}`,
        icon: 'ti-plant-2',
        path: '/vivero',
      })),
      ...(contabilidad || []).map(m => ({
        tipo: 'Contabilidad',
        titulo: m.descripcion || m.categoria || m.tipo,
        sub: `${m.fecha || ''} - ${m.tipo || ''} - Gs. ${Math.round(Number(m.monto) || 0).toLocaleString('es-PY')}`,
        icon: 'ti-calculator',
        path: '/contabilidad',
      })),
    ]

    setItems(lista)
    setLoading(false)
  }

  const resultados = useMemo(() => {
    const term = normalizar(q)
    if (!term) return items.slice(0, 25)
    return items.filter(item => normalizar(`${item.tipo} ${item.titulo} ${item.sub}`).includes(term)).slice(0, 60)
  }, [items, q])

  return (
    <div style={{ minHeight:'100vh', background:'#f2f1ef', padding:'24px 14px 100px' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <button onClick={() => navigate(-1)} style={{ width:40, height:40, borderRadius:14, border:'none', background:'#fff', cursor:'pointer' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:20 }} aria-hidden="true"></i>
          </button>
          <div>
            <div style={{ fontSize:12, color:'#8b928b' }}>Busqueda global</div>
            <h1 style={{ margin:0, fontSize:24, letterSpacing:-0.6 }}>Buscar en AgroBloque</h1>
          </div>
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:12, marginBottom:14, border:'1px solid #e8ece8' }}>
          <div style={{ display:'grid', gridTemplateColumns:'26px 1fr', alignItems:'center', gap:8 }}>
            <i className="ti ti-search" style={{ fontSize:22, color:'#176a25' }} aria-hidden="true"></i>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar A-1, tomate, comprador, abono, cosecha..."
              style={{ border:'none', outline:'none', fontSize:15, padding:'10px 4px', background:'transparent' }} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b' }}>Cargando buscador...</div>
        ) : resultados.length === 0 ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b', background:'#fff', borderRadius:20 }}>Sin resultados.</div>
        ) : resultados.map((r, i) => (
          <div key={`${r.tipo}-${r.titulo}-${i}`} style={card} onClick={() => navigate(r.path)}>
            <div style={{ display:'grid', gridTemplateColumns:'42px 1fr 18px', gap:12, alignItems:'center' }}>
              <span style={{ width:42, height:42, borderRadius:13, background:'#edf6ec', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className={`ti ${r.icon}`} style={{ fontSize:21, color:'#176a25' }} aria-hidden="true"></i>
              </span>
              <span style={{ minWidth:0 }}>
                <span style={{ display:'block', fontSize:11, color:'#8b928b', textTransform:'uppercase', fontWeight:700 }}>{r.tipo}</span>
                <strong style={{ display:'block', fontSize:15, color:'#111', marginTop:2 }}>{r.titulo}</strong>
                <span style={{ display:'block', fontSize:12, color:'#687068', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.sub}</span>
              </span>
              <i className="ti ti-chevron-right" style={{ fontSize:18, color:'#1c211d' }} aria-hidden="true"></i>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
