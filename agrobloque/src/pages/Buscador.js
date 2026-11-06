import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const normalizar = (v) => String(v || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

const card = {
  background: '#fff',
  borderRadius:'var(--ag-radius)',
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
      { data: operarios },
      { data: fumigaciones },
      { data: fertilizaciones },
      { data: contabilidad },
    ] = await Promise.all([
      supabase.from('bloques').select('id, codigo, campos(nombre)').order('codigo'),
      supabase.from('plantaciones').select('id, activa, fecha_siembra, bloques(id, codigo), cultivos(nombre)').order('created_at', { ascending:false }),
      supabase.from('productos').select('id, nombre, stock_actual, categorias_producto(nombre)').eq('activo', true).order('nombre'),
      supabase.from('cosechas').select('id, fecha, kg_total, precio_kg, bloques(id, codigo), compradores(nombre)').order('fecha', { ascending:false }),
      supabase.from('compradores').select('id, nombre, tipo, telefono').order('nombre'),
      supabase.from('tareas').select('id, descripcion, fecha_programada, completada, bloques(id, codigo)').order('fecha_programada', { ascending:false }),
      supabase.from('vivero_lotes').select('id, cultivo, variedad, fecha_siembra, estado').order('fecha_siembra', { ascending:false }),
      supabase.from('operarios').select('id, nombre, campos(nombre)').order('nombre'),
      supabase.from('fumigaciones').select('id, fecha, tipo, operario, fumigacion_bloques(bloques(id,codigo)), fumigacion_productos(productos(nombre))').eq('anulada', false).order('fecha', { ascending:false }).limit(150),
      supabase.from('fertilizaciones').select('id, fecha, soluciones, bloques(id,codigo)').eq('anulada', false).order('fecha', { ascending:false }).limit(150),
      Promise.resolve({ data: [] }),
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
        titulo: p.cultivos?.nombre || 'Plantación',
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
      ...(operarios || []).map(o => ({ tipo:'Operario', titulo:o.nombre, sub:`Personal de campo · ${o.campos?.nombre || 'Sin campo'}`, icon:'ti-user', path:'/asistencia' })),
      ...(fumigaciones || []).map(f => ({ tipo:'Fumigación', titulo:`${f.tipo || 'Aplicación'} · ${(f.fumigacion_bloques || []).map(b => b.bloques?.codigo).filter(Boolean).join(', ') || 'Sin bloque'}`, sub:`${f.fecha || ''} · ${(f.fumigacion_productos || []).map(p => p.productos?.nombre).filter(Boolean).join(' + ') || 'Sin producto'}${f.operario ? ` · ${f.operario}` : ''}`, icon:'ti-spray', path:'/fumigaciones' })),
      ...(fertilizaciones || []).map(f => ({ tipo:'Fertilización', titulo:`Bloque ${f.bloques?.codigo || '-'}`, sub:`${f.fecha || ''} · ${(f.soluciones || []).flatMap(s => s.productos || []).map(p => p.nombre).filter(Boolean).join(' + ') || 'Aplicación'}`, icon:'ti-leaf', path:'/fertilizaciones' })),
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
    <div className="ag-page ag-page-body ui-71cde8" style={{ padding: typeof window !== 'undefined' && window.innerWidth >= 1100 ? '34px 36px 100px' : '24px 14px 100px' }}>
      <div className="ui-f47a4b" style={{ maxWidth: typeof window !== 'undefined' && window.innerWidth >= 1100 ? 1180 : 900 }}>
        <div className="ui-31b0cd">
          <button className="ui-78cb77" aria-label="Volver" onClick={() => navigate(-1)}>
            <i className="ti ti-arrow-left ui-e5e6f8" aria-hidden="true"></i>
          </button>
          <div>
            <div className="ui-93a7e1">Busqueda global</div>
            <h1 className="ui-ee8706">Buscar en AgroBloque</h1>
          </div>
        </div>

        <div className="ag-surface ui-3c3495">
          <div className="ui-affe91">
            <i className="ti ti-search ui-1cfb3f" aria-hidden="true"></i>
            <input className="ui-ead7f5" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar A-1, tomate, comprador, abono, cosecha..."
              />
          </div>
        </div>

        {loading ? (
          <div className="ui-4e47d3">Cargando buscador...</div>
        ) : resultados.length === 0 ? (
          <div className="ag-surface ui-8a232f">Sin resultados.</div>
        ) : resultados.map((r, i) => (
          <div key={`${r.tipo}-${r.titulo}-${i}`} style={card} onClick={() => navigate(r.path)}>
            <div className="ui-caa1ed">
              <span className="ui-dd385b">
                <i className={`${`ti ${r.icon}`} ui-d932c2`} aria-hidden="true"></i>
              </span>
              <span className="ui-3f9f96">
                <span className="ui-9e8e47">{r.tipo}</span>
                <strong className="ui-57bdb3">{r.titulo}</strong>
                <span className="ui-7dd5eb">{r.sub}</span>
              </span>
              <i className="ti ti-chevron-right ui-4416e1" aria-hidden="true"></i>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
